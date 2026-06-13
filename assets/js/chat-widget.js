// ============================================
// CHAT WIDGET - floating bubble on all pages
// ============================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDoc, getDocs, doc, onSnapshot, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAleQHLvA75qr5a-bAuIZKCUyGiZ8jTJbE",
  authDomain: "admirals-hockey.firebaseapp.com",
  projectId: "admirals-hockey",
  storageBucket: "admirals-hockey.firebasestorage.app",
  messagingSenderId: "783358659334",
  appId: "1:783358659334:web:5daffd093adca386faec87"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentProfile = null;
let isOpen = false;
let unsubscribe = null;
let lastSeenCount = parseInt(localStorage.getItem('chat_lastSeen') || '0');
let totalMessages = 0;
let CHANNELS = [];
let currentChannel = null;

// Only show widget on non-chat pages
if (window.location.pathname.includes('chat.html') || window.location.pathname === '/chat') {
  // Don't inject widget on the chat page itself
} else {
  injectWidget();
}

function injectWidget() {
  const widget = document.createElement('div');
  widget.id = 'chatWidget';
  widget.innerHTML = `
    <div id="chatBubble" onclick="toggleChatWidget()" style="
      position:fixed;bottom:24px;right:24px;width:52px;height:52px;
      background:#5D1725;border-radius:50%;display:none;align-items:center;
      justify-content:center;cursor:pointer;z-index:1000;
      box-shadow:0 4px 16px rgba(0,0,0,0.25);transition:transform 0.2s;">
      <span style="font-size:1.4rem;">💬</span>
      <span id="chatBadge" style="display:none;position:absolute;top:-4px;right:-4px;
        background:#c62828;color:white;border-radius:50%;width:20px;height:20px;
        font-size:0.65rem;font-weight:700;align-items:center;justify-content:center;"></span>
    </div>

    <div id="chatPanel" style="
      display:none;position:fixed;bottom:88px;right:24px;width:340px;height:480px;
      background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);
      z-index:1000;flex-direction:column;overflow:hidden;border:1px solid #e0e0e0;">
      <div style="background:linear-gradient(135deg,#5D1725,#3c0f17);padding:0.85rem 1rem;
        display:flex;align-items:center;justify-content:space-between;">
        <div style="min-width:0;flex:1;">
          <div style="color:white;font-weight:700;font-size:0.95rem;">⚓ Team Chat</div>
          <select id="widgetChannelSelect" style="
            margin-top:2px;background:transparent;color:rgba(255,255,255,0.85);
            font-size:0.75rem;border:none;outline:none;cursor:pointer;max-width:100%;">
          </select>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;flex-shrink:0;">
          <a href="/chat" style="color:rgba(255,255,255,0.8);font-size:0.75rem;text-decoration:none;
            border:1px solid rgba(255,255,255,0.3);padding:3px 8px;border-radius:4px;">Full View</a>
          <button onclick="toggleChatWidget()" style="background:none;border:none;color:white;
            cursor:pointer;font-size:1.2rem;padding:0;line-height:1;">×</button>
        </div>
      </div>
      <div id="widgetMessages" style="flex:1;overflow-y:auto;padding:0.75rem;
        display:flex;flex-direction:column;gap:0.5rem;font-size:0.85rem;"></div>
      <div id="widgetInputArea" style="padding:0.6rem;border-top:1px solid #f0f0f0;display:none;">
        <div style="display:flex;gap:0.5rem;">
          <input type="text" id="widgetInput" placeholder="Message..." style="
            flex:1;padding:0.5rem 0.75rem;border:1px solid #ddd;border-radius:6px;
            font-size:0.85rem;font-family:inherit;outline:none;">
          <button onclick="sendWidgetMessage()" style="background:#5D1725;color:white;border:none;
            border-radius:6px;padding:0.5rem 0.85rem;font-size:0.85rem;cursor:pointer;">Send</button>
        </div>
      </div>
      <div id="widgetNoAccess" style="padding:0.6rem;border-top:1px solid #f0f0f0;
        text-align:center;font-size:0.78rem;color:#999;display:none;">
        View only — <a href="/chat" style="color:#5D1725;">open full chat</a>
      </div>
      <div id="widgetLoginPrompt" style="padding:1rem;text-align:center;font-size:0.85rem;
        color:#666;display:none;">
        <a href="#" onclick="showMemberModal('login')" style="color:#5D1725;font-weight:600;">Log in</a> to join the chat
      </div>
    </div>`;

  document.body.appendChild(widget);

  // Handle Enter key in widget input
  document.getElementById('widgetInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendWidgetMessage();
  });

  document.getElementById('widgetChannelSelect')?.addEventListener('change', e => {
    const channel = CHANNELS.find(c => c.id === e.target.value);
    if (channel) subscribeToChannel(channel);
  });
}

window.toggleChatWidget = function() {
  isOpen = !isOpen;
  const panel = document.getElementById('chatPanel');
  const bubble = document.getElementById('chatBubble');
  panel.style.display = isOpen ? 'flex' : 'none';
  bubble.style.transform = isOpen ? 'scale(0.9)' : 'scale(1)';

  if (isOpen) {
    lastSeenCount = totalMessages;
    localStorage.setItem('chat_lastSeen', lastSeenCount);
    updateBadge();
    document.getElementById('widgetMessages').scrollTop = 999999;
  }
};

window.sendWidgetMessage = async function() {
  const input = document.getElementById('widgetInput');
  const text = input?.value.trim();
  if (!text || !currentUser || !currentProfile || !currentChannel) return;

  const canWrite = (currentChannel.writeRoles || []).includes(currentProfile.role);
  if (!canWrite) return;

  input.value = '';
  await addDoc(collection(db, 'chat', currentChannel.id, 'messages'), {
    uid: currentUser.uid,
    displayName: currentProfile.displayName || currentUser.displayName,
    role: currentProfile.role || 'member',
    text,
    timestamp: serverTimestamp()
  });
};

function updateBadge() {
  const badge = document.getElementById('chatBadge');
  if (!badge) return;
  const unread = Math.max(0, totalMessages - lastSeenCount);
  if (unread > 0 && !isOpen) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function renderWidgetMessages(messages) {
  totalMessages = messages.length;
  updateBadge();

  const container = document.getElementById('widgetMessages');
  if (!container) return;

  if (!messages.length) {
    container.innerHTML = '<div style="text-align:center;color:#aaa;font-style:italic;padding:1rem;">No messages yet</div>';
    return;
  }

  container.innerHTML = messages.slice(-50).map(msg => {
    const isCoach = msg.role === 'superadmin' || msg.role === 'admin';
    const time = msg.timestamp ? (() => {
      const d = msg.timestamp.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp);
      return d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
    })() : '';
    return `<div style="display:flex;gap:0.5rem;align-items:flex-start;">
      <div style="width:26px;height:26px;border-radius:50%;background:${isCoach?'#5D1725':'#555'};
        color:white;display:flex;align-items:center;justify-content:center;font-size:0.7rem;
        font-weight:700;flex-shrink:0;">${(msg.displayName||'?').charAt(0)}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:baseline;gap:0.35rem;flex-wrap:wrap;">
          <span style="font-weight:700;font-size:0.82rem;color:#111;">${msg.displayName||'Unknown'}${isCoach?' 🏒':''}</span>
          <span style="font-size:0.65rem;color:#888;">${time}</span>
        </div>
        <div style="font-size:0.83rem;color:#333;line-height:1.4;word-break:break-word;">${(msg.text||'').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>
      </div>
    </div>`;
  }).join('');

  if (isOpen) container.scrollTop = 999999;
}

async function loadChannels() {
  const snap = await getDocs(collection(db, 'chatChannels'));
  CHANNELS = [];
  snap.forEach(d => CHANNELS.push({ id: d.id, ...d.data() }));
  CHANNELS.sort((a, b) => (a.order || 99) - (b.order || 99));
  if (!CHANNELS.length) {
    CHANNELS = [{ id: 'general', name: '#general', desc: 'General team discussion', icon: '💬',
      readRoles: ['player','alumni','rep','admin','superadmin'],
      writeRoles: ['player','alumni','rep','admin','superadmin'] }];
  }
}

function subscribeToChannel(channel) {
  currentChannel = channel;
  localStorage.setItem('chat_widget_channel', channel.id);

  if (unsubscribe) unsubscribe();
  const q = query(collection(db, 'chat', channel.id, 'messages'), orderBy('timestamp', 'asc'), limit(50));
  unsubscribe = onSnapshot(q, snap => {
    renderWidgetMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });

  const canWrite = (channel.writeRoles || []).includes(currentProfile?.role);
  document.getElementById('widgetInputArea').style.display = canWrite ? 'block' : 'none';
  document.getElementById('widgetNoAccess').style.display = canWrite ? 'none' : 'block';

  const input = document.getElementById('widgetInput');
  if (input) input.placeholder = `Message ${channel.name}...`;

  const select = document.getElementById('widgetChannelSelect');
  if (select) select.value = channel.id;
}

onAuthStateChanged(auth, async (user) => {
  const bubble = document.getElementById('chatBubble');
  if (!bubble) return;

  if (!user) {
    bubble.style.display = 'none';
    return;
  }

  const snap = await getDoc(doc(db, 'members', user.uid));
  currentProfile = snap.exists() ? snap.data() : { role: 'member', status: 'pending' };
  currentUser = user;

  if (user.email === 'coachberry03@gmail.com') currentProfile.role = 'superadmin';

  if (currentProfile.status === 'pending' || currentProfile.status === 'denied') {
    bubble.style.display = 'none';
    return;
  }

  await loadChannels();
  const readable = CHANNELS.filter(c => (c.readRoles || []).includes(currentProfile.role));

  if (!readable.length) {
    bubble.style.display = 'none';
    return;
  }

  bubble.style.display = 'flex';
  document.getElementById('widgetLoginPrompt').style.display = 'none';

  // Populate channel dropdown
  const select = document.getElementById('widgetChannelSelect');
  if (select) {
    select.innerHTML = readable.map(c => `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${c.name}</option>`).join('');
    select.style.display = readable.length > 1 ? 'block' : (readable.length === 1 ? 'block' : 'none');
  }

  // Restore previously selected channel if still readable, else default to first
  const saved = localStorage.getItem('chat_widget_channel');
  const initial = readable.find(c => c.id === saved) || readable[0];
  subscribeToChannel(initial);
});
