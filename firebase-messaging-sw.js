// v2 - force update
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAleQHLvA75qr5a-bAuIZKCUyGiZ8jTJbE",
  authDomain: "admirals-hockey.firebaseapp.com",
  projectId: "admirals-hockey",
  storageBucket: "admirals-hockey.firebasestorage.app",
  messagingSenderId: "783358659334",
  appId: "1:783358659334:web:5daffd093adca386faec87"
});

// Use a raw push listener instead of firebase's onBackgroundMessage,
// since onBackgroundMessage can silently skip showing a notification
// when it detects a focused client (which breaks iOS Safari, which
// always delivers push via this event regardless of app foreground state).
self.addEventListener('push', function(event) {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }

  const notification = payload.notification || {};
  const title = notification.title || 'Admirals Hockey';
  const body = notification.body || '';
  const url = (payload.fcmOptions && payload.fcmOptions.link) || (payload.data && payload.data.url) || '/';

  const options = {
    body: body,
    icon: '/assets/images/admiral-logo.png',
    badge: '/assets/images/admiral-logo.png',
    data: { url: url }
  };

  // Best-effort app icon badge bump while the app is closed/backgrounded. A service
  // worker can't read the person's true unread total (that lives in localStorage on
  // their device), so this just signals "something's new" — the app corrects it to
  // the real count the next time it's opened.
  const badgePromise = ('setAppBadge' in self.navigator)
    ? self.navigator.setAppBadge().catch(() => {})
    : Promise.resolve();

  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    badgePromise
  ]));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(clients.openWindow(url));
});
