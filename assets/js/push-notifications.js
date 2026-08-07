import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const VAPID_KEY = "BCbLDoNo9nX8669RUa_E_Jne-_EjXXtai1-UeOkJhWU_fRSEGOQsF0KXPXAyms4GNkWU1m1CSphRkAS_8EkoGpg";

function showDebug(msg) { /* debug disabled */ }

export async function initPushNotifications(app, user, options) {
  const requirePrompt = options && options.requirePrompt;
  showDebug('--- Push init started ---');
  if (!('serviceWorker' in navigator)) { showDebug('ERROR: no serviceWorker support'); return; }
  if (!('Notification' in window)) { showDebug('ERROR: no Notification support'); return; }
  if (!user) { showDebug('ERROR: no user'); return; }

  showDebug('Permission status: ' + Notification.permission);

  try {
    if (Notification.permission === 'denied') { showDebug('ERROR: permission denied'); return; }

    if (Notification.permission === 'default') {
      // IMPORTANT: Notification.requestPermission() must be triggered by a direct user
      // gesture (e.g. a button click) — some mobile browsers (notably iOS Safari) will
      // silently hang this call indefinitely if invoked automatically on page load,
      // which previously caused long freezes across the site on every page navigation.
      // So on automatic calls (no explicit user click), skip prompting entirely.
      if (!requirePrompt) { showDebug('Skipping auto-prompt (no user gesture)'); return; }
      showDebug('Requesting permission...');
      const perm = await Notification.requestPermission();
      showDebug('Permission result: ' + perm);
      if (perm !== 'granted') return;
    }

    showDebug('Registering service worker...');
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    showDebug('Service worker registered: ' + registration.scope);

    showDebug('Getting messaging instance...');
    const messaging = getMessaging(app);

    showDebug('Getting FCM token...');
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    showDebug('Token received: ' + (token ? token.substring(0, 20) + '...' : 'NULL'));

    if (token) {
      const db = getFirestore(app);
      const memberRef = doc(db, 'members', user.uid);
      const snap = await getDoc(memberRef);
      const existing = snap.exists() ? (snap.data().fcmTokens || []) : [];
      if (!existing.includes(token)) {
        showDebug('Saving token to Firestore...');
        await setDoc(memberRef, { fcmTokens: [...existing, token] }, { merge: true });
        showDebug('SUCCESS: token saved!');
      } else {
        showDebug('Token already saved.');
      }
    }
  } catch (err) {
    showDebug('EXCEPTION: ' + err.name + ': ' + err.message);
  }
}
