(function () {
  var courses = Array.isArray(window.GOLF_COURSES) ? window.GOLF_COURSES : [];
  var top100Rankings = Array.isArray(window.TOP100_AUSTRALIA_RANKINGS) ? window.TOP100_AUSTRALIA_RANKINGS : [];
  var TOP100_STATE_CODES = {
    "ACT": "ACT",
    "New South Wales": "NSW",
    "Northern Territory": "NT",
    "Queensland": "QLD",
    "South Australia": "SA",
    "Tasmania": "TAS",
    "Victoria": "VIC",
    "Western Australia": "WA"
  };

  var TRAVEL_REGION_ALIASES = [
    {
      name: "Sunshine Coast",
      state: "QLD",
      keywords: [
        "sunshine coast",
        "noosa",
        "noosa heads",
        "tewantin",
        "doonan",
        "eumundi",
        "peregian",
        "coolum",
        "mount coolum",
        "marcoola",
        "caloundra",
        "pelican waters",
        "maroochy",
        "maroochydore",
        "bli bli",
        "nambour",
        "beerwah",
        "cooroy",
        "boreen point",
        "weyba downs",
        "maleny",
        "buderim",
        "pacific paradise",
        "twin waters"
      ]
    },
    {
      name: "Outback Queensland",
      state: "QLD",
      keywords: [
        "outback queensland",
        "birdsville",
        "mount isa",
        "longreach",
        "winton",
        "cloncurry",
        "charleville",
        "roma",
        "quilpie",
        "cunnamulla"
      ]
    },
    {
      name: "Mornington Peninsula",
      state: "VIC",
      keywords: [
        "mornington peninsula",
        "cape schanck",
        "st andrews beach",
        "fingal",
        "rosebud",
        "rye",
        "dromana",
        "sorrento",
        "flinders"
      ]
    },
    {
      name: "Melbourne Sandbelt",
      state: "VIC",
      keywords: [
        "melbourne sandbelt",
        "sandbelt",
        "beaumaris",
        "cheltenham",
        "heatherton",
        "black rock",
        "oakleigh south",
        "bentleigh east",
        "keysborough",
        "mordialloc"
      ]
    }
  ];

  enrichTop100Rankings();
  var MAP_STYLES = {
    map: "https://tiles.openfreemap.org/styles/liberty",
    satellite: {
      version: 8,
      sources: {
        "esri-world-imagery": {
          type: "raster",
          tiles: [
            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          ],
          tileSize: 256,
          attribution: "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
        }
      },
      layers: [
        {
          id: "esri-world-imagery",
          type: "raster",
          source: "esri-world-imagery",
          minzoom: 0,
          maxzoom: 19
        }
      ]
    }
  };
  var state = {
    query: "",
    stateFilter: "all",
    priceFilter: "all",
    mapStyle: "map",
    selectedId: courses[0] ? courses[0].id : null,
    filtered: courses.slice()
  };

  var elements = {
    searchInput: document.querySelector("#searchInput"),
    stateFilter: document.querySelector("#stateFilter"),
    priceFilter: document.querySelector("#priceFilter"),
    nearMeButton: document.querySelector("#nearMeButton"),
    clearButton: document.querySelector("#clearButton"),
    mapModeButtons: document.querySelectorAll("#mapModeToggle button"),
    selectedCourse: document.querySelector("#selectedCourse"),
    resultCount: document.querySelector("#resultCount"),
    resultsList: document.querySelector("#resultsList"),
    mapStatus: document.querySelector("#mapStatus")
  };

  var markerById = new Map();
  var map;
  var popup;
  var statusTimer;
  var CLUSTER_MAX_ZOOM = 6.8;

  init();

  function init() {
    hydrateStateFilter();
    render();
    initMap();
    bindEvents();
    registerServiceWorker();
  }

  function hydrateStateFilter() {
    var states = Array.from(new Set(courses.map(function (course) { return course.state; }))).sort();
    var html = ['<option value="all">All states</option>'];
    states.forEach(function (code) {
      html.push('<option value="' + escapeAttribute(code) + '">' + escapeHtml(code) + '</option>');
    });
    elements.stateFilter.innerHTML = html.join("");
  }

  function bindEvents() {
    elements.searchInput.addEventListener("input", function (event) {
      state.query = event.target.value.trim();
      keepSearchFocus(function () {
        applyFilters(true);
      });
    });

    elements.stateFilter.addEventListener("change", function (event) {
      state.stateFilter = event.target.value;
      applyFilters(true);
    });

    elements.priceFilter.addEventListener("change", function (event) {
      state.priceFilter = event.target.value;
      applyFilters(true);
    });

    elements.clearButton.addEventListener("click", function () {
      state.query = "";
      state.stateFilter = "all";
      state.priceFilter = "all";
      elements.searchInput.value = "";
      elements.stateFilter.value = "all";
      elements.priceFilter.value = "all";
      applyFilters(true);
    });

    elements.nearMeButton.addEventListener("click", selectNearestCourse);

    elements.mapModeButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        setMapStyle(button.dataset.mapStyle);
      });
    });

    document.addEventListener("error", function (event) {
      var image = event.target;
      if (image && image.matches && image.matches("img.course-image") && image.dataset.fallback !== "used") {
        image.dataset.fallback = "used";
        image.src = image.dataset.fallbackSrc || "assets/course-photo-fallback.svg";
        image.classList.remove("logo-image");
        var media = image.closest(".course-media");
        if (media) {
          media.classList.remove("logo-card");
        }
      }
    }, true);
  }

  function initMap() {
    if (!window.maplibregl) {
      showStatus("Map library could not load.");
      return;
    }

    map = new maplibregl.Map({
      container: "map",
      style: MAP_STYLES.map,
      center: [134.5, -25.4],
      zoom: 3.4,
      minZoom: 3,
      maxBounds: [
        [105.0, -45.8],
        [160.5, -8.0]
      ],
      attributionControl: true
    });

    popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      focusAfterOpen: false,
      offset: 26
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", function () {
      renderMarkers();
      fitToCourses(state.filtered, { maxZoom: 4.2, instant: true });
      var selected = getSelectedCourse();
      if (selected) {
        showCoursePopup(selected);
      }
    });

    map.on("zoomend", renderMarkers);
    map.on("moveend", renderMarkers);
  }

  function keepSearchFocus(callback) {
    var shouldRestore = document.activeElement === elements.searchInput;
    var start = elements.searchInput.selectionStart;
    var end = elements.searchInput.selectionEnd;
    callback();
    if (!shouldRestore) {
      return;
    }

    window.requestAnimationFrame(function () {
      elements.searchInput.focus({ preventScroll: true });
      if (typeof start === "number" && typeof end === "number") {
        elements.searchInput.setSelectionRange(start, end);
      }
    });
  }

  function setMapStyle(nextStyle) {
    if (!map || !MAP_STYLES[nextStyle] || state.mapStyle === nextStyle) {
      return;
    }

    state.mapStyle = nextStyle;
    map.setStyle(MAP_STYLES[nextStyle]);
    elements.mapModeButtons.forEach(function (button) {
      var isActive = button.dataset.mapStyle === nextStyle;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    renderMarkers();
    var selected = getSelectedCourse();
    if (selected) {
      showCoursePopup(selected);
    }
    showStatus(nextStyle === "satellite" ? "Satellite view" : "Map view");
  }

  function applyFilters(shouldMoveMap) {
    var query = normalise(state.query);
    var maxPrice = state.priceFilter === "all" ? Infinity : Number(state.priceFilter);

    state.filtered = courses.filter(function (course) {
      var searchable = normalise([
        course.name,
        (course.aliases || []).join(" "),
        course.town,
        course.region,
        course.state,
        course.access,
        course.holes,
        course.summary,
        courseTravelRegions(course).join(" ")
      ].join(" "));

      var matchesQuery = !query || searchable.includes(query);
      var matchesState = state.stateFilter === "all" || course.state === state.stateFilter;
      var matchesPrice = course.priceLevel <= maxPrice;
      return matchesQuery && matchesState && matchesPrice;
    });

    if (query) {
      state.filtered.sort(function (a, b) {
        return searchRank(b, query) - searchRank(a, query);
      });
    }

    if (!state.filtered.some(function (course) { return course.id === state.selectedId; })) {
      state.selectedId = state.filtered[0] ? state.filtered[0].id : null;
    }

    render();
    renderMarkers();

    if (shouldMoveMap && map && state.filtered.length) {
      fitToCourses(state.filtered, { maxZoom: state.filtered.length === 1 ? 11 : 7 });
    }

    var selected = getSelectedCourse();
    if (selected && map) {
      showCoursePopup(selected);
    } else if (popup) {
      popup.remove();
    }
  }

  function searchRank(course, query) {
    var name = normalise(course.name);
    var aliases = normalise((course.aliases || []).join(" "));
    var town = normalise(course.town);
    var region = normalise(course.region);
    var travelRegions = courseTravelRegions(course).map(normalise);
    var stateCode = normalise(course.state);

    if (name === query) return 100;
    if (name.indexOf(query) === 0) return 90;
    if (aliases === query) return 86;
    if (town === query) return 80;
    if (region === query) return 72;
    if (travelRegions.indexOf(query) !== -1) return 70;
    if (stateCode === query) return 60;
    if (name.includes(query)) return 50;
    if (aliases.includes(query)) return 46;
    if (town.includes(query)) return 40;
    if (region.includes(query)) return 32;
    if (travelRegions.some(function (travelRegion) { return travelRegion.includes(query) || query.includes(travelRegion); })) return 30;
    return 10;
  }


  function courseTravelRegions(course) {
    var text = normalise([course.name, course.town, course.region, course.state, course.summary].join(" "));

    return TRAVEL_REGION_ALIASES.filter(function (travelRegion) {
      if (travelRegion.state && course.state !== travelRegion.state) {
        return false;
      }

      return travelRegion.keywords.some(function (keyword) {
        return text.includes(normalise(keyword));
      });
    }).map(function (travelRegion) {
      return travelRegion.name;
    });
  }

  function enrichTop100Rankings() {
    if (!top100Rankings.length) {
      return;
    }

    top100Rankings.forEach(function (ranking) {
      ranking._key = rankingKey(ranking.name);
      ranking._state = rankingState(ranking.location);
    });

    courses.forEach(function (course) {
      var rankings = findTop100Rankings(course);
      if (rankings.length) {
        var ranking = rankings[0];
        course.top100Rankings = [ranking];
        course.top100Rank = ranking.rank;
        course.top100Name = ranking.name;
        course.top100Url = ranking.url;
      } else {
        delete course.top100Rankings;
        delete course.top100Rank;
        delete course.top100Name;
        delete course.top100Url;
      }
    });
  }

  function findTop100Rankings(course) {
    var courseKey = rankingKey(course.name);
    var matches = [];

    top100Rankings.forEach(function (ranking) {
      var manualIds = Array.isArray(ranking.courseIds) ? ranking.courseIds : [];
      if (manualIds.indexOf(course.id) !== -1) {
        matches.push({ ranking: ranking, score: 200 });
        return;
      }

      if (ranking._state && course.state && ranking._state !== course.state) {
        return;
      }

      var score = rankingMatchScore(courseKey, ranking._key);
      if (score >= 60) {
        matches.push({ ranking: ranking, score: score });
      }
    });

    var seenRanks = {};
    return matches
      .sort(function (a, b) {
        return a.ranking.rank - b.ranking.rank || b.score - a.score;
      })
      .filter(function (match) {
        if (seenRanks[match.ranking.rank]) {
          return false;
        }
        seenRanks[match.ranking.rank] = true;
        return true;
      })
      .map(function (match) { return match.ranking; });
  }

  function rankingMatchScore(courseKey, rankingCourseKey) {
    if (!courseKey || !rankingCourseKey) {
      return 0;
    }

    if (courseKey === rankingCourseKey) {
      return 100;
    }

    var courseTokens = courseKey.split(" ");
    var rankingTokens = rankingCourseKey.split(" ");

    if (courseTokens.length >= 2 && rankingTokens.length >= 2 && rankingCourseKey.includes(courseKey)) {
      return 82;
    }

    if (courseTokens.length >= 2 && rankingTokens.length >= 2 && courseKey.includes(rankingCourseKey)) {
      return 76;
    }

    var uniqueCourseTokens = courseTokens.filter(function (token, index) { return courseTokens.indexOf(token) === index; });
    var uniqueRankingTokens = rankingTokens.filter(function (token, index) { return rankingTokens.indexOf(token) === index; });
    var shared = uniqueRankingTokens.filter(function (token) { return uniqueCourseTokens.includes(token); });
    var required = Math.min(uniqueCourseTokens.length, uniqueRankingTokens.length);

    if (required >= 2 && shared.length >= required) {
      return 68;
    }

    return 0;
  }

  function rankingState(location) {
    var stateName = String(location || "").split(",")[0].trim();
    return TOP100_STATE_CODES[stateName] || "";
  }

  function rankingKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\baustralia\b/g, " ")
      .replace(/\(([^)]*)\)/g, " $1 ")
      .replace(/-/g, " ")
      .replace(/\b(the|golf|club|course|country|resort|public|hotel|and)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function render() {
    renderSelectedCourse();
    renderResults();
  }

  function renderSelectedCourse() {
    var course = getSelectedCourse();
    if (!course) {
      elements.selectedCourse.innerHTML = '<div class="empty-selection">No matching courses.</div>';
      return;
    }

    var links = courseLinks(course);
    var rankingBadge = top100Badge(course, "detail-top100");

    var mediaClass = course.mediaKind === "logo" ? " logo-card" : "";
    var imageClass = course.mediaKind === "logo" ? " course-image logo-image" : " course-image";
    elements.selectedCourse.innerHTML =
      '<article class="course-detail">' +
        '<div class="course-media' + mediaClass + '">' +
          '<img class="' + imageClass + '" src="' + escapeAttribute(course.imageUrl) + '" data-fallback-src="' + escapeAttribute(course.fallbackImageUrl || "assets/course-photo-fallback.svg") + '" alt="' + escapeAttribute(course.imageAlt || course.name) + '" />' +
        '</div>' +
        '<div class="course-title-row">' +
          '<h2>' + escapeHtml(course.name) + '</h2>' +
          rankingBadge +
          '<p class="course-meta">' + escapeHtml(courseLocationLine(course)) + '</p>' +
          '<p class="course-meta">' + escapeHtml(courseInfoLine(course)) + '</p>' +
        '</div>' +
        '<div class="price-row">' +
          '<span class="price-label">Price guide</span>' +
          '<span class="price-scale" aria-label="' + priceScale(course.priceLevel) + ' relative price tier">' + priceScale(course.priceLevel) + '</span>' +
        '</div>' +
        '<p class="course-summary">' + escapeHtml(course.summary) + '</p>' +
        '<div class="course-links">' + links + '</div>' +
      '</article>';
  }

  function renderResults() {
    elements.resultCount.textContent = state.filtered.length + " shown";

    elements.resultsList.innerHTML = state.filtered.map(function (course) {
      var rankingBadge = top100Badge(course, "result-top100");
      return '<article class="course-result ' + (course.top100Rank ? "has-top100" : "") + '" aria-current="' + (course.id === state.selectedId) + '">' +
        '<button class="course-result-main" type="button" data-course-id="' + escapeAttribute(course.id) + '">' +
          '<span>' +
            '<h3>' + escapeHtml(course.name) + '</h3>' +
            '<p>' + escapeHtml(courseLocationLine(course)) + '</p>' +
            '<p>' + escapeHtml(courseInfoLine(course)) + '</p>' +
          '</span>' +
          '<span class="result-price">' + priceScale(course.priceLevel) + '</span>' +
        '</button>' +
        rankingBadge +
      '</article>';
    }).join("");

    elements.resultsList.querySelectorAll(".course-result-main").forEach(function (button) {
      button.addEventListener("click", function () {
        selectCourse(button.dataset.courseId, true);
      });
    });
  }

  function renderMarkers() {
    if (!map) {
      return;
    }

    markerById.forEach(function (marker) {
      marker.remove();
    });
    markerById.clear();

    buildClusters(state.filtered).forEach(function (cluster) {
      var marker = new maplibregl.Marker({
        element: createMarkerElement(cluster),
        anchor: "center"
      })
        .setLngLat(cluster.center)
        .addTo(map);
      markerById.set(cluster.id, marker);
    });
  }

  function buildClusters(items) {
    if (!map || map.getZoom() >= CLUSTER_MAX_ZOOM) {
      return items.map(function (course) {
        return createSingleCluster(course);
      });
    }

    var zoom = map.getZoom();
    var radius = zoom < 4 ? 50 : zoom < 5.4 ? 42 : 34;
    var maxDistanceKm = maxClusterDistanceKm(zoom);
    var projected = items.map(function (course) {
      return {
        course: course,
        point: map.project(course.coordinates)
      };
    });
    var used = new Set();
    var clusters = [];

    for (var i = 0; i < projected.length; i += 1) {
      if (used.has(i)) {
        continue;
      }

      var members = [projected[i].course];
      used.add(i);

      for (var j = i + 1; j < projected.length; j += 1) {
        if (used.has(j)) {
          continue;
        }
        var dx = projected[i].point.x - projected[j].point.x;
        var dy = projected[i].point.y - projected[j].point.y;
        var screenDistance = Math.sqrt(dx * dx + dy * dy);
        var realDistance = distanceKm(projected[i].course.coordinates, projected[j].course.coordinates);
        if (screenDistance <= radius && realDistance <= maxDistanceKm) {
          members.push(projected[j].course);
          used.add(j);
        }
      }

      clusters.push(createCourseCluster(members));
    }

    return clusters;
  }

  function maxClusterDistanceKm(zoom) {
    if (zoom < 4) {
      return 42;
    }
    if (zoom < 5.4) {
      return 28;
    }
    return 14;
  }

  function createSingleCluster(course) {
    return {
      id: "course-" + course.id,
      count: 1,
      courses: [course],
      center: course.coordinates,
      isCluster: false
    };
  }

  function createCourseCluster(members) {
    if (members.length === 1) {
      return createSingleCluster(members[0]);
    }

    var sums = members.reduce(function (next, course) {
      next.lng += course.coordinates[0];
      next.lat += course.coordinates[1];
      return next;
    }, { lng: 0, lat: 0 });
    var centroid = [sums.lng / members.length, sums.lat / members.length];
    var anchor = members
      .slice()
      .sort(function (a, b) {
        return coordinateDistance(a.coordinates, centroid) - coordinateDistance(b.coordinates, centroid);
      })[0];

    return {
      id: "cluster-" + members.map(function (course) { return course.id; }).sort().join("-"),
      count: members.length,
      courses: members,
      center: anchor.coordinates,
      isCluster: true
    };
  }

  function coordinateDistance(a, b) {
    var dx = a[0] - b[0];
    var dy = a[1] - b[1];
    return dx * dx + dy * dy;
  }

  function createMarkerElement(cluster) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = cluster.isCluster ? "course-marker cluster-marker" : "course-marker";

    if (cluster.isCluster) {
      button.setAttribute("aria-label", cluster.count + " courses in this area");
      button.innerHTML = '<span class="marker-ball"><span class="marker-count">' + cluster.count + '</span></span>';
      button.addEventListener("mouseenter", function () { showClusterPopup(cluster); });
      button.addEventListener("mouseleave", function () { popup.remove(); });
      button.addEventListener("click", function () {
        fitToCourses(cluster.courses, { maxZoom: Math.min(11, map.getZoom() + 2.5) });
        showClusterPopup(cluster);
      });
      return button;
    }

    var course = cluster.courses[0];
    button.setAttribute("aria-label", course.name);
    button.classList.toggle("is-active", course.id === state.selectedId);
    button.innerHTML = '<span class="marker-ball"></span>';

    button.addEventListener("mouseenter", function () { showCoursePopup(course); });
    button.addEventListener("mouseleave", function () {
      if (course.id !== state.selectedId) {
        popup.remove();
      }
    });
    button.addEventListener("click", function () {
      selectCourse(course.id, false);
      showCoursePopup(course);
    });

    return button;
  }

  function selectCourse(id, shouldFly) {
    var course = courses.find(function (item) { return item.id === id; });
    if (!course) {
      return;
    }

    state.selectedId = id;
    render();
    renderMarkers();
    showCoursePopup(course);

    if (shouldFly && map) {
      map.flyTo({
        center: course.coordinates,
        zoom: Math.max(map.getZoom(), 10.5),
        duration: 650
      });
    }
  }

  function showCoursePopup(course) {
    if (!map || !popup) {
      return;
    }

    var popupLinks = coursePopupLinks(course);
    var rankingBadge = top100Badge(course, "popup-top100");
    var imageClass = course.mediaKind === "logo" ? "course-image logo-image" : "course-image";

    popup
      .setLngLat(course.coordinates)
      .setHTML(
        '<div class="popup-card">' +
          '<img class="' + imageClass + '" src="' + escapeAttribute(course.imageUrl) + '" data-fallback-src="' + escapeAttribute(course.fallbackImageUrl || "assets/course-photo-fallback.svg") + '" alt="" />' +
          '<div>' +
            '<h3>' + escapeHtml(course.name) + '</h3>' +
            rankingBadge +
            '<p>' + escapeHtml(courseLocationLine(course)) + ' - ' + priceScale(course.priceLevel) + '</p>' +
            '<div class="popup-links">' + popupLinks + '</div>' +
          '</div>' +
        '</div>'
      )
      .addTo(map);
  }

  function showClusterPopup(cluster) {
    if (!map || !popup) {
      return;
    }

    var preview = cluster.courses.slice(0, 5).map(function (course) {
      return '<li>' + escapeHtml(course.name) + '</li>';
    }).join("");
    var extra = cluster.courses.length > 5 ? '<li>+' + (cluster.courses.length - 5) + ' more</li>' : "";

    popup
      .setLngLat(cluster.center)
      .setHTML(
        '<div class="cluster-popup">' +
          '<h3>' + cluster.count + ' courses nearby</h3>' +
          '<ul>' + preview + extra + '</ul>' +
          '<p>Click the ball to zoom in.</p>' +
        '</div>'
      )
      .addTo(map);
  }

  function selectNearestCourse() {
    if (!navigator.geolocation) {
      showStatus("Location is unavailable on this device.");
      return;
    }

    showStatus("Finding nearby courses...");
    navigator.geolocation.getCurrentPosition(
      function (position) {
        var origin = [position.coords.longitude, position.coords.latitude];
        var nearest = courses
          .map(function (course) {
            return {
              course: course,
              distance: distanceKm(origin, course.coordinates)
            };
          })
          .sort(function (a, b) { return a.distance - b.distance; })[0];

        if (!nearest) {
          showStatus("No courses available.");
          return;
        }

        state.query = "";
        state.stateFilter = "all";
        state.priceFilter = "all";
        elements.searchInput.value = "";
        elements.stateFilter.value = "all";
        elements.priceFilter.value = "all";
        state.filtered = courses.slice();
        selectCourse(nearest.course.id, true);
        renderResults();
        renderMarkers();
        showStatus(nearest.course.name + " is about " + Math.round(nearest.distance) + " km away.");
      },
      function () {
        showStatus("Location permission was not granted.");
      },
      {
        enableHighAccuracy: true,
        timeout: 9000,
        maximumAge: 300000
      }
    );
  }

  function fitToCourses(items, options) {
    options = options || {};
    if (!map || !items.length) {
      return;
    }

    if (items.length === 1) {
      map[options.instant ? "jumpTo" : "flyTo"]({
        center: items[0].coordinates,
        zoom: options.maxZoom || 10
      });
      return;
    }

    var bounds = new maplibregl.LngLatBounds();
    items.forEach(function (course) {
      bounds.extend(course.coordinates);
    });

    map.fitBounds(bounds, {
      padding: { top: 54, right: 54, bottom: 54, left: 54 },
      maxZoom: options.maxZoom || 6,
      duration: options.instant ? 0 : 650
    });
  }

  function getSelectedCourse() {
    return courses.find(function (course) { return course.id === state.selectedId; }) || null;
  }

  function courseLinks(course) {
    var links = "";
    if (course.homepageUrl) {
      links += linkButton(course.homepageUrl, "Website", false);
    } else if (course.webSearchUrl) {
      links += linkButton(course.webSearchUrl, "Find online", false);
    }
    if (course.bookingUrl) {
      links += linkButton(course.bookingUrl, "Book", true);
    }
    (course.top100Rankings || []).forEach(function (ranking) {
      links += linkButton(ranking.url, "Top 100 #" + ranking.rank, false);
    });
    if (!links && course.sourceUrl) {
      links += linkButton(course.sourceUrl, "Map data", false);
    }
    return links;
  }

  function coursePopupLinks(course) {
    var links = "";
    if (course.homepageUrl) {
      links += popupLink(course.homepageUrl, "Website");
    } else if (course.webSearchUrl) {
      links += popupLink(course.webSearchUrl, "Find online");
    }
    if (course.bookingUrl) {
      links += popupLink(course.bookingUrl, "Book");
    }
    (course.top100Rankings || []).forEach(function (ranking) {
      links += popupLink(ranking.url, "Top 100 #" + ranking.rank);
    });
    if (!links && course.sourceUrl) {
      links += popupLink(course.sourceUrl, "Map data");
    }
    return links;
  }

  function courseLocationLine(course) {
    var seen = {};
    return [course.town, course.region, course.state].filter(function (part) {
      var value = String(part || "").trim();
      var key = normalise(value);
      if (!value || value === "Australia" || seen[key]) {
        return false;
      }
      seen[key] = true;
      return true;
    }).join(" - ");
  }

  function courseInfoLine(course) {
    var details = [];
    if (course.holes) {
      details.push(course.holes + " holes");
    }
    if (course.access) {
      details.push(course.access);
    }
    return details.join(" - ") || "Golf course";
  }

  function top100Badge(course, extraClass) {
    var rankings = course.top100Rankings || [];
    if (!rankings.length && course.top100Rank && course.top100Url) {
      rankings = [{ rank: course.top100Rank, name: course.top100Name || course.name, url: course.top100Url }];
    }
    if (!rankings.length) {
      return "";
    }

    return '<span class="top100-badge-list ' + escapeAttribute(extraClass || "") + '">' + rankings.map(function (ranking) {
      return '<a class="top100-badge" href="' + escapeAttribute(ranking.url) + '" target="_blank" rel="noopener noreferrer" aria-label="Top100 Golf Courses rank ' + ranking.rank + ' for ' + escapeAttribute(ranking.name || course.name) + '">Top 100 #' + ranking.rank + '</a>';
    }).join("") + '</span>';
  }

  function linkButton(url, label, primary) {
    return '<a class="link-button ' + (primary ? "primary" : "") + '" href="' + escapeAttribute(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + '</a>';
  }

  function popupLink(url, label) {
    return '<a href="' + escapeAttribute(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + '</a>';
  }

  function priceScale(level) {
    var safeLevel = Math.max(2, Math.min(5, Number(level) || 2));
    return "$".repeat(safeLevel);
  }

  function normalise(value) {
    return String(value).toLowerCase().replace(/\s+/g, " ").trim();
  }

  function distanceKm(from, to) {
    var earthRadius = 6371;
    var dLat = toRadians(to[1] - from[1]);
    var dLon = toRadians(to[0] - from[0]);
    var lat1 = toRadians(from[1]);
    var lat2 = toRadians(to[1]);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return earthRadius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  function toRadians(value) {
    return (value * Math.PI) / 180;
  }

  function showStatus(message) {
    window.clearTimeout(statusTimer);
    elements.mapStatus.textContent = message;
    elements.mapStatus.classList.add("is-visible");
    statusTimer = window.setTimeout(function () {
      elements.mapStatus.classList.remove("is-visible");
    }, 4200);
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
      navigator.serviceWorker.register("service-worker.js").catch(function () {});
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
