importScripts("/firebase-config.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");

const CACHE_NAME = "datenight-v6";
const APP_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/firebase-config.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png"
];

const configured = globalThis.DATE_NIGHT_FIREBASE?.firebaseConfig?.apiKey &&
  !globalThis.DATE_NIGHT_FIREBASE.firebaseConfig.apiKey.startsWith("PASTE_");

if (configured) {
  firebase.initializeApp(globalThis.DATE_NIGHT_FIREBASE.firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(payload => {
    const title = payload.notification?.title || payload.data?.title || "DateNight";
    const options = {
      body: payload.notification?.body || payload.data?.body || "A little message from your partner ♡",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.data?.tag || "datenight-message",
      data: { url: payload.data?.url || "/" }
    };
    return self.registration.showNotification(title, options);
  });
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/.netlify/functions/")
  ) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match("/index.html")))
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
