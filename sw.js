/* foodlog service worker - makes the app usable with no signal.
   index.html and data.json: network first, cached copy when offline.
   Google Fonts: cached after first use so the themes look the same offline.
   Meal photos: cached as you view them, plus the last 30 days on request.
   GitHub API calls are left alone - saving needs a connection. */
const V = 'v1';
const APP = 'foodlog-app-' + V, FONTS = 'foodlog-fonts-' + V, PHOTOS = 'foodlog-photos';
const PHOTO_CAP = 600;                       /* ~70 MB at ~120 KB each */
const INDEX_KEY = './index.html', DATA_KEY = './data.json';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    try { await c.put(INDEX_KEY, await fetch('./index.html', { cache: 'no-store' })); } catch (x) {}
    try { await c.put(DATA_KEY, stamp(await fetch('./data.json', { cache: 'no-store' }))); } catch (x) {}
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== APP && k !== FONTS && k !== PHOTOS) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* copy a response and record when it was fetched, so the page can say
   "log as of ..." when it has to serve this later */
function stamp(res) {
  const h = new Headers(res.headers); h.set('x-foodlog-cached-at', new Date().toISOString());
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
function markOffline(res) {
  if (!res) return res;
  const h = new Headers(res.headers); h.set('x-foodlog-offline', '1');
  return res.blob().then(b => new Response(b, { status: res.status, statusText: res.statusText, headers: h }));
}
function withTimeout(p, ms) {
  return new Promise((ok, no) => { const t = setTimeout(() => no(new Error('timeout')), ms); p.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); no(e); }); });
}

const isIndex = u => u.origin === self.location.origin && (u.pathname.endsWith('/index.html') || u.pathname.endsWith('/'));
const isData = u => u.origin === self.location.origin && u.pathname.endsWith('/data.json');
const isPhoto = u => (u.hostname === 'raw.githubusercontent.com' && u.pathname.includes('/foodlog/main/images/'))
                  || (u.origin === self.location.origin && u.pathname.includes('/images/'));
const isFont = u => u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (isIndex(u) || e.request.mode === 'navigate') e.respondWith(networkFirst(e.request, APP, INDEX_KEY, 6000, false));
  else if (isData(u)) e.respondWith(networkFirst(e.request, APP, DATA_KEY, 6000, true));
  else if (isPhoto(u)) e.respondWith(cacheFirst(e.request, PHOTOS, true));
  else if (isFont(u)) e.respondWith(cacheFirst(e.request, FONTS, false));
  /* everything else (GitHub API, YouTube, ...) goes straight to the network */
});

async function networkFirst(req, cacheName, key, ms, stampIt) {
  const c = await caches.open(cacheName);
  try {
    const res = await withTimeout(fetch(req, { cache: 'no-store' }), ms);
    if (res && res.ok) { await c.put(key, stampIt ? stamp(res.clone()) : res.clone()); return res; }
    throw new Error('bad status ' + (res && res.status));
  } catch (err) {
    const hit = await c.match(key);
    if (hit) return markOffline(hit);
    return new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}
async function cacheFirst(req, cacheName, cap) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req, { ignoreSearch: false });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) { await c.put(req, res.clone()); if (cap) trim(c); }
    return res;
  } catch (err) {
    return new Response('', { status: 503 });
  }
}
async function trim(c) {
  const keys = await c.keys();
  if (keys.length <= PHOTO_CAP) return;
  for (const k of keys.slice(0, keys.length - PHOTO_CAP)) await c.delete(k);   /* oldest first */
}

/* the page sends the photo URLs it wants kept (the last 30 days) */
self.addEventListener('message', e => {
  const m = e.data || {};
  if (m.type === 'photos' && Array.isArray(m.urls)) {
    e.waitUntil((async () => {
      const c = await caches.open(PHOTOS);
      for (const url of m.urls) {
        if (await c.match(url)) continue;
        try { const r = await fetch(url); if (r.ok || r.type === 'opaque') await c.put(url, r); } catch (x) {}
      }
      trim(c);
    })());
  }
});
