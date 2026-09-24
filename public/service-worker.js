// リマインドちゃん Service Worker
// push イベントを受信して通知を表示する。iOSではホーム画面に追加したPWAでのみ動作する。

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "リマインド", body: "確認してください" };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    // JSON以外のペイロードが来た場合はテキストとして扱う
    if (event.data) {
      data = { title: "リマインド", body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "reminder",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// 通知をタップしたらアプリを開く（既に開いていればフォーカス）
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
