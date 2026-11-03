const CACHE = 'agriforesight-shell-v11-hosted-demo';
const FILES = ['/', '/static/style.css', '/static/app.js', '/static/chat.js', '/static/assistant-mark.svg', '/static/manifest.json', '/static/icon.svg'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('agriforesight-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) { const clone = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, clone)); } return response; }).catch(() => caches.match(event.request).then(cached => cached || new Response('Offline resource unavailable', {status:503}))));
});
