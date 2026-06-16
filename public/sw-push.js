// Messaging service worker for Aura of Accord web-push notifications.
// Does NOT cache the app shell. Stays out of the Lovable PWA skill's
// app-shell rules (see PWA skill: messaging workers are separate).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Aura of Accord", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Aura of Accord";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.url || "/" },
    tag: payload.tag || "aura-notification",
    renotify: true,
    vibrate: [120, 60, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      try {
        const u = new URL(client.url);
        if (u.origin === self.location.origin) {
          client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      } catch {}
    }
    await self.clients.openWindow(target);
  })());
});