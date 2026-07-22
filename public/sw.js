/**
 * AEGIS·SENTRY v4.0 — Service Worker
 *
 * Offline-first PWA strategy:
 *   - App shell: cache-first (instant load)
 *   - API data:  stale-while-revalidate (fresh but fast)
 *   - Fonts/assets: cache-first with expiry
 *
 * Reference: MDN Service Worker API, Workbox patterns
 */

const CACHE_VERSION = "aegis-sentry-v4.0.0";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

const APP_SHELL_URLS = [
  "/",
  "/manifest.json",
];

const API_CACHE_RULES = [
  { pattern: /\/api\/threats/, maxAge: 300_000 },       // 5 min
  { pattern: /\/api\/approaches/, maxAge: 600_000 },     // 10 min
  { pattern: /\/api\/docs/, maxAge: 3_600_000 },         // 1 hour
  { pattern: /\/api\/object\//, maxAge: 300_000 },       // 5 min
  { pattern: /\/api\/evolution/, maxAge: 300_000 },
  { pattern: /\/api\/deflect/, maxAge: 300_000 },
  { pattern: /\/api\/observatory/, maxAge: 60_000 },     // 1 min (live)
  { pattern: /\/api\/annotations/, maxAge: 30_000 },     // 30s
];

/* ── INSTALL ── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE ── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ── FETCH ── */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // API routes → stale-while-revalidate with TTL
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(staleWhileRevalidate(request, url));
    return;
  }

  // Static assets → cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // App shell / pages → network-first with cache fallback
  event.respondWith(networkFirst(request, APP_SHELL_CACHE));
});

/* ── STRATEGIES ── */

async function staleWhileRevalidate(request, url) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);

  // Check TTL
  let fresh = false;
  if (cached) {
    const cachedTime = cached.headers.get("x-sw-cached-at");
    const rule = API_CACHE_RULES.find((r) => r.pattern.test(url.pathname));
    const maxAge = rule ? rule.maxAge : 300_000;
    if (cachedTime && Date.now() - parseInt(cachedTime) < maxAge) {
      fresh = true;
    }
  }

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        const clone = response.clone();
        const headers = new Headers(clone.headers);
        headers.set("x-sw-cached-at", String(Date.now()));
        const stamped = new Response(clone.body, {
          status: clone.status,
          statusText: clone.statusText,
          headers,
        });
        cache.put(request, stamped);
      }
      return response;
    })
    .catch(() => cached);

  if (cached && fresh) return cached;
  return fetchPromise;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    return cached || new Response("Offline — AEGIS·SENTRY", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }
}

/* ── BACKGROUND SYNC (annotations) ── */
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-annotations") {
    event.waitUntil(syncAnnotations());
  }
});

async function syncAnnotations() {
  // Read queued annotations from IndexedDB and POST to server
  // Placeholder: actual implementation uses idb-keyval
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: "ANNOTATIONS_SYNCED" });
  });
}

/* ── PUSH NOTIFICATIONS (observatory alerts) ── */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || "AEGIS·SENTRY Alert";
    const options = {
      body: data.body || "New asteroid alert detected.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-72.png",
      vibrate: [100, 50, 100],
      data: { url: data.url || "/" },
      actions: data.actions || [],
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    /* malformed push */
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});