import { showFramer } from '/assets/js/image-framer.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

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

// ============================================
// AUTH
// ============================================
const users = JSON.parse(localStorage.getItem('admirals_users')) || { admin: { password: 'admin', email: 'coachberry03@gmail.com' } };
let currentUser = localStorage.getItem('admirals_currentUser');
function saveUsers() { localStorage.setItem('admirals_users', JSON.stringify(users)); }

document.getElementById('loginForm').addEventListener('submit', e => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  if (users[username] && users[username].password === password) {
    currentUser = username;
    localStorage.setItem('admirals_currentUser', username);
    showDashboard();
  } else {
    document.getElementById('loginError').textContent = 'Invalid username or password';
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('admirals_currentUser');
  location.reload();
});

document.getElementById('signupForm').addEventListener('submit', e => {
  e.preventDefault();
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupConfirm').value;
  if (password !== confirm) { document.getElementById('signupError').textContent = 'Passwords do not match'; return; }
  const username = email.split('@')[0];
  users[username] = { password, email };
  saveUsers();
  currentUser = username;
  localStorage.setItem('admirals_currentUser', username);
  document.getElementById('signupScreen').style.display = 'none';
  showDashboard();
});

const params = new URLSearchParams(window.location.search);
const inviteToken = params.get('invite');
if (inviteToken) {
  const invites = JSON.parse(localStorage.getItem('admirals_invites')) || {};
  if (invites[inviteToken] && !invites[inviteToken].used) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('signupScreen').style.display = 'flex';
    document.getElementById('signupEmail').value = invites[inviteToken].email;
  }
}

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('currentUser').textContent = currentUser;
  document.getElementById('settingsUsername').textContent = currentUser;
  document.getElementById('settingsEmail').value = users[currentUser]?.email || '';
  loadPlayers(); loadCoaches(); loadBoardMembers();
  loadSchedule(); loadStats(); loadNews(); loadUsers();
}

if (currentUser) showDashboard();

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
  });
});

// ============================================
// ROSTER MODAL
// ============================================
let croppedPhoto = null;
let currentPhotoURL = null;

const rosterModal = document.getElementById('rosterModal');
const closeRosterModal = document.getElementById('closeRosterModal');
closeRosterModal.addEventListener('click', () => rosterModal.classList.remove('active'));
rosterModal.addEventListener('click', e => { if (e.target === rosterModal) rosterModal.classList.remove('active'); });
document.getElementById('cancelMemberBtn').addEventListener('click', () => rosterModal.classList.remove('active'));

function openRosterModal(type, data = null) {
  // Reset
  croppedPhoto = null;
  currentPhotoURL = data?.photoURL || null;
  document.getElementById('memberId').value = data?.id || '';
  document.getElementById('memberType').value = type;
  document.getElementById('memberBio').value = data?.bio || '';
  // Hide bio for players, show for coaches and board members
  document.getElementById('bioPart').style.display = type === 'player' ? 'none' : 'block';
  document.getElementById('memberCaptain').checked = data?.captain || false;
  document.getElementById('memberAlternate').checked = data?.alternate || false;
  document.getElementById('memberPhoto').value = '';
  document.getElementById('memberSaveStatus').textContent = '';

  // Show correct fields
  const isPlayer = type === 'player';
  document.getElementById('playerFields').style.display = isPlayer ? 'block' : 'none';
  document.getElementById('staffFields').style.display = isPlayer ? 'none' : 'block';

  if (isPlayer) {
    document.getElementById('memberName').value = data?.name || '';
    document.getElementById('memberNumber').value = data?.number || '';
    document.getElementById('memberPosition').value = data?.position || '';
    document.getElementById('memberGrade').value = data?.grade || '';
  } else {
    document.getElementById('memberNameStaff').value = data?.name || '';
    document.getElementById('memberTitle').value = data?.title || '';
  }

  // Title
  const titles = { player: 'Player', coach: 'Coach', board: 'Board Member' };
  document.getElementById('rosterModalTitle').textContent = (data ? 'Edit' : 'Add') + ' ' + titles[type];

  // Photo preview
  const preview = document.getElementById('memberPhotoPreview');
  if (currentPhotoURL) {
    // Show existing photo (Firebase URL) in confirmed state
    showPhotoConfirmed(currentPhotoURL, preview);
  } else {
    showEmptyPhotoState(preview);
  }

  rosterModal.classList.add('active');
}

// Photo upload with framer
// memberPhoto input is hidden - we use triggerPhotoPicker() instead
document.getElementById('memberPhoto').style.display = 'none';



function triggerPhotoPicker(container) {
  // Create a fresh file input each time to avoid browser caching issues
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,.heic,.heif,.HEIC,.HEIF';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', function() {
    const file = this.files[0];
    document.body.removeChild(input);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const src = e.target.result;
      showFramer(src, container, (dataURL) => {
        croppedPhoto = dataURL;
        currentPhotoURL = null;
        showPhotoConfirmed(dataURL, container);
      });
    };
    reader.readAsDataURL(file);
  });
  input.click();
}

function showEmptyPhotoState(container) {
  container.innerHTML = `
    <div class="photo-preview-layout">
      <div class="photo-preview-frame photo-preview-empty">
        <span>No Image</span>
      </div>
      <div class="photo-preview-buttons">
        <button type="button" class="btn-secondary photo-btn" id="photoPickerBtn">Choose File</button>
      </div>
    </div>
  `;
  document.getElementById('photoPickerBtn').addEventListener('click', () => {
    triggerPhotoPicker(container);
  });
}

function showPhotoConfirmed(dataURL, container, originalSrc = null) {
  container.innerHTML = `
    <div class="photo-preview-layout">
      <div class="photo-preview-frame">
        <img src="${dataURL}" class="photo-preview-img">
      </div>
      <div class="photo-preview-buttons">
        ${originalSrc ? `<button type="button" id="reframeBtn" class="btn-secondary photo-btn">Change Photo</button>` : `<button type="button" id="reframeBtn" class="btn-secondary photo-btn">Change Photo</button>`}
        <button type="button" id="removePhotoBtn" class="btn-delete photo-btn">Remove Photo</button>
      </div>
    </div>
  `;

  if (originalSrc) {
    document.getElementById('reframeBtn')?.addEventListener('click', () => {
    if (originalSrc) {
      showFramer(originalSrc, container, (dataURL) => {
        croppedPhoto = dataURL;
        currentPhotoURL = null;
        showPhotoConfirmed(dataURL, container, originalSrc);
      });
    } else {
      // Trigger file input
      document.getElementById('memberPhoto').click();
    }
  });
  }

  document.getElementById('removePhotoBtn').addEventListener('click', () => {
    croppedPhoto = null;
    currentPhotoURL = null;
    document.getElementById('memberPhoto').value = '';
    showEmptyPhotoState(container);
  });
}

// Save member
document.getElementById('saveMemberBtn').addEventListener('click', async () => {
  const id = document.getElementById('memberId').value || Date.now().toString();
  const type = document.getElementById('memberType').value;
  const status = document.getElementById('memberSaveStatus');
  status.textContent = 'Saving...';
  status.style.color = '#666';

  let photoURL = currentPhotoURL || '';

  // Upload cropped photo if new one selected
  if (croppedPhoto) {
    try {
      const storageRef = ref(storage, `roster/${type}/${id}`);
      await uploadString(storageRef, croppedPhoto, 'data_url');
      photoURL = await getDownloadURL(storageRef);
    } catch (e) {
      console.error('Photo upload failed:', e);
    }
  }

  // Build member object
  const isPlayer = type === 'player';
  const member = {
    id, type,
    name: isPlayer ? document.getElementById('memberName').value : document.getElementById('memberNameStaff').value,
    bio: document.getElementById('memberBio').value,
    photoURL
  };

  if (isPlayer) {
    member.number = document.getElementById('memberNumber').value;
    member.position = document.getElementById('memberPosition').value;
    member.grade = document.getElementById('memberGrade').value;
    member.captain = document.getElementById('memberCaptain').checked;
    member.alternate = document.getElementById('memberAlternate').checked;
  } else {
    member.title = document.getElementById('memberTitle').value;
  }

  await setDoc(doc(db, 'roster', id), member);
  status.textContent = '✅ Saved!';
  status.style.color = 'green';

  setTimeout(() => {
    rosterModal.classList.remove('active');
    loadPlayers(); loadCoaches(); loadBoardMembers();
  }, 800);
});

// Add buttons
document.getElementById('addPlayerBtn').addEventListener('click', () => openRosterModal('player'));
document.getElementById('addCoachBtn').addEventListener('click', () => openRosterModal('coach'));
document.getElementById('addBoardBtn').addEventListener('click', () => openRosterModal('board'));

// ============================================
// LOAD ROSTER
// ============================================
async function loadPlayers() {
  const list = document.getElementById('playersList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'roster'));
  const players = [];
  snap.forEach(d => { if (d.data().type === 'player') players.push(d.data()); });
  if (players.length === 0) { list.innerHTML = '<div class="empty-state">No players added yet</div>'; return; }
  players.sort((a, b) => parseInt(a.number) - parseInt(b.number)).forEach(p => {
    list.appendChild(buildRosterItem(p));
  });
}

async function loadCoaches() {
  const list = document.getElementById('coachesList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'roster'));
  const coaches = [];
  snap.forEach(d => { if (d.data().type === 'coach') coaches.push(d.data()); });
  if (coaches.length === 0) { list.innerHTML = '<div class="empty-state">No coaches added yet</div>'; return; }
  coaches.forEach(c => list.appendChild(buildRosterItem(c)));
}

async function loadBoardMembers() {
  const list = document.getElementById('boardList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'roster'));
  const members = [];
  snap.forEach(d => { if (d.data().type === 'board') members.push(d.data()); });
  if (members.length === 0) { list.innerHTML = '<div class="empty-state">No board members added yet</div>'; return; }
  members.forEach(m => list.appendChild(buildRosterItem(m)));
}

function buildRosterItem(m) {
  const item = document.createElement('div');
  item.className = 'item';
  const subtitle = m.type === 'player' ? `${m.position} | ${m.grade}` : m.title || '';
  const label = m.type === 'player' ? `#${m.number} - ${m.name}` : m.name;
  item.innerHTML = `
    <div class="item-info">
      ${m.photoURL ? `<img src="${m.photoURL}" class="item-photo">` : ''}
      <div>
        <strong>${label}</strong>
        <span>${subtitle}</span>
      </div>
    </div>
    <div>
      <button class="btn-edit" onclick="editMember('${m.id}')">Edit</button>
      <button class="btn-delete" onclick="deleteMember('${m.id}')">Delete</button>
    </div>
  `;
  return item;
}

window.editMember = async (id) => {
  const snap = await getDoc(doc(db, 'roster', id));
  if (snap.exists()) openRosterModal(snap.data().type, snap.data());
};

window.deleteMember = async (id) => {
  if (!confirm('Delete this member?')) return;
  await deleteDoc(doc(db, 'roster', id));
  try { await deleteObject(ref(storage, `roster/player/${id}`)); } catch(e) {}
  try { await deleteObject(ref(storage, `roster/coach/${id}`)); } catch(e) {}
  try { await deleteObject(ref(storage, `roster/board/${id}`)); } catch(e) {}
  loadPlayers(); loadCoaches(); loadBoardMembers();
};

// ============================================
// SCHEDULE
// ============================================
document.getElementById('addGameBtn').addEventListener('click', () => {
  ['gameId','gameDate','gameTime','gameOpponent','gameType','gameLocation'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('gameForm').style.display = 'block';
});
document.getElementById('cancelGameBtn').addEventListener('click', () => document.getElementById('gameForm').style.display = 'none');
document.getElementById('saveGameBtn').addEventListener('click', async () => {
  const id = document.getElementById('gameId').value || Date.now().toString();
  await setDoc(doc(db, 'schedule', id), { id, date: document.getElementById('gameDate').value, time: document.getElementById('gameTime').value, opponent: document.getElementById('gameOpponent').value, type: document.getElementById('gameType').value, location: document.getElementById('gameLocation').value });
  document.getElementById('gameForm').style.display = 'none';
  loadSchedule();
});

async function loadSchedule() {
  const list = document.getElementById('gamesList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'schedule'));
  const games = [];
  snap.forEach(d => games.push(d.data()));
  if (games.length === 0) { list.innerHTML = '<div class="empty-state">No games added yet</div>'; return; }
  games.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(g => {
    const dateStr = new Date(g.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `<div class="item-info"><div><strong>${dateStr} @ ${g.time} - ${g.opponent}</strong><span>${g.type} | ${g.location}</span></div></div><div><button class="btn-edit" onclick="editGame('${g.id}')">Edit</button><button class="btn-delete" onclick="deleteGame('${g.id}')">Delete</button></div>`;
    list.appendChild(item);
  });
}

window.editGame = async (id) => {
  const snap = await getDoc(doc(db, 'schedule', id));
  const g = snap.data();
  document.getElementById('gameId').value = g.id;
  document.getElementById('gameDate').value = g.date;
  document.getElementById('gameTime').value = g.time;
  document.getElementById('gameOpponent').value = g.opponent;
  document.getElementById('gameType').value = g.type;
  document.getElementById('gameLocation').value = g.location;
  document.getElementById('gameForm').style.display = 'block';
};
window.deleteGame = async (id) => { if (!confirm('Delete game?')) return; await deleteDoc(doc(db, 'schedule', id)); loadSchedule(); };

// ============================================
// STATISTICS
// ============================================
document.getElementById('saveStatsBtn').addEventListener('click', async () => {
  await setDoc(doc(db, 'stats', 'record'), { wins: parseInt(document.getElementById('wins').value) || 0, losses: parseInt(document.getElementById('losses').value) || 0, ties: parseInt(document.getElementById('ties').value) || 0 });
  alert('Stats saved!');
});

document.getElementById('addScorerBtn').addEventListener('click', () => { ['scorerId','scorerName','scorerGoals','scorerAssists'].forEach(id => document.getElementById(id).value = ''); document.getElementById('scorerForm').style.display = 'block'; });
document.getElementById('cancelScorerBtn').addEventListener('click', () => document.getElementById('scorerForm').style.display = 'none');
document.getElementById('saveScorerBtn').addEventListener('click', async () => {
  const id = document.getElementById('scorerId').value || Date.now().toString();
  await setDoc(doc(db, 'scorers', id), { id, name: document.getElementById('scorerName').value, goals: parseInt(document.getElementById('scorerGoals').value) || 0, assists: parseInt(document.getElementById('scorerAssists').value) || 0 });
  document.getElementById('scorerForm').style.display = 'none';
  loadStats();
});

document.getElementById('addGoaltenderBtn').addEventListener('click', () => { ['goaltenderId','goaltenderName','goaltenderGames','goaltenderGAA','goaltenderSave'].forEach(id => document.getElementById(id).value = ''); document.getElementById('goaltenderForm').style.display = 'block'; });
document.getElementById('cancelGoaltenderBtn').addEventListener('click', () => document.getElementById('goaltenderForm').style.display = 'none');
document.getElementById('saveGoaltenderBtn').addEventListener('click', async () => {
  const id = document.getElementById('goaltenderId').value || Date.now().toString();
  await setDoc(doc(db, 'goaltenders', id), { id, name: document.getElementById('goaltenderName').value, games: parseInt(document.getElementById('goaltenderGames').value) || 0, gaa: parseFloat(document.getElementById('goaltenderGAA').value) || 0, save: parseFloat(document.getElementById('goaltenderSave').value) || 0 });
  document.getElementById('goaltenderForm').style.display = 'none';
  loadStats();
});

async function loadStats() {
  const recordSnap = await getDoc(doc(db, 'stats', 'record'));
  if (recordSnap.exists()) { const r = recordSnap.data(); document.getElementById('wins').value = r.wins; document.getElementById('losses').value = r.losses; document.getElementById('ties').value = r.ties; }
  const scorersSnap = await getDocs(collection(db, 'scorers'));
  const scorers = []; scorersSnap.forEach(d => scorers.push(d.data()));
  const scorersList = document.getElementById('scorersList');
  scorersList.innerHTML = scorers.length === 0 ? '<div class="empty-state">No scorers added yet</div>' : '';
  scorers.sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists)).forEach(s => {
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `<div class="item-info"><div><strong>${s.name}</strong><span>${s.goals}G | ${s.assists}A | ${s.goals + s.assists}PTS</span></div></div><div><button class="btn-edit" onclick="editScorer('${s.id}')">Edit</button><button class="btn-delete" onclick="deleteScorer('${s.id}')">Delete</button></div>`;
    scorersList.appendChild(item);
  });
  const goalSnap = await getDocs(collection(db, 'goaltenders'));
  const goalies = []; goalSnap.forEach(d => goalies.push(d.data()));
  const goaliesList = document.getElementById('goaltendersList');
  goaliesList.innerHTML = goalies.length === 0 ? '<div class="empty-state">No goaltenders added yet</div>' : '';
  goalies.forEach(g => {
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `<div class="item-info"><div><strong>${g.name}</strong><span>${g.games}GP | ${g.gaa} GAA | ${g.save}% SV</span></div></div><div><button class="btn-edit" onclick="editGoaltender('${g.id}')">Edit</button><button class="btn-delete" onclick="deleteGoaltender('${g.id}')">Delete</button></div>`;
    goaliesList.appendChild(item);
  });
}

window.editScorer = async (id) => { const snap = await getDoc(doc(db, 'scorers', id)); const s = snap.data(); document.getElementById('scorerId').value = s.id; document.getElementById('scorerName').value = s.name; document.getElementById('scorerGoals').value = s.goals; document.getElementById('scorerAssists').value = s.assists; document.getElementById('scorerForm').style.display = 'block'; };
window.deleteScorer = async (id) => { if (!confirm('Delete?')) return; await deleteDoc(doc(db, 'scorers', id)); loadStats(); };
window.editGoaltender = async (id) => { const snap = await getDoc(doc(db, 'goaltenders', id)); const g = snap.data(); document.getElementById('goaltenderId').value = g.id; document.getElementById('goaltenderName').value = g.name; document.getElementById('goaltenderGames').value = g.games; document.getElementById('goaltenderGAA').value = g.gaa; document.getElementById('goaltenderSave').value = g.save; document.getElementById('goaltenderForm').style.display = 'block'; };
window.deleteGoaltender = async (id) => { if (!confirm('Delete?')) return; await deleteDoc(doc(db, 'goaltenders', id)); loadStats(); };

// ============================================
// NEWS
// ============================================
document.getElementById('addNewsBtn').addEventListener('click', () => { ['newsId','newsTitle','newsDate','newsCategory','newsContent'].forEach(id => document.getElementById(id).value = ''); document.getElementById('newsForm').style.display = 'block'; });
document.getElementById('cancelNewsBtn').addEventListener('click', () => document.getElementById('newsForm').style.display = 'none');
document.getElementById('saveNewsBtn').addEventListener('click', async () => {
  const id = document.getElementById('newsId').value || Date.now().toString();
  await setDoc(doc(db, 'news', id), { id, title: document.getElementById('newsTitle').value, date: document.getElementById('newsDate').value, category: document.getElementById('newsCategory').value, content: document.getElementById('newsContent').value });
  document.getElementById('newsForm').style.display = 'none';
  loadNews();
});

async function loadNews() {
  const list = document.getElementById('newsList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'news'));
  const posts = []; snap.forEach(d => posts.push(d.data()));
  if (posts.length === 0) { list.innerHTML = '<div class="empty-state">No posts added yet</div>'; return; }
  posts.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(n => {
    const dateStr = new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `<div class="item-info"><div><strong>${n.title}</strong><span>${n.category} | ${dateStr}</span></div></div><div><button class="btn-edit" onclick="editNews('${n.id}')">Edit</button><button class="btn-delete" onclick="deleteNews('${n.id}')">Delete</button></div>`;
    list.appendChild(item);
  });
}

window.editNews = async (id) => { const snap = await getDoc(doc(db, 'news', id)); const n = snap.data(); document.getElementById('newsId').value = n.id; document.getElementById('newsTitle').value = n.title; document.getElementById('newsDate').value = n.date; document.getElementById('newsCategory').value = n.category; document.getElementById('newsContent').value = n.content; document.getElementById('newsForm').style.display = 'block'; };
window.deleteNews = async (id) => { if (!confirm('Delete post?')) return; await deleteDoc(doc(db, 'news', id)); loadNews(); };

// ============================================
// USERS
// ============================================
document.getElementById('inviteUserBtn').addEventListener('click', () => document.getElementById('inviteForm').style.display = 'block');
document.getElementById('cancelInviteBtn').addEventListener('click', () => document.getElementById('inviteForm').style.display = 'none');
document.getElementById('generateInviteBtn').addEventListener('click', () => {
  const email = document.getElementById('inviteEmail').value;
  if (!email) { alert('Please enter an email'); return; }
  const token = Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  const invites = JSON.parse(localStorage.getItem('admirals_invites')) || {};
  invites[token] = { email, used: false };
  localStorage.setItem('admirals_invites', JSON.stringify(invites));
  document.getElementById('inviteLink').value = `${window.location.origin}/admin.html?invite=${token}`;
  document.getElementById('inviteForm').style.display = 'none';
  document.getElementById('inviteResult').style.display = 'block';
});
document.getElementById('copyLinkBtn').addEventListener('click', () => { document.getElementById('inviteLink').select(); document.execCommand('copy'); alert('Link copied!'); });

function loadUsers() {
  const list = document.getElementById('usersList');
  list.innerHTML = '';
  Object.entries(users).forEach(([username, info]) => {
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `<div class="item-info"><div><strong>${username}</strong><span>${info.email || ''}</span></div></div><div>${username !== 'admin' ? `<button class="btn-delete" onclick="deleteUser('${username}')">Remove</button>` : '<span style="font-size:0.8rem;color:#999;">Master Admin</span>'}</div>`;
    list.appendChild(item);
  });
}
window.deleteUser = (username) => { if (!confirm('Remove user?')) return; delete users[username]; saveUsers(); loadUsers(); };

// ============================================
// SETTINGS
// ============================================
document.getElementById('updateEmailBtn').addEventListener('click', () => {
  const email = document.getElementById('settingsEmail').value;
  if (!email) return;
  users[currentUser].email = email; saveUsers();
  document.getElementById('settingsMsg').textContent = '✅ Email updated!';
  document.getElementById('settingsMsg').style.color = 'green';
});
document.getElementById('updatePasswordBtn').addEventListener('click', () => {
  const current = document.getElementById('currentPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;
  const msg = document.getElementById('settingsMsg');
  if (users[currentUser].password !== current) { msg.textContent = '❌ Current password incorrect'; msg.style.color = 'red'; return; }
  if (newPwd !== confirm) { msg.textContent = '❌ Passwords do not match'; msg.style.color = 'red'; return; }
  users[currentUser].password = newPwd; saveUsers();
  ['currentPassword','newPassword','confirmPassword'].forEach(id => document.getElementById(id).value = '');
  msg.textContent = '✅ Password updated!'; msg.style.color = 'green';
});
