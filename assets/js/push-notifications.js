import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const VAPID_KEY = "BCbLDoNo9nX8669RUa_E_Jne-_EjXXtai1-UeOkJhWU_fRSEGOQsF0KXPXAyms4GNkWU1m1CSphRkAS_8EkoGpg";

function showDebug(msg) {
  let el = document.getElementById('pushDebugBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pushDebugBanner';
    el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:999999;background:#000;color:#0f0;font-family:monospace;font-size:11px;padding:8px;max-height:40vh;overflow-y:auto;white-space:pre-wrap;';
    document.body.appendChild(el);
  }
  el.textContent += msg + '\n';
}

export async function initPushNotifications(app, user) {
  showDebug('--- Push init started ---');
  if (!('serviceWorker' in navigator)) { showDebug('ERROR: no serviceWorker support'); return; }
  if (!('Notification' in window)) { showDebug('ERROR: no Notification support'); return; }
  if (!user) { showDebug('ERROR: no user'); return; }

  showDebug('Permission status: ' + Notification.permission);

  try {
    if (Notification.permission === 'denied') { showDebug('ERROR: permission denied'); return; }

    if (Notification.permission === 'default') {
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
