// Service worker: lets the flashcards work offline once they have been opened.
//
// The app's own files are fetched network-first, so an online visit always gets
// the latest version of every file together, and fall back to the cache when
// offline or when the server errors. Google Fonts files never change, so they
// are served cache-first. Bump VERSION when the list of app files changes.

var VERSION = "v2";
var PREFIX = "greek-flashcards-";
var APP_CACHE = PREFIX + VERSION;
var FONT_CACHE = PREFIX + "fonts-" + VERSION;

var APP_FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "greek_vocab.json",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(function (cache) { return cache.addAll(APP_FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

// Remove only this app's older caches: on GitHub Pages every project of a user
// shares one origin, so other sites' caches live here too.
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (key) { return key.indexOf(PREFIX) === 0 && key !== APP_CACHE && key !== FONT_CACHE; })
          .map(function (key) { return caches.delete(key); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(event));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(event));
  }
});

// A response worth keeping: a real success, not a redirect (e.g. a Wi-Fi login page).
function cacheable(response) {
  return response.ok && !response.redirected;
}

function store(event, cacheName, request, response) {
  event.waitUntil(
    caches.open(cacheName)
      .then(function (cache) { return cache.put(request, response); })
      .catch(function () { /* full or unavailable storage: serve without caching */ })
  );
}

function networkFirst(event) {
  var request = event.request;
  var fromCache = function () { return caches.match(request, { ignoreSearch: true }); };
  return fetch(request).then(function (response) {
    if (cacheable(response)) {
      store(event, APP_CACHE, request, response.clone());
      return response;
    }
    // Server error or similar: prefer the last good copy if there is one.
    return fromCache().then(function (cached) { return cached || response; });
  }, function () {
    return fromCache().then(function (cached) { return cached || Response.error(); });
  });
}

// The font stylesheet is requested with CORS (crossorigin on the <link>), so its
// status is readable and only successful responses are kept.
function cacheFirst(event) {
  var request = event.request;
  return caches.match(request).then(function (cached) {
    if (cached) return cached;
    return fetch(request).then(function (response) {
      if (cacheable(response)) store(event, FONT_CACHE, request, response.clone());
      return response;
    });
  });
}
