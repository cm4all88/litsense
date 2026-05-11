const CACHE = 'litsense-v2';

const PRECACHE = [
  '/',
  '/index.html',
  '/backgrounds/2y88r.jpg',
  '/backgrounds/zorEp.jpg',
  '/backgrounds/laZvI.jpg',
  '/backgrounds/I6yup.jpg',
  '/backgrounds/mLL3D.jpg',
  '/backgrounds/yAZGN.jpg',
  '/backgrounds/2Xnwr.jpg',
  '/backgrounds/5YgWB.jpg',
  '/backgrounds/6XTvH.jpg',
  '/backgrounds/chrBZ.jpg',
];

// Never cache these — always fetch live
const BYPASS = [
  'supabase.co',
  'stripe.com',
  'anthropic.com',
  'resend.com',
  'googleapis.com',
  'easypost.com',
  '/api/',
  '/rest/v1/',
  '/auth/v1/',
  '/storage/v1/',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // Never cache API or external service calls
  const url = e.request.url;
  if (BYPASS.some(b => url.includes(b))) return;

  // Only cache same-origin static assets
  const isStatic = url.match(/\.(js|css|png|jpg|jpeg|gif|webp|svg|woff2?|ico)(\?|$)/);
  if (!isStatic && !url.includes(self.location.origin)) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok && isStatic) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
      return cached || network;
    })
  );
});


const PRECACHE = [
  '/',
  '/index.html',
  '/backgrounds/2y88r.jpg',
  '/backgrounds/zorEp.jpg',
  '/backgrounds/laZvI.jpg',
  '/backgrounds/I6yup.jpg',
  '/backgrounds/mLL3D.jpg',
  '/backgrounds/yAZGN.jpg',
  '/backgrounds/2Xnwr.jpg',
  '/backgrounds/5YgWB.jpg',
  '/backgrounds/6XTvH.jpg',
  '/backgrounds/chrBZ.jpg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
      return cached || network;
    })
  );
});
