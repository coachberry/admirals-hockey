import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

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
// AUTH (localStorage for simple login)
// ============================================
const users = JSON.parse(localStorage.getItem('admirals_users')) || { admin: { password: 'admin', email: 'coachberry03@gmail.com' } };
let currentUser = localStorage.getItem('admirals_currentUser');

function saveUsers() { localStorage.setItem('admirals_users', JSON.stringify(users)); }

// ============================================
// LOGIN
// ============================================
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
  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite');
  if (token) {
    const invites = JSON.parse(localStorage.getItem('admirals_invites')) || {};
    if (invites[token]) { invites[token].used = true; localStorage.setItem('admirals_invites', JSON.stringify(invites)); }
  }
  saveUsers();
  currentUser = username;
  localStorage.setItem('admirals_currentUser', username);
  document.getElementById('signupScreen').style.display = 'none';
  showDashboard();
});

// Check invite
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
  loadPlayers();
  loadCoaches();
  loadBoardMembers();
  loadSchedule();
  loadStats();
  loadNews();
  loadUsers();
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
// PHOTO UPLOAD HELPER
// ============================================
async function uploadPhoto(file, path) {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

function previewPhoto(inputId, previewId) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => { preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`; };
      reader.readAsDataURL(file);
    }
  });
}

previewPhoto('playerPhoto', 'playerPhotoPreview');
previewPhoto('coachPhoto', 'coachPhotoPreview');
previewPhoto('boardPhoto', 'boardPhotoPreview');

// ============================================
// PLAYERS
// ============================================
document.getElementById('addPlayerBtn').addEventListener('click', () => {
  clearForm(['playerId','playerName','playerNumber','playerPosition','playerGrade','playerBio']);
  document.getElementById('playerPhotoPreview').innerHTML = '';
  document.getElementById('playerPhoto').value = '';
  document.getElementById('playerForm').style.display = 'block';
  document.getElementById('coachForm').style.display = 'none';
  document.getElementById('boardForm').style.display = 'none';
});
document.getElementById('cancelPlayerBtn').addEventListener('click', () => document.getElementById('playerForm').style.display = 'none');

document.getElementById('savePlayerBtn').addEventListener('click', async () => {
  const id = document.getElementById('playerId').value || Date.now().toString();
  const status = document.getElementById('playerSaveStatus');
  status.textContent = 'Saving...';

  let photoURL = '';
  const photoFile = document.getElementById('playerPhoto').files[0];
  if (photoFile) photoURL = await uploadPhoto(photoFile, `roster/players/${id}`);

  const player = {
    id,
    type: 'player',
    name: document.getElementById('playerName').value,
    number: document.getElementById('playerNumber').value,
    position: document.getElementById('playerPosition').value,
    grade: document.getElementById('playerGrade').value,
    bio: document.getElementById('playerBio').value,
    photoURL: photoURL || document.getElementById('playerPhotoPreview').querySelector('img')?.src || ''
  };

  await setDoc(doc(db, 'roster', id), player);
  status.textContent = '✅ Saved!';
  document.getElementById('playerForm').style.display = 'none';
  loadPlayers();
});

async function loadPlayers() {
  const list = document.getElementById('playersList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'roster'));
  const players = [];
  snap.forEach(d => { if (d.data().type === 'player') players.push(d.data()); });

  if (players.length === 0) { list.innerHTML = '<div class="empty-state">No players added yet</div>'; return; }

  players.sort((a, b) => parseInt(a.number) - parseInt(b.number)).forEach(p => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <div class="item-info">
        ${p.photoURL ? `<img src="${p.photoURL}" class="item-photo">` : ''}
        <div>
          <strong>#${p.number} - ${p.name}</strong>
          <span>${p.position} | ${p.grade}</span>
        </div>
      </div>
      <div>
        <button class="btn-edit" onclick="editPlayer('${p.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteRosterMember('${p.id}', 'players')">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });
}

window.editPlayer = async (id) => {
  const snap = await getDoc(doc(db, 'roster', id));
  const p = snap.data();
  document.getElementById('playerId').value = p.id;
  document.getElementById('playerName').value = p.name;
  document.getElementById('playerNumber').value = p.number;
  document.getElementById('playerPosition').value = p.position;
  document.getElementById('playerGrade').value = p.grade;
  document.getElementById('playerBio').value = p.bio || '';
  if (p.photoURL) document.getElementById('playerPhotoPreview').innerHTML = `<img src="${p.photoURL}" alt="Photo">`;
  document.getElementById('playerForm').style.display = 'block';
};

// ============================================
// COACHES
// ============================================
document.getElementById('addCoachBtn').addEventListener('click', () => {
  clearForm(['coachId','coachName','coachTitle','coachBio']);
  document.getElementById('coachPhotoPreview').innerHTML = '';
  document.getElementById('coachPhoto').value = '';
  document.getElementById('coachForm').style.display = 'block';
  document.getElementById('playerForm').style.display = 'none';
  document.getElementById('boardForm').style.display = 'none';
});
document.getElementById('cancelCoachBtn').addEventListener('click', () => document.getElementById('coachForm').style.display = 'none');

document.getElementById('saveCoachBtn').addEventListener('click', async () => {
  const id = document.getElementById('coachId').value || Date.now().toString();
  const status = document.getElementById('coachSaveStatus');
  status.textContent = 'Saving...';

  let photoURL = '';
  const photoFile = document.getElementById('coachPhoto').files[0];
  if (photoFile) photoURL = await uploadPhoto(photoFile, `roster/coaches/${id}`);

  const coach = {
    id,
    type: 'coach',
    name: document.getElementById('coachName').value,
    title: document.getElementById('coachTitle').value,
    bio: document.getElementById('coachBio').value,
    photoURL: photoURL || document.getElementById('coachPhotoPreview').querySelector('img')?.src || ''
  };

  await setDoc(doc(db, 'roster', id), coach);
  status.textContent = '✅ Saved!';
  document.getElementById('coachForm').style.display = 'none';
  loadCoaches();
});

async function loadCoaches() {
  const list = document.getElementById('coachesList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'roster'));
  const coaches = [];
  snap.forEach(d => { if (d.data().type === 'coach') coaches.push(d.data()); });

  if (coaches.length === 0) { list.innerHTML = '<div class="empty-state">No coaches added yet</div>'; return; }

  coaches.forEach(c => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <div class="item-info">
        ${c.photoURL ? `<img src="${c.photoURL}" class="item-photo">` : ''}
        <div>
          <strong>${c.name}</strong>
          <span>${c.title}</span>
        </div>
      </div>
      <div>
        <button class="btn-edit" onclick="editCoach('${c.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteRosterMember('${c.id}', 'coaches')">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });
}

window.editCoach = async (id) => {
  const snap = await getDoc(doc(db, 'roster', id));
  const c = snap.data();
  document.getElementById('coachId').value = c.id;
  document.getElementById('coachName').value = c.name;
  document.getElementById('coachTitle').value = c.title || '';
  document.getElementById('coachBio').value = c.bio || '';
  if (c.photoURL) document.getElementById('coachPhotoPreview').innerHTML = `<img src="${c.photoURL}" alt="Photo">`;
  document.getElementById('coachForm').style.display = 'block';
};

// ============================================
// BOARD MEMBERS
// ============================================
document.getElementById('addBoardBtn').addEventListener('click', () => {
  clearForm(['boardId','boardName','boardTitle','boardBio']);
  document.getElementById('boardPhotoPreview').innerHTML = '';
  document.getElementById('boardPhoto').value = '';
  document.getElementById('boardForm').style.display = 'block';
  document.getElementById('playerForm').style.display = 'none';
  document.getElementById('coachForm').style.display = 'none';
});
document.getElementById('cancelBoardBtn').addEventListener('click', () => document.getElementById('boardForm').style.display = 'none');

document.getElementById('saveBoardBtn').addEventListener('click', async () => {
  const id = document.getElementById('boardId').value || Date.now().toString();
  const status = document.getElementById('boardSaveStatus');
  status.textContent = 'Saving...';

  let photoURL = '';
  const photoFile = document.getElementById('boardPhoto').files[0];
  if (photoFile) photoURL = await uploadPhoto(photoFile, `roster/board/${id}`);

  const member = {
    id,
    type: 'board',
    name: document.getElementById('boardName').value,
    title: document.getElementById('boardTitle').value,
    bio: document.getElementById('boardBio').value,
    photoURL: photoURL || document.getElementById('boardPhotoPreview').querySelector('img')?.src || ''
  };

  await setDoc(doc(db, 'roster', id), member);
  status.textContent = '✅ Saved!';
  document.getElementById('boardForm').style.display = 'none';
  loadBoardMembers();
});

async function loadBoardMembers() {
  const list = document.getElementById('boardList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'roster'));
  const members = [];
  snap.forEach(d => { if (d.data().type === 'board') members.push(d.data()); });

  if (members.length === 0) { list.innerHTML = '<div class="empty-state">No board members added yet</div>'; return; }

  members.forEach(m => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <div class="item-info">
        ${m.photoURL ? `<img src="${m.photoURL}" class="item-photo">` : ''}
        <div>
          <strong>${m.name}</strong>
          <span>${m.title}</span>
        </div>
      </div>
      <div>
        <button class="btn-edit" onclick="editBoard('${m.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteRosterMember('${m.id}', 'board')">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });
}

window.editBoard = async (id) => {
  const snap = await getDoc(doc(db, 'roster', id));
  const m = snap.data();
  document.getElementById('boardId').value = m.id;
  document.getElementById('boardName').value = m.name;
  document.getElementById('boardTitle').value = m.title || '';
  document.getElementById('boardBio').value = m.bio || '';
  if (m.photoURL) document.getElementById('boardPhotoPreview').innerHTML = `<img src="${m.photoURL}" alt="Photo">`;
  document.getElementById('boardForm').style.display = 'block';
};

window.deleteRosterMember = async (id, type) => {
  if (!confirm('Delete this member?')) return;
  await deleteDoc(doc(db, 'roster', id));
  try { await deleteObject(ref(storage, `roster/${type}/${id}`)); } catch(e) {}
  loadPlayers(); loadCoaches(); loadBoardMembers();
};

// ============================================
// SCHEDULE
// ============================================
document.getElementById('addGameBtn').addEventListener('click', () => {
  clearForm(['gameId','gameDate','gameTime','gameOpponent','gameType','gameLocation']);
  document.getElementById('gameForm').style.display = 'block';
});
document.getElementById('cancelGameBtn').addEventListener('click', () => document.getElementById('gameForm').style.display = 'none');

document.getElementById('saveGameBtn').addEventListener('click', async () => {
  const id = document.getElementById('gameId').value || Date.now().toString();
  const game = {
    id,
    date: document.getElementById('gameDate').value,
    time: document.getElementById('gameTime').value,
    opponent: document.getElementById('gameOpponent').value,
    type: document.getElementById('gameType').value,
    location: document.getElementById('gameLocation').value
  };
  await setDoc(doc(db, 'schedule', id), game);
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
    item.innerHTML = `
      <div class="item-info"><div><strong>${dateStr} @ ${g.time} - ${g.opponent}</strong><span>${g.type} | ${g.location}</span></div></div>
      <div>
        <button class="btn-edit" onclick="editGame('${g.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteGame('${g.id}')">Delete</button>
      </div>
    `;
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

window.deleteGame = async (id) => {
  if (!confirm('Delete this game?')) return;
  await deleteDoc(doc(db, 'schedule', id));
  loadSchedule();
};

// ============================================
// STATISTICS
// ============================================
document.getElementById('saveStatsBtn').addEventListener('click', async () => {
  const stats = {
    wins: parseInt(document.getElementById('wins').value) || 0,
    losses: parseInt(document.getElementById('losses').value) || 0,
    ties: parseInt(document.getElementById('ties').value) || 0
  };
  await setDoc(doc(db, 'stats', 'record'), stats);
  alert('Stats saved!');
});

document.getElementById('addScorerBtn').addEventListener('click', () => {
  clearForm(['scorerId','scorerName','scorerGoals','scorerAssists']);
  document.getElementById('scorerForm').style.display = 'block';
});
document.getElementById('cancelScorerBtn').addEventListener('click', () => document.getElementById('scorerForm').style.display = 'none');

document.getElementById('saveScorerBtn').addEventListener('click', async () => {
  const id = document.getElementById('scorerId').value || Date.now().toString();
  const scorer = { id, name: document.getElementById('scorerName').value, goals: parseInt(document.getElementById('scorerGoals').value) || 0, assists: parseInt(document.getElementById('scorerAssists').value) || 0 };
  await setDoc(doc(db, 'scorers', id), scorer);
  document.getElementById('scorerForm').style.display = 'none';
  loadStats();
});

document.getElementById('addGoaltenderBtn').addEventListener('click', () => {
  clearForm(['goaltenderId','goaltenderName','goaltenderGames','goaltenderGAA','goaltenderSave']);
  document.getElementById('goaltenderForm').style.display = 'block';
});
document.getElementById('cancelGoaltenderBtn').addEventListener('click', () => document.getElementById('goaltenderForm').style.display = 'none');

document.getElementById('saveGoaltenderBtn').addEventListener('click', async () => {
  const id = document.getElementById('goaltenderId').value || Date.now().toString();
  const g = { id, name: document.getElementById('goaltenderName').value, games: parseInt(document.getElementById('goaltenderGames').value) || 0, gaa: parseFloat(document.getElementById('goaltenderGAA').value) || 0, save: parseFloat(document.getElementById('goaltenderSave').value) || 0 };
  await setDoc(doc(db, 'goaltenders', id), g);
  document.getElementById('goaltenderForm').style.display = 'none';
  loadStats();
});

async function loadStats() {
  const recordSnap = await getDoc(doc(db, 'stats', 'record'));
  if (recordSnap.exists()) {
    const r = recordSnap.data();
    document.getElementById('wins').value = r.wins;
    document.getElementById('losses').value = r.losses;
    document.getElementById('ties').value = r.ties;
  }

  const scorersSnap = await getDocs(collection(db, 'scorers'));
  const scorers = [];
  scorersSnap.forEach(d => scorers.push(d.data()));
  const scorersList = document.getElementById('scorersList');
  scorersList.innerHTML = scorers.length === 0 ? '<div class="empty-state">No scorers added yet</div>' : '';
  scorers.sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists)).forEach(s => {
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `<div class="item-info"><div><strong>${s.name}</strong><span>${s.goals}G | ${s.assists}A | ${s.goals + s.assists}PTS</span></div></div><div><button class="btn-edit" onclick="editScorer('${s.id}')">Edit</button><button class="btn-delete" onclick="deleteScorer('${s.id}')">Delete</button></div>`;
    scorersList.appendChild(item);
  });

  const goalSnap = await getDocs(collection(db, 'goaltenders'));
  const goalies = [];
  goalSnap.forEach(d => goalies.push(d.data()));
  const goaltendersList = document.getElementById('goaltendersList');
  goaltendersList.innerHTML = goalies.length === 0 ? '<div class="empty-state">No goaltenders added yet</div>' : '';
  goalies.forEach(g => {
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `<div class="item-info"><div><strong>${g.name}</strong><span>${g.games}GP | ${g.gaa} GAA | ${g.save}% SV</span></div></div><div><button class="btn-edit" onclick="editGoaltender('${g.id}')">Edit</button><button class="btn-delete" onclick="deleteGoaltender('${g.id}')">Delete</button></div>`;
    goaltendersList.appendChild(item);
  });
}

window.editScorer = async (id) => {
  const snap = await getDoc(doc(db, 'scorers', id));
  const s = snap.data();
  document.getElementById('scorerId').value = s.id;
  document.getElementById('scorerName').value = s.name;
  document.getElementById('scorerGoals').value = s.goals;
  document.getElementById('scorerAssists').value = s.assists;
  document.getElementById('scorerForm').style.display = 'block';
};
window.deleteScorer = async (id) => { if (!confirm('Delete?')) return; await deleteDoc(doc(db, 'scorers', id)); loadStats(); };

window.editGoaltender = async (id) => {
  const snap = await getDoc(doc(db, 'goaltenders', id));
  const g = snap.data();
  document.getElementById('goaltenderId').value = g.id;
  document.getElementById('goaltenderName').value = g.name;
  document.getElementById('goaltenderGames').value = g.games;
  document.getElementById('goaltenderGAA').value = g.gaa;
  document.getElementById('goaltenderSave').value = g.save;
  document.getElementById('goaltenderForm').style.display = 'block';
};
window.deleteGoaltender = async (id) => { if (!confirm('Delete?')) return; await deleteDoc(doc(db, 'goaltenders', id)); loadStats(); };

// ============================================
// NEWS
// ============================================
document.getElementById('addNewsBtn').addEventListener('click', () => {
  clearForm(['newsId','newsTitle','newsDate','newsCategory','newsContent']);
  document.getElementById('newsForm').style.display = 'block';
});
document.getElementById('cancelNewsBtn').addEventListener('click', () => document.getElementById('newsForm').style.display = 'none');

document.getElementById('saveNewsBtn').addEventListener('click', async () => {
  const id = document.getElementById('newsId').value || Date.now().toString();
  const post = { id, title: document.getElementById('newsTitle').value, date: document.getElementById('newsDate').value, category: document.getElementById('newsCategory').value, content: document.getElementById('newsContent').value };
  await setDoc(doc(db, 'news', id), post);
  document.getElementById('newsForm').style.display = 'none';
  loadNews();
});

async function loadNews() {
  const list = document.getElementById('newsList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'news'));
  const posts = [];
  snap.forEach(d => posts.push(d.data()));
  if (posts.length === 0) { list.innerHTML = '<div class="empty-state">No posts added yet</div>'; return; }
  posts.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(n => {
    const dateStr = new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `<div class="item-info"><div><strong>${n.title}</strong><span>${n.category} | ${dateStr}</span></div></div><div><button class="btn-edit" onclick="editNews('${n.id}')">Edit</button><button class="btn-delete" onclick="deleteNews('${n.id}')">Delete</button></div>`;
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
  document.getElementById('newsForm').style.display = 'block';
};
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
  const link = `${window.location.origin}/admin.html?invite=${token}`;
  document.getElementById('inviteLink').value = link;
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
  if (!email) { alert('Please enter an email'); return; }
  users[currentUser].email = email;
  saveUsers();
  showSettingsMsg('✅ Email updated!', 'green');
});

document.getElementById('updatePasswordBtn').addEventListener('click', () => {
  const current = document.getElementById('currentPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;
  if (users[currentUser].password !== current) { showSettingsMsg('❌ Current password incorrect', 'red'); return; }
  if (newPwd !== confirm) { showSettingsMsg('❌ Passwords do not match', 'red'); return; }
  users[currentUser].password = newPwd;
  saveUsers();
  ['currentPassword','newPassword','confirmPassword'].forEach(id => document.getElementById(id).value = '');
  showSettingsMsg('✅ Password updated!', 'green');
});

function showSettingsMsg(msg, color) {
  const el = document.getElementById('settingsMsg');
  el.textContent = msg;
  el.style.color = color;
}

// ============================================
// HELPERS
// ============================================
function clearForm(ids) {
  ids.forEach(id => document.getElementById(id).value = '');
}
