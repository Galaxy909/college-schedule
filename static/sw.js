/**
 * sw.js — Service Worker для PWA (работа в офлайн-режиме)
 */

const CACHE_NAME = "schedule-v1";
const STATIC_ASSETS = [
  "/static/index.html",
  "/static/style.css",
  "/static/app.js",
  "/static/manifest.json",
  "/static/icon-192.png",
  "/static/icon-512.png",
];

// Установка: кэшируем статические файлы
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Активация: чистим старые кэши
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Перехват запросов (Network-first с кэш-бэкапом)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Для API: сначала пробуем сеть, если нет интернета — отдаем из кэша
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Для статики: сначала ищем в кэше, иначе берем из сети
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
