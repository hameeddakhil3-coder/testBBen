const VERSION = "bben-pwa-v2";
const SHELL_CACHE = VERSION + "-shell";
const PAGE_CACHE = VERSION + "-pages";
const STATIC_CACHE = VERSION + "-static";
const SHELL_URLS = ["/offline.html", "/manifest.webmanifest", "/icons/bben.svg"];
const STATIC_EXTENSIONS = /\.(?:css|js|svg|png|webp|jpg|jpeg|woff2?)$/i;
const PRIVATE_NAVIGATION_PATHS = ["/seller.html", "/merchant-profile.html", "/customer-profile.html", "/platform.html"];

function isPrivateNavigation(pathname) {
  return PRIVATE_NAVIGATION_PATHS.includes(pathname) || pathname === "/platform" || pathname.startsWith("/platform/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("bben-pwa-") && ![SHELL_CACHE, PAGE_CACHE, STATIC_CACHE].includes(key)).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get("content-type")?.includes("text/html") && !url.search && !isPrivateNavigation(url.pathname)) {
          const cache = await caches.open(PAGE_CACHE);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return (await caches.match("/offline.html")) || new Response("أنت غير متصل بالإنترنت. أعد الاتصال ثم حاول مجددًا.", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  if (STATIC_EXTENSIONS.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      const update = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
      return cached || update;
    })());
  }
});