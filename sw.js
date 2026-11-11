/* Service worker for Arbeidshåndbok.
   - App-skallet lagres ved installasjon, så håndboken åpnes uten nett.
   - Innhold (content/*) hentes fra nett først, med lagret kopi som reserve.
   Endre VERSION når du endrer index.html, style.css, app.js eller ikoner. */
const VERSION = 'v10';
const SHELL_CACHE = 'handbok-shell-' + VERSION;
const CONTENT_CACHE = 'handbok-content';

const SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'md.js',
  'theme.js',
  'editor.html',
  'editor.js',
  'godkjenning.js',
  'imagemap.js',
  'utseende.js',
  'wordimport.js',
  'autolenker.js',
  'editor.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'content/articles.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(SHELL.filter((u) => !u.startsWith('content/')));
      try {
        const content = await caches.open(CONTENT_CACHE);
        await content.add('content/articles.json');
      } catch (e) { /* innhold hentes ved første åpning */ }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('handbok-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request, { cache: 'no-cache' });
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw e;
  }
}

// Bilder har unike navn og endres aldri: lagret kopi først, så går de raskt og virker uten nett
async function contentCacheFirst(request) {
  const cache = await caches.open(CONTENT_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) {
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, fresh.clone());
  }
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Bilder: lagret kopi først
  if (url.pathname.includes('/content/bilder/')) {
    event.respondWith(contentCacheFirst(req));
    return;
  }

  // Innhold i content/: nett først, lagret kopi som reserve
  if (url.pathname.includes('/content/')) {
    event.respondWith(networkFirst(req, CONTENT_CACHE));
    return;
  }

  // Sidenavigasjon: gi lagret side (index.html eller editor.html), også uten nett
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(req, { ignoreSearch: true })
        .then((r) => r || caches.match('index.html'))
        .then((r) => r || fetch(req))
    );
    return;
  }

  event.respondWith(cacheFirst(req));
});
