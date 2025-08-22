const CACHE = "moodtags-v1";
const ASSETS = ["index.html", "styles.css", "script.js", "manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;

  // Offline navigation fallback to index.html
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("index.html"))
    );
    return;
  }

  // Serve cached assets if available
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/+/, "");
  if (ASSETS.includes(path)) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
    return;
  }

  // Default: network-first, fallback to cache
  e.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
