import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, limit, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let _app = null;
let _uid = null;
let _db = null;
let _notifs = [];

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function loadNotifications() {
  if (!_uid) return;
  const list = document.getElementById('notifList');
  const badge = document.getElementById('notifBadge');
  try {
    const q = query(collection(_db, 'members', _uid, 'notifications'), orderBy('timestamp', 'desc'), limit(30));
    const snap = await getDocs(q);
    _notifs = [];
    snap.forEach(d => _notifs.push({ id: d.id, ...d.data() }));

    const unread = _notifs.filter(n => !n.read).length;
    if (badge) {
      badge.style.display = unread > 0 ? 'block' : 'none';
      badge.textContent = unread > 9 ? '9+' : String(unread);
    }

    if (!list) return;
    if (!_notifs.length) {
      list.innerHTML = '<p style="color:#999;font-size:0.85rem;padding:1.5rem;text-align:center;">No notifications yet.</p>';
      return;
    }

    list.innerHTML = _notifs.map(n => `
      <a href="${n.url || '#'}" data-nid="${n.id}" class="notif-item" style="display:block;padding:0.7rem 1rem;border-bottom:1px solid #f5f5f5;text-decoration:none;color:inherit;background:${n.read ? 'white' : '#fdf3f0'};">
        <div style="font-weight:600;font-size:0.85rem;color:#111;">${n.title || 'Notification'}</div>
        <div style="font-size:0.8rem;color:#555;margin-top:2px;">${n.body || ''}</div>
        <div style="font-size:0.7rem;color:#aaa;margin-top:3px;">${fmtTime(n.timestamp)}</div>
      </a>`).join('');
  } catch (err) {
    console.log('Notification load error:', err.message);
    if (list) list.innerHTML = '<p style="color:#999;font-size:0.85rem;padding:1rem;text-align:center;">Could not load notifications.</p>';
  }
}

async function markAllRead() {
  if (!_uid || !_notifs.length) return;
  const batch = writeBatch(_db);
  _notifs.forEach(n => {
    if (!n.read) batch.update(doc(_db, 'members', _uid, 'notifications', n.id), { read: true });
  });
  try { await batch.commit(); } catch(e) {}
  await loadNotifications();
}

export function initNotificationCenter(app, uid) {
  _app = app;
  _uid = uid;
  _db = getFirestore(app);

  const wrap = document.getElementById('notifBellWrap');
  const btn = document.getElementById('notifBellBtn');
  const dropdown = document.getElementById('notifDropdown');
  const markAllBtn = document.getElementById('notifMarkAllReadBtn');

  if (wrap) wrap.style.display = 'block';

  loadNotifications();
  setInterval(loadNotifications, 60000); // refresh every minute

  if (btn && dropdown) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display === 'block';
      dropdown.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) loadNotifications();
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) dropdown.style.display = 'none';
    });
    dropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.notif-item');
      if (item) {
        const nid = item.dataset.nid;
        setDoc(doc(_db, 'members', _uid, 'notifications', nid), { read: true }, { merge: true }).catch(() => {});
      }
    });
  }

  if (markAllBtn) markAllBtn.addEventListener('click', (e) => { e.stopPropagation(); markAllRead(); });
}

// Helper: create an in-app notification for a specific user (called from client-side admin flows)
export async function createNotification(app, targetUid, title, body, url) {
  const db = getFirestore(app);
  const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);
  await setDoc(doc(db, 'members', targetUid, 'notifications', id), {
    title, body, url: url || '/', read: false, timestamp: Date.now()
  });
}
