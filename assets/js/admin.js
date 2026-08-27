import { showFramer } from '/assets/js/image-framer.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, getDoc, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

document.addEventListener('DOMContentLoaded', () => {

const firebaseConfig = {
  apiKey: "AIzaSyAleQHLvA75qr5a-bAuIZKCUyGiZ8jTJbE",
  authDomain: "admirals-hockey.firebaseapp.com",
  projectId: "admirals-hockey",
  storageBucket: "admirals-hockey.firebasestorage.app",
  messagingSenderId: "783358659334",
  appId: "1:783358659334:web:5daffd093adca386faec87"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// ============================================
// SHARED: send in-app + push notifications to members with matching roles
// ============================================
async function computeRoleRecipients(targetRoles) {
  if (!targetRoles || !targetRoles.length) return [];
  const membersSnap = await getDocs(collection(db, 'members'));
  const recipients = [];
  membersSnap.forEach(d => {
    const m = d.data();
    const mRoles = [m.role, ...(m.roles || []), ...(m.teams || [])].filter(Boolean);
    if (mRoles.some(r => targetRoles.includes(r))) {
      recipients.push({ uid: d.id, name: m.displayName || m.email || 'Member' });
    }
  });
  return recipients;
}

async function logNotification(title, body, url, targetRoles, recipients) {
  try {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);
    await setDoc(doc(db, 'notificationLog', id), {
      title, body, url: url || '',
      targetRoles: targetRoles || [],
      recipientCount: recipients.length,
      recipients: recipients.map(r => ({ uid: r.uid, name: r.name })),
      sentBy: window._firebaseAdminUser || 'admin',
      sentAt: Date.now()
    });
  } catch (err) {
    console.error('logNotification error:', err);
  }
}

async function loadNotificationHistory() {
  const container = document.getElementById('notifHistoryList');
  if (!container) return;
  container.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const q = query(collection(db, 'notificationLog'), orderBy('sentAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    if (snap.empty) {
      container.innerHTML = '<div class="empty-state">No notifications sent yet</div>';
      return;
    }
    let html = '';
    snap.forEach(d => {
      const n = d.data();
      const dateStr = new Date(n.sentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const roles = (n.targetRoles || []).length ? n.targetRoles.join(', ') : 'All';
      const recipientNames = (n.recipients || []).map(r => r.name).join(', ') || 'None';
      html += `
        <div class="item-card" style="padding:0.75rem 1rem;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;cursor:pointer;" onclick="const d=this.nextElementSibling; d.style.display = d.style.display === 'block' ? 'none' : 'block';">
            <div>
              <div style="font-weight:600;font-size:0.9rem;">${n.title || ''}</div>
              <div style="font-size:0.8rem;color:#666;margin-top:2px;">${n.body || ''}</div>
              <div style="font-size:0.75rem;color:#999;margin-top:4px;">${dateStr} &bull; Roles: ${roles} &bull; ${n.recipientCount || 0} recipient(s)</div>
            </div>
            <span style="color:#5D1725;font-size:0.75rem;white-space:nowrap;flex-shrink:0;">Details &#9662;</span>
          </div>
          <div style="display:none;margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid #f0f0f0;font-size:0.8rem;color:#555;">
            ${recipientNames}
          </div>
        </div>`;
    });
    container.innerHTML = html;
  } catch (err) {
    console.error('loadNotificationHistory error:', err);
    container.innerHTML = '<div class="empty-state">Could not load history</div>';
  }
}

async function sendRoleNotifications(targetRoles, title, body, url) {
  if (!targetRoles || !targetRoles.length) return;
  try {
    const recipients = await computeRoleRecipients(targetRoles);
    const writes = recipients.map(r => {
      const nid = Date.now().toString() + Math.random().toString(36).slice(2, 8);
      return setDoc(doc(db, 'members', r.uid, 'notifications', nid), {
        title, body, url: url || '/', read: false, timestamp: Date.now()
      });
    });
    await Promise.all(writes);
    // Also trigger push notification via Cloud Function
    const sendFn = httpsCallable(functions, 'sendManualNotification');
    await sendFn({ title, body, url, targetRoles });
    await logNotification(title, body, url, targetRoles, recipients);
  } catch (err) {
    console.error('sendRoleNotifications error:', err);
  }
}

function buildNotifRoleCheckboxes(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const roles = [
    { id: 'player', label: 'Player' }, { id: 'varsity', label: 'Varsity' }, { id: 'jv', label: 'JV' },
    { id: 'coach', label: 'Coach' }, { id: 'rep', label: 'Team Rep' }, { id: 'alumni', label: 'Alumni' },
    { id: 'prospect', label: 'Prospect' }, { id: 'member', label: 'Member' },
  ];
  container.innerHTML = roles.map(r => `<label style="font-size:0.8rem;display:flex;align-items:center;gap:0.3rem;"><input type="checkbox" class="notifRoleCb" value="${r.id}"> ${r.label}</label>`).join('');
}

// ============================================
// MASTER PAGE LIST — single source of truth
// Add a new page here ONCE and it will automatically appear in:
// Pages visibility, Footer Quick Links, and Page Hero settings.
// ============================================
const SITE_PAGES = [
  { id: 'home',        label: 'Home',          path: '/index.html', footer: true,  hero: false },
  { id: 'schedule',    label: 'Schedule',      path: '/schedule',   footer: true,  hero: true,  heroBadge: '', heroTitle: 'Schedule', heroSubtitle: 'Complete game schedule and results' },
  { id: 'roster',      label: 'Roster',        path: '/roster',     footer: true,  hero: true,  heroBadge: '', heroTitle: 'Team Roster', heroSubtitle: 'Meet the Admirals' },
  { id: 'stats',       label: 'Stats',         path: '/stats',      footer: true,  hero: true,  heroBadge: '', heroTitle: 'Statistics', heroSubtitle: 'Season stats for every player' },
  { id: 'leaderboard', label: 'Leaderboard',   path: '/leaderboard', footer: true, hero: true,  heroBadge: 'Franklin Admirals Hockey', heroTitle: 'Leaderboard', heroSubtitle: 'Season statistics leaders' },
  { id: 'news',        label: 'News',          path: '/news',       footer: true,  hero: true,  heroBadge: 'Franklin Admirals Hockey', heroTitle: 'News & Updates', heroSubtitle: 'The latest from the Admirals program' },
  { id: 'chat',        label: 'Team Chat',     path: '/chat',       footer: true,  hero: false },
  { id: 'events',      label: 'Events',        path: '/events',     footer: true,  hero: true,  heroBadge: 'Franklin Admirals Hockey', heroTitle: 'Events', heroSubtitle: 'Team events, fundraisers & community activities' },
  { id: 'gallery',     label: 'Gallery',       path: '/gallery',    footer: true,  hero: true,  heroBadge: 'Franklin Admirals Hockey', heroTitle: 'Photo Gallery', heroSubtitle: 'Memories from the ice' },
  { id: 'summer',      label: 'Summer Hockey', path: '/summer-hockey', footer: true, hero: true, heroBadge: 'Franklin Admirals Hockey', heroTitle: 'Summer Hockey', heroSubtitle: 'In-house summer league — alumni, current players & friends' },
  { id: 'alumni',      label: 'Alumni',        path: '/alumni',     footer: true,  hero: true,  heroBadge: 'Franklin Admirals Hockey', heroTitle: 'Alumni Network', heroSubtitle: 'Once an Admiral, always an Admiral' },
  { id: 'sponsors',    label: 'Sponsors',      path: '/sponsors',   footer: true,  hero: true,  heroBadge: 'Franklin Admirals Hockey', heroTitle: 'Our Sponsors', heroSubtitle: 'Thank you to our supporters' },
  { id: 'tryouts',     label: 'Tryouts',       path: '/tryouts',    footer: true,  hero: true,  heroBadge: '', heroTitle: 'Admirals Hockey Tryouts', heroSubtitle: "Join one of Tennessee's premier high school hockey programs" },
  { id: 'contact',     label: 'Contact',       path: '/contact',    footer: true,  hero: true,  heroBadge: 'Get In Touch', heroTitle: 'Contact Us', heroSubtitle: "Questions? We'd love to hear from you" },
  { id: 'get-app',     label: 'Get App',       path: '/get-app',    footer: true,  hero: true,  heroBadge: '📱 App', heroTitle: 'Get the Admirals Hockey App', heroSubtitle: 'Install the site on your phone for quick access to schedules, chat, and RSVPs' },
];


// ============================================
// AUTH
// ============================================
let currentUser = null;

// If no localStorage user, wait for Firebase auto-login to set it
if (!currentUser) {
  // Show a checking message instead of login form
  const loginBox = document.querySelector('.login-box');
  if (loginBox) {
    loginBox.innerHTML = '<h1>⚓ Franklin Admirals</h1><p style="color:#666;margin-top:1rem;">Checking credentials...</p>';
  }
  // Poll for Firebase auth up to 5 seconds
  let attempts = 0;
  const authCheck = setInterval(() => {
    currentUser = window._firebaseAdminUser || null;
    attempts++;
    if (currentUser) {
      clearInterval(authCheck);
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
    } else if (attempts >= 10) {
      clearInterval(authCheck);
      // Not logged in via Firebase - show normal login form
      if (loginBox) {
        loginBox.innerHTML = `<h1>⚓ Franklin Admirals</h1>
          <h2>Admin Portal</h2>
          <form id="loginForm">
            <input type="email" id="username" placeholder="Email" required>
            <input type="password" id="password" placeholder="Password" required>
            <button type="submit">Login</button>
          </form>
          <button id="googleLoginBtn" type="button" style="margin-top:0.6rem;width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:6px;background:white;cursor:pointer;font-size:0.9rem;">Sign in with Google</button>
          <p id="loginError" class="error"></p>`;
        document.getElementById('loginForm').addEventListener('submit', async e => {
          e.preventDefault();
          const email = document.getElementById('username').value;
          const pw = document.getElementById('password').value;
          document.getElementById('loginError').textContent = '';
          try {
            const { getAuth, signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
            await signInWithEmailAndPassword(getAuth(), email, pw);
          } catch (err) {
            document.getElementById('loginError').textContent = 'Invalid email or password';
          }
        });
        document.getElementById('googleLoginBtn').addEventListener('click', async () => {
          document.getElementById('loginError').textContent = '';
          try {
            const { getAuth, signInWithPopup, GoogleAuthProvider } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
            await signInWithPopup(getAuth(), new GoogleAuthProvider());
          } catch (err) {
            document.getElementById('loginError').textContent = 'Google sign-in failed';
          }
        });
      }
    }
  }, 500);
}


document.getElementById('logoutBtn').addEventListener('click', async () => {
  localStorage.removeItem('admirals_currentUser');
  // Also sign out of Firebase so auto-login doesn't re-trigger
  try {
    const { getAuth, signOut } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const auth = getAuth();
    await signOut(auth);
  } catch(e) {}
  window.location.href = '/index.html';
});




async function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('currentUser').textContent = currentUser;
  document.getElementById('settingsUsername').textContent = currentUser;
  document.getElementById('settingsEmail').value = '';
  await loadSeasons();
  loadNews();
  loadMembersTab();

  // Restore last active tab and load its data
  const savedTab = localStorage.getItem('admirals_activeTab');
  if (savedTab && document.getElementById(savedTab + 'Tab')) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(savedTab + 'Tab').classList.add('active');
    const tabBtn = document.querySelector(`[data-tab="${savedTab}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    // Load data for the restored tab
    if (savedTab === 'jvRoster') loadJvRosterSeasons();
    if (savedTab === 'jvSchedule') loadJvScheduleSeasons();
    if (savedTab === 'summer') loadSummerSeasons();
    if (savedTab === 'schedule') loadScheduleGames(document.getElementById('scheduleSeasonSelect')?.value);
    if (savedTab === 'lineups') loadLineupsTab();
    if (savedTab === 'chat') loadChannelsAdmin();
    if (savedTab === 'teamEvents') loadTeamEventsAdmin();
    if (savedTab === 'contactInfo') { loadContactInfo(); loadFooterLinks(); }
    if (savedTab === 'navigation') loadNav();
    // if (savedTab === 'tryouts') loadTryoutsSeasons(); // TODO: Tryouts tab JS not yet implemented
    if (savedTab === 'pageheroes') loadPageHeroes();
  }
}

// showDashboard is called by the Firebase auth handler in admin.html
// when _firebaseAdminUser is set. We expose it on window for that.
window.showDashboard = showDashboard;

const sendNotifBtn = document.getElementById('sendNotifBtn');
if (sendNotifBtn) {
  sendNotifBtn.addEventListener('click', async () => {
    const title = document.getElementById('notifTitle').value.trim();
    const body = document.getElementById('notifBody').value.trim();
    const url = document.getElementById('notifUrl').value.trim();
    const status = document.getElementById('notifStatus');

    if (!title || !body) {
      status.textContent = 'Title and message are required';
      status.style.color = '#c62828';
      return;
    }

    const targetRoles = Array.from(document.querySelectorAll('.notifRoleCheck:checked')).map(c => c.value);
    if (!targetRoles.length) {
      status.textContent = 'Select at least one role to send to';
      status.style.color = '#c62828';
      return;
    }

    status.textContent = 'Sending...';
    status.style.color = '#666';
    sendNotifBtn.disabled = true;

    try {
      const recipients = await computeRoleRecipients(targetRoles);
      const sendFn = httpsCallable(functions, 'sendManualNotification');
      const result = await sendFn({ title, body, url, targetRoles });
      await logNotification(title, body, url, targetRoles, recipients);
      status.textContent = `✅ Sent to ${result.data.sent} device(s)${result.data.failed ? ', ' + result.data.failed + ' failed' : ''}.`;
      status.style.color = 'green';
      document.getElementById('notifTitle').value = '';
      document.getElementById('notifBody').value = '';
      document.getElementById('notifUrl').value = '';
      loadNotificationHistory();
    } catch (err) {
      status.textContent = 'Error: ' + err.message;
      status.style.color = '#c62828';
    }
    sendNotifBtn.disabled = false;
  });
}

document.querySelector('[data-tab="notifications"]')?.addEventListener('click', loadNotificationHistory);


// ============================================
// TABS
// ============================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    const tab = e.target.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tab + 'Tab').classList.add('active');
    e.target.classList.add('active');
    localStorage.setItem('admirals_activeTab', tab);
  });
});

// ============================================
// SEASONS
// ============================================
window.currentSeasonId = null;
let currentSeasonId = null;
let allSeasons = [];

async function loadSeasons() {
  const snap = await getDocs(collection(db, 'seasons'));
  allSeasons = [];
  snap.forEach(d => allSeasons.push({ id: d.id, ...d.data() }));
  allSeasons.sort((a, b) => b.label.localeCompare(a.label));

  // Find current season
  const current = allSeasons.find(s => s.current) || allSeasons[0];
  currentSeasonId = current?.id || null;
  window.currentSeasonId = currentSeasonId;

  // Populate season selector in roster tab
  const select = document.getElementById('rosterSeasonSelect');
  select.innerHTML = allSeasons.map(s =>
    `<option value="${s.id}" ${s.id === currentSeasonId ? 'selected' : ''}>${s.label}${s.current ? ' (Current)' : ''}</option>`
  ).join('');

  if (!allSeasons.length) {
    select.innerHTML = '<option value="">No seasons - create one first</option>';
  }

  // Populate schedule season selector
  const schedSelect = document.getElementById('scheduleSeasonSelect');
  schedSelect.innerHTML = allSeasons.map(s =>
    `<option value="${s.id}" ${s.id === currentSeasonId ? 'selected' : ''}>${s.label}${s.current ? ' (Current)' : ''}</option>`
  ).join('');
  if (!allSeasons.length) schedSelect.innerHTML = '<option value="">No seasons</option>';

  // Restore saved seasons or fall back to current
  const savedRosterSeason = localStorage.getItem('admirals_rosterSeason');
  const savedScheduleSeason = localStorage.getItem('admirals_scheduleSeason');

  if (savedRosterSeason && allSeasons.find(s => s.id === savedRosterSeason)) {
    currentSeasonId = savedRosterSeason;
    document.getElementById('rosterSeasonSelect').value = savedRosterSeason;
  }
  if (savedScheduleSeason && allSeasons.find(s => s.id === savedScheduleSeason)) {
    document.getElementById('scheduleSeasonSelect').value = savedScheduleSeason;
  }

  if (currentSeasonId) loadRoster(currentSeasonId);
  loadScheduleGames(document.getElementById('scheduleSeasonSelect').value || currentSeasonId);

  // Populate seasons list tab
  renderSeasonsList();
}

document.getElementById('scheduleSeasonSelect').addEventListener('change', e => {
  localStorage.setItem('admirals_scheduleSeason', e.target.value);
  loadScheduleGames(e.target.value);
});

document.getElementById('rosterSeasonSelect').addEventListener('change', e => {
  currentSeasonId = e.target.value;
  localStorage.setItem('admirals_rosterSeason', currentSeasonId);
  loadRoster(currentSeasonId);
});

function renderSeasonsList() {
  const list = document.getElementById('seasonsList');
  list.innerHTML = '';
  if (!allSeasons.length) { list.innerHTML = '<div class="empty-state">No seasons added yet</div>'; return; }
  allSeasons.forEach(s => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <div class="item-info">
        <div>
          <strong>${s.label}</strong>
          <span>${s.current ? '✅ Current Season' : ''}</span>
          <span>${s.varsityRosterHidden ? ' 🔒 Varsity Roster TBD' : ''}</span>
          <span>${s.jvRosterHidden ? ' 🔒 JV Roster TBD' : ''}</span>
          <span>${s.jvEnabled ? ' ✅ JV Active' : ' — JV Hidden'}</span>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        ${!s.current ? `<button class="btn-edit" onclick="setCurrentSeason('${s.id}')">Set Current</button>` : ''}
        <button class="btn-edit" onclick="toggleSeasonFlag('${s.id}','varsityRosterHidden')">${s.varsityRosterHidden ? 'Show Varsity Roster' : 'Varsity Roster TBD'}</button>
        <button class="btn-edit" onclick="toggleSeasonFlag('${s.id}','jvRosterHidden')">${s.jvRosterHidden ? 'Show JV Roster' : 'JV Roster TBD'}</button>
        <button class="btn-edit" onclick="toggleSeasonFlag('${s.id}','jvEnabled')">${s.jvEnabled ? 'Hide from JV Pages' : 'Show on JV Pages'}</button>
        <button class="btn-delete" onclick="deleteSeason('${s.id}')">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });
}

document.getElementById('addSeasonBtn').addEventListener('click', () => {
  document.getElementById('seasonLabel').value = '';
  document.getElementById('seasonCurrent').checked = false;
  document.getElementById('seasonVarsityRosterHidden').checked = false;
  document.getElementById('seasonJvRosterHidden').checked = false;
  document.getElementById('seasonJvEnabled').checked = false;
  document.getElementById('seasonForm').style.display = 'block';
});
document.getElementById('cancelSeasonBtn').addEventListener('click', () => document.getElementById('seasonForm').style.display = 'none');

document.getElementById('saveSeasonBtn').addEventListener('click', async () => {
  const label = document.getElementById('seasonLabel').value.trim();
  if (!label) { alert('Please enter a season label'); return; }
  const isCurrent = document.getElementById('seasonCurrent').checked;
  const varsityRosterHidden = document.getElementById('seasonVarsityRosterHidden').checked;
  const jvRosterHidden = document.getElementById('seasonJvRosterHidden').checked;
  const jvEnabled = document.getElementById('seasonJvEnabled').checked;
  const rosterTBD = varsityRosterHidden; // backward compat
  const id = label.replace(/[^a-zA-Z0-9-]/g, '-');

  // If setting as current, unset others
  if (isCurrent) {
    for (const s of allSeasons) {
      if (s.current) await setDoc(doc(db, 'seasons', s.id), { ...s, current: false });
    }
  }

  await setDoc(doc(db, 'seasons', id), { label, current: isCurrent, rosterTBD, varsityRosterHidden, jvRosterHidden, jvEnabled, createdAt: new Date().toISOString() });
  document.getElementById('seasonForm').style.display = 'none';
  await loadSeasons();
});

window.setCurrentSeason = async (id) => {
  for (const s of allSeasons) {
    await setDoc(doc(db, 'seasons', s.id), { ...s, current: s.id === id });
  }
  await loadSeasons();
};

window.toggleRosterTBD = async (id) => {
  await window.toggleSeasonFlag(id, 'varsityRosterHidden');
};

window.toggleSeasonFlag = async (id, flag) => {
  const s = allSeasons.find(x => x.id === id);
  if (!s) return;
  const update = { ...s };
  update[flag] = !s[flag];
  if (flag === 'varsityRosterHidden') update.rosterTBD = update[flag];
  if (flag === 'jvEnabled' && !update[flag]) update.rosterTBD = s.rosterTBD;
  await setDoc(doc(db, 'seasons', s.id), update);
  await loadSeasons();
};

window.deleteSeason = async (id) => {
  if (!confirm('Delete this season? All roster data for this season will be lost.')) return;
  await deleteDoc(doc(db, 'seasons', id));
  await loadSeasons();
};

// ============================================
// ROSTER MODAL
// ============================================
let croppedPhoto = null;
let currentPhotoURL = null;

const rosterModal = document.getElementById('rosterModal');
document.getElementById('closeRosterModal').addEventListener('click', () => rosterModal.classList.remove('active'));
rosterModal.addEventListener('click', e => { if (e.target === rosterModal) rosterModal.classList.remove('active'); });
document.getElementById('cancelMemberBtn').addEventListener('click', () => rosterModal.classList.remove('active'));

function openRosterModal(type, data = null) {
  croppedPhoto = null;
  currentPhotoURL = data?.photoURL || null;
  document.getElementById('memberId').value = data?.id || '';
  document.getElementById('memberType').value = type;
  document.getElementById('memberPlayerId').value = data?.playerId || '';
  document.getElementById('memberBio').value = data?.bio || '';
  if (document.getElementById('memberBioVisual')) document.getElementById('memberBioVisual').innerHTML = data?.bio || '';
  // Default back to Visual tab each time the modal opens
  const bioVisualBtn = document.getElementById('bioEditorVisualBtn');
  const bioHtmlBtn = document.getElementById('bioEditorHtmlBtn');
  if (bioVisualBtn && bioHtmlBtn) {
    bioVisualBtn.classList.add('active');
    bioHtmlBtn.classList.remove('active');
    document.getElementById('memberBioVisual').style.display = 'block';
    document.getElementById('memberBio').style.display = 'none';
    const bioToolbar = document.getElementById('bioEditorToolbar');
    if (bioToolbar) bioToolbar.style.display = 'flex';
  }
  document.getElementById('bioPart').style.display = type === 'player' ? 'none' : 'block';
  document.getElementById('memberPhoto').value = '';
  document.getElementById('memberSaveStatus').textContent = '';
  document.getElementById('playerSearchResults').innerHTML = '';
  document.getElementById('playerSearch').value = '';

  const isPlayer = type === 'player';
  document.getElementById('playerFields').style.display = isPlayer ? 'block' : 'none';
  document.getElementById('staffFields').style.display = isPlayer ? 'none' : 'block';
  document.getElementById('returningPlayerSection').style.display = isPlayer && !data ? 'block' : 'none';
  document.getElementById('returningStaffSection').style.display = !isPlayer && !data ? 'block' : 'none';
  document.getElementById('staffSearch').value = '';
  document.getElementById('staffSearchResults').innerHTML = '';
  document.getElementById('memberStaffId').value = data?.staffId || '';

  if (isPlayer) {
    document.getElementById('memberName').value = data?.name || '';
    document.getElementById('memberNumber').value = data?.number || '';
    document.getElementById('memberPosition').value = data?.position || '';
    document.getElementById('memberGrade').value = data?.grade || '';
    document.getElementById('memberCaptain').checked = data?.captain || false;
    document.getElementById('memberAlternate').checked = data?.alternate || false;
  } else {
    document.getElementById('memberNameStaff').value = data?.name || '';
    document.getElementById('memberTitle').value = data?.title || '';
  }

  const titles = { player: 'Player', coach: 'Coach', board: 'Board Member' };
  document.getElementById('rosterModalTitle').textContent = (data ? 'Edit' : 'Add') + ' ' + titles[type];

  const preview = document.getElementById('memberPhotoPreview');
  if (currentPhotoURL) {
    showPhotoConfirmed(currentPhotoURL, preview);
  } else {
    showEmptyPhotoState(preview);
  }

  rosterModal.classList.add('active');
}

// ============================================
// RETURNING PLAYER SEARCH
// ============================================
window.checkDuplicatePlayerName = async function(name) {
  const warning = document.getElementById('duplicatePlayerWarning');
  if (!warning) return;
  if (!name || name.trim().length < 2) { warning.style.display = 'none'; return; }
  const snap = await getDocs(collection(db, 'players'));
  const matches = [];
  snap.forEach(d => {
    const p = d.data();
    if (p.name && p.name.toLowerCase() === name.trim().toLowerCase()) matches.push({ id: d.id, ...p });
  });
  if (!matches.length) { warning.style.display = 'none'; return; }
  warning.style.display = 'block';
  const pid = matches[0].id;
  const pname = matches[0].name;
  const pseasons = matches[0].seasons ? ' (seasons: ' + matches[0].seasons.join(', ') + ')' : '';
  warning.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
    + '<p style="margin:0;">⚠️ A player named <strong>' + pname + '</strong> already exists' + pseasons + '.</p>'
    + '<button onclick="document.getElementById(\'duplicatePlayerWarning\').style.display=\'none\'" style="background:none;border:none;font-size:1rem;cursor:pointer;color:#888;padding:0 0 0 0.5rem;">✕</button>'
    + '</div>'
    + '<button id="useExistingPlayerBtn" style="margin-top:0.4rem;background:#5D1725;color:white;border:none;border-radius:4px;padding:4px 10px;font-size:0.8rem;cursor:pointer;">Use existing player profile</button>';
  document.getElementById('useExistingPlayerBtn').onclick = () => selectReturningPlayer(pid, pname)
};

document.getElementById('playerSearchBtn').addEventListener('click', async () => {
  const query = document.getElementById('playerSearch').value.trim().toLowerCase();
  if (!query) return;

  const results = document.getElementById('playerSearchResults');
  results.innerHTML = '<p style="font-size:0.8rem;color:#666;">Searching...</p>';

  // Search players collection - exclude already on current season roster
  const [snap, rosterSnap] = await Promise.all([
    getDocs(collection(db, 'players')),
    window._rosterMode === 'jv'
      ? getDocs(collection(db, 'jv-roster', window.jvCurrentSeasonId || jvCurrentSeasonId, 'players'))
      : getDocs(collection(db, 'roster', currentSeasonId, 'players'))
  ]);
  const alreadyOnRoster = new Set();
  rosterSnap.forEach(d => { if (d.data().playerId) alreadyOnRoster.add(d.data().playerId); });
  const matches = [];
  snap.forEach(d => {
    const p = d.data();
    if (p.name.toLowerCase().includes(query) && !alreadyOnRoster.has(d.id)) matches.push({ id: d.id, ...p });
  });

  if (!matches.length) {
    results.innerHTML = '<p style="font-size:0.8rem;color:#666;">No matching players found. Add as new player below.</p>';
    return;
  }

  results.innerHTML = matches.map(p => `
    <div class="search-result-item" onclick="selectReturningPlayer('${p.id}', '${p.name.replace(/'/g, "\\'")}')">
      <strong>${p.name}</strong>
      <span style="font-size:0.75rem;color:#666;">${p.seasons ? p.seasons.join(', ') : ''}</span>
    </div>
  `).join('');
});

// ============================================
// RETURNING STAFF SEARCH
// ============================================
document.getElementById('staffSearchBtn').addEventListener('click', async () => {
  const q = document.getElementById('staffSearch').value.trim().toLowerCase();
  if (!q) return;
  const results = document.getElementById('staffSearchResults');
  results.innerHTML = '<p style="font-size:0.8rem;color:#666;">Searching...</p>';
  const type = document.getElementById('memberType').value;
  const collName = type === 'coach' ? 'coaches' : 'board';
  const snap = await getDocs(collection(db, collName));
  const matches = [];
  snap.forEach(d => { if (d.data().name.toLowerCase().includes(q)) matches.push({id: d.id, ...d.data()}); });
  if (!matches.length) {
    results.innerHTML = '<p style="font-size:0.8rem;color:#666;">No matches found. Fill in name below to add new.</p>';
    return;
  }
  results.innerHTML = matches.map(m => `
    <div class="search-result-item" onclick="selectReturningStaff('${m.id}', '${m.name.replace(/'/g, "\'")}')">
      <strong>${m.name}</strong>
    </div>
  `).join('');
});

window.selectReturningStaff = (staffId, name) => {
  document.getElementById('memberStaffId').value = staffId;
  document.getElementById('memberNameStaff').value = name;
  document.getElementById('staffSearch').value = name;
  document.getElementById('staffSearchResults').innerHTML = `<p style="font-size:0.8rem;color:green;">✅ Linked to existing profile: ${name}</p>`;
};

window.selectReturningPlayer = (playerId, name) => {
  document.getElementById('memberPlayerId').value = playerId;
  document.getElementById('memberName').value = name;
  document.getElementById('playerSearch').value = name;
  document.getElementById('playerSearchResults').innerHTML = `<p style="font-size:0.8rem;color:green;">✅ Linked to existing player profile: ${name}</p>`;
};

// ============================================
// PHOTO HANDLING
// ============================================
document.getElementById('memberPhoto').style.display = 'none';

function handlePhotoFile(file, container) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    showFramer(e.target.result, container, (dataURL) => {
      croppedPhoto = dataURL;
      currentPhotoURL = null;
      showPhotoConfirmed(dataURL, container);
    });
  };
  reader.readAsDataURL(file);
}

function showEmptyPhotoState(container) {
  container.innerHTML = `
    <div class="photo-preview-layout">
      <div class="photo-preview-frame photo-preview-empty"><span>No Image</span></div>
      <div class="photo-preview-buttons">
        <label class="btn-secondary photo-btn photo-choose-label">
          Choose File
          <input type="file" class="persistentPhotoInput" accept="image/*,.heic,.heif,.HEIC,.HEIF" style="display:none;">
        </label>
      </div>
    </div>
  `;
  container.querySelector('.persistentPhotoInput').addEventListener('change', function() {
    handlePhotoFile(this.files[0], container);
  });
}

function showPhotoConfirmed(dataURL, container) {
  container.innerHTML = `
    <div class="photo-preview-layout">
      <div class="photo-preview-frame"><img src="${dataURL}" class="photo-preview-img"></div>
      <div class="photo-preview-buttons">
        <label class="btn-secondary photo-btn photo-choose-label">
          Choose File
          <input type="file" class="persistentPhotoInput" accept="image/*,.heic,.heif,.HEIC,.HEIF" style="display:none;">
        </label>
        <button type="button" class="btn-delete photo-btn" id="removePhotoBtn">Remove Photo</button>
      </div>
    </div>
  `;
  container.querySelector('.persistentPhotoInput').addEventListener('change', function() {
    handlePhotoFile(this.files[0], container);
  });
  document.getElementById('removePhotoBtn').addEventListener('click', () => {
    croppedPhoto = null;
    currentPhotoURL = null;
    showEmptyPhotoState(container);
  });
}

// ============================================
// SAVE MEMBER
// ============================================
document.getElementById('saveMemberBtn').addEventListener('click', async () => {
  currentSeasonId = document.getElementById('rosterSeasonSelect').value;
  if (!currentSeasonId) { alert('Please select or create a season first.'); return; }

  const id = document.getElementById('memberId').value || Date.now().toString();
  const type = document.getElementById('memberType').value;
  const status = document.getElementById('memberSaveStatus');
  status.textContent = 'Saving...';
  status.style.color = '#666';

  let photoURL = currentPhotoURL || '';
  if (croppedPhoto) {
    try {
      const storageRef = ref(storage, `roster/${currentSeasonId}/${type}/${id}`);
      await uploadString(storageRef, croppedPhoto, 'data_url');
      photoURL = await getDownloadURL(storageRef);
    } catch (e) { console.error('Photo upload failed:', e); }
  }

  const isPlayer = type === 'player';
  const name = isPlayer ? document.getElementById('memberName').value : document.getElementById('memberNameStaff').value;

  const title = !isPlayer ? document.getElementById('memberTitle').value : '';
  const bioHtmlBtnActive = document.getElementById('bioEditorHtmlBtn');
  const bioContent = (bioHtmlBtnActive && bioHtmlBtnActive.classList.contains('active'))
    ? document.getElementById('memberBio').value
    : (document.getElementById('memberBioVisual')?.innerHTML || document.getElementById('memberBio').value);
  const member = { id, type, name, bio: bioContent, photoURL, season: currentSeasonId, ...(title && { title }) };

  if (isPlayer) {
    member.number = document.getElementById('memberNumber').value.trim() || null;
    member.position = document.getElementById('memberPosition').value;
    member.grade = document.getElementById('memberGrade').value;
    member.captain = document.getElementById('memberCaptain').checked;
    member.alternate = document.getElementById('memberAlternate').checked;

    // Handle permanent player profile
    let playerId = document.getElementById('memberPlayerId').value;
    if (!playerId) {
      // New player - create permanent profile
      playerId = 'player_' + Date.now().toString();
      await setDoc(doc(db, 'players', playerId), { name, seasons: [currentSeasonId], createdAt: new Date().toISOString() });
    } else {
      // Existing player - add this season
      const existingSnap = await getDoc(doc(db, 'players', playerId));
      if (existingSnap.exists()) {
        const existing = existingSnap.data();
        const seasons = existing.seasons || [];
        if (!seasons.includes(currentSeasonId)) seasons.push(currentSeasonId);
        await setDoc(doc(db, 'players', playerId), { ...existing, name, seasons });
      }
    }
    member.playerId = playerId;
  } else {
    member.title = document.getElementById('memberTitle').value;
    const staffCollName = type === 'coach' ? 'coaches' : 'board';
    let staffId = document.getElementById('memberStaffId').value;
    if (!staffId) {
      staffId = type + '_' + Date.now().toString();
    }
    await setDoc(doc(db, staffCollName, staffId), { name, createdAt: new Date().toISOString() }, { merge: true });
    member.staffId = staffId;
  }

  // Save to season-specific roster (varsity or JV)
  const collName = type === 'player' ? 'players' : type === 'coach' ? 'coaches' : 'boards';
  const rosterCollection = window._rosterMode === 'jv' ? 'jv-roster' : 'roster';
  const saveSeason = window._rosterMode === 'jv' ? (window._jvSaveSeasonId || jvCurrentSeasonId) : currentSeasonId;
  // merge:true is critical here — without it, saving this form (e.g. just adding a bio)
  // completely overwrites the roster document, silently wiping fields set elsewhere
  // like memberUid (account link) and parentUids (parent-linking).
  await setDoc(doc(db, rosterCollection, saveSeason, collName, id), member, { merge: true });

  // For coaches/board members added via "select returning staff", propagate bio/title/photo
  // to every other roster entry (Varsity + JV, any season) that shares the same staffId,
  // so editing one place keeps every appearance of that person in sync.
  if (!isPlayer && member.staffId) {
    syncStaffAcrossRosters(member.staffId, type, {
      bio: member.bio, title: member.title || '', photoURL: member.photoURL
    }, rosterCollection, saveSeason, id);
  }

  status.textContent = '✅ Saved!';
  status.style.color = 'green';
  if (window._rosterMode === 'jv') {
    setTimeout(() => { rosterModal.classList.remove('active'); loadJvRoster(jvCurrentSeasonId); }, 800);
  } else {
    setTimeout(() => { rosterModal.classList.remove('active'); loadRoster(currentSeasonId); }, 800);
  }
});

async function syncStaffAcrossRosters(staffId, type, updates, skipCollection, skipSeason, skipId) {
  try {
    const seasonsSnap = await getDocs(collection(db, 'seasons'));
    const collName = type === 'coach' ? 'coaches' : 'board';
    const tasks = [];

    for (const seasonDoc of seasonsSnap.docs) {
      const seasonId = seasonDoc.id;

      // Varsity roster
      tasks.push((async () => {
        const q = query(collection(db, 'roster', seasonId, collName), where('staffId', '==', staffId));
        const snap = await getDocs(q);
        snap.forEach(d => {
          if (skipCollection === 'roster' && seasonId === skipSeason && d.id === skipId) return;
          setDoc(doc(db, 'roster', seasonId, collName, d.id), updates, { merge: true });
        });
      })());

      // JV roster — coaches only, JV has no board members
      if (type === 'coach') {
        tasks.push((async () => {
          const q = query(collection(db, 'jv-roster', seasonId, 'coaches'), where('staffId', '==', staffId));
          const snap = await getDocs(q);
          snap.forEach(d => {
            if (skipCollection === 'jv-roster' && seasonId === skipSeason && d.id === skipId) return;
            setDoc(doc(db, 'jv-roster', seasonId, 'coaches', d.id), updates, { merge: true });
          });
        })());
      }
    }
    await Promise.all(tasks);
  } catch (e) {
    console.error('syncStaffAcrossRosters error:', e);
  }
}

// Add buttons
document.getElementById('addPlayerBtn').addEventListener('click', () => { window._rosterMode = 'varsity'; openRosterModal('player'); });
document.getElementById('addCoachBtn').addEventListener('click', () => { window._rosterMode = 'varsity'; openRosterModal('coach'); });
document.getElementById('addBoardBtn').addEventListener('click', () => { window._rosterMode = 'varsity'; openRosterModal('board'); });

// ============================================
// LOAD ROSTER
// ============================================
let _rosterMembersMap = {};
let _rosterMembersByName = {};
let _rosterUsedUids = new Set();

async function loadMembersMap() {
  const snap = await getDocs(collection(db, 'members'));
  const map = {};
  const byName = {};
  snap.forEach(d => {
    const m = d.data();
    const name = m.displayName || m.email || 'Member';
    map[d.id] = name;
    const key = (m.displayName || '').trim().toLowerCase();
    if (key) byName[key] = { uid: d.id, name };
  });
  return { map, byName };
}

async function loadUsedUids(rosterCollection, seasonId) {
  const usedUids = new Set();
  const subCollections = rosterCollection === 'jv-roster' ? ['players', 'coaches'] : ['players', 'coaches', 'boards'];
  for (const cn of subCollections) {
    const rSnap = await getDocs(collection(db, rosterCollection, seasonId, cn));
    rSnap.forEach(d => {
      const data = d.data();
      if (data.memberUid) usedUids.add(data.memberUid);
    });
  }
  return usedUids;
}

async function loadRoster(seasonId) {
  if (!seasonId) return;
  // Wrap in try/catch: if this enhancement data fails to load (e.g. network hiccup),
  // the actual roster must still load rather than the whole tab silently breaking.
  try {
    const { map, byName } = await loadMembersMap();
    _rosterMembersMap = map;
    _rosterMembersByName = byName;
    _rosterUsedUids = await loadUsedUids('roster', seasonId);
  } catch (e) {
    console.error('loadRoster: linked-status data failed to load, continuing without it', e);
    _rosterMembersMap = {};
    _rosterMembersByName = {};
    _rosterUsedUids = new Set();
  }
  await loadPlayers(seasonId);
  await loadCoaches(seasonId);
  await loadBoardMembers(seasonId);
}

async function loadPlayers(seasonId) {
  const list = document.getElementById('playersList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'roster', seasonId, 'players'));
  const players = [];
  snap.forEach(d => players.push(d.data()));
  if (!players.length) { list.innerHTML = '<div class="empty-state">No players added yet</div>'; return; }
  players.sort((a, b) => parseInt(a.number) - parseInt(b.number));
  const forwards = players.filter(p => p.position === 'Forward');
  const defense = players.filter(p => p.position === 'Defense');
  const goalies = players.filter(p => p.position === 'Goaltender');
  const other = players.filter(p => !['Forward','Defense','Goaltender'].includes(p.position));
  [['Forwards', forwards], ['Defense', defense], ['Goaltenders', goalies], ['Other', other]].forEach(([label, group]) => {
    if (!group.length) return;
    const h = document.createElement('h4');
    h.textContent = label;
    h.style.cssText = 'margin:0.75rem 0 0.25rem;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.5px;color:#5D1725;border-bottom:1px solid #eee;padding-bottom:0.2rem;';
    list.appendChild(h);
    group.forEach(p => list.appendChild(buildRosterItem(p)));
  });
}

async function loadCoaches(seasonId) {
  const list = document.getElementById('coachesList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'roster', seasonId, 'coaches'));
  const coaches = [];
  snap.forEach(d => coaches.push(d.data()));
  if (!coaches.length) { list.innerHTML = '<div class="empty-state">No coaches added yet</div>'; return; }
  coaches.forEach(c => list.appendChild(buildRosterItem(c)));
}

async function loadBoardMembers(seasonId) {
  const list = document.getElementById('boardList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'roster', seasonId, 'boards'));
  const members = [];
  snap.forEach(d => members.push(d.data()));
  if (!members.length) { list.innerHTML = '<div class="empty-state">No board members added yet</div>'; return; }
  members.forEach(m => list.appendChild(buildRosterItem(m)));
}

window.linkRosterMember = async function(seasonId, collName, playerId, currentUid, rosterCollection) {
  const snap = await getDocs(collection(db, 'members'));
  const members = [];
  const teamFilter = rosterCollection === 'jv-roster' ? 'jv' : 'varsity';
  snap.forEach(d => {
    const m = { id: d.id, ...d.data() };
    // Only show players with the matching team assignment or player role
    const hasTeam = Array.isArray(m.teams) && m.teams.includes(teamFilter);
    const isPlayer = m.role === 'player' || m.role === teamFilter;
    if (hasTeam || isPlayer) members.push(m);
  });
  members.sort((a,b) => (a.displayName||'').localeCompare(b.displayName||''));

  // Find member accounts already linked to a DIFFERENT roster entry this season (players/coaches/boards)
  const usedUids = new Set();
  const subCollections = rosterCollection === 'jv-roster' ? ['players', 'coaches'] : ['players', 'coaches', 'boards'];
  for (const cn of subCollections) {
    const rSnap = await getDocs(collection(db, rosterCollection, seasonId, cn));
    rSnap.forEach(d => {
      if (d.id === playerId && cn === collName) return; // skip this same entry
      const data = d.data();
      if (data.memberUid) usedUids.add(data.memberUid);
    });
  }
  const availableMembers = members.filter(m => !usedUids.has(m.id) || m.id === currentUid);
  const currentLinked = currentUid ? members.find(m => m.id === currentUid) : null;
  const currentLinkedName = currentLinked ? (currentLinked.displayName || currentLinked.email) : (currentUid ? currentUid : '');

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  const options = availableMembers.map(m => '<option value="' + m.id + '"' + (currentUid===m.id?' selected':'') + '>' + (m.displayName||m.email) + ' (' + m.role + ')</option>').join('');
  modal.innerHTML = '<div style="background:white;border-radius:8px;padding:1.5rem;max-width:400px;width:90%;">'
    + '<h3 style="margin-bottom:1rem;">Link to Member Account</h3>'
    + (currentLinkedName ? '<div style="margin-bottom:0.75rem;font-size:0.85rem;color:#2e7d32;">Currently linked to: <strong>' + currentLinkedName + '</strong></div>' : '')
    + '<select id="rosterMemberPicker" style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:6px;font-size:0.9rem;margin-bottom:1rem;"><option value="">-- No link --</option>' + options + '</select>'
    + '<div style="display:flex;gap:0.5rem;">'
    + '<button id="rmpSave" style="background:#5D1725;color:white;border:none;border-radius:6px;padding:0.6rem 1.2rem;cursor:pointer;font-weight:600;">Save</button>'
    + '<button id="rmpCancel" style="background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:0.6rem 1.2rem;cursor:pointer;">Cancel</button>'
    + (currentUid ? '<button id="rmpUnlink" style="background:white;color:#c62828;border:1px solid #c62828;border-radius:6px;padding:0.6rem 1.2rem;cursor:pointer;margin-left:auto;">Unlink</button>' : '')
    + '</div></div>';
  document.body.appendChild(modal);
  modal.querySelector('#rmpCancel').onclick = () => modal.remove();
  modal.querySelector('#rmpSave').onclick = async () => {
    const uid = modal.querySelector('#rosterMemberPicker').value || null;
    await setDoc(doc(db, rosterCollection, seasonId, collName, playerId), { memberUid: uid }, { merge: true });
    modal.remove();
    if (rosterCollection === 'jv-roster') loadJvRoster(seasonId); else loadRoster(seasonId);
  };
  const unlinkBtn = modal.querySelector('#rmpUnlink');
  if (unlinkBtn) unlinkBtn.onclick = async () => {
    await setDoc(doc(db, rosterCollection, seasonId, collName, playerId), { memberUid: null }, { merge: true });
    modal.remove();
    if (rosterCollection === 'jv-roster') loadJvRoster(seasonId); else loadRoster(seasonId);
  };
};

window.linkRosterParents = async function(seasonId, collName, playerId, currentParentUids, rosterCollection) {
  const snap = await getDocs(collection(db, 'members'));
  const members = [];
  snap.forEach(d => {
    const m = { id: d.id, ...d.data() };
    // Players themselves shouldn't show up as candidates for parent-linking
    const isPlayer = m.role === 'player' || (Array.isArray(m.roles) && m.roles.includes('player'));
    if (!isPlayer) members.push(m);
  });
  members.sort((a,b) => {
    const aIsParent = a.role === 'parent' || (Array.isArray(a.roles) && a.roles.includes('parent'));
    const bIsParent = b.role === 'parent' || (Array.isArray(b.roles) && b.roles.includes('parent'));
    if (aIsParent !== bIsParent) return aIsParent ? -1 : 1;
    return (a.displayName||'').localeCompare(b.displayName||'');
  });

  const currentSet = new Set(currentParentUids || []);

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  const checkboxesHtml = members.map(m => `
    <label style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid #f5f5f5;font-size:0.88rem;">
      <input type="checkbox" class="parentLinkCb" value="${m.id}" ${currentSet.has(m.id) ? 'checked' : ''}>
      ${m.displayName || m.email} <span style="color:#999;font-size:0.75rem;">(${m.role || 'member'})</span>
    </label>`).join('');

  modal.innerHTML = `<div style="background:white;border-radius:8px;padding:1.5rem;max-width:420px;width:90%;max-height:80vh;display:flex;flex-direction:column;">
    <h3 style="margin-bottom:0.5rem;">Link Parent(s)</h3>
    <p style="font-size:0.8rem;color:#666;margin-bottom:0.75rem;">Select all member accounts that should be able to see this player's schedule and RSVP for them.</p>
    <div style="overflow-y:auto;flex:1;margin-bottom:1rem;border:1px solid #eee;border-radius:6px;padding:0 0.75rem;">${checkboxesHtml}</div>
    <div style="display:flex;gap:0.5rem;">
      <button id="rpSave" style="background:#5D1725;color:white;border:none;border-radius:6px;padding:0.6rem 1.2rem;cursor:pointer;font-weight:600;">Save</button>
      <button id="rpCancel" style="background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:0.6rem 1.2rem;cursor:pointer;">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#rpCancel').onclick = () => modal.remove();
  modal.querySelector('#rpSave').onclick = async () => {
    const selected = Array.from(modal.querySelectorAll('.parentLinkCb:checked')).map(cb => cb.value);
    await setDoc(doc(db, rosterCollection, seasonId, collName, playerId), { parentUids: selected }, { merge: true });
    modal.remove();
    if (rosterCollection === 'jv-roster') loadJvRoster(seasonId); else loadRoster(seasonId);
  };
};

function buildRosterItem(m) {
  const item = document.createElement('div');
  item.className = 'item';
  const subtitle = m.type === 'player' ? `${m.position} | ${m.grade}` : m.title || '';
  const captainLabel = m.captain ? ' - Captain' : m.alternate ? ' - Alternate Captain' : '';
  const label = m.type === 'player' ? `#${m.number} - ${m.name}${captainLabel}` : m.name;
  const linkedName = m.memberUid ? (_rosterMembersMap[m.memberUid] || 'Unknown member') : '';
  let statusHtml = '';
  if (linkedName) {
    statusHtml = `<span style="display:block;color:#2e7d32;font-size:0.75rem;margin-top:2px;">🔗 Linked to: ${linkedName}</span>`;
  } else {
    const possibleMatch = _rosterMembersByName[(m.name || '').trim().toLowerCase()];
    if (possibleMatch && !_rosterUsedUids.has(possibleMatch.uid)) {
      statusHtml = `<span style="display:block;color:#e65100;font-size:0.75rem;margin-top:2px;">⚠️ Account found (${possibleMatch.name}) — not linked</span>`;
    } else {
      statusHtml = `<span style="display:block;color:#999;font-size:0.75rem;margin-top:2px;">No account found</span>`;
    }
  }
  const parentUids = Array.isArray(m.parentUids) ? m.parentUids : [];
  const parentNames = parentUids.map(uid => _rosterMembersMap[uid] || 'Unknown').filter(Boolean);
  const parentsHtml = (m.type === 'player' && parentNames.length)
    ? `<span style="display:block;color:#1565c0;font-size:0.75rem;margin-top:2px;">👪 Parent(s): ${parentNames.join(', ')}</span>` : '';
  item.innerHTML = `
    <div class="item-info">
      ${m.photoURL ? `<img src="${m.photoURL}" class="item-photo">` : ''}
      <div><strong>${label}</strong><span>${subtitle}</span>${statusHtml}${parentsHtml}</div>
    </div>
    <div>
      <button class="btn-secondary" style="font-size:0.75rem;padding:3px 8px;background:${m.memberUid?'white':'#c62828'};color:${m.memberUid?'#2e7d32':'white'};border-color:${m.memberUid?'#2e7d32':'#c62828'};" onclick="linkRosterMember(window._rosterMode==='jv'?(window._jvSaveSeasonId||window.jvCurrentSeasonId):window.currentSeasonId,'${m.type==='player'?'players':m.type==='coach'?'coaches':'boards'}','${m.id}','${m.memberUid||''}',window._rosterMode==='jv'?'jv-roster':'roster')" title="${m.memberUid?'Linked - click to change':'Not linked - click to link'}">${m.memberUid?'🔗 Linked':'Link'}</button>
      ${m.type === 'player' ? `<button class="btn-secondary" style="font-size:0.75rem;padding:3px 8px;" onclick='linkRosterParents(window._rosterMode==="jv"?(window._jvSaveSeasonId||window.jvCurrentSeasonId):window.currentSeasonId,"players","${m.id}",${JSON.stringify(parentUids)},window._rosterMode==="jv"?"jv-roster":"roster")'>👪 Parents${parentUids.length ? ' (' + parentUids.length + ')' : ''}</button>` : ''}
      <button class="btn-edit" onclick="editMember('${m.id}', '${m.type}')">Edit</button>
      <button class="btn-delete" onclick="deleteRosterMember('${m.id}', '${m.type}')">Delete</button>
    </div>
  `;
  return item;
}

window.editMember = async (id, type) => {
  const cn = type === 'player' ? 'players' : type === 'coach' ? 'coaches' : 'boards';
  const snap = await getDoc(doc(db, 'roster', currentSeasonId, cn, id));
  if (snap.exists()) openRosterModal(type, snap.data());
};

window.deleteRosterMember = async (id, type) => {
  if (!confirm('Delete this member from this season?')) return;
  const collName = type === 'player' ? 'players' : type === 'coach' ? 'coaches' : 'boards';
  const rc = window._rosterMode === 'jv' ? 'jv-roster' : 'roster';
  const sid = window._rosterMode === 'jv' ? (window.jvCurrentSeasonId || jvCurrentSeasonId) : currentSeasonId;
  await deleteDoc(doc(db, rc, sid, collName, id));
  try { await deleteObject(ref(storage, `roster/${sid}/${type}/${id}`)); } catch(e) {}
  if (window._rosterMode === 'jv') loadJvRoster(sid); else loadRoster(sid);
};

// ============================================
// SCHEDULE
// ============================================
let currentGameId = null;
let opponentLogoData = null;
let savedRinks = [];
let savedLeagues = [];
let savedTournaments = [];

document.getElementById('addGameBtn').addEventListener('click', () => openGameModal());

async function openGameModal(data = null) {
  currentGameId = data?.id || null;
  opponentLogoData = null;
  await loadSavedOptions();
  showGameModal(data);
}

function showGameModal(data = null) {
  const modal = document.getElementById('gameModal');
  if (!modal) createGameModal();

  // Reset fields
  const fields = ['gameDate','gameTime','gameEndTime','gameTimezone','gameOpponent','gameHomeAway','gameRinkName','gameRinkAddress','gameResult','gameTeamScore','gameOpponentScore'];
  fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = data?.[id.replace('game', '').toLowerCase()] || ''; });

  // Always reset logo preview first
  document.getElementById('gameOpponentLogoPreview').innerHTML = '<span style="font-size:1.5rem;">🏒</span>';
  document.getElementById('removeOpponentLogo').style.display = 'none';

  if (data) {
    document.getElementById('gameDate').value = data.date || '';
    document.getElementById('gameTime').value = data.time || '';
    document.getElementById('gameEndTime').value = data.endTime || '';
    document.getElementById('gameTimezone').value = data.timezone || '';
    document.getElementById('gameGameType').value = data.gameType || '';
    document.getElementById('gameLeagueName').value = data.leagueName || '';
    document.getElementById('gameTournamentName').value = data.tournamentName || '';
    document.getElementById('gameSubtype').value = data.subtype || '';
    document.getElementById('gameOpponent').value = data.opponent || '';
    document.getElementById('gameHomeAway').value = data.homeAway || '';
    document.getElementById('gameRinkName').value = data.rinkName || '';
    document.getElementById('gameRinkAddress').value = data.rinkAddress || '';
    document.getElementById('gameResult').value = data.result || '';
    document.getElementById('gameTeamScore').value = data.teamScore ?? '';
    document.getElementById('gameOpponentScore').value = data.opponentScore ?? '';
    document.getElementById('scoreFields').style.display = data.result ? 'grid' : 'none';
    document.getElementById('gamePracticeNotes').value = data.notes || '';
    window._editingGameLogo = data?.opponentLogo || '';
  if (data.opponentLogo) {
      document.getElementById('gameOpponentLogoPreview').innerHTML = `<img src="${data.opponentLogo}" style="height:50px;object-fit:contain;">`;
      document.getElementById('removeOpponentLogo').style.display = 'inline-block';
    }
  } else {
    ['gameDate','gameTime','gameEndTime','gameTimezone','gameGameType','gameLeagueName','gameTournamentName',
     'gameSubtype','gameOpponent','gameHomeAway','gameRinkName','gameRinkAddress','gameResult',
     'gameTeamScore','gameOpponentScore','gamePracticeNotes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('scoreFields').style.display = 'none';
  }

  toggleGameTypeFields();
  document.getElementById('gameModal').classList.add('active');
}

function createGameModal() {
  const modal = document.createElement('div');
  modal.id = 'gameModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <h2 id="gameModalTitle">Add Game</h2>
        <button class="modal-close" id="closeGameModal">&times;</button>
      </div>
      <div class="modal-body">

        <div class="form-label-group">
          <label class="field-label">Date, Time &amp; Timezone</label>
          <div style="display:grid;grid-template-columns:1fr 120px 90px;gap:0.5rem;">
            <input type="date" id="gameDate">
            <input type="time" id="gameTime">
            <select id="gameTimezone">
              <option value="">TZ</option>
              <option value="ET">ET</option>
              <option value="CT">CT</option>
              <option value="MT">MT</option>
              <option value="PT">PT</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-label-group">
            <label class="field-label">Game Type</label>
            <select id="gameGameType">
              <option value="">Select...</option>
              <option value="Exhibition">Exhibition</option>
              <option value="League">League</option>
              <option value="Tournament">Tournament</option>
              <option value="Practice">Practice</option>
            </select>
          </div>
          <div class="form-label-group">
            <label class="field-label">Sub-Type</label>
            <select id="gameSubtype">
              <option value="">Select...</option>
              <option value="Regular Season">Regular Season</option>
              <option value="Playoffs">Playoffs</option>
              <option value="Championship">Championship</option>
            </select>
          </div>
        </div>

        <div id="leagueField" style="display:none;">
          <div class="form-label-group">
            <label class="field-label">League Name</label>
            <input type="text" id="gameLeagueName" placeholder="e.g. GNASH" list="leaguesList">
            <datalist id="leaguesList"></datalist>
          </div>
        </div>
        <div id="tournamentField" style="display:none;">
          <div class="form-label-group">
            <label class="field-label">Tournament Name</label>
            <input type="text" id="gameTournamentName" placeholder="e.g. Battle at the Border" list="tournamentsList">
            <datalist id="tournamentsList"></datalist>
          </div>
        </div>

        <div class="form-row" id="opponentRow">
          <div class="form-label-group">
            <label class="field-label">Opponent</label>
            <input type="text" id="gameOpponent" placeholder="Opponent Name">
          </div>
          <div class="form-label-group">
            <label class="field-label">Home or Away</label>
            <select id="gameHomeAway">
              <option value="">Select...</option>
              <option value="Home">Home</option>
              <option value="Away">Away</option>
            </select>
          </div>
        </div>

        <div class="photo-upload-section" id="opponentLogoSection" style="margin-bottom:0.75rem;">
          <label class="field-label">Opponent Logo (optional)</label>
          <div style="display:flex;align-items:center;gap:0.75rem;margin-top:0.4rem;">
            <div id="gameOpponentLogoPreview" class="opp-logo-admin-preview"></div>
            <label class="btn-secondary photo-btn photo-choose-label" style="font-size:0.8rem;">
              Choose Logo
              <input type="file" id="gameOpponentLogo" accept="image/*" style="display:none;">
            </label>
            <button type="button" id="removeOpponentLogo" class="btn-delete photo-btn" style="font-size:0.8rem;display:none;">Remove</button>
          </div>
        </div>

        <div class="form-label-group" id="practiceNotesField" style="display:none;">
          <label class="field-label">Practice Notes (optional)</label>
          <textarea id="gamePracticeNotes" rows="2" placeholder="e.g. Full ice, focus on breakouts"></textarea>
        </div>

        <div class="form-row">
          <div class="form-label-group">
            <label class="field-label">Rink Name</label>
            <input type="text" id="gameRinkName" placeholder="e.g. Centennial Sportsplex" list="rinkNamesList">
            <datalist id="rinkNamesList"></datalist>
          </div>
          <div class="form-label-group">
            <label class="field-label">Rink Address</label>
            <input type="text" id="gameRinkAddress" placeholder="e.g. 222 25th Ave N Nashville, TN" list="rinkAddressList">
            <datalist id="rinkAddressList"></datalist>
          </div>
        </div>

        <div class="form-label-group" id="resultSection" style="margin-top:1rem;">
          <label class="field-label" style="color:#5D1725;">Result</label>
          <select id="gameResult">
            <option value="">No Result Yet</option>
            <option value="W">W - Win</option>
            <option value="L">L - Loss</option>
            <option value="T">T - Tie</option>
            <option value="OTW">OTW - Overtime Win</option>
            <option value="OTL">OTL - Overtime Loss</option>
            <option value="SOW">SOW - Shootout Win</option>
            <option value="SOL">SOL - Shootout Loss</option>
          </select>
        </div>
        <div class="form-row" id="scoreFields" style="display:none;">
          <div class="form-label-group">
            <label class="field-label">Our Score</label>
            <input type="number" id="gameTeamScore" placeholder="0" min="0">
          </div>
          <div class="form-label-group">
            <label class="field-label">Opponent Score</label>
            <input type="number" id="gameOpponentScore" placeholder="0" min="0">
          </div>
        </div>

        <div class="form-label-group" style="margin-top:0.75rem;">
          <label style="display:flex;align-items:center;gap:0.4rem;">
            <input type="checkbox" id="gameSendNotif"> Send Notification?
          </label>
          <div id="gameNotifRoles" style="display:none;flex-wrap:wrap;gap:0.5rem;margin-top:0.6rem;"></div>
        </div>

        <div class="form-buttons">
          <button id="saveGameBtn" class="btn-primary">Save Game</button>
          <button id="cancelGameBtn" class="btn-secondary">Cancel</button>
        </div>
        <p id="gameSaveStatus" class="save-status"></p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('closeGameModal').addEventListener('click', () => modal.classList.remove('active'));
  document.getElementById('cancelGameBtn').addEventListener('click', () => modal.classList.remove('active'));
  // Click-outside-to-close intentionally disabled: this is a form modal.

  document.getElementById('gameGameType').addEventListener('change', toggleGameTypeFields);
  document.getElementById('gameResult').addEventListener('change', () => {
    const hasResult = document.getElementById('gameResult').value;
    document.getElementById('scoreFields').style.display = hasResult ? 'grid' : 'none';
  });

  // Opponent logo upload
  // opponentLogoData is module-scoped
  document.getElementById('gameOpponentLogo').addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      opponentLogoData = e.target.result;
      document.getElementById('gameOpponentLogoPreview').innerHTML = `<img src="${opponentLogoData}" style="height:50px;object-fit:contain;">`;
      document.getElementById('removeOpponentLogo').style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('removeOpponentLogo').addEventListener('click', () => {
    opponentLogoData = null;
    document.getElementById('gameOpponentLogoPreview').innerHTML = '';
    document.getElementById('gameOpponentLogo').value = '';
    document.getElementById('removeOpponentLogo').style.display = 'none';
  });

  // Auto-fill rink address when rink name selected
  document.getElementById('gameRinkName').addEventListener('change', () => {
    const name = document.getElementById('gameRinkName').value;
    const rink = savedRinks.find(r => r.name === name);
    if (rink) document.getElementById('gameRinkAddress').value = rink.address;
  });

  const gameSendNotifCb = document.getElementById('gameSendNotif');
  if (gameSendNotifCb) {
    buildNotifRoleCheckboxes('gameNotifRoles');
    gameSendNotifCb.addEventListener('change', function() {
      document.getElementById('gameNotifRoles').style.display = this.checked ? 'flex' : 'none';
    });
  }

  document.getElementById('saveGameBtn').addEventListener('click', async () => {
    const seasonId = document.getElementById('scheduleSeasonSelect').value;
    if (!seasonId) { alert('Please select a season first'); return; }

    const status = document.getElementById('gameSaveStatus');
    status.textContent = 'Saving...';

    const id = currentGameId || Date.now().toString();
    const gameType = document.getElementById('gameGameType').value;
    const result = document.getElementById('gameResult').value;
    const rinkName = document.getElementById('gameRinkName').value;
    const rinkAddress = document.getElementById('gameRinkAddress').value;
    const leagueName = document.getElementById('gameLeagueName').value;
    const tournamentName = document.getElementById('gameTournamentName').value;

    // Upload opponent logo if new one selected
    let opponentLogo = window._editingGameLogo || '';
    if (opponentLogoData) {
      try {
        const storageRef = ref(storage, `schedule/${seasonId}/${id}/opponentLogo`);
        await uploadString(storageRef, opponentLogoData, 'data_url');
        opponentLogo = await getDownloadURL(storageRef);
      } catch(e) { console.error('Logo upload failed:', e); }
    }

    const isPractice = gameType === 'Practice';

    const game = {
      id,
      date: document.getElementById('gameDate').value,
      time: document.getElementById('gameTime').value,
      endTime: document.getElementById('gameEndTime').value || '',
      timezone: document.getElementById('gameTimezone').value,
      gameType,
      subtype: isPractice ? '' : document.getElementById('gameSubtype').value,
      leagueName: gameType === 'League' ? leagueName : '',
      tournamentName: gameType === 'Tournament' ? tournamentName : '',
      opponent: isPractice ? '' : document.getElementById('gameOpponent').value,
      homeAway: isPractice ? '' : document.getElementById('gameHomeAway').value,
      rinkName,
      rinkAddress,
      opponentLogo: isPractice ? '' : opponentLogo,
      result: isPractice ? '' : result,
      teamScore: isPractice ? null : (result ? parseInt(document.getElementById('gameTeamScore').value) || 0 : null),
      opponentScore: isPractice ? null : (result ? parseInt(document.getElementById('gameOpponentScore').value) || 0 : null),
      notes: isPractice ? document.getElementById('gamePracticeNotes').value.trim() : '',
    };

    await setDoc(doc(db, 'seasons', seasonId, 'schedule', id), game);

    // Save rink for reuse
    if (rinkName) {
      await setDoc(doc(db, 'rinks', rinkName.replace(/\s+/g, '_')), { name: rinkName, address: rinkAddress }, { merge: true });
    }
    // Save league for reuse
    if (gameType === 'League' && leagueName) {
      await setDoc(doc(db, 'leagues', leagueName.replace(/\s+/g, '_')), { name: leagueName }, { merge: true });
    }
    // Save tournament for reuse
    if (gameType === 'Tournament' && tournamentName) {
      await setDoc(doc(db, 'tournaments', tournamentName.replace(/\s+/g, '_')), { name: tournamentName }, { merge: true });
    }

    status.textContent = '✅ Saved!';
    status.style.color = 'green';

    if (document.getElementById('gameSendNotif')?.checked) {
      const notifRoles = Array.from(document.querySelectorAll('#gameNotifRoles .notifRoleCb:checked')).map(c => c.value);
      if (notifRoles.length) {
        const oppText = game.opponent ? ('vs ' + game.opponent) : 'New Game Added';
        const bodyText = (game.date || '') + (game.rinkName ? (' at ' + game.rinkName) : '');
        sendRoleNotifications(notifRoles, oppText, bodyText || 'Check the schedule for details.', '/schedule');
      }
    }

    setTimeout(() => {
      document.getElementById('gameModal').classList.remove('active');
      loadScheduleGames(seasonId);
    }, 800);
  });
}

function toggleGameTypeFields() {
  const type = document.getElementById('gameGameType')?.value;
  const isPractice = type === 'Practice';
  const leagueField = document.getElementById('leagueField');
  const tournamentField = document.getElementById('tournamentField');
  const subtypeField = document.getElementById('gameSubtype')?.parentElement;
  if (leagueField) leagueField.style.display = (!isPractice && type === 'League') ? 'block' : 'none';
  if (tournamentField) tournamentField.style.display = (!isPractice && type === 'Tournament') ? 'block' : 'none';
  if (subtypeField) subtypeField.style.display = (!isPractice && type !== 'Exhibition') ? 'block' : 'none';

  const opponentRow = document.getElementById('opponentRow');
  const opponentLogoSection = document.getElementById('opponentLogoSection');
  const resultSection = document.getElementById('resultSection');
  const scoreFields = document.getElementById('scoreFields');
  const practiceNotesField = document.getElementById('practiceNotesField');
  if (opponentRow) opponentRow.style.display = isPractice ? 'none' : 'flex';
  if (opponentLogoSection) opponentLogoSection.style.display = isPractice ? 'none' : 'block';
  if (resultSection) resultSection.style.display = isPractice ? 'none' : 'block';
  if (scoreFields && isPractice) scoreFields.style.display = 'none';
  if (practiceNotesField) practiceNotesField.style.display = isPractice ? 'block' : 'none';
}

async function loadSavedOptions() {
  savedRinks = [];
  savedLeagues = [];
  savedTournaments = [];

  const [rinkSnap, leagueSnap, tournSnap] = await Promise.all([
    getDocs(collection(db, 'rinks')),
    getDocs(collection(db, 'leagues')),
    getDocs(collection(db, 'tournaments'))
  ]);

  rinkSnap.forEach(d => savedRinks.push(d.data()));
  leagueSnap.forEach(d => savedLeagues.push(d.data()));
  tournSnap.forEach(d => savedTournaments.push(d.data()));

  if (!document.getElementById('gameModal')) createGameModal();

  const rinkList = document.getElementById('rinkNamesList');
  const rinkAddressList = document.getElementById('rinkAddressList');
  const leagueList = document.getElementById('leaguesList');
  const tournList = document.getElementById('tournamentsList');

  if (rinkList) rinkList.innerHTML = savedRinks.map(r => `<option value="${r.name}">`).join('');
  if (rinkAddressList) rinkAddressList.innerHTML = savedRinks.map(r => `<option value="${r.address}">`).join('');
  if (leagueList) leagueList.innerHTML = savedLeagues.map(l => `<option value="${l.name}">`).join('');
  if (tournList) tournList.innerHTML = savedTournaments.map(t => `<option value="${t.name}">`).join('');
}

async function loadScheduleGames(seasonId) {
  if (!seasonId) return;
  const list = document.getElementById('gamesList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'seasons', seasonId, 'schedule'));
  const games = [];
  snap.forEach(d => games.push(d.data()));
  if (!games.length) { list.innerHTML = '<div class="empty-state">No games added yet</div>'; return; }
  function fmt12(time) {
    if (!time) return '';
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  }

  function buildGameItem(g) {
    const dateStr = new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const homeAway = g.homeAway === 'Home' ? 'vs.' : '@';
    const resultStr = g.result ? ` | ${g.result} ${g.teamScore}-${g.opponentScore}` : '';
    const item = document.createElement('div'); item.className = 'item';
    const seasonIdForStats = document.getElementById('scheduleSeasonSelect').value;
    item.innerHTML = `
      <div class="item-info">
        <div>
          <strong>${dateStr} ${fmt12(g.time)}${g.timezone ? ' ' + g.timezone : ''} · ${homeAway} ${g.opponent}</strong>
          <span>${g.gameType}${g.subtype ? ' · ' + g.subtype : ''}${resultStr}</span>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn-stats" onclick="openGameStats('${g.id}', '${seasonIdForStats}')">Stats</button>
        <button class="btn-edit" onclick="viewScheduleGameRsvp('${g.id}','${seasonIdForStats}')">📋 RSVPs</button>
        <button class="btn-edit" onclick="editGame('${g.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteGame('${g.id}')">Delete</button>
      </div>
    `;
    return item;
  }

  // Split into Upcoming (no result yet + future/today practices) and Past Events
  // (games with a result, or practices whose date has already passed) — admin-view
  // only, purely a display convenience, does not affect the public site at all.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isPast = (g) => {
    if (g.gameType === 'Practice') return new Date(g.date + 'T12:00:00') < today;
    return !!g.result;
  };
  const upcoming = games.filter(g => !isPast(g)).sort((a, b) => new Date(a.date) - new Date(b.date));
  const past = games.filter(isPast).sort((a, b) => new Date(b.date) - new Date(a.date));

  upcoming.forEach(g => list.appendChild(buildGameItem(g)));

  if (past.length) {
    const pastHeader = document.createElement('div');
    pastHeader.textContent = 'Past Events';
    pastHeader.style.cssText = 'margin:1.5rem 0 0.5rem;font-weight:700;font-size:0.9rem;color:#777777;border-top:1px solid #e0e0e0;padding-top:1rem;';
    list.appendChild(pastHeader);
    past.forEach(g => list.appendChild(buildGameItem(g)));
  }
}

window.editGame = async (id) => {
  const seasonId = document.getElementById('scheduleSeasonSelect').value;
  const snap = await getDoc(doc(db, 'seasons', seasonId, 'schedule', id));
  if (snap.exists()) {
    currentGameId = id;
    await loadSavedOptions();
    showGameModal(snap.data());
  }
};

window.deleteGame = async (id) => {
  if (!confirm('Delete game?')) return;
  const seasonId = document.getElementById('scheduleSeasonSelect').value;
  await deleteDoc(doc(db, 'seasons', seasonId, 'schedule', id));
  loadScheduleGames(seasonId);
};

// ============================================
// NEWS
// ============================================
let newsImageData = null;
let currentNewsImageURL = null;

// News image input handler
const newsImageInput = document.getElementById('newsImageInput');
if (newsImageInput) {
  newsImageInput.addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      newsImageData = e.target.result;
      const preview = document.getElementById('newsImagePreview');
      if (preview) preview.innerHTML = `<img src="${newsImageData}" style="width:120px;aspect-ratio:16/9;object-fit:cover;border-radius:4px;border:1px solid #ddd;display:block;">`;
      const removeBtn = document.getElementById('removeNewsImage');
      if (removeBtn) removeBtn.style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
  });
}

// News remove image handler
const removeNewsImageBtn = document.getElementById('removeNewsImage');
if (removeNewsImageBtn) {
  removeNewsImageBtn.addEventListener('click', () => {
    newsImageData = null;
    currentNewsImageURL = null;
    const preview = document.getElementById('newsImagePreview');
    if (preview) preview.innerHTML = '';
    removeNewsImageBtn.style.display = 'none';
    const input = document.getElementById('newsImageInput');
    if (input) input.value = '';
  });
}

document.getElementById('addNewsBtn').addEventListener('click', () => {
  ['newsId','newsTitle','newsDate','newsCategory','newsContent'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  if (document.getElementById('newsSummary')) document.getElementById('newsSummary').value = '';
  if (document.getElementById('newsContentVisual')) document.getElementById('newsContentVisual').innerHTML = '';
  if (document.getElementById('newsFeatured')) document.getElementById('newsFeatured').checked = false;
  if (document.getElementById('newsHomeCard')) document.getElementById('newsHomeCard').checked = false;
  if (document.getElementById('homeCardOrder')) document.getElementById('homeCardOrder').style.display = 'none';
  if (document.getElementById('newsHomeOrder')) document.getElementById('newsHomeOrder').value = '';
  newsImageData = null;
  currentNewsImageURL = null;
  document.getElementById('newsImagePreview').innerHTML = '';
  if (document.getElementById('removeNewsImage')) document.getElementById('removeNewsImage').style.display = 'none';
  document.getElementById('newsForm').style.display = 'block';
});
document.getElementById('cancelNewsBtn').addEventListener('click', () => document.getElementById('newsForm').style.display = 'none');

const newsSendNotifCb = document.getElementById('newsSendNotif');
if (newsSendNotifCb) {
  buildNotifRoleCheckboxes('newsNotifRoles');
  newsSendNotifCb.addEventListener('change', function() {
    document.getElementById('newsNotifRoles').style.display = this.checked ? 'flex' : 'none';
  });
}

document.getElementById('saveNewsBtn').addEventListener('click', async () => {
  const id = document.getElementById('newsId').value || Date.now().toString();
  // Handle news image upload
  let newsImgURL = currentNewsImageURL || '';
  if (newsImageData) {
    try {
      const newsImgRef = ref(storage, `news/${id}`);
      await uploadString(newsImgRef, newsImageData, 'data_url');
      newsImgURL = await getDownloadURL(newsImgRef);
    } catch(e) { console.error(e); }
  }
  const isFeatured = document.getElementById('newsFeatured')?.checked || false;
  const isHomeCard = document.getElementById('newsHomeCard')?.checked || false;
  const homeOrder = parseInt(document.getElementById('newsHomeOrder')?.value) || 99;
  const summary = document.getElementById('newsSummary')?.value || '';

  // Get content from whichever editor is active
  const htmlBtn = document.getElementById('editorHtmlBtn');
  let bodyContent = '';
  if (htmlBtn && htmlBtn.classList.contains('active')) {
    bodyContent = document.getElementById('newsContent').value;
  } else {
    bodyContent = document.getElementById('newsContentVisual')?.innerHTML || '';
  }

  if (isFeatured) {
    const allNews = await getDocs(collection(db, 'news'));
    for (const d of allNews.docs) {
      if (d.id !== id && d.data().featured) {
        await setDoc(doc(db, 'news', d.id), { ...d.data(), featured: false });
      }
    }
  }
  await setDoc(doc(db, 'news', id), {
    id,
    title: document.getElementById('newsTitle').value,
    date: document.getElementById('newsDate').value,
    category: document.getElementById('newsCategory').value,
    summary,
    content: bodyContent,
    imageURL: newsImgURL,
    featured: isFeatured,
    homeCard: isHomeCard,
    homeOrder: isHomeCard ? homeOrder : 99
  });
  const status = document.getElementById('newsSaveStatus');
  if (status) { status.textContent = '✅ Saved!'; status.style.color = 'green'; }

  if (document.getElementById('newsSendNotif')?.checked) {
    const notifRoles = Array.from(document.querySelectorAll('#newsNotifRoles .notifRoleCb:checked')).map(c => c.value);
    if (notifRoles.length) {
      const titleText = document.getElementById('newsTitle').value || 'New Post';
      sendRoleNotifications(notifRoles, 'News: ' + titleText, summary || 'Check out the latest news.', '/news');
    }
  }

  setTimeout(() => {
    document.getElementById('newsForm').style.display = 'none';
    loadNews();
  }, 600);
});

async function loadNews() {
  const list = document.getElementById('newsList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'news'));
  const posts = []; snap.forEach(d => posts.push(d.data()));
  if (!posts.length) { list.innerHTML = '<div class="empty-state">No posts added yet</div>'; return; }
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  loadHomeOrderManager();
  posts.forEach(n => {
    const dateStr = new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const item = document.createElement('div'); item.className = 'item';
    const badges = `${n.featured ? '<span style="background:#5D1725;color:white;font-size:0.65rem;padding:2px 6px;border-radius:3px;margin-left:6px;">⭐ Featured</span>' : ''}${n.homeCard ? '<span style="background:#1565c0;color:white;font-size:0.65rem;padding:2px 6px;border-radius:3px;margin-left:4px;">📌 Home</span>' : ''}`;
    item.innerHTML = `<div class="item-info"><div><strong>${n.title}${badges}</strong><span>${n.category} | ${dateStr}</span></div></div><div><button class="btn-edit" onclick="editNews('${n.id}')">Edit</button><button class="btn-delete" onclick="deleteNews('${n.id}')">Delete</button></div>`;
    list.appendChild(item);
  });
}

window.editNews = async (id) => {
  const snap = await getDoc(doc(db, 'news', id));
  const n = snap.data();
  document.getElementById('newsId').value = n.id;
  document.getElementById('newsTitle').value = n.title;
  document.getElementById('newsDate').value = n.date;
  document.getElementById('newsCategory').value = n.category;
  document.getElementById('newsContent').value = n.content;
  if (document.getElementById('newsFeatured')) document.getElementById('newsFeatured').checked = n.featured || false;
  if (document.getElementById('newsHomeCard')) {
    document.getElementById('newsHomeCard').checked = n.homeCard || false;
    document.getElementById('homeCardOrder').style.display = n.homeCard ? 'block' : 'none';
  }
  if (document.getElementById('newsHomeOrder')) document.getElementById('newsHomeOrder').value = n.homeOrder || '';
  if (document.getElementById('newsSummary')) document.getElementById('newsSummary').value = n.summary || '';
  // Load content into visual editor
  if (document.getElementById('newsContentVisual')) document.getElementById('newsContentVisual').innerHTML = n.content || '';
  if (document.getElementById('newsContent')) document.getElementById('newsContent').value = n.content || '';
  currentNewsImageURL = n.imageURL || null;
  newsImageData = null;
  const preview = document.getElementById('newsImagePreview');
  if (currentNewsImageURL) {
    preview.innerHTML = `<img src="${currentNewsImageURL}" style="width:120px;aspect-ratio:16/9;object-fit:cover;border-radius:4px;border:1px solid #ddd;display:block;">`;
    document.getElementById('removeNewsImage').style.display = 'inline-block';
  } else {
    preview.innerHTML = '';
    document.getElementById('removeNewsImage').style.display = 'none';
  }
  document.getElementById('newsForm').style.display = 'block';
};
window.deleteNews = async (id) => { if (!confirm('Delete post?')) return; await deleteDoc(doc(db, 'news', id)); loadNews(); };




async function loadHomeOrderManager() {
  const container = document.getElementById('homeOrderManager');
  if (!container) return;
  const snap = await getDocs(collection(db, 'news'));
  const cards = [];
  snap.forEach(d => { const n = d.data(); if (n.homeCard) cards.push({ id: d.id, ...n }); });
  cards.sort((a, b) => (a.homeOrder||99) - (b.homeOrder||99));
  const list = document.getElementById('homeOrderList');
  if (!list) return;
  list.innerHTML = cards.map((n, i) => `
    <div class="home-order-item" draggable="true" data-id="${n.id}" style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem;background:white;border:1px solid #eee;border-radius:4px;cursor:grab;margin-bottom:0.4rem;">
      <span class="home-order-num" style="font-weight:700;color:#5D1725;min-width:20px;">${i+1}</span>
      <span style="flex:1;font-size:0.9rem;">${n.title}</span>
    </div>`).join('');
  setupDragSort(list, cards);
}

function setupDragSort(list, items) {
  let dragged = null;
  list.querySelectorAll('.home-order-item').forEach(item => {
    item.addEventListener('dragstart', () => { dragged = item; item.style.opacity = '0.5'; });
    item.addEventListener('dragend', () => { item.style.opacity = '1'; saveHomeOrder(); });
    item.addEventListener('dragover', e => { e.preventDefault(); const rect = item.getBoundingClientRect(); const mid = rect.top + rect.height/2; if (e.clientY < mid) list.insertBefore(dragged, item); else list.insertBefore(dragged, item.nextSibling); });
  });
}

async function saveHomeOrder() {
  const items = document.querySelectorAll('.home-order-item');
  for (let i = 0; i < items.length; i++) {
    const id = items[i].dataset.id;
    items[i].querySelector('.home-order-num').textContent = i + 1;
    await setDoc(doc(db, 'news', id), { homeOrder: i + 1 }, { merge: true });
  }
}

const toggleBtn = document.getElementById('toggleOrderManager');
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    const list = document.getElementById('homeOrderList');
    const hidden = list.style.display === 'none';
    list.style.display = hidden ? 'flex' : 'none';
    toggleBtn.textContent = hidden ? 'Hide' : 'Show';
  });
}

// Expose to window for HTML onclick attributes
// Editor tab toggle (Visual / HTML)
const editorVisualBtn = document.getElementById('editorVisualBtn');
const editorHtmlBtn = document.getElementById('editorHtmlBtn');
if (editorVisualBtn && editorHtmlBtn) {
  editorVisualBtn.addEventListener('click', () => {
    editorVisualBtn.classList.add('active');
    editorHtmlBtn.classList.remove('active');
    const visual = document.getElementById('newsContentVisual');
    const html = document.getElementById('newsContent');
    const toolbar = document.getElementById('editorToolbar');
    // Sync HTML content into visual editor
    visual.innerHTML = html.value;
    visual.style.display = 'block';
    html.style.display = 'none';
    if (toolbar) toolbar.style.display = 'flex';
  });
  editorHtmlBtn.addEventListener('click', () => {
    editorHtmlBtn.classList.add('active');
    editorVisualBtn.classList.remove('active');
    const visual = document.getElementById('newsContentVisual');
    const html = document.getElementById('newsContent');
    const toolbar = document.getElementById('editorToolbar');
    // Sync visual content into HTML editor
    html.value = visual.innerHTML;
    visual.style.display = 'none';
    html.style.display = 'block';
    if (toolbar) toolbar.style.display = 'none';
  });
}

const bioEditorVisualBtn = document.getElementById('bioEditorVisualBtn');
const bioEditorHtmlBtn = document.getElementById('bioEditorHtmlBtn');
if (bioEditorVisualBtn && bioEditorHtmlBtn) {
  bioEditorVisualBtn.addEventListener('click', () => {
    bioEditorVisualBtn.classList.add('active');
    bioEditorHtmlBtn.classList.remove('active');
    const visual = document.getElementById('memberBioVisual');
    const html = document.getElementById('memberBio');
    const toolbar = document.getElementById('bioEditorToolbar');
    visual.innerHTML = html.value;
    visual.style.display = 'block';
    html.style.display = 'none';
    if (toolbar) toolbar.style.display = 'flex';
  });
  bioEditorHtmlBtn.addEventListener('click', () => {
    bioEditorHtmlBtn.classList.add('active');
    bioEditorVisualBtn.classList.remove('active');
    const visual = document.getElementById('memberBioVisual');
    const html = document.getElementById('memberBio');
    const toolbar = document.getElementById('bioEditorToolbar');
    html.value = visual.innerHTML;
    visual.style.display = 'none';
    html.style.display = 'block';
    if (toolbar) toolbar.style.display = 'none';
  });
}

window.execCmdBio = function(cmd, val) {
  const el = document.getElementById('memberBioVisual');
  if (el) { el.focus(); document.execCommand(cmd, false, val || null); }
};
window.insertLinkBio = function() {
  const url = prompt('Enter URL:');
  if (url) {
    document.getElementById('memberBioVisual')?.focus();
    document.execCommand('createLink', false, url);
  }
};

// Click handler for resizing images in the visual editor
document.addEventListener('click', (e) => {
  const visual = document.getElementById('newsContentVisual');
  if (!visual) return;
  // Remove any existing resize controls
  document.querySelectorAll('.img-resize-controls').forEach(el => el.remove());

  if (e.target.tagName === 'IMG' && visual.contains(e.target)) {
    const img = e.target;
    const controls = document.createElement('div');
    controls.className = 'img-resize-controls';
    controls.contentEditable = false;
    controls.style.cssText = 'display:flex;gap:0.4rem;align-items:center;background:#333;padding:4px 8px;border-radius:4px;margin:4px 0;width:fit-content;';
    controls.innerHTML = `
      <span style="color:white;font-size:0.75rem;">Size:</span>
      <button type="button" style="font-size:0.75rem;padding:2px 8px;cursor:pointer;">25%</button>
      <button type="button" style="font-size:0.75rem;padding:2px 8px;cursor:pointer;">50%</button>
      <button type="button" style="font-size:0.75rem;padding:2px 8px;cursor:pointer;">75%</button>
      <button type="button" style="font-size:0.75rem;padding:2px 8px;cursor:pointer;">100%</button>
      <span style="color:white;font-size:0.75rem;margin-left:0.5rem;">Align:</span>
      <button type="button" style="font-size:0.75rem;padding:2px 8px;cursor:pointer;">Left</button>
      <button type="button" style="font-size:0.75rem;padding:2px 8px;cursor:pointer;">Center</button>
      <button type="button" style="font-size:0.75rem;padding:2px 8px;cursor:pointer;">Right</button>
    `;
    const buttons = controls.querySelectorAll('button');
    buttons[0].onclick = () => { img.style.width = '25%'; img.style.height = 'auto'; };
    buttons[1].onclick = () => { img.style.width = '50%'; img.style.height = 'auto'; };
    buttons[2].onclick = () => { img.style.width = '75%'; img.style.height = 'auto'; };
    buttons[3].onclick = () => { img.style.width = '100%'; img.style.height = 'auto'; };
    buttons[4].onclick = () => { img.style.display = 'block'; img.style.margin = '0.5rem auto 0.5rem 0'; img.style.float = 'none'; };
    buttons[5].onclick = () => { img.style.display = 'block'; img.style.margin = '0.5rem auto'; img.style.float = 'none'; };
    buttons[6].onclick = () => { img.style.display = 'block'; img.style.margin = '0.5rem 0 0.5rem auto'; img.style.float = 'none'; };
    img.parentNode.insertBefore(controls, img.nextSibling);
    img.style.border = '2px solid #5D1725';
  } else {
    visual?.querySelectorAll('img').forEach(img => img.style.border = '');
  }
});

window.insertBodyImage = function() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      try {
        const imgId = 'bodyimg_' + Date.now();
        const imgRef = ref(storage, `news/body/${imgId}`);
        await uploadString(imgRef, dataUrl, 'data_url');
        const url = await getDownloadURL(imgRef);
        const visual = document.getElementById('newsContentVisual');
        visual.focus();
        document.execCommand('insertHTML', false, `<img src="${url}" style="max-width:100%;border-radius:6px;margin:0.5rem 0;">`);
      } catch (err) {
        alert('Image upload failed. Please try again.');
        console.error(err);
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
};

window.execCmd = window.execCmd || function(cmd, val) {
  const el = document.getElementById('newsContentVisual');
  if (el) { el.focus(); document.execCommand(cmd, false, val || null); }
};
window.insertLink = window.insertLink || function() {
  const url = prompt('Enter URL:');
  if (url) document.execCommand('createLink', false, url);
};


// ============================================
// SUMMER HOCKEY ADMIN
// ============================================

let summerCurrentSeasonId = null;
let summerTeams = {};
let summerTeamLogoData = null;
let summerCurrentTeamLogoURL = null;
let summerRoster = []; // temp roster while editing team modal

// Logo helpers
function resetSummerLogoPreview() {
  const preview = document.getElementById('summerTeamLogoPreview');
  const removeBtn = document.getElementById('removeSummerTeamLogo');
  if (!preview) return;
  if (summerCurrentTeamLogoURL) {
    preview.innerHTML = `<img src="${summerCurrentTeamLogoURL}" style="width:100%;height:100%;object-fit:contain;">`;
    if (removeBtn) removeBtn.style.display = 'inline-block';
  } else {
    preview.textContent = 'No Logo';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

// Logo file input
const summerTeamLogoInput = document.getElementById('summerTeamLogo');
if (summerTeamLogoInput) {
  summerTeamLogoInput.addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      summerTeamLogoData = e.target.result;
      summerCurrentTeamLogoURL = null;
      const preview = document.getElementById('summerTeamLogoPreview');
      preview.innerHTML = `<img src="${summerTeamLogoData}" style="width:100%;height:100%;object-fit:contain;">`;
      document.getElementById('removeSummerTeamLogo').style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
  });
}

const removeSummerTeamLogoBtn = document.getElementById('removeSummerTeamLogo');
if (removeSummerTeamLogoBtn) {
  removeSummerTeamLogoBtn.addEventListener('click', () => {
    summerTeamLogoData = null;
    summerCurrentTeamLogoURL = null;
    resetSummerLogoPreview();
  });
}

// Roster helpers
function renderSummerRoster() {
  const list = document.getElementById('summerRosterList');
  if (!list) return;
  if (!summerRoster.length) {
    list.innerHTML = '<div style="color:#999;font-size:0.85rem;font-style:italic;">No players added yet</div>';
    return;
  }
  list.innerHTML = summerRoster.map((p, i) => `
    <div draggable="true" data-index="${i}" style="display:flex;align-items:center;gap:0.5rem;padding:5px 8px;background:white;border:1px solid #eee;border-radius:4px;font-size:0.85rem;cursor:grab;user-select:none;">
      <span style="color:#ccc;font-size:1rem;flex-shrink:0;">⋮⋮</span>
      <span style="background:#5D1725;color:white;font-weight:700;font-size:0.75rem;border-radius:3px;padding:2px 6px;min-width:24px;text-align:center;flex-shrink:0;">${p.number || '-'}</span>
      <span style="flex:1;">${p.name}</span>
      <span style="color:#5D1725;font-size:0.75rem;font-weight:600;">${p.position === 'Goalie' ? 'G' : ''}</span>
      <button onclick="editSummerPlayer(${i})" style="background:none;border:1px solid #999;border-radius:3px;color:#555;cursor:pointer;font-size:0.7rem;padding:1px 5px;flex-shrink:0;">Edit</button>
      <button onclick="linkMemberToPlayer(${i})" style="background:none;border:1px solid #999;border-radius:3px;color:${p.memberUid ? '#2e7d32' : '#999'};cursor:pointer;font-size:0.7rem;padding:1px 5px;flex-shrink:0;" title="${p.memberUid ? 'Linked: ' + (p.memberName||p.memberUid) : 'Link to member account'}">${p.memberUid ? '🔗' : 'Link'}</button>
      <button onclick="linkParentsToSummerPlayer(${i})" style="background:none;border:1px solid #999;border-radius:3px;color:${(p.parentUids&&p.parentUids.length) ? '#1565c0' : '#999'};cursor:pointer;font-size:0.7rem;padding:1px 5px;flex-shrink:0;" title="${(p.parentNames&&p.parentNames.length) ? 'Parents: ' + p.parentNames.join(', ') : 'Link parent(s)'}">👪${(p.parentUids&&p.parentUids.length) ? ' ' + p.parentUids.length : ''}</button>
      <button onclick="removeSummerPlayer(${i})" style="background:none;border:none;color:#c62828;cursor:pointer;font-size:1rem;padding:0 4px;flex-shrink:0;">×</button>
    </div>`).join('');

  // Set up drag-to-reorder
  let dragged = null;
  list.querySelectorAll('[draggable]').forEach(row => {
    row.addEventListener('dragstart', () => { dragged = row; row.style.opacity = '0.4'; });
    row.addEventListener('dragend', () => {
      row.style.opacity = '1';
      // Rebuild summerRoster from current DOM order
      const newOrder = [];
      list.querySelectorAll('[draggable]').forEach(r => {
        newOrder.push(summerRoster[parseInt(r.dataset.index)]);
      });
      summerRoster.length = 0;
      newOrder.forEach(p => summerRoster.push(p));
      renderSummerRoster();
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) list.insertBefore(dragged, row);
      else list.insertBefore(dragged, row.nextSibling);
    });
  });
}

window.linkMemberToPlayer = async function(index) {
  // Load all members and show a picker
  const snap = await getDocs(collection(db, 'members'));
  const members = [];
  snap.forEach(d => members.push({ id: d.id, ...d.data() }));
  members.sort((a,b) => (a.displayName||'').localeCompare(b.displayName||''));

  const current = summerRoster[index];
  const options = members.map(m => `<option value="${m.id}" data-name="${m.displayName||m.email}" ${current.memberUid===m.id?'selected':''}>${m.displayName||m.email} (${m.role})</option>`).join('');

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:white;border-radius:8px;padding:1.5rem;max-width:400px;width:90%;">
      <h3 style="margin-bottom:1rem;">Link "${current.name}" to a Member</h3>
      <select id="memberPickerSelect" style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:6px;font-size:0.9rem;margin-bottom:1rem;">
        <option value="">-- No link --</option>
        ${options}
      </select>
      <div style="display:flex;gap:0.5rem;">
        <button id="memberPickerSave" style="background:#5D1725;color:white;border:none;border-radius:6px;padding:0.6rem 1.2rem;cursor:pointer;font-weight:600;">Save</button>
        <button id="memberPickerCancel" style="background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:0.6rem 1.2rem;cursor:pointer;">Cancel</button>
        ${current.memberUid ? '<button id="memberPickerUnlink" style="background:white;color:#c62828;border:1px solid #c62828;border-radius:6px;padding:0.6rem 1.2rem;cursor:pointer;margin-left:auto;">Unlink</button>' : ''}
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector('#memberPickerCancel').onclick = () => modal.remove();
  modal.querySelector('#memberPickerSave').onclick = () => {
    const sel = modal.querySelector('#memberPickerSelect');
    const uid = sel.value;
    const name = uid ? sel.options[sel.selectedIndex].dataset.name : '';
    summerRoster[index].memberUid = uid || null;
    summerRoster[index].memberName = name || null;
    modal.remove();
    renderSummerRoster();
  };
  const unlinkBtn = modal.querySelector('#memberPickerUnlink');
  if (unlinkBtn) unlinkBtn.onclick = () => {
    summerRoster[index].memberUid = null;
    summerRoster[index].memberName = null;
    modal.remove();
    renderSummerRoster();
  };
};

window.linkParentsToSummerPlayer = async function(index) {
  const snap = await getDocs(collection(db, 'members'));
  const members = [];
  snap.forEach(d => {
    const m = { id: d.id, ...d.data() };
    const isPlayer = m.role === 'player' || (Array.isArray(m.roles) && m.roles.includes('player'));
    if (!isPlayer) members.push(m);
  });
  members.sort((a,b) => {
    const aIsParent = a.role === 'parent' || (Array.isArray(a.roles) && a.roles.includes('parent'));
    const bIsParent = b.role === 'parent' || (Array.isArray(b.roles) && b.roles.includes('parent'));
    if (aIsParent !== bIsParent) return aIsParent ? -1 : 1;
    return (a.displayName||'').localeCompare(b.displayName||'');
  });

  const current = summerRoster[index];
  const currentSet = new Set(Array.isArray(current.parentUids) ? current.parentUids : []);

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  const checkboxesHtml = members.map(m => `
    <label style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid #f5f5f5;font-size:0.88rem;">
      <input type="checkbox" class="summerParentCb" value="${m.id}" data-name="${(m.displayName||m.email||'').replace(/"/g,'&quot;')}" ${currentSet.has(m.id) ? 'checked' : ''}>
      ${m.displayName || m.email} <span style="color:#999;font-size:0.75rem;">(${m.role || 'member'})</span>
    </label>`).join('');

  modal.innerHTML = `<div style="background:white;border-radius:8px;padding:1.5rem;max-width:420px;width:90%;max-height:80vh;display:flex;flex-direction:column;">
    <h3 style="margin-bottom:0.5rem;">Link Parent(s) to "${current.name}"</h3>
    <p style="font-size:0.8rem;color:#666;margin-bottom:0.75rem;">Select all member accounts that should be able to see this player's schedule and RSVP for them.</p>
    <div style="overflow-y:auto;flex:1;margin-bottom:1rem;border:1px solid #eee;border-radius:6px;padding:0 0.75rem;">${checkboxesHtml}</div>
    <div style="display:flex;gap:0.5rem;">
      <button id="spSave" style="background:#5D1725;color:white;border:none;border-radius:6px;padding:0.6rem 1.2rem;cursor:pointer;font-weight:600;">Save</button>
      <button id="spCancel" style="background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:0.6rem 1.2rem;cursor:pointer;">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#spCancel').onclick = () => modal.remove();
  modal.querySelector('#spSave').onclick = () => {
    const checked = Array.from(modal.querySelectorAll('.summerParentCb:checked'));
    summerRoster[index].parentUids = checked.map(cb => cb.value);
    summerRoster[index].parentNames = checked.map(cb => cb.dataset.name);
    modal.remove();
    renderSummerRoster();
  };
};

window.removeSummerPlayer = function(index) {
  summerRoster.splice(index, 1);
  renderSummerRoster();
};

window.editSummerPlayer = function(index) {
  const p = summerRoster[index];
  const existing = document.getElementById('editPlayerModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'editPlayerModal';
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-header">
        <h2>Edit Player</h2>
        <button class="modal-close" onclick="document.getElementById('editPlayerModal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-label-group" style="width:80px;">
            <label class="field-label">Number</label>
            <input type="text" id="editPlayerNumber" value="${p.number || ''}" inputmode="numeric" style="text-align:center;">
          </div>
          <div class="form-label-group" style="flex:1;">
            <label class="field-label">Name</label>
            <input type="text" id="editPlayerName" value="${p.name || ''}">
          </div>
        </div>
        <div class="form-label-group">
          <label class="field-label">Position</label>
          <select id="editPlayerPosition">
            <option value="Skater" ${p.position!=='Goalie'?'selected':''}>Skater</option>
            <option value="Goalie" ${p.position==='Goalie'?'selected':''}>Goalie</option>
          </select>
        </div>
        <div class="form-buttons">
          <button id="saveEditPlayerBtn" class="btn-primary">Save</button>
          <button onclick="document.getElementById('editPlayerModal').remove()" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('saveEditPlayerBtn').addEventListener('click', () => {
    summerRoster[index] = {
      ...p,
      number: document.getElementById('editPlayerNumber').value.trim(),
      name: document.getElementById('editPlayerName').value.trim(),
      position: document.getElementById('editPlayerPosition').value
    };
    modal.remove();
    renderSummerRoster();
  });
};

// Bulk roster table
function addBulkRow(name='', pos='Skater', number='') {
  const tbody = document.getElementById('bulkRosterBody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="border:1px solid #ddd;padding:2px;width:60px;">
      <input type="text" placeholder="#" value="${number}" inputmode="numeric"
        style="width:100%;border:none;padding:3px 4px;font-size:0.85rem;text-align:center;">
    </td>
    <td style="border:1px solid #ddd;padding:2px;">
      <input type="text" placeholder="First Last" value="${name}"
        style="width:100%;border:none;padding:3px 4px;font-size:0.85rem;">
    </td>
    <td style="border:1px solid #ddd;padding:2px;">
      <select style="border:none;padding:3px 4px;font-size:0.85rem;width:100%;">
        <option value="Skater" ${pos==='Skater'?'selected':''}>Skater</option>
        <option value="Goalie" ${pos==='Goalie'?'selected':''}>Goalie</option>
      </select>
    </td>
    <td style="border:1px solid #ddd;padding:2px;text-align:center;">
      <button type="button" onclick="this.closest('tr').remove()"
        style="background:none;border:none;color:#c62828;cursor:pointer;font-size:1rem;padding:0 4px;">×</button>
    </td>`;
  tbody.appendChild(tr);
  tr.querySelector('input[placeholder="#"]').focus();
}

function initBulkTable() {
  const tbody = document.getElementById('bulkRosterBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  // Start with 5 empty rows
  for (let i = 0; i < 5; i++) addBulkRow();
}

const addBulkRowBtn = document.getElementById('addBulkRowBtn');
if (addBulkRowBtn) {
  addBulkRowBtn.addEventListener('click', () => addBulkRow());
}

const addAllPlayersBtn = document.getElementById('addAllPlayersBtn');
if (addAllPlayersBtn) {
  addAllPlayersBtn.addEventListener('click', () => {
    const rows = document.querySelectorAll('#bulkRosterBody tr');
    let added = 0;
    rows.forEach(row => {
      const inputs = row.querySelectorAll('input');
      const select = row.querySelector('select');
      const number = inputs[0]?.value.trim() || '';
      const name = inputs[1]?.value.trim();
      if (!name) return;
      const pos = select?.value || 'Skater';
      if (!summerRoster.find(p => p.name === name)) {
        summerRoster.push({ name, position: pos, number });
        added++;
      }
    });
    renderSummerRoster();
    // Clear the bulk table rows
    initBulkTable();
    if (added > 0) {
      const btn = document.getElementById('addAllPlayersBtn');
      const orig = btn.textContent;
      btn.textContent = `✅ Added ${added} player${added>1?'s':''}`;
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  });
}

// Season management
async function loadSummerSeasons() {
  const snap = await getDocs(collection(db, 'summer'));
  const seasons = [];
  snap.forEach(d => seasons.push({ id: d.id, ...d.data() }));
  seasons.sort((a, b) => b.id.localeCompare(a.id));

  const select = document.getElementById('summerAdminSeasonSelect');
  if (!select) return;

  if (!seasons.length) {
    select.innerHTML = '<option value="">No seasons yet</option>';
    return;
  }

  select.innerHTML = seasons.map(s =>
    `<option value="${s.id}">${s.label || s.id}${s.hidden ? ' (Hidden)' : ''}</option>`
  ).join('');

  summerCurrentSeasonId = seasons[0].id;
  await loadSummerTeams();
  await loadSummerGames();

  // Add hide/delete buttons next to select if not already there
  const existingBtns = document.getElementById('summerSeasonActions');
  if (!existingBtns) {
    const btnWrap = document.createElement('div');
    btnWrap.id = 'summerSeasonActions';
    btnWrap.style.cssText = 'display:flex;gap:0.5rem;margin-top:0.5rem;';
    btnWrap.innerHTML = `
      <button id="toggleSummerSeasonBtn" class="btn-secondary" style="font-size:0.8rem;" onclick="toggleSummerSeasonVisibility()">Hide Season</button>
      <button class="btn-delete" style="font-size:0.8rem;" onclick="deleteSummerSeason()">Delete Season</button>`;
    select.parentNode.insertBefore(btnWrap, select.nextSibling);
  }
  updateSummerSeasonButtons(seasons);

  select.addEventListener('change', async e => {
    summerCurrentSeasonId = e.target.value;
    updateSummerSeasonButtons(seasons);
    await loadSummerTeams();
    await loadSummerGames();
  });
}

function updateSummerSeasonButtons(seasons) {
  const btn = document.getElementById('toggleSummerSeasonBtn');
  if (!btn) return;
  const season = seasons.find(s => s.id === summerCurrentSeasonId);
  btn.textContent = season?.hidden ? 'Show Season on Website' : 'Hide Season from Website';
}

window.toggleSummerSeasonVisibility = async function() {
  const snap = await getDoc(doc(db, 'summer', summerCurrentSeasonId));
  if (!snap.exists()) return;
  const hidden = !snap.data().hidden;
  await setDoc(doc(db, 'summer', summerCurrentSeasonId), { hidden }, { merge: true });
  loadSummerSeasons();
};

window.deleteSummerSeason = async function() {
  if (!confirm('Delete this summer season? This will NOT delete teams or games — just the season entry.')) return;
  await deleteDoc(doc(db, 'summer', summerCurrentSeasonId));
  loadSummerSeasons();
};

// Add Season
const addSummerSeasonBtn = document.getElementById('addSummerSeasonBtn');
if (addSummerSeasonBtn) {
  addSummerSeasonBtn.addEventListener('click', () => {
    document.getElementById('summerSeasonYear').value = '';
    document.getElementById('summerSeasonLabel').value = '';
    document.getElementById('summerSeasonModal').classList.add('active');
  });
}

const closeSummerSeasonModal = document.getElementById('closeSummerSeasonModal');
if (closeSummerSeasonModal) closeSummerSeasonModal.addEventListener('click', () => document.getElementById('summerSeasonModal').classList.remove('active'));

const cancelSummerSeasonBtn = document.getElementById('cancelSummerSeasonBtn');
if (cancelSummerSeasonBtn) cancelSummerSeasonBtn.addEventListener('click', () => document.getElementById('summerSeasonModal').classList.remove('active'));

const saveSummerSeasonBtn = document.getElementById('saveSummerSeasonBtn');
if (saveSummerSeasonBtn) {
  saveSummerSeasonBtn.addEventListener('click', async () => {
    const year = document.getElementById('summerSeasonYear').value.trim();
    const label = document.getElementById('summerSeasonLabel').value.trim() || `Summer ${year}`;
    if (!year) return;
    await setDoc(doc(db, 'summer', year), { id: year, label });
    document.getElementById('summerSeasonModal').classList.remove('active');
    await loadSummerSeasons();
  });
}

// Teams
async function loadSummerTeams() {
  if (!summerCurrentSeasonId) return;
  const snap = await getDocs(collection(db, 'summer', summerCurrentSeasonId, 'teams'));
  summerTeams = {};
  snap.forEach(d => { summerTeams[d.id] = { id: d.id, ...d.data() }; });
  renderSummerTeams();
}

function renderSummerTeams() {
  const list = document.getElementById('summerTeamsList');
  if (!list) return;
  const teams = Object.values(summerTeams);
  if (!teams.length) { list.innerHTML = '<div class="empty-state">No teams yet</div>'; return; }
  list.innerHTML = teams.map(t => `
    <div class="item">
      <div class="item-info">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          ${t.logoURL
            ? `<img src="${t.logoURL}" style="width:28px;height:28px;object-fit:contain;border-radius:3px;flex-shrink:0;">`
            : `<span style="width:16px;height:16px;border-radius:50%;background:${t.color || '#999'};display:inline-block;flex-shrink:0;"></span>`}
          <strong>${t.name}</strong>
          <span>${t.abbreviation || ''}</span>
          <span style="color:#999;font-size:0.8rem;">${Array.isArray(t.roster) ? t.roster.length + ' players' : ''}</span>
        </div>
      </div>
      <div>
        <button class="btn-edit" onclick="editSummerTeam('${t.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteSummerTeam('${t.id}')">Delete</button>
      </div>
    </div>`).join('');
}

const addSummerTeamBtn = document.getElementById('addSummerTeamBtn');
if (addSummerTeamBtn) {
  addSummerTeamBtn.addEventListener('click', () => {
    document.getElementById('summerTeamId').value = '';
    document.getElementById('summerTeamName').value = '';
    document.getElementById('summerTeamAbbr').value = '';
    document.getElementById('summerTeamColor').value = '#c00000';
    document.getElementById('summerTeamModalTitle').textContent = 'Add Team';
    summerTeamLogoData = null;
    summerCurrentTeamLogoURL = null;
    summerRoster = [];
    resetSummerLogoPreview();
    renderSummerRoster();
    initBulkTable();
    document.getElementById('summerTeamModal').classList.add('active');
  });
}

const closeSummerTeamModal = document.getElementById('closeSummerTeamModal');
if (closeSummerTeamModal) closeSummerTeamModal.addEventListener('click', () => document.getElementById('summerTeamModal').classList.remove('active'));
const cancelSummerTeamBtn = document.getElementById('cancelSummerTeamBtn');
if (cancelSummerTeamBtn) cancelSummerTeamBtn.addEventListener('click', () => document.getElementById('summerTeamModal').classList.remove('active'));

const saveSummerTeamBtn = document.getElementById('saveSummerTeamBtn');
if (saveSummerTeamBtn) {
  saveSummerTeamBtn.addEventListener('click', async () => {
    const id = document.getElementById('summerTeamId').value || Date.now().toString();
    const name = document.getElementById('summerTeamName').value.trim();
    if (!name || !summerCurrentSeasonId) return;
    let logoURL = summerCurrentTeamLogoURL || '';
    if (summerTeamLogoData) {
      try {
        const logoRef = ref(storage, `summer/teams/${id}`);
        await uploadString(logoRef, summerTeamLogoData, 'data_url');
        logoURL = await getDownloadURL(logoRef);
      } catch(e) { console.error(e); }
    }
    await setDoc(doc(db, 'summer', summerCurrentSeasonId, 'teams', id), {
      id,
      name,
      abbreviation: document.getElementById('summerTeamAbbr').value.trim().toUpperCase(),
      color: document.getElementById('summerTeamColor').value,
      logoURL,
      roster: summerRoster
    });
    document.getElementById('summerTeamModal').classList.remove('active');
    await loadSummerTeams();
  });
}

window.editSummerTeam = function(id) {
  const t = summerTeams[id];
  if (!t) return;
  document.getElementById('summerTeamId').value = t.id;
  document.getElementById('summerTeamName').value = t.name;
  document.getElementById('summerTeamAbbr').value = t.abbreviation || '';
  document.getElementById('summerTeamColor').value = t.color || '#c00000';
  document.getElementById('summerTeamModalTitle').textContent = 'Edit Team';
  summerTeamLogoData = null;
  summerCurrentTeamLogoURL = t.logoURL || null;
  summerRoster = Array.isArray(t.roster) ? [...t.roster] : [];
  resetSummerLogoPreview();
  renderSummerRoster();
  initBulkTable();
  document.getElementById('summerTeamModal').classList.add('active');
};

window.deleteSummerTeam = async function(id) {
  if (!confirm('Delete this team?')) return;
  await deleteDoc(doc(db, 'summer', summerCurrentSeasonId, 'teams', id));
  await loadSummerTeams();
};

// Games
async function loadSummerGames() {
  if (!summerCurrentSeasonId) return;
  const snap = await getDocs(collection(db, 'summer', summerCurrentSeasonId, 'games'));
  const games = [];
  snap.forEach(d => games.push({ id: d.id, ...d.data() }));
  games.sort((a, b) => a.date.localeCompare(b.date));

  const list = document.getElementById('summerGamesList');
  if (!list) return;
  if (!games.length) { list.innerHTML = '<div class="empty-state">No games yet</div>'; return; }

  list.innerHTML = games.map(g => {
    const home = summerTeams[g.homeTeamId];
    const away = summerTeams[g.awayTeamId];
    const homeName = home?.name || g.homeTeamId || '?';
    const awayName = away?.name || g.awayTeamId || '?';
    const score = g.played ? ` — ${g.homeScore}-${g.awayScore}` : '';
    const d = new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' });
    return `
      <div class="item">
        <div class="item-info"><div>
          <strong>${homeName} vs ${awayName}${score}</strong>
          <span>${d}${g.time ? ' · ' + g.time : ''}${g.played ? ' · FINAL' : ' · Upcoming'}</span>
        </div></div>
        <div>
          <button class="btn-edit" onclick="viewGameRsvp('${g.id}','${summerCurrentSeasonId}')">📋 RSVP</button>
          <button class="btn-edit" onclick="editSummerGame('${g.id}')">Edit</button>
          <button class="btn-delete" onclick="deleteSummerGame('${g.id}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}

const addSummerGameBtn = document.getElementById('addSummerGameBtn');
if (addSummerGameBtn) {
  addSummerGameBtn.addEventListener('click', () => openSummerGameModal());
}

function openSummerGameModal(game = null) {
  document.getElementById('summerGameId').value = game?.id || '';
  document.getElementById('summerGameDate').value = game?.date || '';
  document.getElementById('summerGameTime').value = game?.time || '';
  document.getElementById('summerGamePlayed').checked = game?.played || false;
  document.getElementById('summerHomeScore').value = game?.homeScore ?? '';
  document.getElementById('summerAwayScore').value = game?.awayScore ?? '';
  if (document.getElementById('summerGameOT')) document.getElementById('summerGameOT').checked = game?.ot || false;
  if (document.getElementById('summerGameSO')) document.getElementById('summerGameSO').checked = game?.so || false;
  document.getElementById('summerScoreFields').style.display = game?.played ? 'block' : 'none';
  document.getElementById('summerGameStatus').textContent = '';
  document.getElementById('summerGameModalTitle').textContent = game ? 'Edit Game' : 'Add Game';

  // Populate team dropdowns
  const teams = Object.values(summerTeams);
  const homeSelect = document.getElementById('summerGameHomeTeam');
  const awaySelect = document.getElementById('summerGameAwayTeam');
  const opts = teams.map(t => `<option value="${t.id}" ${game?.homeTeamId === t.id ? 'selected' : ''}>${t.name}</option>`).join('');
  const awayOpts = teams.map(t => `<option value="${t.id}" ${game?.awayTeamId === t.id ? 'selected' : ''}>${t.name}</option>`).join('');
  homeSelect.innerHTML = opts;
  awaySelect.innerHTML = awayOpts;

  // Update score label with team names
  function updateLabels() {
    const ht = summerTeams[homeSelect.value];
    const at = summerTeams[awaySelect.value];
    document.getElementById('homeScoreLabel').textContent = (ht?.name || 'Home') + ' Score';
    document.getElementById('awayScoreLabel').textContent = (at?.name || 'Away') + ' Score';
  }
  homeSelect.addEventListener('change', updateLabels);
  awaySelect.addEventListener('change', updateLabels);
  updateLabels();

  document.getElementById('summerGameModal').classList.add('active');
}

const summerPlayedChk = document.getElementById('summerGamePlayed');
if (summerPlayedChk) {
  summerPlayedChk.addEventListener('change', function() {
    document.getElementById('summerScoreFields').style.display = this.checked ? 'block' : 'none';
  });
}

const closeSummerGameModal = document.getElementById('closeSummerGameModal');
if (closeSummerGameModal) closeSummerGameModal.addEventListener('click', () => document.getElementById('summerGameModal').classList.remove('active'));
const cancelSummerGameBtn = document.getElementById('cancelSummerGameBtn');
if (cancelSummerGameBtn) cancelSummerGameBtn.addEventListener('click', () => document.getElementById('summerGameModal').classList.remove('active'));

const saveSummerGameBtn = document.getElementById('saveSummerGameBtn');
if (saveSummerGameBtn) {
  saveSummerGameBtn.addEventListener('click', async () => {
    const status = document.getElementById('summerGameStatus');
    status.textContent = 'Saving...';
    const id = document.getElementById('summerGameId').value || Date.now().toString();
    const played = document.getElementById('summerGamePlayed').checked;
    await setDoc(doc(db, 'summer', summerCurrentSeasonId, 'games', id), {
      id,
      date: document.getElementById('summerGameDate').value,
      time: document.getElementById('summerGameTime').value,
      homeTeamId: document.getElementById('summerGameHomeTeam').value,
      awayTeamId: document.getElementById('summerGameAwayTeam').value,
      played,
      homeScore: played ? parseInt(document.getElementById('summerHomeScore').value) || 0 : null,
      awayScore: played ? parseInt(document.getElementById('summerAwayScore').value) || 0 : null,
      ot: played ? (document.getElementById('summerGameOT')?.checked || false) : false,
      so: played ? (document.getElementById('summerGameSO')?.checked || false) : false,
    });
    status.textContent = '✅ Saved!';
    status.style.color = 'green';
    setTimeout(async () => {
      document.getElementById('summerGameModal').classList.remove('active');
      await loadSummerGames();
    }, 600);
  });
}

window.viewGameRsvp = async function(gameId, seasonId) {
  const modal = document.getElementById('summerRsvpModal');
  const content = document.getElementById('summerRsvpContent');
  const titleEl = document.getElementById('summerRsvpModalTitle');
  content.innerHTML = '<p style="color:#999;">Loading...</p>';
  modal.classList.add('active');

  const gameSnap = await getDoc(doc(db, 'summer', seasonId, 'games', gameId));
  const game = gameSnap.exists() ? gameSnap.data() : {};
  const home = summerTeams[game.homeTeamId];
  const away = summerTeams[game.awayTeamId];
  const d = game.date ? new Date(game.date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) : '';
  titleEl.textContent = `${home?.name || '?'} vs ${away?.name || '?'} — ${d}${game.time ? ' · ' + game.time : ''}`;

  const rsvpSnap = await getDocs(collection(db, 'summer', seasonId, 'games', gameId, 'rsvps'));
  const rsvps = {};
  rsvpSnap.forEach(d => { rsvps[d.id] = d.data().response; });

  function renderTeamRsvp(team) {
    if (!team) return '<p style="color:#999;font-style:italic;">Team not found</p>';
    const roster = Array.isArray(team.roster) ? team.roster : [];
    if (!roster.length) return '<p style="color:#999;font-style:italic;">No players on roster</p>';
    const players = [...roster].sort((a, b) => parseInt(a.number) - parseInt(b.number));
    const inPlayers = players.filter(p => p.memberUid && rsvps[p.memberUid] === 'yes');
    const outPlayers = players.filter(p => p.memberUid && rsvps[p.memberUid] === 'no');
    const pendingPlayers = players.filter(p => !p.memberUid || !rsvps[p.memberUid]);
    const rsvpKey = (p) => p.memberUid || 'manual_' + p.name.replace(/[^a-zA-Z0-9]/g, '_');
    function playerRow(p, status) {
      const key = rsvpKey(p);
      const inActive = status === 'yes';
      const outActive = status === 'no';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:0.88rem;">
        <span>${p.number ? `<strong>#${p.number}</strong> ` : ''}${p.name}${!p.memberUid ? ' <span style="color:#aaa;font-size:0.75rem;">(unlinked)</span>' : ''}</span>
        <div style="display:flex;gap:0.3rem;">
          <button onclick="adminSetRsvp('${gameId}','${seasonId}','${key}','${p.name}','yes',${inActive})"
            style="border-radius:4px;padding:2px 8px;font-size:0.75rem;font-weight:600;cursor:pointer;border:1.5px solid #2e7d32;background:${inActive?'#2e7d32':'white'};color:${inActive?'white':'#2e7d32'};">✅ In</button>
          <button onclick="adminSetRsvp('${gameId}','${seasonId}','${key}','${p.name}','no',${outActive})"
            style="border-radius:4px;padding:2px 8px;font-size:0.75rem;font-weight:600;cursor:pointer;border:1.5px solid #c62828;background:${outActive?'#c62828':'white'};color:${outActive?'white':'#c62828'};">❌ Out</button>
        </div>
      </div>`;
    }
    return `
      <div style="margin-bottom:0.5rem;display:flex;gap:1rem;font-size:0.82rem;font-weight:600;">
        <span style="color:#2e7d32;">✅ In: ${inPlayers.length}</span>
        <span style="color:#c62828;">❌ Out: ${outPlayers.length}</span>
        <span style="color:#888;">⏳ No RSVP: ${pendingPlayers.length}</span>
      </div>
      ${[...inPlayers, ...outPlayers, ...pendingPlayers].map(p => playerRow(p, rsvps[p.memberUid])).join('')}`;
  }

  content.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">
      <div>
        <div style="font-weight:700;font-size:1rem;margin-bottom:0.75rem;padding-bottom:0.5rem;border-bottom:2px solid ${home?.color||'#5D1725'};color:${home?.color||'#5D1725'};">${home?.name || 'Home Team'}</div>
        ${renderTeamRsvp(home)}
      </div>
      <div>
        <div style="font-weight:700;font-size:1rem;margin-bottom:0.75rem;padding-bottom:0.5rem;border-bottom:2px solid ${away?.color||'#5D1725'};color:${away?.color||'#5D1725'};">${away?.name || 'Away Team'}</div>
        ${renderTeamRsvp(away)}
      </div>
    </div>`;
};

window.adminSetRsvp = async function(gameId, seasonId, key, name, response, isActive) {
  const rsvpRef = doc(db, 'summer', seasonId, 'games', gameId, 'rsvps', key);
  if (isActive) {
    await deleteDoc(rsvpRef);
  } else {
    await setDoc(rsvpRef, { response, name, adminSet: true, timestamp: new Date().toISOString() });
  }
  // Refresh modal
  await window.viewGameRsvp(gameId, seasonId);
};

// Close RSVP modal
const closeSummerRsvpModalBtn = document.getElementById('closeSummerRsvpModal');
if (closeSummerRsvpModalBtn) closeSummerRsvpModalBtn.addEventListener('click', () => document.getElementById('summerRsvpModal').classList.remove('active'));

window.editSummerGame = async function(id) {
  const snap = await getDoc(doc(db, 'summer', summerCurrentSeasonId, 'games', id));
  if (snap.exists()) openSummerGameModal(snap.data());
};

window.deleteSummerGame = async function(id) {
  if (!confirm('Delete this game?')) return;
  await deleteDoc(doc(db, 'summer', summerCurrentSeasonId, 'games', id));
  await loadSummerGames();
};

// Load on init
loadSummerSeasons();


// Quick Schedule Generator
const quickScheduleBtn = document.getElementById('quickScheduleBtn');
if (quickScheduleBtn) {
  quickScheduleBtn.addEventListener('click', () => {
    document.getElementById('quickSchedulePanel').style.display = 'block';
    document.getElementById('quickScheduleStatus').textContent = '';
  });
}

const cancelQuickScheduleBtn = document.getElementById('cancelQuickScheduleBtn');
if (cancelQuickScheduleBtn) {
  cancelQuickScheduleBtn.addEventListener('click', () => {
    document.getElementById('quickSchedulePanel').style.display = 'none';
  });
}

const generateScheduleBtn = document.getElementById('generateScheduleBtn');
if (generateScheduleBtn) {
  generateScheduleBtn.addEventListener('click', async () => {
    const startDateStr = document.getElementById('quickScheduleStart').value;
    const count = parseInt(document.getElementById('quickScheduleCount').value) || 10;
    const firstTime = document.getElementById('quickScheduleFirstTime').value;
    const status = document.getElementById('quickScheduleStatus');

    if (!startDateStr) { status.textContent = 'Please pick a start date.'; status.style.color = 'red'; return; }
    if (!summerCurrentSeasonId) { status.textContent = 'No season selected.'; status.style.color = 'red'; return; }

    const times = firstTime === '18:30' ? ['18:30', '20:00'] : ['20:00', '18:30'];
    const startDate = new Date(startDateStr + 'T12:00:00');

    // Make sure it's a Tuesday (day 2)
    const day = startDate.getDay();
    if (day !== 2) {
      status.textContent = 'Start date must be a Tuesday.';
      status.style.color = 'red';
      return;
    }

    status.textContent = 'Generating...';
    status.style.color = '#555';

    for (let i = 0; i < count; i++) {
      const gameDate = new Date(startDate);
      gameDate.setDate(startDate.getDate() + (i * 7));
      const dateStr = gameDate.toISOString().split('T')[0];
      const time = times[i % 2];
      const id = Date.now().toString() + i;
      await setDoc(doc(db, 'summer', summerCurrentSeasonId, 'games', id), {
        id,
        date: dateStr,
        time,
        homeTeamId: '',
        awayTeamId: '',
        played: false,
        homeScore: null,
        awayScore: null
      });
      // Small delay to avoid timestamp collision
      await new Promise(r => setTimeout(r, 50));
    }

    status.textContent = `✅ ${count} games generated! Now edit each to assign teams.`;
    status.style.color = 'green';
    document.getElementById('quickSchedulePanel').style.display = 'none';
    await loadSummerGames();
  });
}


// ============================================
// PAGE VISIBILITY
// ============================================
const pagesList = SITE_PAGES.filter(p => p.id !== 'home').map(p => ({ id: p.id, label: p.label, path: p.path }));

let pageVisibility = {};

async function loadPageVisibility() {
  const snap = await getDoc(doc(db, 'settings', 'pages'));
  pageVisibility = snap.exists() ? snap.data() : {};
  const list = document.getElementById('pagesToggleList');
  if (!list) return;
  list.innerHTML = pagesList.map(p => {
    const isOn = pageVisibility[p.id] !== false;
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;background:white;border:1px solid #e0e0e0;border-radius:6px;padding:0.85rem 1.25rem;">
        <div>
          <div style="font-weight:600;color:#111;">${p.label}</div>
          <div style="font-size:0.8rem;color:#999;">${p.path}</div>
        </div>
        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
          <span style="font-size:0.85rem;color:${isOn ? '#2e7d32' : '#c62828'};font-weight:600;" id="pageLabel_${p.id}">${isOn ? 'Visible' : 'Hidden'}</span>
          <div style="position:relative;width:44px;height:24px;cursor:pointer;" id="pageTrack_${p.id}" data-page="${p.id}">
            <div style="position:absolute;top:0;left:0;right:0;bottom:0;border-radius:12px;background:${isOn ? '#2e7d32' : '#ccc'};transition:background 0.2s;"></div>
            <div style="position:absolute;top:2px;left:${isOn ? '22px' : '2px'};width:20px;height:20px;border-radius:50%;background:white;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3);" id="pageThumb_${p.id}"></div>
          </div>
        </label>
      </div>`;
  }).join('');

  // Attach click listeners after rendering
  pagesList.forEach(p => {
    const track = document.getElementById('pageTrack_' + p.id);
    if (!track) return;
    track.addEventListener('click', () => {
      const currentlyOn = pageVisibility[p.id] !== false;
      window.updatePageToggle(p.id, !currentlyOn);
    });
  });
}

window.updatePageToggle = function(id, isOn) {
  pageVisibility[id] = isOn;
  const label = document.getElementById('pageLabel_' + id);
  const track = document.getElementById('pageTrack_' + id);
  const thumb = document.getElementById('pageThumb_' + id);
  if (label) {
    label.textContent = isOn ? 'Visible' : 'Hidden';
    label.style.color = isOn ? '#2e7d32' : '#c62828';
  }
  if (track) {
    // Update the background div (first child)
    const bg = track.querySelector('div');
    if (bg) bg.style.background = isOn ? '#2e7d32' : '#ccc';
  }
  if (thumb) thumb.style.left = isOn ? '22px' : '2px';
};

const savePageVisibilityBtn = document.getElementById('savePageVisibilityBtn');
if (savePageVisibilityBtn) {
  savePageVisibilityBtn.addEventListener('click', async () => {
    const status = document.getElementById('pagesSaveStatus');
    status.textContent = 'Saving...';
    await setDoc(doc(db, 'settings', 'pages'), pageVisibility);
    status.textContent = '✅ Saved!';
    status.style.color = 'green';
    setTimeout(() => { status.textContent = ''; }, 3000);
  });
}

loadPageVisibility();



// ============================================
// MEMBERS ADMIN TAB
// ============================================

// Builds a map of memberUid -> { asPlayer: [...], asParent: [...] } by scanning
// current-season rosters (Varsity, JV, Summer), so admins can see at a glance
// exactly who each account is linked to, to help catch mis-linked accounts.
async function buildRosterLinkMap() {
  const linkMap = {};
  function addPlayerLink(uid, label) {
    if (!uid) return;
    if (!linkMap[uid]) linkMap[uid] = { asPlayer: [], asParent: [] };
    linkMap[uid].asPlayer.push(label);
  }
  function addParentLink(uids, childName, teamLabel) {
    (uids || []).forEach(uid => {
      if (!uid) return;
      if (!linkMap[uid]) linkMap[uid] = { asPlayer: [], asParent: [] };
      linkMap[uid].asParent.push(childName + ' (' + teamLabel + ')');
    });
  }

  try {
    const seasonsSnap = await getDocs(collection(db, 'seasons'));
    const currentSeasons = seasonsSnap.docs.filter(d => d.data().current);

    await Promise.all(currentSeasons.map(async seasonDoc => {
      const seasonId = seasonDoc.id;
      const sd = seasonDoc.data();

      // Varsity: players, coaches, board
      const [vPlayers, vCoaches, vBoard] = await Promise.all([
        getDocs(collection(db, 'roster', seasonId, 'players')),
        getDocs(collection(db, 'roster', seasonId, 'coaches')),
        getDocs(collection(db, 'roster', seasonId, 'board')),
      ]);
      vPlayers.forEach(d => {
        const p = d.data();
        addPlayerLink(p.memberUid, 'Varsity Player: ' + (p.name || 'Unknown'));
        addParentLink(p.parentUids, p.name || 'Unknown', 'Varsity');
      });
      vCoaches.forEach(d => {
        const c = d.data();
        addPlayerLink(c.memberUid, 'Varsity Coach: ' + (c.name || 'Unknown'));
      });
      vBoard.forEach(d => {
        const b = d.data();
        addPlayerLink(b.memberUid, 'Board: ' + (b.name || 'Unknown'));
      });

      // JV: players, coaches (only if JV enabled for this season)
      if (sd.jvEnabled) {
        const [jPlayers, jCoaches] = await Promise.all([
          getDocs(collection(db, 'jv-roster', seasonId, 'players')),
          getDocs(collection(db, 'jv-roster', seasonId, 'coaches')),
        ]);
        jPlayers.forEach(d => {
          const p = d.data();
          addPlayerLink(p.memberUid, 'JV Player: ' + (p.name || 'Unknown'));
          addParentLink(p.parentUids, p.name || 'Unknown', 'JV');
        });
        jCoaches.forEach(d => {
          const c = d.data();
          addPlayerLink(c.memberUid, 'JV Coach: ' + (c.name || 'Unknown'));
        });
      }
    }));

    // Summer Hockey: roster is an array embedded in each team doc, across non-hidden seasons
    const summerSeasonsSnap = await getDocs(collection(db, 'summer'));
    const relevantSummerSeasons = summerSeasonsSnap.docs.filter(d => !d.data().hidden);
    await Promise.all(relevantSummerSeasons.map(async seasonDoc => {
      const teamsSnap = await getDocs(collection(db, 'summer', seasonDoc.id, 'teams'));
      teamsSnap.forEach(teamDoc => {
        const team = teamDoc.data();
        const roster = Array.isArray(team.roster) ? team.roster : [];
        roster.forEach(p => {
          addPlayerLink(p.memberUid, 'Summer (' + (team.name || 'Team') + '): ' + (p.name || 'Unknown'));
          addParentLink(p.parentUids, p.name || 'Unknown', 'Summer · ' + (team.name || 'Team'));
        });
      });
    }));
  } catch (err) {
    console.error('buildRosterLinkMap error:', err);
  }

  return linkMap;
}

async function loadMembersTab() {
  const list = document.getElementById('membersList');
  if (!list) return;
  list.innerHTML = '<div class="empty-state">Loading...</div>';

  try {

  const rosterLinkMap = await buildRosterLinkMap();
  const snap = await getDocs(collection(db, 'members'));
  const members = [];
  snap.forEach(d => members.push({ id: d.id, ...d.data() }));
  members.sort((a, b) => (a.displayName||'').localeCompare(b.displayName||''));

  document.getElementById('membersCount').textContent = `${members.length} user${members.length !== 1 ? 's' : ''}`;

  if (!members.length) { list.innerHTML = '<div class="empty-state">No users yet</div>'; return; }

  const roleColors = { player:'#2e7d32', prospect:'#0277bd', alumni:'#e65100', coach:'#5D1725', rep:'#1565c0', parent:'#8e24aa', member:'#666' };
  const roleOrder = { coach:0, player:1, prospect:2, alumni:3, rep:4, parent:5, member:6 };
  members.sort((a,b) => (roleOrder[a.role]||99) - (roleOrder[b.role]||99) || (a.displayName||'').localeCompare(b.displayName||''));

  // Group by role
  const groups = {};
  members.forEach(m => {
    const role = m.role || 'member';
    if (!groups[role]) groups[role] = [];
    groups[role].push(m);
  });

  const roleLabels = { player:'Player', prospect:'Prospective Player', alumni:'Alumni', coach:'Coach', rep:'Team Rep', parent:'Parent', member:'Member' };

  let html = '';
  Object.entries(groups).sort((a,b) => (roleOrder[a[0]]||99) - (roleOrder[b[0]]||99)).forEach(([role, roleMembers]) => {
    html += `<h3 style="margin:1.25rem 0 0.5rem;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.5px;color:#5D1725;border-bottom:2px solid #5D1725;padding-bottom:0.3rem;">${roleLabels[role]||role} (${roleMembers.length})</h3>`;
    html += roleMembers.map(m => `
      <div class="item">
        <div class="item-info">
          <div style="display:flex;align-items:center;gap:0.5rem;">
            ${m.photoURL ? `<img src="${m.photoURL}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">` : `<div style="width:32px;height:32px;border-radius:50%;background:${roleColors[m.role]||'#666'};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;">${(m.displayName||'?').charAt(0)}</div>`}
            <div>
              <strong style="cursor:pointer;color:#5D1725;text-decoration:underline;" onclick="viewMemberInfo('${m.id}')">${m.displayName || 'Unknown'}</strong>
              <span>${m.email}</span>
              ${m.status === 'pending' ? '<span style="color:#856404;font-size:0.75rem;font-weight:600;">⏳ Pending</span>' : ''}
              ${m.status === 'denied' ? '<span style="color:#c62828;font-size:0.75rem;font-weight:600;">❌ Denied</span>' : ''}
              ${(() => {
                const link = rosterLinkMap[m.id];
                if (!link || (!link.asPlayer.length && !link.asParent.length)) return '';
                let html = '';
                if (link.asPlayer.length) {
                  html += '<span style="display:block;color:#2e7d32;font-size:0.75rem;margin-top:2px;">🔗 ' + link.asPlayer.join(', ') + '</span>';
                }
                if (link.asParent.length) {
                  html += '<span style="display:block;color:#1565c0;font-size:0.75rem;margin-top:2px;">👪 Parent of: ' + link.asParent.join(', ') + '</span>';
                }
                return html;
              })()}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <div style="display:flex;flex-wrap:wrap;gap:2px;max-width:340px;">
            <label style="font-size:0.75rem;display:inline-flex;align-items:center;gap:0.25rem;cursor:pointer;padding:3px 8px;border-radius:12px;border:1px solid #ddd;background:${((m.roles||[]).includes('player')||m.role==='player')?'#5D1725':'#f9f9f9'};color:${((m.roles||[]).includes('player')||m.role==='player')?'white':'#555'};margin:1px;"><input type="checkbox" ${((m.roles||[]).includes('player')||m.role==='player')?' checked':''} onchange="toggleMemberRole('${m.id}','player',this.checked,this.closest('label'))" style="display:none;"> Player</label><label style="font-size:0.75rem;display:inline-flex;align-items:center;gap:0.25rem;cursor:pointer;padding:3px 8px;border-radius:12px;border:1px solid #ddd;background:${((m.roles||[]).includes('prospect')||m.role==='prospect')?'#5D1725':'#f9f9f9'};color:${((m.roles||[]).includes('prospect')||m.role==='prospect')?'white':'#555'};margin:1px;"><input type="checkbox" ${((m.roles||[]).includes('prospect')||m.role==='prospect')?' checked':''} onchange="toggleMemberRole('${m.id}','prospect',this.checked,this.closest('label'))" style="display:none;"> Prospect</label><label style="font-size:0.75rem;display:inline-flex;align-items:center;gap:0.25rem;cursor:pointer;padding:3px 8px;border-radius:12px;border:1px solid #ddd;background:${((m.roles||[]).includes('alumni')||m.role==='alumni')?'#5D1725':'#f9f9f9'};color:${((m.roles||[]).includes('alumni')||m.role==='alumni')?'white':'#555'};margin:1px;"><input type="checkbox" ${((m.roles||[]).includes('alumni')||m.role==='alumni')?' checked':''} onchange="toggleMemberRole('${m.id}','alumni',this.checked,this.closest('label'))" style="display:none;"> Alumni</label><label style="font-size:0.75rem;display:inline-flex;align-items:center;gap:0.25rem;cursor:pointer;padding:3px 8px;border-radius:12px;border:1px solid #ddd;background:${((m.roles||[]).includes('coach')||m.role==='coach')?'#5D1725':'#f9f9f9'};color:${((m.roles||[]).includes('coach')||m.role==='coach')?'white':'#555'};margin:1px;"><input type="checkbox" ${((m.roles||[]).includes('coach')||m.role==='coach')?' checked':''} onchange="toggleMemberRole('${m.id}','coach',this.checked,this.closest('label'))" style="display:none;"> Coach</label><label style="font-size:0.75rem;display:inline-flex;align-items:center;gap:0.25rem;cursor:pointer;padding:3px 8px;border-radius:12px;border:1px solid #ddd;background:${((m.roles||[]).includes('rep')||m.role==='rep')?'#5D1725':'#f9f9f9'};color:${((m.roles||[]).includes('rep')||m.role==='rep')?'white':'#555'};margin:1px;"><input type="checkbox" ${((m.roles||[]).includes('rep')||m.role==='rep')?' checked':''} onchange="toggleMemberRole('${m.id}','rep',this.checked,this.closest('label'))" style="display:none;"> Team Rep</label><label style="font-size:0.75rem;display:inline-flex;align-items:center;gap:0.25rem;cursor:pointer;padding:3px 8px;border-radius:12px;border:1px solid #ddd;background:${((m.roles||[]).includes('parent')||m.role==='parent')?'#5D1725':'#f9f9f9'};color:${((m.roles||[]).includes('parent')||m.role==='parent')?'white':'#555'};margin:1px;"><input type="checkbox" ${((m.roles||[]).includes('parent')||m.role==='parent')?' checked':''} onchange="toggleMemberRole('${m.id}','parent',this.checked,this.closest('label'))" style="display:none;"> Parent</label><label style="font-size:0.75rem;display:inline-flex;align-items:center;gap:0.25rem;cursor:pointer;padding:3px 8px;border-radius:12px;border:1px solid #ddd;background:${((m.roles||[]).includes('member')||m.role==='member')?'#5D1725':'#f9f9f9'};color:${((m.roles||[]).includes('member')||m.role==='member')?'white':'#555'};margin:1px;"><input type="checkbox" ${((m.roles||[]).includes('member')||m.role==='member')?' checked':''} onchange="toggleMemberRole('${m.id}','member',this.checked,this.closest('label'))" style="display:none;"> Member</label><label style="font-size:0.75rem;display:inline-flex;align-items:center;gap:0.25rem;cursor:pointer;padding:3px 8px;border-radius:12px;border:1px solid #ddd;background:${((m.roles||[]).includes('varsity')||m.role==='varsity')?'#5D1725':'#f9f9f9'};color:${((m.roles||[]).includes('varsity')||m.role==='varsity')?'white':'#555'};margin:1px;"><input type="checkbox" ${((m.roles||[]).includes('varsity')||m.role==='varsity')?' checked':''} onchange="toggleMemberRole('${m.id}','varsity',this.checked,this.closest('label'))" style="display:none;"> Varsity</label><label style="font-size:0.75rem;display:inline-flex;align-items:center;gap:0.25rem;cursor:pointer;padding:3px 8px;border-radius:12px;border:1px solid #ddd;background:${((m.roles||[]).includes('jv')||m.role==='jv')?'#5D1725':'#f9f9f9'};color:${((m.roles||[]).includes('jv')||m.role==='jv')?'white':'#555'};margin:1px;"><input type="checkbox" ${((m.roles||[]).includes('jv')||m.role==='jv')?' checked':''} onchange="toggleMemberRole('${m.id}','jv',this.checked,this.closest('label'))" style="display:none;"> JV</label><label style="font-size:0.75rem;display:inline-flex;align-items:center;gap:0.25rem;cursor:pointer;padding:3px 8px;border-radius:12px;border:1px solid #ddd;background:${((m.roles||[]).includes('admin')||m.role==='admin')?'#5D1725':'#f9f9f9'};color:${((m.roles||[]).includes('admin')||m.role==='admin')?'white':'#555'};margin:1px;"><input type="checkbox" ${((m.roles||[]).includes('admin')||m.role==='admin')?' checked':''} onchange="toggleMemberRole('${m.id}','admin',this.checked,this.closest('label'))" style="display:none;"> Admin</label><label style="font-size:0.75rem;display:inline-flex;align-items:center;gap:0.25rem;cursor:pointer;padding:3px 8px;border-radius:12px;border:1px solid #ddd;background:${((m.roles||[]).includes('superadmin')||m.role==='superadmin')?'#5D1725':'#f9f9f9'};color:${((m.roles||[]).includes('superadmin')||m.role==='superadmin')?'white':'#555'};margin:1px;"><input type="checkbox" ${((m.roles||[]).includes('superadmin')||m.role==='superadmin')?' checked':''} onchange="toggleMemberRole('${m.id}','superadmin',this.checked,this.closest('label'))" style="display:none;"> Super Admin</label>
          </div>          </div>
          ${m.role === 'admin' ? `<button class="btn-secondary" style="font-size:0.8rem;padding:4px 8px;" onclick="showAdminPermissions('${m.id}')">Permissions</button>` : ''}
          <button class="btn-delete" onclick="deleteMember('${m.id}')">Remove</button>
        </div>
      </div>`).join('');
  });

  list.innerHTML = html;

  } catch (err) {
    console.error('loadMembersTab error:', err);
    list.innerHTML = '<div class="empty-state">Could not load users. Please try again.</div>';
  }
}

window.toggleMemberRole = async function(uid, role, checked, labelEl) {
  // Update UI immediately
  if (labelEl) {
    labelEl.style.background = checked ? '#5D1725' : '#f9f9f9';
    labelEl.style.color = checked ? 'white' : '#555';
    labelEl.style.borderColor = checked ? '#5D1725' : '#ddd';
  }
  const snap = await getDoc(doc(db, 'members', uid));
  if (!snap.exists()) return;
  const data = snap.data();
  let roles = Array.isArray(data.roles) ? [...data.roles] : (data.role ? [data.role] : []);
  if (checked && !roles.includes(role)) roles.push(role);
  if (!checked) roles = roles.filter(r => r !== role);
  const priority = ['superadmin','admin','coach','player','varsity','jv','alumni','rep','prospect','parent','member'];
  const primaryRole = priority.find(r => roles.includes(r)) || 'member';
  await setDoc(doc(db, 'members', uid), { roles, role: primaryRole, teams: roles.filter(r => ['varsity','jv'].includes(r)) }, { merge: true });
};

window.updateMemberRole = async function(uid, role) {
  await window.toggleMemberRole(uid, role, true);
};

window.updateMemberAdmin = async function(uid, isAdmin) {
  await setDoc(doc(db, 'members', uid), { isAdmin }, { merge: true });
  if (isAdmin) showAdminPermissions(uid);
  loadMembersTab();
};

const ADMIN_TABS = [
  { id: 'roster',       label: 'Roster' },
  { id: 'schedule',     label: 'Schedule' },
  { id: 'gameStats',    label: 'Game Stats' },
  { id: 'news',         label: 'News & Updates' },
  { id: 'events',       label: 'Events' },
  { id: 'summer',       label: 'Summer Hockey' },
  { id: 'gallery',      label: 'Gallery' },
  { id: 'sponsors',     label: 'Sponsors' },
  { id: 'members',      label: 'Members' },
  { id: 'pages',        label: 'Pages' },
  { id: 'seasons',      label: 'Seasons' },
  { id: 'tryouts',      label: 'Tryouts' },
  { id: 'navigation',   label: 'Navigation' },
  { id: 'pageheroes',   label: 'Page Heroes' },
];

window.showAdminPermissions = async function(uid) {
  const snap = await getDoc(doc(db, 'members', uid));
  const member = snap.data();
  const perms = member.adminPermissions || {};

  const existing = document.getElementById('adminPermsModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'adminPermsModal';
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>Admin Permissions — ${member.displayName}</h2>
        <button class="modal-close" onclick="document.getElementById('adminPermsModal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:0.85rem;color:#666;margin-bottom:1rem;">Select which admin tabs this person can access:</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1.25rem;">
          ${ADMIN_TABS.map(t => `
            <label style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;background:#f9f9f9;border-radius:4px;cursor:pointer;">
              <input type="checkbox" value="${t.id}" ${perms[t.id] ? 'checked' : ''}>
              ${t.label}
            </label>`).join('')}
        </div>
        <div style="display:flex;gap:0.5rem;">
          <button id="saveAdminPermsBtn" class="btn-primary">Save Permissions</button>
          <button onclick="document.getElementById('adminPermsModal').remove()" class="btn-secondary">Cancel</button>
        </div>
        <p id="adminPermsStatus" class="save-status"></p>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('saveAdminPermsBtn').addEventListener('click', async () => {
    const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
    const newPerms = {};
    checkboxes.forEach(cb => { newPerms[cb.value] = cb.checked; });
    await setDoc(doc(db, 'members', uid), { adminPermissions: newPerms }, { merge: true });
    document.getElementById('adminPermsStatus').textContent = '✅ Saved!';
    setTimeout(() => modal.remove(), 1000);
  });
};

window.viewMemberInfo = async function(uid) {
  const snap = await getDoc(doc(db, 'members', uid));
  if (!snap.exists()) return;
  const m = snap.data();
  const modal = document.getElementById('memberInfoModal');
  document.getElementById('memberInfoName').textContent = m.displayName || 'Member Info';
  if (!m.shareWithCoach) {
    document.getElementById('memberInfoBody').innerHTML = '<p style="color:#999;font-style:italic;">This member has not chosen to share their information with coaches.</p>';
  } else {
    document.getElementById('memberInfoBody').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.6rem;font-size:0.9rem;">
        ${m.photoURL ? '<div style="text-align:center;margin-bottom:0.5rem;"><img src="' + m.photoURL + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;"></div>' : ''}
        <div><strong>Email:</strong> ${m.email || '—'}</div>
        <div><strong>Phone:</strong> ${m.phone || '—'}</div>
        <div><strong>Position:</strong> ${m.position || '—'}</div>
        <div><strong>Grad Year:</strong> ${m.gradYear || '—'}</div>
        <div><strong>Jersey #:</strong> ${m.jerseyNumber || '—'}</div>
        <div><strong>Years with Team:</strong> ${m.yearsWithTeam || '—'}</div>
        <div><strong>Hometown:</strong> ${m.hometown || '—'}</div>
        ${m.bio ? '<div><strong>Bio:</strong> ' + m.bio + '</div>' : ''}
        <div><strong>Roles:</strong> ${(m.roles || [m.role]).filter(Boolean).join(', ')}</div>
      </div>`;
  }
  modal.classList.add('active');
};

window.deleteMember = async function(uid) {
  if (!confirm('Remove this member?')) return;
  await deleteDoc(doc(db, 'members', uid));
  loadMembersTab();
};

// ============================================
// ROLE REQUESTS TAB
// ============================================
async function loadRoleRequestsTab() {
  const list = document.getElementById('roleRequestsList');
  if (!list) return;
  list.innerHTML = '<div class="empty-state">Loading...</div>';

  try {

  const snap = await getDocs(collection(db, 'roleRequests'));
  const requests = [];
  snap.forEach(d => requests.push({ id: d.id, ...d.data() }));
  requests.sort((a, b) => {
    const order = { pending: 0, approved: 1, rejected: 2 };
    return (order[a.status]||0) - (order[b.status]||0);
  });

  const pending = requests.filter(r => r.status === 'pending').length;
  const badge = document.getElementById('roleRequestsBadge');
  if (badge) { badge.textContent = pending > 0 ? pending : ''; badge.style.display = pending > 0 ? 'inline' : 'none'; }

  if (!requests.length) { list.innerHTML = '<div class="empty-state">No role requests yet</div>'; return; }

  const statusColors = { pending:'#856404', approved:'#2e7d32', rejected:'#c62828' };
  const statusBg = { pending:'#fff8e1', approved:'#e8f5e9', rejected:'#ffebee' };

  list.innerHTML = requests.map(r => {
    let details = '';
    if (r.requestedRole === 'player') details = `Grad: ${r.gradYear} · ${r.position}`;
    else if (r.requestedRole === 'family') details = `Player: ${r.playerName} · ${r.relationship}`;
    else if (r.requestedRole === 'alumni') details = `Grad: ${r.gradYear} · Played: ${r.yearsPlayed}`;

    return `
      <div class="item" style="background:${statusBg[r.status]||'white'};">
        <div class="item-info">
          <div>
            <strong>${r.memberName}</strong>
            <span>${r.email} · Requesting: <strong>${r.requestedRole}</strong>${details ? ' · ' + details : ''}</span>
            <span style="color:${statusColors[r.status]};font-weight:600;font-size:0.8rem;">${r.status.toUpperCase()}</span>
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;">
          ${r.status === 'pending' ? `
            <button class="btn-primary" style="font-size:0.8rem;padding:5px 10px;" onclick="approveRoleRequest('${r.id}','${r.uid}','${r.requestedRole}')">Approve</button>
            <button class="btn-delete" style="font-size:0.8rem;padding:5px 10px;" onclick="rejectRoleRequest('${r.id}')">Reject</button>
          ` : ''}
          <button class="btn-secondary" style="font-size:0.8rem;padding:5px 10px;" onclick="deleteRoleRequest('${r.id}')">Delete</button>
        </div>
      </div>`;
  }).join('');

  } catch (err) {
    console.error('loadRoleRequestsTab error:', err);
    list.innerHTML = '<div class="empty-state">Could not load role requests. Please try again.</div>';
  }
}



// ============================================
// RSVP VIEWER (Team Events + Varsity Schedule)
// ============================================
function showRsvpModal(title, html) {
  document.getElementById('rsvpViewerTitle').textContent = title;
  document.getElementById('rsvpViewerContent').innerHTML = html;
  document.getElementById('rsvpViewerModal').classList.add('active');
}

window.viewTeamEventRsvp = async function(eventId) {
  const modal = document.getElementById('rsvpViewerModal');
  modal.classList.add('active');
  document.getElementById('rsvpViewerContent').innerHTML = '<p style="color:#999;">Loading...</p>';

  const evSnap = await getDoc(doc(db, 'teamEvents', eventId));
  const ev = evSnap.exists() ? evSnap.data() : {};
  const d = ev.date ? new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) : '';
  document.getElementById('rsvpViewerTitle').textContent = (ev.name || 'Team Event') + (d ? ' — ' + d : '');

  const rsvpSnap = await getDocs(collection(db, 'teamEvents', eventId, 'rsvps'));
  const rsvps = {};
  rsvpSnap.forEach(d => { rsvps[d.id] = d.data(); });

  // Load all members with invited roles
  const invitedRoles = ev.invitedRoles || [];
  const membersSnap = await getDocs(collection(db, 'members'));
  const invited = [];
  membersSnap.forEach(d => {
    const m = { id: d.id, ...d.data() };
    const mRoles = [m.role, ...(m.roles||[]), ...(m.teams||[])].filter(Boolean);
    if (invitedRoles.length === 0 || mRoles.some(r => invitedRoles.includes(r))) invited.push(m);
  });
  invited.sort((a,b) => (a.displayName||'').localeCompare(b.displayName||''));

  const inList = invited.filter(m => rsvps[m.id]?.response === 'yes');
  const outList = invited.filter(m => rsvps[m.id]?.response === 'no');
  const pending = invited.filter(m => !rsvps[m.id]);

  function memberRow(m, resp) {
    const inA = resp === 'yes'; const outA = resp === 'no';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:0.88rem;">
      <span>${m.displayName || m.email}</span>
      <div style="display:flex;gap:0.3rem;">
        <button onclick="adminSetTeamEventRsvp('${eventId}','${m.id}','${m.displayName||m.email}','yes',${inA})" style="border-radius:4px;padding:2px 8px;font-size:0.75rem;font-weight:600;cursor:pointer;border:1.5px solid #2e7d32;background:${inA?'#2e7d32':'white'};color:${inA?'white':'#2e7d32'};">✅ In</button>
        <button onclick="adminSetTeamEventRsvp('${eventId}','${m.id}','${m.displayName||m.email}','no',${outA})" style="border-radius:4px;padding:2px 8px;font-size:0.75rem;font-weight:600;cursor:pointer;border:1.5px solid #c62828;background:${outA?'#c62828':'white'};color:${outA?'white':'#c62828'};">❌ Out</button>
      </div>
    </div>`;
  }

  document.getElementById('rsvpViewerContent').innerHTML = `
    <div style="display:flex;gap:1rem;font-size:0.82rem;font-weight:600;margin-bottom:1rem;">
      <span style="color:#2e7d32;">✅ In: ${inList.length}</span>
      <span style="color:#c62828;">❌ Out: ${outList.length}</span>
      <span style="color:#888;">⏳ No RSVP: ${pending.length}</span>
    </div>
    ${[...inList,...outList,...pending].map(m => memberRow(m, rsvps[m.id]?.response)).join('')}
    ${invited.length === 0 ? '<p style="color:#999;font-style:italic;">No members invited.</p>' : ''}`;
};

window.adminSetTeamEventRsvp = async function(eventId, uid, name, response, isActive) {
  const rsvpRef = doc(db, 'teamEvents', eventId, 'rsvps', uid);
  if (isActive) { await deleteDoc(rsvpRef); }
  else { await setDoc(rsvpRef, { response, name, adminSet: true, timestamp: new Date().toISOString() }); }
  await window.viewTeamEventRsvp(eventId);
};

window.viewScheduleGameRsvp = async function(gameId, seasonId) {
  const modal = document.getElementById('rsvpViewerModal');
  modal.classList.add('active');
  document.getElementById('rsvpViewerContent').innerHTML = '<p style="color:#999;">Loading...</p>';

  try {

  const gSnap = await getDoc(doc(db, 'seasons', seasonId, 'schedule', gameId));
  const g = gSnap.exists() ? gSnap.data() : {};
  const d = g.date ? new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) : '';
  document.getElementById('rsvpViewerTitle').textContent = 'vs ' + (g.opponent||'TBD') + (d ? ' — ' + d : '');

  const rsvpSnap = await getDocs(collection(db, 'seasons', seasonId, 'schedule', gameId, 'rsvps'));
  const rsvps = {};
  rsvpSnap.forEach(d => { rsvps[d.id] = d.data(); });

  // Load full varsity roster (linked and unlinked) — players and coaches
  const playersSnap = await getDocs(collection(db, 'roster', seasonId, 'players'));
  const players = [];
  playersSnap.forEach(d => players.push(d.data()));
  players.sort((a,b) => parseInt(a.number||99) - parseInt(b.number||99));

  const coachesSnap = await getDocs(collection(db, 'roster', seasonId, 'coaches'));
  const coaches = [];
  coachesSnap.forEach(d => coaches.push(d.data()));
  coaches.sort((a,b) => (a.name||'').localeCompare(b.name||''));

  const rsvpKey = (p) => p.memberUid || 'manual_' + p.name.replace(/[^a-zA-Z0-9]/g, '_');

  const inList = players.filter(p => rsvps[rsvpKey(p)]?.response === 'yes');
  const outList = players.filter(p => rsvps[rsvpKey(p)]?.response === 'no');
  const pending = players.filter(p => !rsvps[rsvpKey(p)]);

  const coachInList = coaches.filter(c => rsvps[rsvpKey(c)]?.response === 'yes');
  const coachOutList = coaches.filter(c => rsvps[rsvpKey(c)]?.response === 'no');
  const coachPending = coaches.filter(c => !rsvps[rsvpKey(c)]);

  function playerRow(p, resp, showNumber) {
    const inA = resp === 'yes'; const outA = resp === 'no';
    const key = rsvpKey(p);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:0.88rem;">
      <span>${showNumber && p.number ? '<strong>#'+p.number+'</strong> ' : ''}${p.name}${!p.memberUid ? ' <span style="color:#aaa;font-size:0.75rem;">(unlinked)</span>' : ''}</span>
      <div style="display:flex;gap:0.3rem;">
        <button onclick="adminSetScheduleRsvp('${gameId}','${seasonId}','${key}','${p.name}','yes',${inA})" style="border-radius:4px;padding:2px 8px;font-size:0.75rem;font-weight:600;cursor:pointer;border:1.5px solid #2e7d32;background:${inA?'#2e7d32':'white'};color:${inA?'white':'#2e7d32'};">✅ In</button>
        <button onclick="adminSetScheduleRsvp('${gameId}','${seasonId}','${key}','${p.name}','no',${outA})" style="border-radius:4px;padding:2px 8px;font-size:0.75rem;font-weight:600;cursor:pointer;border:1.5px solid #c62828;background:${outA?'#c62828':'white'};color:${outA?'white':'#c62828'};">❌ Out</button>
      </div>
    </div>`;
  }

  document.getElementById('rsvpViewerContent').innerHTML = `
    <div style="display:flex;gap:1rem;font-size:0.82rem;font-weight:600;margin-bottom:1rem;">
      <span style="color:#2e7d32;">✅ In: ${inList.length}</span>
      <span style="color:#c62828;">❌ Out: ${outList.length}</span>
      <span style="color:#888;">⏳ No RSVP: ${pending.length}</span>
    </div>
    <div style="font-weight:700;font-size:0.85rem;color:#5D1725;margin:0.75rem 0 0.25rem;">Players</div>
    ${players.length === 0 ? '<p style="color:#999;font-style:italic;">No players on this roster yet.</p>' : [...inList,...outList,...pending].map(p => playerRow(p, rsvps[rsvpKey(p)]?.response, true)).join('')}
    <div style="font-weight:700;font-size:0.85rem;color:#5D1725;margin:1rem 0 0.25rem;">Coaches</div>
    ${coaches.length === 0 ? '<p style="color:#999;font-style:italic;">No coaches on this roster yet.</p>' : [...coachInList,...coachOutList,...coachPending].map(c => playerRow(c, rsvps[rsvpKey(c)]?.response, false)).join('')}`;

  } catch (err) {
    console.error('viewScheduleGameRsvp error:', err);
    document.getElementById('rsvpViewerContent').innerHTML = '<p style="color:#c62828;">Could not load RSVPs. Please close this and try again.</p>';
  }
};

window.adminSetScheduleRsvp = async function(gameId, seasonId, uid, name, response, isActive) {
  const rsvpRef = doc(db, 'seasons', seasonId, 'schedule', gameId, 'rsvps', uid);
  if (isActive) { await deleteDoc(rsvpRef); }
  else { await setDoc(rsvpRef, { response, name, adminSet: true, timestamp: new Date().toISOString() }); }
  await window.viewScheduleGameRsvp(gameId, seasonId);
};

window.approveRoleRequest = async function(requestId, uid, role) {
  await setDoc(doc(db, 'members', uid), { role }, { merge: true });
  await setDoc(doc(db, 'roleRequests', requestId), { status: 'approved' }, { merge: true });
  loadRoleRequestsTab();
  loadMembersTab();
};

window.rejectRoleRequest = async function(requestId) {
  await setDoc(doc(db, 'roleRequests', requestId), { status: 'rejected' }, { merge: true });
  loadRoleRequestsTab();
};

window.deleteRoleRequest = async function(requestId) {
  if (!confirm('Delete this request?')) return;
  await deleteDoc(doc(db, 'roleRequests', requestId));
  loadRoleRequestsTab();
};

// ============================================
// EXPORT MEMBERS CSV
// ============================================
const exportMembersBtn = document.getElementById('exportMembersBtn');
if (exportMembersBtn) {
  exportMembersBtn.addEventListener('click', async () => {
    const snap = await getDocs(collection(db, 'members'));
    const rows = [['Name', 'Email', 'Role', 'Joined']];
    snap.forEach(d => {
      const m = d.data();
      rows.push([m.displayName || '', m.email || '', m.role || 'member', m.createdAt || '']);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'admirals-members.csv'; a.click();
  });
}

loadMembersTab();
loadRoleRequestsTab();


// ============================================
// SPONSORS ADMIN
// ============================================
async function loadSponsors() {
  const list = document.getElementById('sponsorsList');
  if (!list) return;
  const snap = await getDocs(collection(db, 'sponsors'));
  const sponsors = [];
  snap.forEach(d => sponsors.push({ id: d.id, ...d.data() }));
  sponsors.sort((a,b) => (a.order||99) - (b.order||99));

  if (!sponsors.length) { list.innerHTML = '<div class="empty-state">No sponsors yet</div>'; return; }

  list.innerHTML = sponsors.map(s => `
    <div class="item">
      <div class="item-info">
        <div style="display:flex;align-items:center;gap:0.75rem;">
          ${s.logoURL ? `<img src="${s.logoURL}" style="width:48px;height:32px;object-fit:contain;border-radius:3px;border:1px solid #eee;">` : '<div style="width:48px;height:32px;background:#f5f5f5;border-radius:3px;"></div>'}
          <div>
            <strong>${s.name}</strong>
            ${s.featured ? '<span style="background:#f0b429;color:#333;font-size:0.65rem;font-weight:700;padding:1px 6px;border-radius:3px;margin-left:4px;">⭐ Featured</span>' : ''}
            <span>${s.website || ''}</span>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn-edit" onclick="editSponsor('${s.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteSponsor('${s.id}')">Delete</button>
      </div>
    </div>`).join('');
}

window.editSponsor = async function(id) {
  const snap = await getDoc(doc(db, 'sponsors', id));
  const s = snap.data();
  openSponsorModal(id, s);
};

window.deleteSponsor = async function(id) {
  if (!confirm('Delete this sponsor?')) return;
  await deleteDoc(doc(db, 'sponsors', id));
  loadSponsors();
};

function openSponsorModal(id, data) {
  const existing = document.getElementById('sponsorModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'sponsorModal';
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>${id ? 'Edit Sponsor' : 'Add Sponsor'}</h2>
        <button class="modal-close" onclick="document.getElementById('sponsorModal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-label-group"><label class="field-label">Name</label><input type="text" id="sponsorName" value="${data?.name||''}"></div>
        <div class="form-label-group"><label class="field-label">Website URL</label><input type="text" id="sponsorWebsite" value="${data?.website||''}" placeholder="https://..."></div>
        <div class="form-label-group"><label class="field-label">Description</label><textarea id="sponsorDesc" rows="2" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">${data?.description||''}</textarea></div>
        <div class="form-label-group"><label class="field-label">Logo</label>
          <div style="display:flex;gap:0.75rem;align-items:center;">
            ${data?.logoURL ? `<img id="sponsorLogoPreview" src="${data.logoURL}" style="height:48px;object-fit:contain;border:1px solid #ddd;border-radius:4px;">` : '<div id="sponsorLogoPreview" style="width:80px;height:48px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;"></div>'}
            <label class="btn-secondary photo-btn">Upload<input type="file" id="sponsorLogoFile" accept="image/*" style="display:none;"></label>
          </div>
        </div>
        <div class="form-label-group"><label class="field-label">Display Order</label><input type="number" id="sponsorOrder" value="${data?.order||1}" min="1" style="width:80px;"></div>
        <div class="captain-checkboxes">
          <label class="captain-label"><input type="checkbox" id="sponsorFeatured" ${data?.featured?'checked':''}> Featured Sponsor (shown prominently)</label>
        </div>
        <div class="form-buttons">
          <button id="saveSponsorBtn" class="btn-primary">Save Sponsor</button>
          <button onclick="document.getElementById('sponsorModal').remove()" class="btn-secondary">Cancel</button>
        </div>
        <p id="sponsorStatus" class="save-status"></p>
      </div>
    </div>`;
  document.body.appendChild(modal);

  let sponsorLogoData = data?.logoURL || null;

  document.getElementById('sponsorLogoFile').addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      sponsorLogoData = e.target.result;
      document.getElementById('sponsorLogoPreview').outerHTML = `<img id="sponsorLogoPreview" src="${sponsorLogoData}" style="height:48px;object-fit:contain;border:1px solid #ddd;border-radius:4px;">`;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('saveSponsorBtn').addEventListener('click', async () => {
    const name = document.getElementById('sponsorName').value.trim();
    if (!name) { document.getElementById('sponsorStatus').textContent = 'Name required'; return; }

    let logoURL = data?.logoURL || '';
    if (sponsorLogoData && sponsorLogoData.startsWith('data:')) {
      const storageRef = ref(storage, `sponsors/${Date.now()}`);
      await uploadString(storageRef, sponsorLogoData, 'data_url');
      logoURL = await getDownloadURL(storageRef);
    }

    const sponsorData = {
      name,
      website: document.getElementById('sponsorWebsite').value.trim(),
      description: document.getElementById('sponsorDesc').value.trim(),
      logoURL,
      order: parseInt(document.getElementById('sponsorOrder').value) || 1,
      featured: document.getElementById('sponsorFeatured').checked
    };

    if (document.getElementById('sponsorFeatured').checked) {
      // Unfeature others
      const snap = await getDocs(collection(db, 'sponsors'));
      const batch = [];
      snap.forEach(d => { if (d.id !== id && d.data().featured) batch.push(setDoc(doc(db, 'sponsors', d.id), { featured: false }, { merge: true })); });
      await Promise.all(batch);
    }

    const docId = id || Date.now().toString();
    await setDoc(doc(db, 'sponsors', docId), sponsorData);
    document.getElementById('sponsorModal').remove();
    loadSponsors();
  });
}

const addSponsorBtn = document.getElementById('addSponsorBtn');
if (addSponsorBtn) addSponsorBtn.addEventListener('click', () => openSponsorModal(null, null));

loadSponsors();

// ============================================
// GALLERY ADMIN
// ============================================
let currentGallerySeasonId = null;

async function loadGallerySeasons() {
  const sel = document.getElementById('gallerySeason');
  if (!sel) return;

  // Pull from team seasons
  const seasonsSnap = await getDocs(collection(db, 'seasons'));
  const teamSeasons = [];
  seasonsSnap.forEach(d => teamSeasons.push({ id: d.id, label: d.data().label || d.id, type: 'Team Season' }));
  teamSeasons.sort((a,b) => b.id.localeCompare(a.id));

  // Pull from summer seasons
  const summerSnap = await getDocs(collection(db, 'summer'));
  const summerSeasons = [];
  summerSnap.forEach(d => summerSeasons.push({ id: 'summer-' + d.id, label: (d.data().label || d.id) + ' (Summer)', type: 'Summer League' }));
  summerSeasons.sort((a,b) => b.id.localeCompare(a.id));

  const allSeasons = [...teamSeasons, ...summerSeasons];

  if (!allSeasons.length) {
    sel.innerHTML = '<option value="">No seasons found</option>';
    return;
  }

  sel.innerHTML = `<optgroup label="Team Seasons">${teamSeasons.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}</optgroup>` +
    (summerSeasons.length ? `<optgroup label="Summer League">${summerSeasons.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}</optgroup>` : '');

  currentGallerySeasonId = allSeasons[0].id;
  loadGalleryAlbums(allSeasons[0].id);

  sel.removeEventListener('change', onGallerySeasonChange);
  sel.addEventListener('change', onGallerySeasonChange);
}

function onGallerySeasonChange(e) {
  currentGallerySeasonId = e.target.value;
  loadGalleryAlbums(e.target.value);
}

async function loadGalleryAlbums(seasonId) {
  const list = document.getElementById('galleryAlbumsList');
  if (!list) return;
  const snap = await getDocs(collection(db, 'gallery', seasonId, 'albums'));
  const albums = [];
  snap.forEach(d => albums.push({ id: d.id, ...d.data() }));
  albums.sort((a,b) => (a.order||99) - (b.order||99));

  if (!albums.length) { list.innerHTML = '<div class="empty-state">No albums yet — click + Add Album</div>'; return; }

  list.innerHTML = albums.map(a => `
    <div class="item">
      <div class="item-info">
        <div>
          <strong>${a.name || a.id}</strong>
          <span>${a.photoCount || 0} photos</span>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn-edit" data-season='${seasonId}' data-album='${a.id}' data-name='${(a.name||a.id).replace(/'/g,'')}' onclick="openAlbum(this.dataset.season,this.dataset.album,this.dataset.name)">Open</button>
        <button class="btn-delete" onclick="deleteAlbum('${seasonId}','${a.id}')">Delete</button>
      </div>
    </div>`).join('');
}

const addGallerySeasonBtn = document.getElementById('addGallerySeasonBtn');
if (addGallerySeasonBtn) {
  addGallerySeasonBtn.addEventListener('click', async () => {
    const label = prompt('Season label (e.g. 2024-25):');
    if (!label) return;
    const id = label.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    await setDoc(doc(db, 'gallery', id), { label, createdAt: new Date().toISOString() });
    loadGallerySeasons();
  });
}

const addAlbumBtn = document.getElementById('addAlbumBtn');
if (addAlbumBtn) {
  addAlbumBtn.addEventListener('click', async () => {
    if (!currentGallerySeasonId) { alert('Create a season first'); return; }
    const name = prompt('Album name (e.g. Game 1 vs Brentwood):');
    if (!name) return;
    const id = Date.now().toString();
    await setDoc(doc(db, 'gallery', currentGallerySeasonId, 'albums', id), {
      name,
      order: 99,
      photoCount: 0,
      createdAt: new Date().toISOString()
    });
    loadGalleryAlbums(currentGallerySeasonId);
  });
}

window.deleteAlbum = async function(seasonId, albumId) {
  if (!confirm('Delete this album and all its photos?')) return;
  const photosSnap = await getDocs(collection(db, 'gallery', seasonId, 'albums', albumId, 'photos'));
  await Promise.all(photosSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'gallery', seasonId, 'albums', albumId));
  loadGalleryAlbums(seasonId);
};

window.openAlbum = async function(seasonId, albumId, albumName) {
  const list = document.getElementById('galleryAlbumsList');
  list.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;">
      <button class="btn-secondary" onclick="loadGalleryAlbums('${seasonId}')">← Back</button>
      <h3 style="margin:0;">${albumName}</h3>
      <label class="btn-primary photo-btn" style="margin-left:auto;cursor:pointer;">
        + Upload Photos
        <input type="file" id="photoUploadInput" accept="image/*" multiple style="display:none;">
      </label>
    </div>
    <p id="uploadProgress" style="font-size:0.85rem;color:#555;"></p>
    <div id="albumPhotosList"></div>`;

  loadAlbumPhotos(seasonId, albumId);

  document.getElementById('photoUploadInput').addEventListener('change', async function() {
    const files = Array.from(this.files);
    const progress = document.getElementById('uploadProgress');
    progress.textContent = `Uploading ${files.length} photo${files.length !== 1 ? 's' : ''}...`;

    let uploaded = 0;
    for (const file of files) {
      const reader = new FileReader();
      await new Promise(resolve => {
        reader.onload = async e => {
          const storageRef = storageRefFn(storage, `gallery/${seasonId}/${albumId}/${Date.now()}_${file.name}`);
          await uploadString(storageRef, e.target.result, 'data_url');
          const url = await getDownloadURL(storageRef);
          await addDoc(collection(db, 'gallery', seasonId, 'albums', albumId, 'photos'), {
            url,
            caption: '',
            order: Date.now(),
            uploadedAt: new Date().toISOString()
          });
          uploaded++;
          progress.textContent = `Uploaded ${uploaded} of ${files.length}...`;
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }

    // Update photo count
    const photosSnap = await getDocs(collection(db, 'gallery', seasonId, 'albums', albumId, 'photos'));
    await setDoc(doc(db, 'gallery', seasonId, 'albums', albumId), { photoCount: photosSnap.size }, { merge: true });

    progress.textContent = `✅ ${uploaded} photo${uploaded !== 1 ? 's' : ''} uploaded!`;
    setTimeout(() => { progress.textContent = ''; }, 3000);
    loadAlbumPhotos(seasonId, albumId);
  });
};

async function loadAlbumPhotos(seasonId, albumId) {
  const container = document.getElementById('albumPhotosList');
  if (!container) return;
  const snap = await getDocs(collection(db, 'gallery', seasonId, 'albums', albumId, 'photos'));
  const photos = [];
  snap.forEach(d => photos.push({ id: d.id, ...d.data() }));

  if (!photos.length) { container.innerHTML = '<div class="empty-state">No photos yet — click Upload Photos</div>'; return; }

  container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.5rem;">
    ${photos.map(p => `
      <div style="position:relative;aspect-ratio:1;border-radius:4px;overflow:hidden;background:#f5f5f5;">
        <img src="${p.url}" style="width:100%;height:100%;object-fit:cover;">
        <button onclick="deletePhoto('${seasonId}','${albumId}','${p.id}','${p.url}')" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;width:22px;height:22px;font-size:0.8rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
      </div>`).join('')}
  </div>`;
}

window.deletePhoto = async function(seasonId, albumId, photoId, url) {
  if (!confirm('Delete this photo?')) return;
  await deleteDoc(doc(db, 'gallery', seasonId, 'albums', albumId, 'photos', photoId));
  const photosSnap = await getDocs(collection(db, 'gallery', seasonId, 'albums', albumId, 'photos'));
  await setDoc(doc(db, 'gallery', seasonId, 'albums', albumId), { photoCount: photosSnap.size }, { merge: true });
  openAlbum(seasonId, albumId, '');
};

loadGallerySeasons();



// ============================================
// QUICK HITS ADMIN
// ============================================
async function loadQuickHitsAdmin() {
  const list = document.getElementById('quickHitsList');
  if (!list) return;
  const snap = await getDocs(collection(db, 'quickhits'));
  const hits = [];
  snap.forEach(d => hits.push({ id: d.id, ...d.data() }));
  hits.sort((a,b) => (a.order||99) - (b.order||99));

  if (!hits.length) { list.innerHTML = '<div class="empty-state">No links added yet</div>'; return; }

  list.innerHTML = hits.map(h => `
    <div class="item" style="opacity:${h.hidden ? '0.5' : '1'};">
      <div class="item-info">
        <div>
          <strong>${h.emoji||''} ${h.label}${h.hidden ? ' <span style="color:#c62828;font-size:0.75rem;font-weight:600;">(Hidden)</span>' : ''}</strong>
          <span>${h.url||''}</span>
          <span style="font-size:0.75rem;color:#999;">Order: ${h.order||1}</span>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn-secondary" style="font-size:0.8rem;" onclick="toggleQuickHitVisibility('${h.id}',${!h.hidden})">${h.hidden ? 'Show' : 'Hide'}</button>
        <button class="btn-edit" onclick="editQuickHit('${h.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteQuickHit('${h.id}')">Delete</button>
      </div>
    </div>`).join('');
}

window.toggleQuickHitVisibility = async function(id, hidden) {
  await setDoc(doc(db, 'quickhits', id), { hidden }, { merge: true });
  loadQuickHitsAdmin();
};

function openQuickHitModal(id, data) {
  const existing = document.getElementById('quickHitModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'quickHitModal';
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>${id ? 'Edit' : 'Add'} Quick Hit Link</h2>
        <button class="modal-close" onclick="document.getElementById('quickHitModal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-label-group" style="width:80px;">
            <label class="field-label">Emoji</label>
            <input type="text" id="qhEmoji" value="${data?.emoji||''}" style="width:60px;text-align:center;font-size:1.2rem;" placeholder="🔗">
          </div>
          <div class="form-label-group" style="flex:1;">
            <label class="field-label">Label *</label>
            <input type="text" id="qhLabel" value="${data?.label||''}" placeholder="e.g. Buy Tickets">
          </div>
        </div>
        <div class="form-label-group">
          <label class="field-label">URL *</label>
          <input type="text" id="qhUrl" value="${data?.url||''}" placeholder="https://...">
        </div>
        <div class="form-label-group">
          <label class="field-label">Display Order</label>
          <input type="number" id="qhOrder" value="${data?.order||1}" min="1" style="width:80px;">
        </div>
        <div class="form-buttons">
          <button id="saveQuickHitBtn" class="btn-primary">Save Link</button>
          <button onclick="document.getElementById('quickHitModal').remove()" class="btn-secondary">Cancel</button>
        </div>
        <p id="qhStatus" class="save-status"></p>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('saveQuickHitBtn').addEventListener('click', async () => {
    const label = document.getElementById('qhLabel').value.trim();
    const url = document.getElementById('qhUrl').value.trim();
    if (!label || !url) { document.getElementById('qhStatus').textContent = 'Label and URL required'; return; }

    const hitData = {
      label,
      url,
      emoji: document.getElementById('qhEmoji').value.trim(),
      order: parseInt(document.getElementById('qhOrder').value) || 1
    };

    const docId = id || Date.now().toString();
    await setDoc(doc(db, 'quickhits', docId), hitData);
    modal.remove();
    loadQuickHitsAdmin();
  });
}

window.editQuickHit = async function(id) {
  const snap = await getDoc(doc(db, 'quickhits', id));
  openQuickHitModal(id, snap.data());
};

window.deleteQuickHit = async function(id) {
  if (!confirm('Delete this link?')) return;
  await deleteDoc(doc(db, 'quickhits', id));
  loadQuickHitsAdmin();
};

const addQuickHitBtn = document.getElementById('addQuickHitBtn');
if (addQuickHitBtn) addQuickHitBtn.addEventListener('click', () => openQuickHitModal(null, null));

loadQuickHitsAdmin();

// ============================================
// CONTACT PAGE INFO ADMIN
// ============================================
async function loadContactInfo() {
  const fields = ['ciCoachName','ciCoachEmail','ciSchoolName','ciAddress1','ciAddress2','ciMapLink'];
  if (!document.getElementById('ciCoachName')) return;

  const snap = await getDoc(doc(db, 'settings', 'contactInfo'));
  const data = snap.exists() ? snap.data() : {};

  document.getElementById('ciCoachName').value = data.coachName || 'Matt Berry';
  document.getElementById('ciCoachEmail').value = data.coachEmail || 'coachberry03@gmail.com';
  document.getElementById('ciSchoolName').value = data.schoolName || 'Franklin High School';
  document.getElementById('ciAddress1').value = data.address1 || '810 Hillsboro Rd';
  document.getElementById('ciAddress2').value = data.address2 || 'Franklin, TN 37064';
  document.getElementById('ciMapLink').value = data.mapLink || 'https://maps.google.com/maps?q=Franklin+High+School';
  document.getElementById('ciTeamEmail').value = data.teamEmail || '';
  document.getElementById('ciTeamPhone').value = data.teamPhone || '';
}

const saveContactInfoBtn = document.getElementById('saveContactInfoBtn');
if (saveContactInfoBtn) {
  saveContactInfoBtn.addEventListener('click', async () => {
    const data = {
      coachName: document.getElementById('ciCoachName').value.trim(),
      coachEmail: document.getElementById('ciCoachEmail').value.trim(),
      schoolName: document.getElementById('ciSchoolName').value.trim(),
      address1: document.getElementById('ciAddress1').value.trim(),
      address2: document.getElementById('ciAddress2').value.trim(),
      mapLink: document.getElementById('ciMapLink').value.trim(),
      teamEmail: document.getElementById('ciTeamEmail').value.trim(),
      teamPhone: document.getElementById('ciTeamPhone').value.trim()
    };
    await setDoc(doc(db, 'settings', 'contactInfo'), data);
    document.getElementById('contactInfoStatus').textContent = '✅ Saved!';
    setTimeout(() => { document.getElementById('contactInfoStatus').textContent = ''; }, 2000);
  });
}

loadContactInfo();

// ============================================
// JV ROSTER ADMIN
// ============================================
window.jvCurrentSeasonId = null;
let jvCurrentSeasonId = null;

async function loadJvRosterSeasons() {
  const snap = await getDocs(collection(db, 'seasons'));
  const seasons = [];
  snap.forEach(d => seasons.push({ id: d.id, ...d.data() }));
  seasons.sort((a, b) => b.label.localeCompare(a.label));
  const select = document.getElementById('jvRosterSeasonSelect');
  if (!select) return;
  select.innerHTML = seasons.map(s => `<option value="${s.id}">${s.label}${s.current ? ' (Current)' : ''}</option>`).join('');
  const current = seasons.find(s => s.current) || seasons[0];
  if (current) {
    jvCurrentSeasonId = current.id;
    loadJvRoster(current.id);
  }
  select.addEventListener('change', e => {
    jvCurrentSeasonId = e.target.value;
    loadJvRoster(jvCurrentSeasonId);
  });
}

async function loadJvRoster(seasonId) {
  if (!seasonId) return;
  try {
    const { map, byName } = await loadMembersMap();
    _rosterMembersMap = map;
    _rosterMembersByName = byName;
    _rosterUsedUids = await loadUsedUids('jv-roster', seasonId);
  } catch (e) {
    console.error('loadJvRoster: linked-status data failed to load, continuing without it', e);
    _rosterMembersMap = {};
    _rosterMembersByName = {};
    _rosterUsedUids = new Set();
  }
  await loadJvPlayers(seasonId);
  await loadJvCoaches(seasonId);
}

async function loadJvPlayers(seasonId) {
  const list = document.getElementById('jvPlayersList');
  if (!list) return;
  list.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const snap = await getDocs(collection(db, 'jv-roster', seasonId, 'players'));
    const players = [];
    snap.forEach(d => players.push({ id: d.id, ...d.data() }));
    if (!players.length) { list.innerHTML = '<div class="empty-state">No players added yet</div>'; return; }
    list.innerHTML = '';
    players.sort((a, b) => parseInt(a.number) - parseInt(b.number)).forEach(p => list.appendChild(buildJvRosterItem(p, 'player', seasonId)));
  } catch (err) {
    console.error('loadJvPlayers error:', err);
    list.innerHTML = '<div class="empty-state">Could not load players. Please try again.</div>';
  }
}

async function loadJvCoaches(seasonId) {
  const list = document.getElementById('jvCoachesList');
  if (!list) return;
  list.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const snap = await getDocs(collection(db, 'jv-roster', seasonId, 'coaches'));
    const coaches = [];
    snap.forEach(d => coaches.push({ id: d.id, ...d.data() }));
    if (!coaches.length) { list.innerHTML = '<div class="empty-state">No coaches added yet</div>'; return; }
    list.innerHTML = '';
    coaches.forEach(c => list.appendChild(buildJvRosterItem(c, 'coach', seasonId)));
  } catch (err) {
    console.error('loadJvCoaches error:', err);
    list.innerHTML = '<div class="empty-state">Could not load coaches. Please try again.</div>';
  }
}

function buildJvRosterItem(m, type, seasonId) {
  const item = document.createElement('div');
  item.className = 'item';
  const label = type === 'player' ? `${m.number ? '#' + m.number + ' - ' : ''}${m.name}` : m.name;
  const sub = type === 'player' ? m.position || '' : m.title || '';
  const linkedName = m.memberUid ? (_rosterMembersMap[m.memberUid] || 'Unknown member') : '';
  let jvStatusHtml = '';
  if (linkedName) {
    jvStatusHtml = `<span style="display:block;color:#2e7d32;font-size:0.75rem;margin-top:2px;">🔗 Linked to: ${linkedName}</span>`;
  } else {
    const possibleMatch = _rosterMembersByName[(m.name || '').trim().toLowerCase()];
    if (possibleMatch && !_rosterUsedUids.has(possibleMatch.uid)) {
      jvStatusHtml = `<span style="display:block;color:#e65100;font-size:0.75rem;margin-top:2px;">⚠️ Account found (${possibleMatch.name}) — not linked</span>`;
    } else {
      jvStatusHtml = `<span style="display:block;color:#999;font-size:0.75rem;margin-top:2px;">No account found</span>`;
    }
  }
  const jvParentUids = Array.isArray(m.parentUids) ? m.parentUids : [];
  const jvParentNames = jvParentUids.map(uid => _rosterMembersMap[uid] || 'Unknown').filter(Boolean);
  const jvParentsHtml = (type === 'player' && jvParentNames.length)
    ? `<span style="display:block;color:#1565c0;font-size:0.75rem;margin-top:2px;">👪 Parent(s): ${jvParentNames.join(', ')}</span>` : '';
  item.innerHTML = `
    <div class="item-info"><div>
      <strong>${label}</strong>
      <span>${sub}</span>
      ${jvStatusHtml}
      ${jvParentsHtml}
    </div></div>
    <div style="display:flex;gap:0.5rem;">
      <button class="btn-secondary" style="font-size:0.75rem;padding:3px 8px;background:${m.memberUid?'white':'#c62828'};color:${m.memberUid?'#2e7d32':'white'};border-color:${m.memberUid?'#2e7d32':'#c62828'};" onclick="linkRosterMember('${seasonId}','${type==='player'?'players':'coaches'}','${m.id}','${m.memberUid||''}','jv-roster')" title="${m.memberUid?'Linked - click to change':'Not linked - click to link'}">${m.memberUid?'🔗 Linked':'Link'}</button>
      ${type === 'player' ? `<button class="btn-secondary" style="font-size:0.75rem;padding:3px 8px;" onclick='linkRosterParents("${seasonId}","players","${m.id}",${JSON.stringify(jvParentUids)},"jv-roster")'>👪 Parents${jvParentUids.length ? ' (' + jvParentUids.length + ')' : ''}</button>` : ''}
      <button class="btn-edit" onclick="editJvMember('${m.id}','${type}','${seasonId}')">Edit</button>
      <button class="btn-delete" onclick="deleteJvMember('${m.id}','${type}','${seasonId}')">Delete</button>
    </div>`;
  return item;
}

window.deleteJvMember = async (id, type, seasonId) => {
  if (!confirm('Delete this member?')) return;
  const col = type === 'player' ? 'players' : 'coaches';
  await deleteDoc(doc(db, 'jv-roster', seasonId, col, id));
  loadJvRoster(seasonId);
};

window.editJvMember = async (id, type, seasonId) => {
  const col = type === 'player' ? 'players' : 'coaches';
  const snap = await getDoc(doc(db, 'jv-roster', seasonId, col, id));
  if (!snap.exists()) return;
  window._rosterMode = 'jv';
  window._jvSaveSeasonId = seasonId;
  openRosterModal(type, snap.data());
};

// Add JV player/coach buttons
const addJvPlayerBtn = document.getElementById('addJvPlayerBtn');
if (addJvPlayerBtn) addJvPlayerBtn.addEventListener('click', () => {
  window._rosterMode = 'jv';
  window._jvSaveSeasonId = jvCurrentSeasonId;
  openRosterModal('player');
});

const addJvCoachBtn = document.getElementById('addJvCoachBtn');
if (addJvCoachBtn) addJvCoachBtn.addEventListener('click', () => {
  window._rosterMode = 'jv';
  window._jvSaveSeasonId = jvCurrentSeasonId;
  openRosterModal('coach');
});

// Load when tab clicked
const jvRosterTabBtn = document.querySelector('[data-tab="jvRoster"]');
if (jvRosterTabBtn) jvRosterTabBtn.addEventListener('click', loadJvRosterSeasons);

// ============================================
// JV SCHEDULE ADMIN
// ============================================
let jvScheduleSeasonId = null;

async function loadJvScheduleSeasons() {
  const snap = await getDocs(collection(db, 'seasons'));
  const seasons = [];
  snap.forEach(d => seasons.push({ id: d.id, ...d.data() }));
  seasons.sort((a, b) => b.label.localeCompare(a.label));
  const select = document.getElementById('jvScheduleSeasonSelect');
  if (!select) return;
  select.innerHTML = seasons.map(s => `<option value="${s.id}">${s.label}${s.current ? ' (Current)' : ''}</option>`).join('');
  const current = seasons.find(s => s.current) || seasons[0];
  if (current) {
    jvScheduleSeasonId = current.id;
    loadJvGames(current.id);
  }
  select.addEventListener('change', e => {
    jvScheduleSeasonId = e.target.value;
    loadJvGames(jvScheduleSeasonId);
  });
}

async function loadJvGames(seasonId) {
  const list = document.getElementById('jvGamesList');
  if (!list) return;
  list.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
  const snap = await getDocs(collection(db, 'jv-schedule', seasonId, 'games'));
  const games = [];
  snap.forEach(d => games.push({ id: d.id, ...d.data() }));
  if (!games.length) { list.innerHTML = '<div class="empty-state">No games added yet</div>'; return; }
  list.innerHTML = '';

  function buildJvGameItem(g) {
    const item = document.createElement('div');
    item.className = 'item';
    const d = g.date ? new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) : 'TBD';
    const isPractice = g.gameType === 'Practice';
    const score = g.played ? ` — ${g.homeScore || 0}-${g.awayScore || 0}` : '';
    const titleHtml = isPractice ? `<strong>🏒 Practice</strong>` : `<strong>vs. ${g.opponent || 'TBD'}${score}</strong>`;
    const subHtml = isPractice
      ? `${d}${g.time ? ' · ' + g.time : ''}${g.location ? ' · ' + g.location : ''}${g.notes ? ' · ' + g.notes : ''}`
      : `${d}${g.time ? ' · ' + g.time : ''}${g.location ? ' · ' + g.location : ''}${g.played ? ' · FINAL' : ' · Upcoming'}`;
    item.innerHTML = `
      <div class="item-info"><div>
        ${titleHtml}
        <span>${subHtml}</span>
      </div></div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn-edit" onclick="editJvGame('${g.id}','${seasonId}')">Edit</button>
        <button class="btn-delete" onclick="deleteJvGame('${g.id}','${seasonId}')">Delete</button>
      </div>`;
    return item;
  }

  // Split into Upcoming (not yet played + future/today practices) and Past Events
  // (played games, or practices whose date has already passed) — admin-view only,
  // purely a display convenience, does not affect the public site at all.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isPast = (g) => {
    if (g.gameType === 'Practice') return new Date(g.date + 'T12:00:00') < today;
    return !!g.played;
  };
  const upcoming = games.filter(g => !isPast(g)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const past = games.filter(isPast).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  upcoming.forEach(g => list.appendChild(buildJvGameItem(g)));

  if (past.length) {
    const pastHeader = document.createElement('div');
    pastHeader.textContent = 'Past Events';
    pastHeader.style.cssText = 'margin:1.5rem 0 0.5rem;font-weight:700;font-size:0.9rem;color:#777777;border-top:1px solid #e0e0e0;padding-top:1rem;';
    list.appendChild(pastHeader);
    past.forEach(g => list.appendChild(buildJvGameItem(g)));
  }
  } catch (err) {
    console.error('loadJvGames error:', err);
    list.innerHTML = '<div class="empty-state">Could not load games. Please try again.</div>';
  }
}

window.editJvGame = async (id, seasonId) => {
  const snap = await getDoc(doc(db, 'jv-schedule', seasonId, 'games', id));
  if (snap.exists()) openJvGameModal({ id, ...snap.data() }, seasonId);
};

window.deleteJvGame = async (id, seasonId) => {
  if (!confirm('Delete this game?')) return;
  await deleteDoc(doc(db, 'jv-schedule', seasonId, 'games', id));
  loadJvGames(seasonId);
};

function toggleJvGameTypeFields() {
  const type = document.getElementById('jvGameType')?.value;
  const isPractice = type === 'Practice';
  const opponentField = document.getElementById('jvOpponentField');
  const homeField = document.getElementById('jvHomeField');
  const playedSection = document.getElementById('jvPlayedSection');
  const practiceNotesField = document.getElementById('jvPracticeNotesField');
  if (opponentField) opponentField.style.display = isPractice ? 'none' : 'block';
  if (homeField) homeField.style.display = isPractice ? 'none' : 'block';
  if (playedSection) playedSection.style.display = isPractice ? 'none' : 'block';
  if (practiceNotesField) practiceNotesField.style.display = isPractice ? 'block' : 'none';
}
document.getElementById('jvGameType')?.addEventListener('change', toggleJvGameTypeFields);

function openJvGameModal(data, seasonId) {
  const modal = document.getElementById('jvGameModal');
  if (!modal) return;
  document.getElementById('jvGameId').value = data?.id || '';
  document.getElementById('jvGameSeasonId').value = seasonId;
  document.getElementById('jvGameDate').value = data?.date || '';
  document.getElementById('jvGameTime').value = data?.time || '';
  document.getElementById('jvGameEndTime').value = data?.endTime || '';
  document.getElementById('jvGameType').value = data?.gameType || 'Game';
  document.getElementById('jvGameOpponent').value = data?.opponent || '';
  document.getElementById('jvGameLocation').value = data?.location || '';
  document.getElementById('jvGameHome').checked = data?.isHome || false;
  document.getElementById('jvGamePlayed').checked = data?.played || false;
  document.getElementById('jvGameHomeScore').value = data?.homeScore ?? '';
  document.getElementById('jvGameAwayScore').value = data?.awayScore ?? '';
  document.getElementById('jvGameScoreFields').style.display = data?.played ? 'block' : 'none';
  document.getElementById('jvGameNotes').value = data?.notes || '';
  toggleJvGameTypeFields();
  modal.classList.add('active');
}

const addJvGameBtn = document.getElementById('addJvGameBtn');
if (addJvGameBtn) addJvGameBtn.addEventListener('click', () => openJvGameModal(null, jvScheduleSeasonId));

const jvScheduleTabBtn = document.querySelector('[data-tab="jvSchedule"]');
if (jvScheduleTabBtn) jvScheduleTabBtn.addEventListener('click', loadJvScheduleSeasons);

const saveJvGameBtn = document.getElementById('saveJvGameBtn');
if (saveJvGameBtn) {
  saveJvGameBtn.addEventListener('click', async () => {
    const seasonId = document.getElementById('jvGameSeasonId').value;
    const id = document.getElementById('jvGameId').value || Date.now().toString();
    const gameType = document.getElementById('jvGameType').value;
    const isPractice = gameType === 'Practice';
    const played = isPractice ? false : document.getElementById('jvGamePlayed').checked;
    await setDoc(doc(db, 'jv-schedule', seasonId, 'games', id), {
      date: document.getElementById('jvGameDate').value,
      time: document.getElementById('jvGameTime').value,
      endTime: document.getElementById('jvGameEndTime').value || '',
      gameType,
      opponent: isPractice ? '' : document.getElementById('jvGameOpponent').value.trim(),
      location: document.getElementById('jvGameLocation').value.trim(),
      isHome: isPractice ? false : document.getElementById('jvGameHome').checked,
      played,
      homeScore: (played) ? parseInt(document.getElementById('jvGameHomeScore').value) || 0 : null,
      awayScore: (played) ? parseInt(document.getElementById('jvGameAwayScore').value) || 0 : null,
      notes: isPractice ? document.getElementById('jvGameNotes').value.trim() : '',
    }, { merge: true });
    document.getElementById('jvGameModal').classList.remove('active');
    loadJvGames(seasonId);
  });
}

// ============================================
// FOOTER QUICK LINKS
// ============================================
const FOOTER_LINK_OPTIONS = SITE_PAGES.filter(p => p.footer).map(p => ({ id: p.id, label: p.label, href: p.path }));

async function loadFooterLinks() {
  const snap = await getDoc(doc(db, 'settings', 'footerLinks'));
  const saved = snap.exists() ? (snap.data().links || []) : FOOTER_LINK_OPTIONS.map(l => l.id);
  const container = document.getElementById('footerLinksChecks');
  if (!container) return;
  container.innerHTML = FOOTER_LINK_OPTIONS.map(l => `
    <label class="captain-label" style="display:inline-flex;align-items:center;gap:0.4rem;">
      <input type="checkbox" id="fl_${l.id}" value="${l.id}" ${saved.includes(l.id) ? 'checked' : ''}> ${l.label}
    </label>`).join('');
}

const saveFooterLinksBtn = document.getElementById('saveFooterLinksBtn');
if (saveFooterLinksBtn) {
  saveFooterLinksBtn.addEventListener('click', async () => {
    const links = FOOTER_LINK_OPTIONS.filter(l => document.getElementById('fl_' + l.id)?.checked).map(l => l.id);
    await setDoc(doc(db, 'settings', 'footerLinks'), { links });
    const status = document.getElementById('footerLinksStatus');
    status.textContent = '✅ Saved!';
    setTimeout(() => { status.textContent = ''; }, 2500);
  });
}

document.querySelector('[data-tab="contactInfo"]')?.addEventListener('click', () => { loadContactInfo(); loadFooterLinks(); });
loadFooterLinks();

// ============================================
// PAGE HEROES
// ============================================
const PAGE_HERO_DEFAULTS = Object.fromEntries(
  SITE_PAGES.filter(p => p.hero).map(p => [p.id, { badge: p.heroBadge || '', title: p.heroTitle || p.label, subtitle: p.heroSubtitle || '' }])
);

let allPageHeroes = {};

function populateHeroPageSelect() {
  const select = document.getElementById('heroPageSelect');
  if (!select || select.options.length) return;
  select.innerHTML = SITE_PAGES.filter(p => p.hero).map(p => `<option value="${p.id}">${p.label}</option>`).join('');
}

async function loadPageHeroes() {
  populateHeroPageSelect();
  const snap = await getDoc(doc(db, 'settings', 'pageHeroes'));
  allPageHeroes = snap.exists() ? snap.data() : {};
  populateHeroForm(document.getElementById('heroPageSelect').value);
}

function populateHeroForm(pageId) {
  const saved = allPageHeroes[pageId] || {};
  const defaults = PAGE_HERO_DEFAULTS[pageId] || {};
  document.getElementById('heroBadge').value = saved.badge !== undefined ? saved.badge : (defaults.badge || '');
  document.getElementById('heroTitle').value = saved.title || defaults.title || '';
  document.getElementById('heroSubtitle').value = saved.subtitle || defaults.subtitle || '';
  const badgeGroup = document.getElementById('heroBadgeGroup');
  const dynamicBadgePages = ['roster','schedule','stats','tryouts'];
  if (badgeGroup) badgeGroup.style.display = dynamicBadgePages.includes(pageId) ? 'none' : '';
}

const heroPageSelect = document.getElementById('heroPageSelect');
if (heroPageSelect) {
  heroPageSelect.addEventListener('change', e => populateHeroForm(e.target.value));
}

const saveHeroBtn = document.getElementById('saveHeroBtn');
if (saveHeroBtn) {
  saveHeroBtn.addEventListener('click', async () => {
    const pageId = document.getElementById('heroPageSelect').value;
    allPageHeroes[pageId] = {
      badge: document.getElementById('heroBadge').value.trim(),
      title: document.getElementById('heroTitle').value.trim(),
      subtitle: document.getElementById('heroSubtitle').value.trim(),
    };
    await setDoc(doc(db, 'settings', 'pageHeroes'), allPageHeroes);
    const status = document.getElementById('heroSaveStatus');
    status.textContent = '✅ Saved!';
    setTimeout(() => { status.textContent = ''; }, 2500);
  });
}

const pageheroesTabBtn = document.querySelector('[data-tab="pageheroes"]');
if (pageheroesTabBtn) pageheroesTabBtn.addEventListener('click', loadPageHeroes);
loadPageHeroes();

// ============================================
// TEAM EVENTS ADMIN
// ============================================
const TEAM_EVENT_ROLES = [
  { id: 'player', label: 'Player' },
  { id: 'varsity', label: 'Varsity Player' },
  { id: 'jv', label: 'JV Player' },
  { id: 'prospect', label: 'Prospect' },
  { id: 'alumni', label: 'Alumni' },
  { id: 'coach', label: 'Coach' },
  { id: 'rep', label: 'Team Rep' },
  { id: 'member', label: 'Member' },
];

const teamEventModal = document.getElementById('teamEventModal');
document.getElementById('closeTeamEventModal').addEventListener('click', () => teamEventModal.classList.remove('active'));
document.getElementById('cancelTeamEventBtn').addEventListener('click', () => teamEventModal.classList.remove('active'));
teamEventModal.addEventListener('click', e => { if (e.target === teamEventModal) teamEventModal.classList.remove('active'); });

function openTeamEventModal(data = null) {
  document.getElementById('teamEventModalTitle').textContent = data ? 'Edit Team Event' : 'Add Team Event';
  document.getElementById('teamEventId').value = data?.id || '';
  document.getElementById('teamEventName').value = data?.name || '';
  document.getElementById('teamEventDate').value = data?.date || '';
  document.getElementById('teamEventTime').value = data?.time || '';
  document.getElementById('teamEventEndTime').value = data?.endTime || '';
  document.getElementById('teamEventLocation').value = data?.location || '';
  document.getElementById('teamEventDesc').value = data?.description || '';
  document.getElementById('teamEventStatus').textContent = '';
  const isPublic = data?.public !== false;
  document.getElementById('teamEventPublic').checked = isPublic;
  document.getElementById('teamEventPrivate').checked = !isPublic;

  const rolesDiv = document.getElementById('teamEventRoles');
  const selected = data?.invitedRoles || [];
  rolesDiv.innerHTML = TEAM_EVENT_ROLES.map(r => `
    <label class="captain-label" style="display:inline-flex;align-items:center;gap:0.3rem;margin-right:0.5rem;">
      <input type="checkbox" id="ter_${r.id}" value="${r.id}" ${selected.includes(r.id) ? 'checked' : ''}> ${r.label}
    </label>`).join('');

  teamEventModal.classList.add('active');
}

window.editTeamEvent = (id) => {
  const snap = window._teamEvents?.find(e => e.id === id);
  if (snap) openTeamEventModal(snap);
};

window.deleteTeamEvent = async (id) => {
  if (!confirm('Delete this team event?')) return;
  await deleteDoc(doc(db, 'teamEvents', id));
  loadTeamEventsAdmin();
};

document.getElementById('addTeamEventBtn').addEventListener('click', () => openTeamEventModal());

const teamEventSendNotifCb = document.getElementById('teamEventSendNotif');
if (teamEventSendNotifCb) {
  buildNotifRoleCheckboxes('teamEventNotifRoles');
  teamEventSendNotifCb.addEventListener('change', function() {
    document.getElementById('teamEventNotifRoles').style.display = this.checked ? 'flex' : 'none';
  });
}

document.getElementById('saveTeamEventBtn').addEventListener('click', async () => {
  const name = document.getElementById('teamEventName').value.trim();
  if (!name) { alert('Please enter an event name'); return; }
  const id = document.getElementById('teamEventId').value || Date.now().toString();
  const invitedRoles = TEAM_EVENT_ROLES.filter(r => document.getElementById('ter_' + r.id)?.checked).map(r => r.id);
  const isPublic = document.getElementById('teamEventPublic').checked;
  await setDoc(doc(db, 'teamEvents', id), {
    name,
    date: document.getElementById('teamEventDate').value,
    time: document.getElementById('teamEventTime').value,
    endTime: document.getElementById('teamEventEndTime').value || '',
    location: document.getElementById('teamEventLocation').value.trim(),
    description: document.getElementById('teamEventDesc').value.trim(),
    invitedRoles,
    public: isPublic,
    updatedAt: new Date().toISOString()
  }, { merge: true });
  document.getElementById('teamEventStatus').textContent = '✅ Saved!';

  if (document.getElementById('teamEventSendNotif')?.checked) {
    const notifRoles = Array.from(document.querySelectorAll('#teamEventNotifRoles .notifRoleCb:checked')).map(c => c.value);
    if (notifRoles.length) {
      sendRoleNotifications(notifRoles, 'New Event: ' + name, document.getElementById('teamEventLocation').value.trim() || 'Check the events page for details.', '/events');
    }
  }

  setTimeout(() => teamEventModal.classList.remove('active'), 800);
  loadTeamEventsAdmin();
});

async function loadTeamEventsAdmin() {
  const list = document.getElementById('teamEventsList');
  if (!list) return;
  list.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
  const snap = await getDocs(collection(db, 'teamEvents'));
  window._teamEvents = [];
  snap.forEach(d => window._teamEvents.push({ id: d.id, ...d.data() }));
  window._teamEvents.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!window._teamEvents.length) { list.innerHTML = '<div class="empty-state">No team events yet</div>'; return; }
  list.innerHTML = '';
  window._teamEvents.forEach(e => {
    const item = document.createElement('div');
    item.className = 'item';
    const dateStr = e.date ? new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) : 'TBD';
    const roles = (e.invitedRoles && e.invitedRoles.length) ? e.invitedRoles.join(', ') : 'none (view only)';
    item.innerHTML = `
      <div class="item-info">
        <div>
          <strong>${e.name}</strong>
          <span>${dateStr}${e.time ? ' · ' + e.time : ''}${e.location ? ' · ' + e.location : ''}</span>
          <span>${e.public !== false ? '🌐 Public' : '🔒 Private'} · RSVP: ${roles}</span>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn-edit" onclick="viewTeamEventRsvp('${e.id}')">📋 RSVPs</button>
        <button class="btn-edit" onclick="editTeamEvent('${e.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteTeamEvent('${e.id}')">Delete</button>
      </div>`;
    list.appendChild(item);
  });
  } catch (err) {
    console.error('loadTeamEventsAdmin error:', err);
    list.innerHTML = '<div class="empty-state">Could not load team events. Please try again.</div>';
  }
}

document.querySelector('[data-tab="teamEvents"]').addEventListener('click', loadTeamEventsAdmin);

// ============================================
// LINEUPS TAB
// ============================================
let _lineupCurrentGame = null; // { id, seasonId, team, gameType, opponent, date }
let _lineupRosterPlayers = []; // roster players for the currently selected team+season

document.querySelector('[data-tab="lineups"]').addEventListener('click', loadLineupsTab);

async function loadLineupsTab() {
  const seasonSelect = document.getElementById('lineupSeasonSelect');
  seasonSelect.innerHTML = '<option value="">Loading seasons...</option>';
  try {
    const snap = await getDocs(collection(db, 'seasons'));
    const seasons = [];
    snap.forEach(d => seasons.push({ id: d.id, ...d.data() }));
    seasons.sort((a, b) => (b.label || '').localeCompare(a.label || ''));
    seasonSelect.innerHTML = seasons.map(s => `<option value="${s.id}">${s.label}${s.current ? ' (Current)' : ''}</option>`).join('');
    const current = seasons.find(s => s.current) || seasons[0];
    if (current) seasonSelect.value = current.id;
  } catch (err) {
    console.error('loadLineupsTab seasons error:', err);
    seasonSelect.innerHTML = '<option value="">Could not load seasons</option>';
  }
  await loadLineupGames();
}

document.getElementById('lineupTeamSelect')?.addEventListener('change', loadLineupGames);
document.getElementById('lineupSeasonSelect')?.addEventListener('change', loadLineupGames);

async function loadLineupGames() {
  const team = document.getElementById('lineupTeamSelect').value;
  const seasonId = document.getElementById('lineupSeasonSelect').value;
  const gameSelect = document.getElementById('lineupGameSelect');
  document.getElementById('lineupBuilderArea').innerHTML = '<p style="color:#999;font-style:italic;">Select a team, season, and game above to build a lineup.</p>';
  if (!seasonId) { gameSelect.innerHTML = '<option value="">Select a season first</option>'; return; }

  gameSelect.innerHTML = '<option value="">Loading games...</option>';
  try {
    const snap = team === 'jv'
      ? await getDocs(collection(db, 'jv-schedule', seasonId, 'games'))
      : await getDocs(collection(db, 'seasons', seasonId, 'schedule'));
    const games = [];
    snap.forEach(d => {
      const g = d.data();
      if (g.gameType === 'Practice') return; // lineups are for games, not practices
      games.push({ id: d.id, ...g });
    });
    games.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (!games.length) {
      gameSelect.innerHTML = '<option value="">No games found</option>';
      return;
    }
    _lineupGamesCache = {};
    games.forEach(g => { _lineupGamesCache[g.id] = g; });
    gameSelect.innerHTML = '<option value="">Select a game...</option>' + games.map(g => {
      const d = g.date ? new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD';
      return `<option value="${g.id}">${d} vs ${g.opponent || 'TBD'}</option>`;
    }).join('');
  } catch (err) {
    console.error('loadLineupGames error:', err);
    gameSelect.innerHTML = '<option value="">Could not load games</option>';
  }
}

const LINEUP_SLOT_KEYS = [
  ...[1,2,3,4].flatMap(n => [`fwd${n}_LW`, `fwd${n}_C`, `fwd${n}_RW`]),
  ...[1,2,3].flatMap(n => [`d${n}_LD`, `d${n}_RD`]),
  'goalie_starter', 'goalie_backup'
];

let _lineupAssignments = {}; // slotKey -> playerId
let _lineupGamesCache = {}; // gameId -> { opponent, date }
let _lineupPublished = false;

function lineupDocId(team, seasonId, gameId) {
  return team + '_' + seasonId + '_' + gameId;
}

document.getElementById('lineupGameSelect')?.addEventListener('change', async () => {
  const gameId = document.getElementById('lineupGameSelect').value;
  const area = document.getElementById('lineupBuilderArea');
  if (!gameId) {
    area.innerHTML = '<p style="color:#999;font-style:italic;">Select a team, season, and game above to build a lineup.</p>';
    return;
  }
  const team = document.getElementById('lineupTeamSelect').value;
  const seasonId = document.getElementById('lineupSeasonSelect').value;
  area.innerHTML = '<div class="empty-state">Loading roster...</div>';

  try {
    const rosterSnap = team === 'jv'
      ? await getDocs(collection(db, 'jv-roster', seasonId, 'players'))
      : await getDocs(collection(db, 'roster', seasonId, 'players'));
    _lineupRosterPlayers = [];
    rosterSnap.forEach(d => _lineupRosterPlayers.push({ id: d.id, ...d.data() }));
    _lineupRosterPlayers.sort((a, b) => (parseInt(a.number) || 999) - (parseInt(b.number) || 999));

    const gameMeta = _lineupGamesCache[gameId] || {};
    _lineupCurrentGame = { id: gameId, seasonId, team, ...gameMeta };

    // Load any previously saved lineup for this exact game
    _lineupAssignments = {};
    _lineupPublished = false;
    const docId = lineupDocId(team, seasonId, gameId);
    const existingSnap = await getDoc(doc(db, 'lineups', docId));
    if (existingSnap.exists()) {
      _lineupAssignments = existingSnap.data().assignments || {};
      _lineupPublished = existingSnap.data().published === true;
    }

    renderLineupBuilder();
  } catch (err) {
    console.error('lineup roster load error:', err);
    area.innerHTML = '<div class="empty-state">Could not load roster. Please try again.</div>';
  }
});

function lineupPlayerById(id) {
  return _lineupRosterPlayers.find(p => p.id === id);
}

// Roster pool chip — draggable, shows number as the primary visual
function lineupPlayerChip(p) {
  return `<div class="lineup-player-chip" draggable="true" data-player-id="${p.id}"
    style="display:flex;align-items:center;gap:0.5rem;background:white;border:1px solid #ddd;border-radius:6px;padding:0.4rem 0.6rem;font-size:0.85rem;cursor:grab;">
    <div style="width:28px;height:28px;border-radius:50%;background:#5D1725;color:white;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:800;flex-shrink:0;">${p.number || '-'}</div>
    <span>${p.name || 'Unknown'}</span>
  </div>`;
}

// Filled slot card — big number as the primary visual, draggable to move/swap, with a remove (x) button
function lineupFilledSlot(slotKey, p) {
  return `<div class="lineup-slot lineup-slot-filled" draggable="true" data-slot-key="${slotKey}"
    style="position:relative;min-height:52px;border:2px solid #5D1725;border-radius:6px;display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.5rem;background:#fdf3f0;cursor:grab;">
    <div style="font-size:1.4rem;font-weight:800;color:#5D1725;min-width:32px;text-align:center;">${p.number || '-'}</div>
    <span style="font-size:0.82rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name || 'Unknown'}</span>
    <button class="lineup-slot-remove" data-slot-key="${slotKey}" title="Remove"
      style="position:absolute;top:2px;right:2px;background:none;border:none;color:#c62828;font-size:0.9rem;font-weight:700;cursor:pointer;line-height:1;padding:2px;">✕</button>
  </div>`;
}

function lineupEmptySlot(slotKey, label) {
  return `<div class="lineup-slot" data-slot-key="${slotKey}"
    style="min-height:52px;border:2px dashed #ccc;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:0.75rem;">${label}</div>`;
}

function lineupSlotHtml(slotKey, label) {
  const playerId = _lineupAssignments[slotKey];
  const p = playerId ? lineupPlayerById(playerId) : null;
  return p ? lineupFilledSlot(slotKey, p) : lineupEmptySlot(slotKey, label);
}

function renderLineupBuilder() {
  const area = document.getElementById('lineupBuilderArea');
  const assignedIds = new Set(Object.values(_lineupAssignments).filter(Boolean));
  const availablePlayers = _lineupRosterPlayers.filter(p => !assignedIds.has(p.id));
  const poolHtml = availablePlayers.map(p => lineupPlayerChip(p)).join('');

  area.innerHTML = `
    <div style="display:grid;grid-template-columns:220px 1fr;gap:1.5rem;align-items:start;">
      <div>
        <h3 style="font-size:0.9rem;color:#5D1725;margin-bottom:0.5rem;">Available Players</h3>
        <div id="lineupRosterPool" style="display:flex;flex-direction:column;gap:0.4rem;background:#f9f9f9;border-radius:8px;padding:0.6rem;max-height:600px;overflow-y:auto;min-height:60px;">
          ${poolHtml || '<p style="color:#999;font-size:0.8rem;">All players assigned.</p>'}
        </div>
        <p style="font-size:0.72rem;color:#999;margin-top:0.5rem;">Drag a player onto a slot. Drag a filled slot back here (or click ✕) to remove.</p>
      </div>
      <div>
        <h3 style="font-size:0.9rem;color:#5D1725;margin-bottom:0.5rem;">Forwards</h3>
        ${[1,2,3,4].map(n => `
          <div style="margin-bottom:0.6rem;">
            <div style="font-size:0.75rem;color:#999;margin-bottom:0.2rem;">Line ${n}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;">
              ${lineupSlotHtml(`fwd${n}_LW`, 'LW')}${lineupSlotHtml(`fwd${n}_C`, 'C')}${lineupSlotHtml(`fwd${n}_RW`, 'RW')}
            </div>
          </div>
        `).join('')}
        <h3 style="font-size:0.9rem;color:#5D1725;margin:1rem 0 0.5rem;">Defense</h3>
        ${[1,2,3].map(n => `
          <div style="margin-bottom:0.6rem;">
            <div style="font-size:0.75rem;color:#999;margin-bottom:0.2rem;">Pair ${n}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
              ${lineupSlotHtml(`d${n}_LD`, 'LD')}${lineupSlotHtml(`d${n}_RD`, 'RD')}
            </div>
          </div>
        `).join('')}
        <h3 style="font-size:0.9rem;color:#5D1725;margin:1rem 0 0.5rem;">Goalies</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
          ${lineupSlotHtml('goalie_starter', 'Starter')}${lineupSlotHtml('goalie_backup', 'Backup')}
        </div>
        <div style="margin-top:1.5rem;display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
          <button id="saveLineupBtn" class="btn-primary">Save Lineup</button>
          <button id="previewLineupBtn" class="btn-secondary" type="button">👁️ Preview</button>
          <button id="publishLineupBtn" class="btn-secondary" type="button" style="${_lineupPublished ? 'background:#c62828;color:white;border-color:#c62828;' : 'background:#2e7d32;color:white;border-color:#2e7d32;'}">${_lineupPublished ? 'Unpublish' : 'Publish to Site'}</button>
          <span id="lineupPublishBadge" style="font-size:0.78rem;font-weight:700;color:${_lineupPublished ? '#2e7d32' : '#999'};">${_lineupPublished ? '🟢 Live on site' : '⚪ Not published'}</span>
          <span id="lineupSaveStatus" style="font-size:0.85rem;"></span>
        </div>
        <div id="lineupPreviewPanel" style="display:none;margin-top:1.5rem;padding:1.5rem;background:#eee;border-radius:10px;"></div>
      </div>
    </div>
  `;

  wireLineupDragAndDrop();
  document.getElementById('saveLineupBtn')?.addEventListener('click', saveLineup);
  document.getElementById('previewLineupBtn')?.addEventListener('click', toggleLineupPreview);
  document.getElementById('publishLineupBtn')?.addEventListener('click', toggleLineupPublish);
}

// Shared card renderer — used for the admin preview, and will be reused for the
// public site display and the shareable image export.
function buildLineupCardHtml(assignments, teamLabel, game) {
  function slotPlayerHtml(slotKey) {
    const pid = assignments[slotKey];
    const p = pid ? lineupPlayerById(pid) : null;
    if (!p) return `<div class="lc-slot lc-slot-empty"></div>`;
    return `<div class="lc-slot">
      <div class="lc-num">${p.number || '-'}</div>
      <div class="lc-name">${(p.name || '').toUpperCase()}</div>
    </div>`;
  }
  const lineRows = [1,2,3,4].map(n => `
    <div class="lc-row">${slotPlayerHtml('fwd'+n+'_LW')}${slotPlayerHtml('fwd'+n+'_C')}${slotPlayerHtml('fwd'+n+'_RW')}</div>
  `).join('');
  const dRows = [1,2,3].map(n => `
    <div class="lc-row">${slotPlayerHtml('d'+n+'_LD')}${slotPlayerHtml('d'+n+'_RD')}</div>
  `).join('');
  const gRow = `<div class="lc-row" style="max-width:66%;">${slotPlayerHtml('goalie_starter')}${slotPlayerHtml('goalie_backup')}</div>`;

  const formattedDate = game.date ? new Date(game.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const timeStr = game.time ? (() => {
    const [h, m] = game.time.split(':');
    const hr = parseInt(h);
    return (hr % 12 || 12) + ':' + m + ' ' + (hr >= 12 ? 'PM' : 'AM') + (game.timezone ? ' ' + game.timezone : '');
  })() : '';
  const locationLine = game.rinkName
    ? (game.rinkName + (game.rinkAddress ? ' · ' + game.rinkAddress : ''))
    : (game.location || '');

  return `
  <div class="lineup-card" style="background:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.15);max-width:480px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#5D1725,#3c0f17);color:white;padding:1.25rem 1rem 1rem;text-align:center;">
      <div style="display:flex;align-items:center;justify-content:center;gap:0.9rem;margin-bottom:0.6rem;">
        <div style="width:52px;height:52px;border-radius:50%;background:white;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.35);">
          <img src="/assets/images/admiral-logo.png" style="width:78%;height:78%;object-fit:contain;">
        </div>
        <div style="font-size:1rem;font-weight:900;opacity:0.7;letter-spacing:1px;">VS</div>
        <div style="width:52px;height:52px;border-radius:50%;background:white;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.35);">
          ${game.opponentLogo ? `<img src="${game.opponentLogo}" style="width:78%;height:78%;object-fit:contain;">` : `<span style="font-size:1.6rem;">🏒</span>`}
        </div>
      </div>
      <div style="font-size:0.65rem;letter-spacing:1.5px;opacity:0.7;text-transform:uppercase;margin-bottom:2px;">${teamLabel} · Game Day Lineup</div>
      <div style="font-size:1.25rem;font-weight:800;margin-bottom:5px;">Admirals vs ${game.opponent || 'TBD'}</div>
      <div style="font-size:0.8rem;opacity:0.9;font-weight:600;">${formattedDate}${timeStr ? ' · ' + timeStr : ''}</div>
      ${locationLine ? `<div style="font-size:0.73rem;opacity:0.75;margin-top:3px;">📍 ${locationLine}</div>` : ''}
    </div>
    <div style="padding:1rem;">
      <div style="font-size:0.75rem;font-weight:700;color:#5D1725;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #5D1725;padding-bottom:0.25rem;margin-bottom:0.5rem;">Forwards</div>
      ${lineRows}
      <div style="font-size:0.75rem;font-weight:700;color:#5D1725;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #5D1725;padding-bottom:0.25rem;margin:0.75rem 0 0.5rem;">Defense</div>
      ${dRows}
      <div style="font-size:0.75rem;font-weight:700;color:#5D1725;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #5D1725;padding-bottom:0.25rem;margin:0.75rem 0 0.5rem;">Goalies</div>
      ${gRow}
    </div>
  </div>
  <style>
    .lc-row { display:flex; gap:0.4rem; margin-bottom:0.4rem; }
    .lc-slot { flex:1; display:flex; flex-direction:column; align-items:center; background:#f5f5f5; border-radius:6px; padding:0.4rem 0.2rem; min-height:52px; justify-content:center; }
    .lc-slot-empty { background:#fafafa; }
    .lc-num { font-size:1.3rem; font-weight:900; color:#5D1725; line-height:1; }
    .lc-name { font-size:0.62rem; font-weight:700; color:#333; text-align:center; margin-top:2px; line-height:1.1; }
  </style>`;
}

function toggleLineupPreview() {
  const panel = document.getElementById('lineupPreviewPanel');
  if (!panel) return;
  if (panel.style.display === 'none') {
    const teamLabel = _lineupCurrentGame.team === 'jv' ? 'JV' : 'Varsity';
    panel.innerHTML = buildLineupCardHtml(_lineupAssignments, teamLabel, _lineupCurrentGame);
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}

async function toggleLineupPublish() {
  if (!_lineupCurrentGame) return;
  const status = document.getElementById('lineupSaveStatus');
  try {
    const { team, seasonId, id: gameId } = _lineupCurrentGame;
    const docId = lineupDocId(team, seasonId, gameId);
    const newPublished = !_lineupPublished;
    await setDoc(doc(db, 'lineups', docId), {
      team, seasonId, gameId,
      assignments: _lineupAssignments,
      published: newPublished,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    _lineupPublished = newPublished;
    renderLineupBuilder();
    status.textContent = newPublished ? '✅ Published to site!' : 'Unpublished.';
    status.style.color = newPublished ? 'green' : '#666';
    setTimeout(() => { if (status) status.textContent = ''; }, 2500);
  } catch (err) {
    console.error('toggleLineupPublish error:', err);
    if (status) { status.textContent = 'Error — please try again.'; status.style.color = '#c62828'; }
  }
}

function wireLineupDragAndDrop() {
  // Draggable sources: pool chips and filled slots
  document.querySelectorAll('.lineup-player-chip[draggable="true"]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ playerId: el.dataset.playerId, fromSlot: null }));
    });
  });
  document.querySelectorAll('.lineup-slot-filled[draggable="true"]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      const slotKey = el.dataset.slotKey;
      const playerId = _lineupAssignments[slotKey];
      e.dataTransfer.setData('text/plain', JSON.stringify({ playerId, fromSlot: slotKey }));
    });
  });

  // Drop targets: every slot (empty or filled)
  document.querySelectorAll('.lineup-slot').forEach(el => {
    el.addEventListener('dragover', (e) => { e.preventDefault(); });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      let data;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
      if (!data || !data.playerId) return;
      const targetSlot = el.dataset.slotKey;

      // Clear the player's previous slot (if they were already assigned elsewhere)
      if (data.fromSlot) delete _lineupAssignments[data.fromSlot];
      Object.keys(_lineupAssignments).forEach(k => {
        if (_lineupAssignments[k] === data.playerId && k !== targetSlot) delete _lineupAssignments[k];
      });

      // Whoever was previously in the target slot goes back to the pool
      _lineupAssignments[targetSlot] = data.playerId;
      renderLineupBuilder();
    });
  });

  // Drop target: the pool itself (dragging a filled slot back here removes the assignment)
  const pool = document.getElementById('lineupRosterPool');
  if (pool) {
    pool.addEventListener('dragover', (e) => { e.preventDefault(); });
    pool.addEventListener('drop', (e) => {
      e.preventDefault();
      let data;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
      if (data && data.fromSlot) {
        delete _lineupAssignments[data.fromSlot];
        renderLineupBuilder();
      }
    });
  }

  // Remove (x) buttons on filled slots
  document.querySelectorAll('.lineup-slot-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slotKey = btn.dataset.slotKey;
      delete _lineupAssignments[slotKey];
      renderLineupBuilder();
    });
  });
}

async function saveLineup() {
  if (!_lineupCurrentGame) return;
  const status = document.getElementById('lineupSaveStatus');
  status.textContent = 'Saving...';
  status.style.color = '#666';
  try {
    const { team, seasonId, id: gameId } = _lineupCurrentGame;
    const docId = lineupDocId(team, seasonId, gameId);
    await setDoc(doc(db, 'lineups', docId), {
      team, seasonId, gameId,
      assignments: _lineupAssignments,
      published: _lineupPublished,
      updatedAt: new Date().toISOString()
    });
    status.textContent = '✅ Saved!';
    status.style.color = 'green';
    setTimeout(() => { if (status) status.textContent = ''; }, 2000);
  } catch (err) {
    console.error('saveLineup error:', err);
    status.textContent = 'Error saving. Please try again.';
    status.style.color = '#c62828';
  }
}
loadTeamEventsAdmin();

// ============================================
// CHAT CHANNELS
// ============================================
const CHAT_ROLES = [
  { id: 'player',     label: 'Player' },
  { id: 'varsity',    label: 'Varsity Player' },
  { id: 'jv',         label: 'JV Player' },
  { id: 'prospect',   label: 'Prospect' },
  { id: 'alumni',     label: 'Alumni' },
  { id: 'coach',      label: 'Coach' },
  { id: 'rep',        label: 'Team Rep' },
  { id: 'member',     label: 'Member' },
  { id: 'admin',      label: 'Admin' },
  { id: 'superadmin', label: 'Superadmin' },
];

let ADMIN_CHANNELS = [];

function renderRoleCheckboxes(containerId, prefix, selected) {
  const container = document.getElementById(containerId);
  container.innerHTML = CHAT_ROLES.map(r => `
    <label class="captain-label" style="margin-right:1rem;display:inline-flex;align-items:center;gap:0.3rem;">
      <input type="checkbox" id="${prefix}_${r.id}" ${selected.includes(r.id) ? 'checked' : ''}> ${r.label}
    </label>
  `).join('');
}

function getCheckedRoles(prefix) {
  return CHAT_ROLES.filter(r => document.getElementById(`${prefix}_${r.id}`).checked).map(r => r.id);
}

const channelModal = document.getElementById('channelModal');
document.getElementById('closeChannelModal').addEventListener('click', () => channelModal.classList.remove('active'));
document.getElementById('cancelChannelBtn').addEventListener('click', () => channelModal.classList.remove('active'));
channelModal.addEventListener('click', e => { if (e.target === channelModal) channelModal.classList.remove('active'); });

function openChannelModal(data = null) {
  document.getElementById('channelModalTitle').textContent = data ? 'Edit Channel' : 'Add Channel';
  document.getElementById('channelId').value = data?.id || '';
  document.getElementById('channelName').value = data?.name || '';
  document.getElementById('channelIcon').value = data?.icon || '💬';
  document.getElementById('channelDesc').value = data?.desc || '';
  document.getElementById('channelOrder').value = (data?.order !== undefined && data?.order !== null) ? data.order : '';
  const defaultRoles = ['player', 'alumni', 'rep', 'admin', 'superadmin'];
  renderRoleCheckboxes('channelReadRoles', 'chRead', data?.readRoles || defaultRoles);
  renderRoleCheckboxes('channelWriteRoles', 'chWrite', data?.writeRoles || defaultRoles);
  channelModal.classList.add('active');
}
window.openChannelModal = openChannelModal;

window.editChannel = (id) => {
  const c = ADMIN_CHANNELS.find(x => x.id === id);
  if (c) openChannelModal(c);
};

window.deleteChannel = async (id) => {
  if (!confirm('Delete this channel? Existing messages will remain but the channel will no longer be selectable.')) return;
  await deleteDoc(doc(db, 'chatChannels', id));
  loadChannelsAdmin();
};

document.getElementById('addChannelBtn').addEventListener('click', () => openChannelModal());

document.getElementById('saveChannelBtn').addEventListener('click', async () => {
  const name = document.getElementById('channelName').value.trim();
  if (!name) { alert('Please enter a channel name'); return; }
  const existingId = document.getElementById('channelId').value;
  const id = existingId || name.toLowerCase().replace(/^#/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || ('channel-' + Date.now());
  const data = {
    name,
    icon: document.getElementById('channelIcon').value.trim() || '💬',
    desc: document.getElementById('channelDesc').value.trim(),
    order: parseInt(document.getElementById('channelOrder').value) || 99,
    readRoles: getCheckedRoles('chRead'),
    writeRoles: getCheckedRoles('chWrite'),
  };
  await setDoc(doc(db, 'chatChannels', id), data, { merge: true });
  channelModal.classList.remove('active');
  loadChannelsAdmin();
});

async function loadChannelsAdmin() {
  const list = document.getElementById('channelsList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'chatChannels'));
  ADMIN_CHANNELS = [];
  snap.forEach(d => ADMIN_CHANNELS.push({ id: d.id, ...d.data() }));
  ADMIN_CHANNELS.sort((a, b) => (a.order || 99) - (b.order || 99));
  if (!ADMIN_CHANNELS.length) {
    list.innerHTML = '<div class="empty-state">No channels yet - the site shows a default #general channel until you add one</div>';
    return;
  }
  ADMIN_CHANNELS.forEach(c => {
    const item = document.createElement('div');
    item.className = 'item';
    const readLabels = (c.readRoles || []).join(', ') || 'none';
    const writeLabels = (c.writeRoles || []).join(', ') || 'none';
    item.innerHTML = `
      <div class="item-info">
        <div><strong>${c.icon || ''} ${c.name}</strong><span>${c.desc || ''} — Read: ${readLabels} | Post: ${writeLabels}</span></div>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn-edit" onclick="editChannel('${c.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteChannel('${c.id}')">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });
}

document.querySelector('[data-tab="chat"]').addEventListener('click', loadChannelsAdmin);

});