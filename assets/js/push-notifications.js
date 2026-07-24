import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const VAPID_KEY = "BCbLDoNo9nX8669RUa_E_Jne-_EjXXtai1-UeOkJhWU_fRSEGOQsF0KXPXAyms4GNkWU1m1CSphRkAS_8EkoGpg";

export async function initPushNotifications(app, user) {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
  if (!user) return;

  try {
    if (Notification.permission === 'denied') return;

    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });

    if (token) {
      const db = getFirestore(app);
      const memberRef = doc(db, 'members', user.uid);
      const snap = await getDoc(memberRef);
      const existing = snap.exists() ? (snap.data().fcmTokens || []) : [];
      if (!existing.includes(token)) {
        await setDoc(memberRef, { fcmTokens: [...existing, token] }, { merge: true });
      }
    }
  } catch (err) {
    console.log('Push notification setup skipped:', err.message);
  }
}
