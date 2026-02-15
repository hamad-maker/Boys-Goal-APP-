// ============================================
// RISEUP - Service Worker
// Handles push notifications
// ============================================

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(self.clients.claim());
});

// Handle notification click
self.addEventListener('notificationclick', (e) => {
    e.notification.close();

    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            // Focus existing tab or open new one
            for (const client of clients) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            return self.clients.openWindow('/');
        })
    );
});

// Handle scheduled reminder messages from main thread
self.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'SHOW_REMINDER') {
        self.registration.showNotification('RiseUp - Daily Reminder', {
            body: e.data.body || "Time to check in on your habits! Keep your streak going.",
            icon: e.data.icon || undefined,
            badge: e.data.badge || undefined,
            tag: 'daily-reminder',
            renotify: true,
            requireInteraction: false
        });
    }

    if (e.data && e.data.type === 'GOAL_MILESTONE') {
        self.registration.showNotification('RiseUp - Goal Milestone!', {
            body: e.data.body,
            icon: e.data.icon || undefined,
            tag: 'goal-milestone-' + Date.now(),
            requireInteraction: false
        });
    }
});
