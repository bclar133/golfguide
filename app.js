(function () {
  var courses = Array.isArray(window.GOLF_COURSES) ? window.GOLF_COURSES : [];
  var state = { query: '', state: 'all', price: 'all', selectedId: courses[0] && courses[0].id, mapStyle: 'map' };
  var els = {
    search: document.querySelector('#searchInput'),
    state: document.querySelector('#stateFilter'),
    price: document.querySelector('#priceFilter'),
    mapButton: document.querySelector('#mapButton'),
    satelliteButton: document.querySelector('#satelliteButton'),
    clear: document.querySelector('#clearButton'),
    detail: document.querySelector('#selectedCourse'),
    count: document.querySelector('#resultCount'),
    list: document.querySelector('#resultsList'),
    status: document.querySelector('#mapStatus')
  };
  var map;
  var popup;
  var markers = new Map();

  var mapStyles = {
    map: 'https://tiles.openfreemap.org/styles/liberty',
    satellite: {
      version: 8,
      sources: {
        imagery: {
          type: 'raster',
          tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: 'Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
        }
      },
      layers: [{ id: 'imagery', type: 'raster', source: 'imagery' }]
    }
  };

  init();

  function init() {
    courses = prepareCourses(courses);
    state.selectedId = courses[0] && courses[0].id;
    hydrateStates();
    bind();
    initMap();
    render();
    if (courses.length <= 10) {
      loadNationalCourseData();
    }
  }

  function prepareCourses(list) {
    return list.map(normaliseCourse).filter(function (course) {
      return Array.isArray(course.coordinates) && isFinite(course.coordinates[0]) && isFinite(course.coordinates[1]);
    });
  }

  function normaliseCourse(course) {
    var fallback = course.fallbackImageUrl || aerialTile(course.coordinates);
    return Object.assign({}, course, {
      id: course.id || slug(course.name),
      town: course.town || course.region || course.state || 'Australia',
      region: course.region || course.town || course.state || 'Australia',
      state: course.state || 'AU',
      priceLevel: Math.max(2, Math.min(5, Number(course.priceLevel || 3))),
      imageUrl: course.imageUrl || fallback,
      fallbackImageUrl: fallback,
      imageAlt: course.imageAlt || ((course.name || 'Golf course') + ' image'),
      mediaKind: course.mediaKind || 'photo',
      summary: course.summary || 'Golf course in ' + [course.town, course.region, course.state].filter(Boolean).join(', ') + '.',
      searchText: [course.name, course.town, course.region, course.state, course.access, course.summary].join(' ').toLowerCase()
    });
  }

  async function loadNationalCourseData() {
    setStatus('Loading all Australian courses from OpenStreetMap...');
    try {
      var imported = await fetchOverpassCourses();
      if (!imported.length) {
        throw new Error('No course records returned');
      }
      courses = prepareCourses(imported);
      state.selectedId = courses[0] && courses[0].id;
      hydrateStates();
      render(true);
      setStatus('Loaded ' + courses.length + ' Australian course records.');
      window.setTimeout(function () { setStatus(''); }, 3200);
    } catch (error) {
      setStatus('Preview data only: full OpenStreetMap load failed. Try refreshing in a minute.');
      console.error(error);
    }
  }

  async function fetchOverpassCourses() {
    var endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.openstreetmap.ru/api/interpreter'
    ];
    var query = '[out:json][timeout:180];area["ISO3166-1"="AU"][admin_level=2]->.australia;(node["leisure"="golf_course"](area.australia);way["leisure"="golf_course"](area.australia);relation["leisure"="golf_course"](area.australia););out center tags;';
    var lastError;
    for (var i = 0; i < endpoints.length; i += 1) {
      try {
        var response = await fetch(endpoints[i], {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams({ data: query })
        });
        if (!response.ok) throw new Error(endpoints[i] + ' returned HTTP ' + response.status);
        var data = await response.json();
        var records = Array.isArray(data.elements) ? data.elements.map(fromOverpass).filter(Boolean) : [];
        records = dedupeCourses(records);
        if (records.length > 100) return records;
        lastError = new Error('Only ' + records.length + ' records returned from ' + endpoints[i]);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('OpenStreetMap load failed');
  }

  function fromOverpass(element) {
    var tags = element.tags || {};
    var lon = Number(element.lon != null ? element.lon : element.center && element.center.lon);
    var lat = Number(element.lat != null ? element.lat : element.center && element.center.lat);
    if (!isFinite(lon) || !isFinite(lat)) return null;
    var name = clean(tags.name || tags.official_name || tags.short_name || ('Golf Course near ' + townFromTags(tags)));
    var stateCode = clean(tags['addr:state'] || inferState(lon, lat));
    var town = clean(tags['addr:city'] || tags['addr:town'] || tags['addr:suburb'] || tags['addr:locality'] || tags['is_in:city'] || stateCode);
    var region = clean(tags['is_in:region'] || tags['addr:region'] || town || stateCode);
    var website = firstUrl(tags.website || tags['contact:website'] || tags.url || tags['contact:url']);
    var booking = firstUrl(tags.booking || tags['booking:website'] || tags['reservation:website']);
    var coords = [round(lon), round(lat)];
    var aerial = aerialTile(coords);
    var id = slug(name + '-' + stateCode + '-' + (element.id || coords.join('-')));
    return {
      id: id,
      name: name,
      town: town,
      region: region,
      state: stateCode,
      coordinates: coords,
      holes: clean(tags.holes || ''),
      access: accessLabel(tags),
      priceLevel: priceLevel(tags, name),
      homepageUrl: website,
      bookingUrl: booking,
      imageUrl: website ? favicon(website) : aerial,
      fallbackImageUrl: aerial,
      imageAlt: name + (website ? ' logo' : ' aerial course image'),
      mediaKind: website ? 'logo' : 'photo',
      summary: summary(tags, town, region, stateCode),
      webSearchUrl: 'https://www.google.com/search?q=' + encodeURIComponent(name + ' ' + town + ' ' + stateCode + ' golf club website')
    };
  }

  function dedupeCourses(items) {
    var seen = new Set();
    var out = [];
    items.forEach(function (item) {
      var key = slug(item.name + '-' + item.town + '-' + item.state);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    });
    return out.sort(function (a, b) { return a.state.localeCompare(b.state) || a.name.localeCompare(b.name); });
  }

  function bind() {
    els.search.addEventListener('input', function () {
      state.query = els.search.value.trim().toLowerCase();
      render(true);
    });
    els.state.addEventListener('change', function () {
      state.state = els.state.value;
      render(true);
    });
    els.price.addEventListener('change', function () {
      state.price = els.price.value;
      render(true);
    });
    els.clear.addEventListener('click', function () {
      state.query = '';
      state.state = 'all';
      state.price = 'all';
      els.search.value = '';
      els.state.value = 'all';
      els.price.value = 'all';
      render(true);
    });
    els.mapButton.addEventListener('click', function () { setMapStyle('map'); });
    els.satelliteButton.addEventListener('click', function () { setMapStyle('satellite'); });
  }

  function hydrateStates() {
    var states = Array.from(new Set(courses.map(function (course) { return course.state; }).filter(Boolean))).sort();
    els.state.innerHTML = '<option value="all">All states</option>' + states.map(function (code) {
      return '<option value="' + escAttr(code) + '">' + esc(code) + '</option>';
    }).join('');
  }

  function initMap() {
    if (!window.maplibregl) {
      setStatus('Map library could not load.');
      return;
    }
    map = new maplibregl.Map({
      container: 'map',
      style: mapStyles.map,
      center: [134.5, -25.4],
      zoom: 3.45,
      minZoom: 3,
      maxBounds: [[105, -45.8], [160.5, -8]],
      attributionControl: true
    });
    popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 24 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('load', function () {
      renderMarkers();
    });
  }

  function setMapStyle(next) {
    if (!map || state.mapStyle === next) return;
    state.mapStyle = next;
    els.mapButton.setAttribute('aria-pressed', String(next === 'map'));
    els.satelliteButton.setAttribute('aria-pressed', String(next === 'satellite'));
    map.setStyle(mapStyles[next]);
    map.once('styledata', renderMarkers);
  }

  function filteredCourses() {
    return courses.filter(function (course) {
      if (state.state !== 'all' && course.state !== state.state) return false;
      if (state.price !== 'all' && course.priceLevel > Number(state.price)) return false;
      if (state.query && course.searchText.indexOf(state.query) === -1) return false;
      return true;
    });
  }

  function render(shouldFit) {
    var filtered = filteredCourses();
    if (!filtered.some(function (course) { return course.id === state.selectedId; })) {
      state.selectedId = filtered[0] && filtered[0].id;
    }
    renderDetail(filtered);
    renderList(filtered);
    renderMarkers(filtered);
    if (shouldFit && filtered.length && map) fitToCourses(filtered.slice(0, 160));
  }

  function renderDetail(filtered) {
    var course = courses.find(function (item) { return item.id === state.selectedId; }) || filtered[0];
    if (!course) {
      els.detail.innerHTML = '<div class="course-card"><div class="body"><h2>No matching courses</h2></div></div>';
      return;
    }
    var links = [];
    if (course.homepageUrl) links.push('<a href="' + escAttr(course.homepageUrl) + '" target="_blank" rel="noopener">Website</a>');
    if (course.bookingUrl) links.push('<a href="' + escAttr(course.bookingUrl) + '" target="_blank" rel="noopener">Book</a>');
    if (!course.homepageUrl && course.webSearchUrl) links.push('<a href="' + escAttr(course.webSearchUrl) + '" target="_blank" rel="noopener">Find online</a>');
    els.detail.innerHTML = '<article class="course-card">' +
      '<img src="' + escAttr(course.imageUrl) + '" data-fallback="' + escAttr(course.fallbackImageUrl) + '" alt="' + escAttr(course.imageAlt) + '">' +
      '<div class="body"><h2>' + esc(course.name) + '</h2>' +
      '<p class="meta">' + esc(course.town) + ', ' + esc(course.region) + ' - ' + esc(course.state) + '</p>' +
      '<p class="meta">' + esc(infoLine(course)) + '</p>' +
      '<div class="price"><span>Price guide</span><span>' + price(course.priceLevel) + '</span></div>' +
      '<p class="summary">' + esc(course.summary) + '</p>' +
      '<div class="links">' + links.join('') + '</div></div></article>';
    var img = els.detail.querySelector('img');
    img.addEventListener('error', function () {
      if (img.dataset.usedFallback !== 'true') {
        img.dataset.usedFallback = 'true';
        img.src = img.dataset.fallback;
      }
    });
  }

  function renderList(filtered) {
    els.count.textContent = filtered.length + ' shown';
    els.list.innerHTML = filtered.slice(0, 300).map(function (course) {
      return '<button class="result ' + (course.id === state.selectedId ? 'active' : '') + '" type="button" data-id="' + escAttr(course.id) + '">' +
        '<h3>' + esc(course.name) + '</h3><p>' + esc(course.town) + ' - ' + esc(course.region) + ' - ' + esc(course.state) + '</p>' +
        '<p>' + esc(infoLine(course)) + ' - ' + price(course.priceLevel) + '</p></button>';
    }).join('');
    Array.from(els.list.querySelectorAll('button')).forEach(function (button) {
      button.addEventListener('click', function () { selectCourse(button.dataset.id, true); });
    });
  }

  function renderMarkers(list) {
    if (!map) return;
    markers.forEach(function (marker) { marker.remove(); });
    markers.clear();
    (list || filteredCourses()).forEach(function (course) {
      var el = document.createElement('button');
      el.className = 'marker' + (course.id === state.selectedId ? ' active' : '');
      el.type = 'button';
      el.setAttribute('aria-label', course.name);
      el.innerHTML = '<span class="dots"></span>';
      el.addEventListener('mouseenter', function () { showPopup(course); });
      el.addEventListener('mouseleave', function () { if (course.id !== state.selectedId) popup.remove(); });
      el.addEventListener('click', function () { selectCourse(course.id, false); });
      markers.set(course.id, new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(course.coordinates).addTo(map));
    });
  }

  function selectCourse(id, fly) {
    state.selectedId = id;
    var course = courses.find(function (item) { return item.id === id; });
    render(false);
    if (course && map) {
      showPopup(course);
      if (fly) map.flyTo({ center: course.coordinates, zoom: Math.max(map.getZoom(), 10.5), duration: 650 });
    }
  }

  function showPopup(course) {
    if (!map || !popup) return;
    popup.setLngLat(course.coordinates).setHTML('<div class="popup"><h3>' + esc(course.name) + '</h3><p>' + esc(course.town) + ' - ' + esc(course.state) + '</p><p>' + price(course.priceLevel) + '</p></div>').addTo(map);
  }

  function fitToCourses(items) {
    if (!map || !items.length) return;
    var bounds = new maplibregl.LngLatBounds();
    items.forEach(function (course) { bounds.extend(course.coordinates); });
    map.fitBounds(bounds, { padding: 60, maxZoom: 9, duration: 500 });
  }

  function accessLabel(tags) {
    var access = String(tags.access || '').toLowerCase();
    if (access === 'private' || tags.private === 'yes') return 'Private club';
    if (access === 'customers') return 'Public access';
    if (access === 'permissive' || access === 'yes' || !access) return 'Golf course';
    return clean(tags.access || 'Golf course');
  }

  function priceLevel(tags, name) {
    var text = [name, tags.access, tags.fee, tags.operator].join(' ').toLowerCase();
    if (/royal|barnbougle|resort|links|private|championship|sanctuary|joondalup|brookwater/.test(text)) return 5;
    if (/country club|club|fee|yes/.test(text)) return 3;
    return 2;
  }

  function summary(tags, town, region, stateCode) {
    var bits = [];
    if (tags.holes) bits.push(tags.holes + ' holes');
    if (tags.par) bits.push('Par ' + tags.par);
    if (tags.operator) bits.push('Operated by ' + tags.operator);
    var prefix = bits.length ? bits.join(' - ') + '. ' : '';
    return prefix + 'Golf course in ' + [town, region, stateCode].filter(Boolean).join(', ') + '.';
  }

  function inferState(lon, lat) {
    if (lat < -39) return 'TAS';
    if (lon < 129) return 'WA';
    if (lon >= 129 && lon < 138) return lat > -26 ? 'NT' : 'SA';
    if (lon >= 138 && lon < 141) return lat > -29 ? 'QLD' : 'SA';
    if (lon >= 141 && lon < 144) return lat > -29 ? 'QLD' : lat > -36 ? 'NSW' : 'VIC';
    if (lon >= 144 && lon < 150) return lat > -37 ? 'NSW' : 'VIC';
    if (lon >= 150) return lat > -29 ? 'QLD' : 'NSW';
    return 'AU';
  }

  function townFromTags(tags) {
    return tags['addr:city'] || tags['addr:town'] || tags['addr:suburb'] || tags['addr:locality'] || tags['is_in:city'] || 'Australia';
  }

  function firstUrl(value) {
    var text = String(value || '').split(';')[0].trim();
    if (!text) return '';
    return /^https?:\/\//i.test(text) ? text : 'https://' + text.replace(/^\/\//, '');
  }

  function favicon(value) {
    try {
      var host = new URL(value).hostname;
      return 'https://icons.duckduckgo.com/ip3/' + host + '.ico';
    } catch (error) {
      return '';
    }
  }

  function infoLine(course) {
    return [course.holes ? course.holes + ' holes' : '', course.access || 'Golf course'].filter(Boolean).join(' - ');
  }
  function price(level) { return '$'.repeat(Math.max(2, Math.min(5, Number(level || 3)))); }
  function aerialTile(coords) {
    if (!coords) return '';
    var lon = Number(coords[0]);
    var lat = Number(coords[1]);
    var z = 16;
    var latRad = lat * Math.PI / 180;
    var n = Math.pow(2, z);
    var x = Math.floor((lon + 180) / 360 * n);
    var y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x;
  }
  function clean(value) { return String(value || '').trim().replace(/\s+/g, ' '); }
  function round(value) { return Math.round(Number(value) * 1000000) / 1000000; }
  function setStatus(message) { els.status.textContent = message || ''; }
  function slug(value) { return String(value || 'course').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function escAttr(value) { return esc(value).replace(/`/g, '&#96;'); }
})();
