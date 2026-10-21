/**
 * sw.js — Service Worker с Network-First стратегией.
 * Обновления применяются МГНОВЕННО при наличии интернета,
 * а при отсутствии сети сайт загружается из кэша.
 */

const CACHE_NAME = "schedule-v2";
const STATIC_ASSETS = [
  "/static/index.html",
  "/static/style.css?v=2",
  "/static/app.js?v=2",
  "/static/manifest.json",
  "/static/icon-192.png",
  "/static/icon-512.png",
];

// Установка: кэшируем актуальные файлы
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Активация: мгновенно удаляем весь старый кэш
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First стратегия: всегда берём свежее из сети,
// а если нет интернета — достаём из кэша
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
