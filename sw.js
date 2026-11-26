const cacheName = 'xiamen-journal-v3';
const paths = [
  './', './index.html', './credits.html', './manifest.webmanifest',
  './assets/css/app.css', './assets/js/app.js', './assets/js/state.js', './assets/js/geo-map.js',
  './assets/vendor/leaflet/leaflet.js', './assets/vendor/leaflet/leaflet.css',
  './assets/icons/mark.svg', './assets/icons/icon-180.png', './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/images/cover.webp', './assets/images/old-town.webp', './assets/images/jimei.webp',
  './assets/images/coast.webp', './assets/images/island.webp', './assets/images/departure.webp',
  './data/itinerary.json', './data/attractions.json', './data/food.json', './data/budget.json', './data/backup-spots.json', './data/map-positions.json'
];
const assets = new Set(paths.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(paths.map(path => new Request(path, {cache:'reload'})))));
});
self.addEventListener('message',event=>{
  if (event.data?.type==='ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('xiamen-journal-') && name !== cacheName).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  if (!assets.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(url.href);
    return cached ?? fetch(request);
  })());
});
