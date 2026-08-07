// ============================================
// CHAT WIDGET - floating bubble on all pages
// ============================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDoc, getDocs, doc, onSnapshot, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

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
const functions = getFunctions(app);

let ALL_MEMBERS_W = [];
let pendingMentionsW = [];

let currentUser = null;
let currentProfile = null;
let isOpen = false;
let unsubscribe = null;
let CHANNELS = [];
let currentChannel = null;
let readableChannelsCache = [];
let unreadByChannel = {};
let totalUnread = 0;

function getLastRead(channelId) {
  return parseInt(localStorage.getItem('chat_lastRead_' + channelId) || '0');
}
function setLastRead(channelId, ms) {
  localStorage.setItem('chat_lastRead_' + channelId, String(ms));
}
function msOf(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
}

// Count messages newer than this channel's last-read marker, excluding the current user's own messages
async function computeUnreadForChannel(channelId) {
  try {
    const lastRead = getLastRead(channelId);
    const snap = await getDocs(query(collection(db, 'chat', channelId, 'messages'), orderBy('timestamp', 'desc'), limit(100)));
    let count = 0;
    snap.forEach(d => {
      const m = d.data();
      if (m.uid !== currentUser?.uid && msOf(m.timestamp) > lastRead) count++;
    });
    return count;
  } catch (e) {
    return 0;
  }
}

function recomputeTotalUnread() {
  totalUnread = Object.values(unreadByChannel).reduce((a, b) => a + b, 0);
  updateBadge();
}

// Refresh unread counts for all readable channels except the one currently open/active
async function refreshAllUnreadCounts() {
  const results = await Promise.all(readableChannelsCache.map(async ch => {
    if (isOpen && currentChannel && ch.id === currentChannel.id) return { id: ch.id, count: 0 };
    return { id: ch.id, count: await computeUnreadForChannel(ch.id) };
  }));
  results.forEach(r => { unreadByChannel[r.id] = r.count; });
  recomputeTotalUnread();
}

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
          <div style="display:flex;align-items:center;gap:3px;margin-top:4px;max-width:100%;">
            <select id="widgetChannelSelect" style="
              background:rgba(255,255,255,0.18);color:white;font-weight:600;
              font-size:0.75rem;border:none;outline:none;cursor:pointer;max-width:100%;
              padding:3px 8px;border-radius:10px;">
            </select>
            <span id="widgetChannelChevron" style="color:rgba(255,255,255,0.9);font-size:0.6rem;
              display:none;flex-shrink:0;">▾</span>
          </div>
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
      <div id="widgetInputArea" style="padding:0.6rem;border-top:1px solid #f0f0f0;display:none;position:relative;">
        <div id="widgetMentionDropdown" style="display:none;position:absolute;bottom:100%;left:0.6rem;right:0.6rem;
          margin-bottom:4px;background:white;border:1px solid #ddd;border-radius:8px;
          box-shadow:0 -2px 10px rgba(0,0,0,0.12);max-height:140px;overflow-y:auto;z-index:1001;"></div>
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
    const dd = document.getElementById('widgetMentionDropdown');
    if (dd && dd.style.display === 'block') {
      if (e.key === 'Escape') { dd.style.display = 'none'; return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = dd.querySelector('.widget-mention-item');
        if (first) first.click();
        return;
      }
    }
    if (e.key === 'Enter') sendWidgetMessage();
  });

  document.getElementById('widgetInput')?.addEventListener('input', function() {
    handleWidgetMentionTrigger(this);
  });

  document.addEventListener('click', (e) => {
    const dd = document.getElementById('widgetMentionDropdown');
    if (dd && !dd.contains(e.target) && e.target.id !== 'widgetInput') dd.style.display = 'none';
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
    if (currentChannel) {
      setLastRead(currentChannel.id, Date.now());
      unreadByChannel[currentChannel.id] = 0;
    }
    refreshAllUnreadCounts();
    document.getElementById('widgetMessages').scrollTop = 999999;
  }
};

window.sendWidgetMessage = async function() {
  const input = document.getElementById('widgetInput');
  const text = input?.value.trim();
  if (!text || !currentUser || !currentProfile || !currentChannel) return;

  const memberRoles1 = [currentProfile.role, ...(currentProfile.roles || []), ...(currentProfile.teams || [])].filter(Boolean);
  const canWrite = (currentChannel.writeRoles || []).length === 0 || memberRoles1.some(r => (currentChannel.writeRoles || []).includes(r));
  if (!canWrite) return;

  input.value = '';
  await addDoc(collection(db, 'chat', currentChannel.id, 'messages'), {
    uid: currentUser.uid,
    displayName: currentProfile.displayName || currentUser.displayName,
    role: currentProfile.role || 'member',
    text,
    timestamp: serverTimestamp()
  });

  const mentionedUidsW = new Set();
  pendingMentionsW.forEach(pm => {
    if (text.includes('@' + pm.name)) mentionedUidsW.add(pm.uid);
  });
  mentionedUidsW.forEach(uid => notifyWidgetMention(uid, text, currentChannel.name || 'general'));
  pendingMentionsW = [];
  hideWidgetMentionDropdown();
};

function updateBadge() {
  const badge = document.getElementById('chatBadge');
  if (!badge) return;
  const unread = totalUnread;
  if (unread > 0 && !isOpen) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function renderWidgetMessages(messages) {
  if (currentChannel) {
    if (isOpen) {
      // Actively viewing this channel right now — treat as fully read
      setLastRead(currentChannel.id, Date.now());
      unreadByChannel[currentChannel.id] = 0;
    } else {
      const lastRead = getLastRead(currentChannel.id);
      unreadByChannel[currentChannel.id] = messages.filter(m => m.uid !== currentUser?.uid && msOf(m.timestamp) > lastRead).length;
    }
    recomputeTotalUnread();
  }

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

async function loadAllMembersW() {
  const snap = await getDocs(collection(db, 'members'));
  ALL_MEMBERS_W = [];
  snap.forEach(d => {
    if (d.id === currentUser?.uid) return;
    const m = d.data();
    const roles = [m.role, ...(m.roles || []), ...(m.teams || [])].filter(Boolean);
    ALL_MEMBERS_W.push({ uid: d.id, name: m.displayName || m.email || 'Member', roles });
  });
}

function widgetMentionCandidates(channel) {
  if (!channel) return [];
  const readRoles = channel.readRoles || [];
  if (!readRoles.length) return ALL_MEMBERS_W;
  return ALL_MEMBERS_W.filter(m => m.roles.some(r => readRoles.includes(r)));
}

function hideWidgetMentionDropdown() {
  const dd = document.getElementById('widgetMentionDropdown');
  if (dd) dd.style.display = 'none';
}

function escapeHtmlW(text) {
  return (text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function insertWidgetMention(uid, name, atIndex, input) {
  const val = input.value;
  const cursor = input.selectionStart;
  const before = val.slice(0, atIndex);
  const after = val.slice(cursor);
  const newVal = before + '@' + name + ' ' + after;
  input.value = newVal;
  const newCursor = (before + '@' + name + ' ').length;
  input.setSelectionRange(newCursor, newCursor);
  input.focus();
  pendingMentionsW.push({ uid, name });
  hideWidgetMentionDropdown();
}

function showWidgetMentionDropdown(partial, atIndex, input) {
  const candidates = widgetMentionCandidates(currentChannel);
  const matches = candidates.filter(m => m.name.toLowerCase().startsWith(partial.toLowerCase())).slice(0, 5);
  const dd = document.getElementById('widgetMentionDropdown');
  if (!dd || !matches.length) { hideWidgetMentionDropdown(); return; }
  dd.innerHTML = matches.map(m => `<div class="widget-mention-item" data-uid="${m.uid}" data-name="${escapeHtmlW(m.name)}"
    style="padding:0.45rem 0.75rem;cursor:pointer;font-size:0.8rem;color:#333;">${escapeHtmlW(m.name)}</div>`).join('');
  dd.style.display = 'block';
  dd.querySelectorAll('.widget-mention-item').forEach(item => {
    item.addEventListener('mouseenter', () => item.style.background = '#fdf3f0');
    item.addEventListener('mouseleave', () => item.style.background = 'white');
    item.addEventListener('click', () => insertWidgetMention(item.dataset.uid, item.dataset.name, atIndex, input));
  });
}

function handleWidgetMentionTrigger(input) {
  const val = input.value;
  const cursor = input.selectionStart;
  const uptoCursor = val.slice(0, cursor);
  const atIndex = uptoCursor.lastIndexOf('@');
  if (atIndex === -1) { hideWidgetMentionDropdown(); return; }
  const textAfterAt = uptoCursor.slice(atIndex + 1);
  if (/\s/.test(textAfterAt) || textAfterAt.length > 30) { hideWidgetMentionDropdown(); return; }
  const charBefore = atIndex > 0 ? uptoCursor[atIndex - 1] : ' ';
  if (!/\s/.test(charBefore) && atIndex !== 0) { hideWidgetMentionDropdown(); return; }
  showWidgetMentionDropdown(textAfterAt, atIndex, input);
}

async function notifyWidgetMention(uid, text, channelName) {
  try {
    const fn = httpsCallable(functions, 'sendMentionNotification');
    await fn({
      targetUid: uid,
      title: (currentProfile?.displayName || 'Someone') + ' mentioned you in #' + channelName,
      body: text.slice(0, 120),
      url: '/chat'
    });
  } catch (err) {
    console.error('notifyWidgetMention error:', err);
  }
}

function subscribeToChannel(channel) {
  currentChannel = channel;
  localStorage.setItem('chat_widget_channel', channel.id);

  if (unsubscribe) unsubscribe();

  // Show loading state immediately so switching doesn't look frozen while messages load
  const widgetMessagesEl = document.getElementById('widgetMessages');
  if (widgetMessagesEl) widgetMessagesEl.innerHTML = '<div style="text-align:center;color:#999;padding:1rem;font-size:0.82rem;">Loading messages...</div>';

  const q = query(collection(db, 'chat', channel.id, 'messages'), orderBy('timestamp', 'asc'), limit(50));
  unsubscribe = onSnapshot(q, snap => {
    renderWidgetMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });

  const memberRoles2 = [currentProfile?.role, ...(currentProfile?.roles || []), ...(currentProfile?.teams || [])].filter(Boolean);
  const canWrite = (channel.writeRoles || []).length === 0 || memberRoles2.some(r => (channel.writeRoles || []).includes(r));
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
  await loadAllMembersW();
  const memberRoles = [currentProfile.role, ...(currentProfile.roles || []), ...(currentProfile.teams || [])].filter(Boolean);
  const readable = CHANNELS.filter(c => {
    const readRoles = c.readRoles || [];
    return readRoles.length === 0 || memberRoles.some(r => readRoles.includes(r));
  });

  if (!readable.length) {
    bubble.style.display = 'none';
    return;
  }

  readableChannelsCache = readable;

  bubble.style.display = 'flex';
  document.getElementById('widgetLoginPrompt').style.display = 'none';

  // Populate channel dropdown
  const select = document.getElementById('widgetChannelSelect');
  const chevron = document.getElementById('widgetChannelChevron');
  if (select) {
    select.innerHTML = readable.map(c => `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${c.name}</option>`).join('');
    select.style.display = readable.length ? 'inline-block' : 'none';
    if (chevron) chevron.style.display = readable.length > 1 ? 'inline' : 'none';
  }

  // Restore previously selected channel if still readable, else default to first
  const saved = localStorage.getItem('chat_widget_channel');
  const initial = readable.find(c => c.id === saved) || readable[0];
  subscribeToChannel(initial);
  refreshAllUnreadCounts();
});
