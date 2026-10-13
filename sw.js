'use strict';
const PREFIX = 'roadly-' + self.registration.scope;
const CACHE = PREFIX + '-v03';
const ASSETS = ['./', './index.html', './style.css', './app.js', './core.js', './navigation.js', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX + '-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Only own application files. Never bulk-fetch or cache external map tiles/API results.
  const owned = new Set(ASSETS.map(p => new URL(p, self.registration.scope).href));
  if (event.request.method !== 'GET' || !owned.has(url.href)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(c => c.put(event.request, copy))); }
    return response;
  }).catch(async () => (await caches.match(event.request)) || Response.error()));
});
