// Service worker: lets the flashcards work offline once they have been opened.
//
// The app's own files are fetched network-first, so an online visit always gets
// the latest version, and fall back to the cache when offline or on a very slow
// connection. Google Fonts files never change, so they are served cache-first.
// Bump VERSION when the list of app files changes.

var VERSION = "v1";
var APP_CACHE = "greek-flashcards-" + VERSION;
var FONT_CACHE = "greek-flashcards-fonts";
var NETWORK_TIMEOUT_MS = 3000;

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

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (key) { return key !== APP_CACHE && key !== FONT_CACHE; })
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
    event.respondWith(networkFirst(request));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request));
  }
});

function networkFirst(request) {
  return caches.open(APP_CACHE).then(function (cache) {
    var fromCache = function () { return cache.match(request, { ignoreSearch: true }); };
    var network = fetch(request).then(function (response) {
      if (response.ok) cache.put(request, response.clone());
      return response;
    });
    // If the network is slow, answer from the cache; the fetch still refreshes it.
    var slow = new Promise(function (resolve) { setTimeout(resolve, NETWORK_TIMEOUT_MS); }).then(fromCache);
    network.catch(function () { /* handled below */ });

    return Promise.race([network, slow])
      .then(function (response) { return response || network; })
      .catch(function () {
        return fromCache().then(function (cached) { return cached || Response.error(); });
      });
  });
}

function cacheFirst(request) {
  return caches.open(FONT_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        // Font stylesheets load without CORS, so they come back opaque (status 0).
        if (response.ok || response.type === "opaque") cache.put(request, response.clone());
        return response;
      });
    });
  });
}
