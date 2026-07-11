const CACHE_NAME = "golf-course-finder-v37";
const APP_SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "courses.js",
  "top100-rankings.js",
  "manifest.webmanifest",
  "assets/icon.svg",
  "assets/course-placeholder.svg",
  "assets/course-photo-fallback.svg",
  "assets/burns-club-belconnen-logo.png",
  "assets/golf-ball-marker.svg",
  "assets/grass-texture.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
