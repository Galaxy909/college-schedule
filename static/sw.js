/**
 * sw.js — Service Worker с Network-First стратегией и поддержкой уведомлений.
 * Версия v7: динамическое расписание звонков по дням недели (Пн / Вт–Пт / Сб).
 */

const CACHE_NAME = "schedule-v7";
const STATIC_ASSETS = [
  "/static/index.html",
  "/static/style.css?v=7",
  "/static/app.js?v=7",
  "/static/manifest.json?v=7",
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

// Обработка клика по системному уведомлению: фокусируем вкладку или открываем сайт
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data?.url || "/");
      }
    })
  );
});
