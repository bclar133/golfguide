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
    courses = courses.map(normaliseCourse).filter(function (course) {
      return Array.isArray(course.coordinates) && isFinite(course.coordinates[0]) && isFinite(course.coordinates[1]);
    });
    state.selectedId = courses[0] && courses[0].id;
    hydrateStates();
    bind();
    initMap();
    render();
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
      els.status.textContent = 'Map library could not load.';
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
      els.status.textContent = courses.length ? '' : 'No course data was generated yet. Check the GitHub Pages workflow.';
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
    if (shouldFit && filtered.length && map) fitToCourses(filtered.slice(0, 120));
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
  function slug(value) { return String(value || 'course').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function escAttr(value) { return esc(value).replace(/`/g, '&#96;'); }
})();
