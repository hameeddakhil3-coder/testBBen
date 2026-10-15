self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: event.data?.text() || "" }; }
  const title = data.title || "BBen";
  const options = {
    body: data.body || "لديك إشعار جديد في BBen.",
    icon: "/icons/bben-notification.png",
    badge: "/icons/bben-notification.png",
    tag: data.tag || "bben-" + (data.id || Date.now()),
    data: { url: data.url || "/market.html" },
    renotify: false,
    dir: "rtl",
    lang: "ar"
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/market.html", self.location.origin);
  if (target.origin !== self.location.origin) target.href = self.location.origin + "/market.html";
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(windows => {
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        client.navigate(target.href);
        return client.focus();
      }
    }
    return clients.openWindow(target.href);
  }));
});
self.addEventListener("notificationclose", () => {});
