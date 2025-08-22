const CACHE = "moodtags-v3"; // bumped so you get the new JS/CSS
const ASSETS = ["index.html", "styles.css", "script.js", "manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;

  // Offline navigation fallback to index.html
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("index.html")));
    return;
  }

  // Cache-first for our small app shell
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/+/, "");
  if (ASSETS.includes(path)) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
    return;
  }

  // Network-first for everything else
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
