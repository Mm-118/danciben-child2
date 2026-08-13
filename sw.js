// sw.js —— 简单的离线缓存（App Shell）
const CACHE = 'kv-app-v16';
const SHELL = ['./', './index.html', './css/style.css', './js/app.js',
  './js/store.js', './js/util.js', './js/pets.js', './js/tts.js', './js/speech.js',
  './js/sync.js', './js/views/today.js', './js/views/learn.js', './js/views/quiz.js',
  './js/views/play.js', './js/views/library.js', './js/views/pets.js', './js/views/mine.js',
  './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (/(?:books|words[^/]*|sync-config)\.json$/.test(url.pathname)) return; // 词书/索引/同步配置不缓存，始终取最新
  if (url.pathname.includes('/rest/v1/')) return; // Supabase API 不缓存
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
    const copy = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return resp;
  }).catch(() => caches.match('./index.html'))));
});
