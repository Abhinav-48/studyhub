self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || 'StudyHub', {
    body: data.body || 'New update!',
    icon: '/icon-192.png', badge: '/icon-192.png', vibrate: [100,50,100]
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});