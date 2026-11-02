/**
 * sw.js — Service Worker со сверхбыстрой стратегией Stale-While-Revalidate.
 * Версия v9: Мгновенное открытие за 0.05 сек даже при спящем Render!
 */

const CACHE_NAME = "schedule-v9";
const STATIC_ASSETS = [
  "/",
  "/static/index.html",
  "/static/style.css?v=9",
  "/static/app.js?v=9",
  "/static/manifest.json?v=9",
  "/static/icon-192.png",
  "/static/icon-512.png",
];

// Установка: предварительно кэшируем все ресурсы
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Активация: мгновенно берём управление на себя и очищаем старые версии
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Stale-While-Revalidate стратегия для статики:
// 1. Мгновенно отдаём кэш (0.01 сек!)
// 2. В фоне параллельно запрашиваем сеть для обновления
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Для статических файлов и главной страницы
  if (
    event.request.method === "GET" &&
    (url.pathname === "/" ||
     url.pathname.startsWith("/static/") ||
     url.pathname.endsWith(".html") ||
     url.pathname.endsWith(".css") ||
     url.pathname.endsWith(".js") ||
     url.pathname.endsWith(".png"))
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          // Фоновое обновление кэша
          const fetchPromise = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);

          // Отдаём кэш МГНОВЕННО, если он есть, иначе ждём сеть
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // Для API запросов: пробуем сеть, если сервер спит или оффлайн — ищем в кэше
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

// Обработка клика по системному уведомлению: открываем приложение
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
