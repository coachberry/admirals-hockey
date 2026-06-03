import { showFramer } from '/assets/js/image-framer.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, getDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

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

async function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('currentUser').textContent = currentUser;
  document.getElementById('settingsUsername').textContent = currentUser;
  document.getElementById('settingsEmail').value = users[currentUser]?.email || '';
  await loadSeasons();
  loadNews();
  loadUsers();

  // Restore last active tab
  const savedTab = localStorage.getItem('admirals_activeTab');
  if (savedTab && document.getElementById(savedTab + 'Tab')) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(savedTab + 'Tab').classList.add('active');
    const tabBtn = document.querySelector(`[data-tab="${savedTab}"]`);
    if (tabBtn) tabBtn.classList.add('active');
  }
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
    localStorage.setItem('admirals_activeTab', tab);
  });
});

// ============================================
// SEASONS
// ============================================
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
        </div>
      </div>
      <div style="display:flex; gap:0.5rem;">
        ${!s.current ? `<button class="btn-edit" onclick="setCurrentSeason('${s.id}')">Set Current</button>` : ''}
        <button class="btn-delete" onclick="deleteSeason('${s.id}')">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });
}

document.getElementById('addSeasonBtn').addEventListener('click', () => {
  document.getElementById('seasonLabel').value = '';
  document.getElementById('seasonCurrent').checked = false;
  document.getElementById('seasonForm').style.display = 'block';
});
document.getElementById('cancelSeasonBtn').addEventListener('click', () => document.getElementById('seasonForm').style.display = 'none');

document.getElementById('saveSeasonBtn').addEventListener('click', async () => {
  const label = document.getElementById('seasonLabel').value.trim();
  if (!label) { alert('Please enter a season label'); return; }
  const isCurrent = document.getElementById('seasonCurrent').checked;
  const id = label.replace(/[^a-zA-Z0-9-]/g, '-');

  // If setting as current, unset others
  if (isCurrent) {
    for (const s of allSeasons) {
      if (s.current) await setDoc(doc(db, 'seasons', s.id), { ...s, current: false });
    }
  }

  await setDoc(doc(db, 'seasons', id), { label, current: isCurrent, createdAt: new Date().toISOString() });
  document.getElementById('seasonForm').style.display = 'none';
  await loadSeasons();
});

window.setCurrentSeason = async (id) => {
  for (const s of allSeasons) {
    await setDoc(doc(db, 'seasons', s.id), { ...s, current: s.id === id });
  }
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
document.getElementById('playerSearchBtn').addEventListener('click', async () => {
  const query = document.getElementById('playerSearch').value.trim().toLowerCase();
  if (!query) return;

  const results = document.getElementById('playerSearchResults');
  results.innerHTML = '<p style="font-size:0.8rem;color:#666;">Searching...</p>';

  // Search players collection
  const snap = await getDocs(collection(db, 'players'));
  const matches = [];
  snap.forEach(d => {
    const p = d.data();
    if (p.name.toLowerCase().includes(query)) matches.push({ id: d.id, ...p });
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
  const member = { id, type, name, bio: document.getElementById('memberBio').value, photoURL, season: currentSeasonId, ...(title && { title }) };

  if (isPlayer) {
    member.number = document.getElementById('memberNumber').value;
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

  // Save to season-specific roster
  const collName = type === 'player' ? 'players' : type === 'coach' ? 'coaches' : 'boards';
  await setDoc(doc(db, 'roster', currentSeasonId, collName, id), member);

  status.textContent = '✅ Saved!';
  status.style.color = 'green';
  setTimeout(() => {
    rosterModal.classList.remove('active');
    loadRoster(currentSeasonId);
  }, 800);
});

// Add buttons
document.getElementById('addPlayerBtn').addEventListener('click', () => openRosterModal('player'));
document.getElementById('addCoachBtn').addEventListener('click', () => openRosterModal('coach'));
document.getElementById('addBoardBtn').addEventListener('click', () => openRosterModal('board'));

// ============================================
// LOAD ROSTER
// ============================================
async function loadRoster(seasonId) {
  if (!seasonId) return;
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
  players.sort((a, b) => parseInt(a.number) - parseInt(b.number)).forEach(p => list.appendChild(buildRosterItem(p)));
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

function buildRosterItem(m) {
  const item = document.createElement('div');
  item.className = 'item';
  const subtitle = m.type === 'player' ? `${m.position} | ${m.grade}` : m.title || '';
  const captainLabel = m.captain ? ' - Captain' : m.alternate ? ' - Alternate Captain' : '';
  const label = m.type === 'player' ? `#${m.number} - ${m.name}${captainLabel}` : m.name;
  item.innerHTML = `
    <div class="item-info">
      ${m.photoURL ? `<img src="${m.photoURL}" class="item-photo">` : ''}
      <div><strong>${label}</strong><span>${subtitle}</span></div>
    </div>
    <div>
      <button class="btn-edit" onclick="editMember('${m.id}', '${m.type}')">Edit</button>
      <button class="btn-delete" onclick="deleteMember('${m.id}', '${m.type}')">Delete</button>
    </div>
  `;
  return item;
}

window.editMember = async (id, type) => {
  const cn = type === 'player' ? 'players' : type === 'coach' ? 'coaches' : 'boards';
  const snap = await getDoc(doc(db, 'roster', currentSeasonId, cn, id));
  if (snap.exists()) openRosterModal(type, snap.data());
};

window.deleteMember = async (id, type) => {
  if (!confirm('Delete this member from this season?')) return;
  const collName = type === 'player' ? 'players' : type === 'coach' ? 'coaches' : 'boards';
  await deleteDoc(doc(db, 'roster', currentSeasonId, collName, id));
  try { await deleteObject(ref(storage, `roster/${currentSeasonId}/${type}/${id}`)); } catch(e) {}
  loadRoster(currentSeasonId);
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
  const fields = ['gameDate','gameTime','gameTimezone','gameOpponent','gameHomeAway','gameRinkName','gameRinkAddress','gameResult','gameTeamScore','gameOpponentScore'];
  fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = data?.[id.replace('game', '').toLowerCase()] || ''; });

  // Always reset logo preview first
  document.getElementById('gameOpponentLogoPreview').innerHTML = '<span style="font-size:1.5rem;">🏒</span>';
  document.getElementById('removeOpponentLogo').style.display = 'none';

  if (data) {
    document.getElementById('gameDate').value = data.date || '';
    document.getElementById('gameTime').value = data.time || '';
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
    if (data.opponentLogo) {
      document.getElementById('gameOpponentLogoPreview').innerHTML = `<img src="${data.opponentLogo}" style="height:50px;object-fit:contain;">`;
      document.getElementById('removeOpponentLogo').style.display = 'inline-block';
    }
  } else {
    ['gameDate','gameTime','gameTimezone','gameGameType','gameLeagueName','gameTournamentName',
     'gameSubtype','gameOpponent','gameHomeAway','gameRinkName','gameRinkAddress','gameResult',
     'gameTeamScore','gameOpponentScore'].forEach(id => {
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

        <div class="form-row">
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

        <div class="photo-upload-section" style="margin-bottom:0.75rem;">
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

        <div class="form-label-group" style="margin-top:1rem;">
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
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });

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
    let opponentLogo = '';
    if (opponentLogoData) {
      try {
        const storageRef = ref(storage, `schedule/${seasonId}/${id}/opponentLogo`);
        await uploadString(storageRef, opponentLogoData, 'data_url');
        opponentLogo = await getDownloadURL(storageRef);
      } catch(e) { console.error('Logo upload failed:', e); }
    }

    const game = {
      id,
      date: document.getElementById('gameDate').value,
      time: document.getElementById('gameTime').value,
      timezone: document.getElementById('gameTimezone').value,
      gameType,
      subtype: document.getElementById('gameSubtype').value,
      leagueName: gameType === 'League' ? leagueName : '',
      tournamentName: gameType === 'Tournament' ? tournamentName : '',
      opponent: document.getElementById('gameOpponent').value,
      homeAway: document.getElementById('gameHomeAway').value,
      rinkName,
      rinkAddress,
      opponentLogo,
      result,
      teamScore: result ? parseInt(document.getElementById('gameTeamScore').value) || 0 : null,
      opponentScore: result ? parseInt(document.getElementById('gameOpponentScore').value) || 0 : null,
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
    setTimeout(() => {
      document.getElementById('gameModal').classList.remove('active');
      loadScheduleGames(seasonId);
    }, 800);
  });
}

function toggleGameTypeFields() {
  const type = document.getElementById('gameGameType')?.value;
  const leagueField = document.getElementById('leagueField');
  const tournamentField = document.getElementById('tournamentField');
  const subtypeField = document.getElementById('gameSubtype')?.parentElement;
  if (leagueField) leagueField.style.display = type === 'League' ? 'block' : 'none';
  if (tournamentField) tournamentField.style.display = type === 'Tournament' ? 'block' : 'none';
  if (subtypeField) subtypeField.style.display = type === 'Exhibition' ? 'none' : 'block';
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

  games.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(g => {
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
        <button class="btn-edit" onclick="editGame('${g.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteGame('${g.id}')">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });
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
let newsImageData = null;       // ADD THIS
let currentNewsImageURL = null; // ADD THIS

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

// ============================================
// GAME STATS
// ============================================

let currentStatsGameId = null;
let currentStatsSeasonId = null;

document.getElementById('closeGameStatsModal').addEventListener('click', () => {
  document.getElementById('gameStatsModal').classList.remove('active');
});
document.getElementById('cancelGameStatsBtn').addEventListener('click', () => {
  document.getElementById('gameStatsModal').classList.remove('active');
});
document.getElementById('gameStatsModal').addEventListener('click', e => {
  if (e.target === document.getElementById('gameStatsModal'))
    document.getElementById('gameStatsModal').classList.remove('active');
});

document.querySelectorAll('.stats-tab-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    const tab = e.target.dataset.stab;
    document.querySelectorAll('.stats-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.stats-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tab + 'StatsTab').classList.add('active');
    e.target.classList.add('active');
  });
});

window.openGameStats = async (gameId, seasonId) => {
  currentStatsGameId = gameId;
  currentStatsSeasonId = seasonId;

  const gameSnap = await getDoc(doc(db, 'seasons', seasonId, 'schedule', gameId));
  const game = gameSnap.data();

  const homeAway = game.homeAway === 'Home' ? 'vs.' : '@';
  const dateStr = new Date(game.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const resultStr = game.result
    ? `<span class="game-stats-result">${game.result} ${game.teamScore}-${game.opponentScore}</span>`
    : '<span style="color:#999;">No Result Yet</span>';

  document.getElementById('gameStatsTitle').textContent = 'Game Stats';
  document.getElementById('gameStatsInfo').innerHTML = `
    <div class="game-stats-info-inner">
      <div><strong>${dateStr}</strong> &nbsp; ${homeAway} ${game.opponent}</div>
      <div>${resultStr}</div>
    </div>
  `;

  // Load roster for this season
  const playersSnap = await getDocs(collection(db, 'roster', seasonId, 'players'));
  const players = [];
  playersSnap.forEach(d => players.push(d.data()));

  // Include EMPTY NET goalie always
  const emptyNetPlayer = { id: 'EMPTY_NET', name: 'EMPTY NET', number: '0', position: 'Goaltender', isEmptyNet: true };

  const skaters = players.filter(p => p.position !== 'Goaltender').sort((a, b) => parseInt(a.number) - parseInt(b.number));
  const goalies = [
    ...players.filter(p => p.position === 'Goaltender').sort((a, b) => parseInt(a.number) - parseInt(b.number)),
    emptyNetPlayer
  ];

  // Load existing stats
  const existingSkaterSnap = await getDocs(collection(db, 'seasons', seasonId, 'schedule', gameId, 'skaterstats'));
  const existingSkaterStats = {};
  existingSkaterSnap.forEach(d => { existingSkaterStats[d.id] = d.data(); });

  const existingGoalieSnap = await getDocs(collection(db, 'seasons', seasonId, 'schedule', gameId, 'goaliestats'));
  const existingGoalieStats = {};
  existingGoalieSnap.forEach(d => { existingGoalieStats[d.id] = d.data(); });

  // Load existing team stats
  const teamStatsSnap = await getDoc(doc(db, 'seasons', seasonId, 'schedule', gameId, 'teamstats', 'game'));
  const teamStats = teamStatsSnap.exists() ? teamStatsSnap.data() : {};

  // Build team stats tab
  document.getElementById('teamStatsContent').innerHTML = `
    <div class="team-stats-section">
      <div class="team-stats-grid">
        <div class="team-stat-row">
          <span class="team-stat-label">PPG</span>
          <input type="number" class="team-stat-input" id="tsPPG" value="${teamStats.ppg || 0}" min="0">
        </div>
        <div class="team-stat-row">
          <span class="team-stat-label">PP Opportunities</span>
          <input type="number" class="team-stat-input" id="tsPPOpps" value="${teamStats.ppOpps || 0}" min="0">
        </div>
        <div class="team-stat-row">
          <span class="team-stat-label">Successful PKs</span>
          <input type="number" class="team-stat-input" id="tsSuccessfulPKs" value="${teamStats.successfulPKs || 0}" min="0">
        </div>
        <div class="team-stat-row">
          <span class="team-stat-label">PK Attempts</span>
          <input type="number" class="team-stat-input" id="tsPKAttempts" value="${teamStats.pkAttempts || 0}" min="0">
        </div>
        <div class="team-stat-row" style="grid-column:1;">
          <span class="team-stat-label">Bench PIM</span>
          <input type="number" class="team-stat-input" id="tsBenchPIM" value="${teamStats.benchPIM || 0}" min="0">
        </div>
      </div>
    </div>
  `;

  // Add no-spinner CSS to team stat inputs
  document.querySelectorAll('.team-stat-input').forEach(el => {
    el.style.MozAppearance = 'textfield';
  });

  // Build skater rows
  // Columns: #, Player, GP, SOG, G, A, PTS(calc), PPG, PPA, SHG, SHA, GWG, +, -, PIM
  const skaterBody = document.getElementById('skaterStatsBody');
  if (!skaters.length) {
    skaterBody.innerHTML = '<tr><td colspan="15" style="text-align:center;color:#999;padding:1rem;">No skaters on roster</td></tr>';
  } else {
    skaterBody.innerHTML = skaters.map(p => {
      const s = existingSkaterStats[p.id] || {};
      return `
        <tr data-player-id="${p.id}">
          <td style="color:#5D1725;font-weight:700;">${p.number || '-'}</td>
          <td style="font-weight:600;min-width:120px;white-space:nowrap;">${p.name}</td>
          <td><input type="checkbox" class="stat-checkbox" data-field="gpCheck" ${s.gp ? 'checked' : ''}></td>
          <td><input type="number" class="stat-input" data-field="sog" value="${s.sog || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="goals" value="${s.goals || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="assists" value="${s.assists || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="ppg" value="${s.ppg || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="ppa" value="${s.ppa || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="shg" value="${s.shg || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="sha" value="${s.sha || 0}" min="0"></td>
          <td><input type="checkbox" class="stat-checkbox" data-field="gwgCheck" ${s.gwg ? 'checked' : ''}></td>
          <td><input type="number" class="stat-input" data-field="plus" value="${s.plus || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="minus" value="${s.minus || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="pim" value="${s.pim || 0}" min="0"></td>
        </tr>
      `;
    }).join('');
  }

  // Build goalie rows
  const goalieBody = document.getElementById('goalieStatsBody');
  goalieBody.innerHTML = goalies.map(p => {
    const g = existingGoalieStats[p.id] || {};
    const isEN = p.isEmptyNet;
    return `
      <tr data-player-id="${p.id}" ${isEN ? 'style="background:#f9f9f9;"' : ''}>
        <td style="color:#5D1725;font-weight:700;">${p.number || '-'}</td>
        <td style="font-weight:600;min-width:120px;white-space:nowrap;">${p.name}${isEN ? ' <span style="font-size:0.7rem;color:#999;">(EN)</span>' : ''}</td>
        <td>${isEN ? '-' : `<input type="checkbox" class="stat-checkbox" data-field="gsCheck" ${g.gs ? 'checked' : ''}>`}</td>
        <td><input type="checkbox" class="stat-checkbox" data-field="gpCheck" ${g.gp ? 'checked' : ''}></td>
        <td>${isEN ? '-' : `<select class="stat-input" data-field="decision">
          <option value="" ${!g.decision?'selected':''}>-</option>
          <option value="W" ${g.decision==='W'?'selected':''}>W</option>
          <option value="L" ${g.decision==='L'?'selected':''}>L</option>
          <option value="T" ${g.decision==='T'?'selected':''}>T</option>
          <option value="OTW" ${g.decision==='OTW'?'selected':''}>OTW</option>
          <option value="OTL" ${g.decision==='OTL'?'selected':''}>OTL</option>
          <option value="SOW" ${g.decision==='SOW'?'selected':''}>SOW</option>
          <option value="SOL" ${g.decision==='SOL'?'selected':''}>SOL</option>
        </select>`}</td>
        <td><input type="number" class="stat-input" data-field="minutesPlayed" value="${g.minutesPlayed || 0}" placeholder="e.g. 19.50" min="0" step="0.01"></td>
        <td><input type="number" class="stat-input" data-field="shotsAgainst" value="${g.shotsAgainst || 0}" min="0"></td>
        <td><input type="number" class="stat-input" data-field="goalsAgainst" value="${g.goalsAgainst || 0}" min="0"></td>
        <td>${isEN ? '-' : `<input type="number" class="stat-input" data-field="assists" value="${g.assists || 0}" min="0">`}</td>
        <td>${isEN ? '-' : `<input type="number" class="stat-input" data-field="pim" value="${g.pim || 0}" min="0">`}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('gameStatsModal').classList.add('active');

  // Reset to team tab
  document.querySelectorAll('.stats-tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.stats-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('teamStatsTab').classList.add('active');
  document.querySelector('[data-stab="team"]').classList.add('active');
};

document.getElementById('saveGameStatsBtn').addEventListener('click', async () => {
  const status = document.getElementById('gameStatsSaveStatus');
  status.textContent = 'Saving...';
  status.style.color = '#666';

  const seasonId = currentStatsSeasonId;
  const gameId = currentStatsGameId;

  // Save team stats
  const teamStats = {
    benchPIM: parseInt(document.getElementById('tsBenchPIM').value) || 0,
    ppOpps: parseInt(document.getElementById('tsPPOpps').value) || 0,
    ppg: parseInt(document.getElementById('tsPPG').value) || 0,
    pkAttempts: parseInt(document.getElementById('tsPKAttempts').value) || 0,
    successfulPKs: parseInt(document.getElementById('tsSuccessfulPKs').value) || 0,
  };
  await setDoc(doc(db, 'seasons', seasonId, 'schedule', gameId, 'teamstats', 'game'), teamStats);

  // Save skater stats
  const skaterRows = document.querySelectorAll('#skaterStatsBody tr[data-player-id]');
  for (const row of skaterRows) {
    const playerId = row.dataset.playerId;
    const stats = { playerId };
    row.querySelectorAll('.stat-input').forEach(input => {
      stats[input.dataset.field] = parseInt(input.value) || 0;
    });
    const gpCheck = row.querySelector('[data-field="gpCheck"]');
    const gwgCheck = row.querySelector('[data-field="gwgCheck"]');
    stats.gp = gpCheck?.checked ? 1 : 0;
    stats.gwg = gwgCheck?.checked ? 1 : 0;
    stats.pts = (stats.goals || 0) + (stats.assists || 0);
    stats.plusMinus = (stats.plus || 0) - (stats.minus || 0);
    await setDoc(doc(db, 'seasons', seasonId, 'schedule', gameId, 'skaterstats', playerId), stats);
  }

  // Save goalie stats
  const goalieRows = document.querySelectorAll('#goalieStatsBody tr[data-player-id]');
  for (const row of goalieRows) {
    const playerId = row.dataset.playerId;
    const stats = { playerId };
    row.querySelectorAll('.stat-input').forEach(input => {
      const field = input.dataset.field;
      if (field) stats[field] = field === 'decision' ? input.value : field === 'minutesPlayed' ? (parseFloat(input.value) || 0) : (parseInt(input.value) || 0);
    });
    const gsCheck = row.querySelector('[data-field="gsCheck"]');
    const gpCheck = row.querySelector('[data-field="gpCheck"]');
    stats.gs = gsCheck?.checked ? 1 : 0;
    stats.gp = gpCheck?.checked ? 1 : 0;
    const sa = stats.shotsAgainst || 0;
    const ga = stats.goalsAgainst || 0;
    const min = stats.minutesPlayed || 0;
    stats.saves = Math.max(0, sa - ga);
    stats.savePct = sa > 0 ? parseFloat((stats.saves / sa).toFixed(3)) : 0;
    stats.gaa = min > 0 ? parseFloat(((ga * 60) / min).toFixed(2)) : 0;
    await setDoc(doc(db, 'seasons', seasonId, 'schedule', gameId, 'goaliestats', playerId), stats);
  }

  status.textContent = '✅ Stats saved!';
  status.style.color = 'green';
});

// ============================================
// EVENTS
// ============================================
let currentEventId = null;
let eventImageData = null;
let currentEventImageURL = null;

document.getElementById('addEventBtn').addEventListener('click', () => openEventModal());
document.getElementById('closeEventModal').addEventListener('click', () => document.getElementById('eventModal').classList.remove('active'));
document.getElementById('cancelEventBtn').addEventListener('click', () => document.getElementById('eventModal').classList.remove('active'));
document.getElementById('eventModal').addEventListener('click', e => { if (e.target === document.getElementById('eventModal')) document.getElementById('eventModal').classList.remove('active'); });

function openEventModal(data = null) {
  currentEventId = data?.id || null;
  eventImageData = null;
  currentEventImageURL = data?.imageURL || null;
  document.getElementById('eventId').value = data?.id || '';
  document.getElementById('eventName').value = data?.name || '';
  document.getElementById('eventDate').value = data?.date || '';
  document.getElementById('eventTime').value = data?.time || '';
  document.getElementById('eventEndTime').value = data?.endTime || '';
  document.getElementById('eventType').value = data?.type || '';
  document.getElementById('eventLocation').value = data?.location || '';
  document.getElementById('eventDetails').value = data?.details || '';
  document.getElementById('eventLink').value = data?.link || '';
  document.getElementById('eventSaveStatus').textContent = '';
  document.getElementById('eventModalTitle').textContent = data ? 'Edit Event' : 'Add Event';

  const preview = document.getElementById('eventImagePreview');
  const removeBtn = document.getElementById('removeEventImage');
  if (currentEventImageURL) {
    preview.innerHTML = `<img src="${currentEventImageURL}" style="width:100%;height:100%;object-fit:cover;">`;
    if (removeBtn) removeBtn.style.display = 'inline-block';
  } else {
    preview.textContent = 'No Image';
    if (removeBtn) removeBtn.style.display = 'none';
  }

  document.getElementById('eventModal').classList.add('active');
}

document.getElementById('eventImage').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    eventImageData = e.target.result;
    const preview = document.getElementById('eventImagePreview');
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src = eventImageData;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    preview.appendChild(img);
    document.getElementById('removeEventImage').style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
});

const removeEventImageBtn = document.getElementById('removeEventImage');
if (removeEventImageBtn) removeEventImageBtn.addEventListener('click', () => {
  eventImageData = null;
  currentEventImageURL = null;
  document.getElementById('eventImagePreview').textContent = 'No Image';
  document.getElementById('eventImage').value = '';
  removeEventImageBtn.style.display = 'none';
});

document.getElementById('saveEventBtn').addEventListener('click', async () => {
  const status = document.getElementById('eventSaveStatus');
  status.textContent = 'Saving...';
  const id = currentEventId || Date.now().toString();
  let imageURL = currentEventImageURL || '';
  if (eventImageData) {
    try {
      const storageRef = ref(storage, `events/${id}`);
      await uploadString(storageRef, eventImageData, 'data_url');
      imageURL = await getDownloadURL(storageRef);
    } catch(e) { console.error(e); }
  }
  await setDoc(doc(db, 'events', id), {
    id,
    name: document.getElementById('eventName').value,
    date: document.getElementById('eventDate').value,
    time: document.getElementById('eventTime').value,
    endTime: document.getElementById('eventEndTime').value,
    type: document.getElementById('eventType').value,
    location: document.getElementById('eventLocation').value,
    details: document.getElementById('eventDetails').value,
    link: document.getElementById('eventLink').value,
    imageURL
  });
  status.textContent = '✅ Saved!';
  status.style.color = 'green';
  setTimeout(() => { document.getElementById('eventModal').classList.remove('active'); loadEvents(); }, 800);
});

async function loadEvents() {
  const list = document.getElementById('eventsList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'events'));
  const events = [];
  snap.forEach(d => events.push(d.data()));
  if (!events.length) { list.innerHTML = '<div class="empty-state">No events added yet</div>'; return; }
  events.sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
    const item = document.createElement('div'); item.className = 'item';
    const dateStr = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    item.innerHTML = `
      <div class="item-info"><div>
        <strong>${e.name}</strong>
        <span>${dateStr}${e.type ? ' · ' + e.type : ''}${e.location ? ' · ' + e.location : ''}</span>
      </div></div>
      <div>
        <button class="btn-edit" onclick="editEvent('${e.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteEvent('${e.id}')">Delete</button>
      </div>`;
    list.appendChild(item);
  });
}

window.editEvent = async (id) => {
  const snap = await getDoc(doc(db, 'events', id));
  if (snap.exists()) openEventModal(snap.data());
};
window.deleteEvent = async (id) => {
  if (!confirm('Delete this event?')) return;
  await deleteDoc(doc(db, 'events', id));
  try { await deleteObject(ref(storage, `events/${id}`)); } catch(e) {}
  loadEvents();
};

// ============================================
// QUICK HITS
// ============================================
document.getElementById('addQuickHitBtn').addEventListener('click', () => openQuickHitModal());
document.getElementById('closeQuickHitModal').addEventListener('click', () => document.getElementById('quickHitModal').classList.remove('active'));
document.getElementById('cancelQuickHitBtn').addEventListener('click', () => document.getElementById('quickHitModal').classList.remove('active'));

function openQuickHitModal(data = null) {
  document.getElementById('quickHitId').value = data?.id || '';
  document.getElementById('quickHitLabel').value = data?.label || '';
  document.getElementById('quickHitUrl').value = data?.url || '';
  document.getElementById('quickHitEmoji').value = data?.emoji || '';
  document.getElementById('quickHitOrder').value = data?.order || '';
  document.getElementById('quickHitModalTitle').textContent = data ? 'Edit Quick Hit' : 'Add Quick Hit';
  document.getElementById('quickHitModal').classList.add('active');
}

document.getElementById('saveQuickHitBtn').addEventListener('click', async () => {
  const id = document.getElementById('quickHitId').value || Date.now().toString();
  await setDoc(doc(db, 'quickhits', id), {
    id,
    label: document.getElementById('quickHitLabel').value,
    url: document.getElementById('quickHitUrl').value,
    emoji: document.getElementById('quickHitEmoji').value,
    order: parseInt(document.getElementById('quickHitOrder').value) || 99
  });
  document.getElementById('quickHitModal').classList.remove('active');
  loadQuickHits();
});

async function loadQuickHits() {
  const list = document.getElementById('quickHitsList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'quickhits'));
  const hits = [];
  snap.forEach(d => hits.push(d.data()));
  if (!hits.length) { list.innerHTML = '<div class="empty-state">No links added yet</div>'; return; }
  hits.sort((a, b) => (a.order||99) - (b.order||99)).forEach(h => {
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `
      <div class="item-info"><div>
        <strong>${h.emoji || ''} ${h.label}</strong>
        <span>${h.url}</span>
      </div></div>
      <div>
        <button class="btn-edit" onclick="editQuickHit('${h.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteQuickHit('${h.id}')">Delete</button>
      </div>`;
    list.appendChild(item);
  });
}

window.editQuickHit = async (id) => {
  const snap = await getDoc(doc(db, 'quickhits', id));
  if (snap.exists()) openQuickHitModal(snap.data());
};
window.deleteQuickHit = async (id) => {
  if (!confirm('Delete this link?')) return;
  await deleteDoc(doc(db, 'quickhits', id));
  loadQuickHits();
};

// ============================================
// ALUMNI
// ============================================
async function loadAlumni() {
  const list = document.getElementById('alumniList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'alumni'));
  const alumni = [];
  snap.forEach(d => alumni.push({ id: d.id, ...d.data() }));
  alumni.sort((a, b) => (b.gradYear || 0) - (a.gradYear || 0));
  document.getElementById('alumniCount').textContent = `${alumni.length} signup${alumni.length !== 1 ? 's' : ''}`;
  if (!alumni.length) { list.innerHTML = '<div class="empty-state">No alumni signups yet</div>'; return; }
  alumni.forEach(a => {
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `
      <div class="item-info"><div>
        <strong>${a.name}</strong>
        <span>${a.email} · Class of ${a.gradYear || '?'}${a.position ? ' · ' + a.position : ''}</span>
      </div></div>
      <div>
        <button class="btn-delete" onclick="deleteAlumni('${a.id}')">Remove</button>
      </div>`;
    list.appendChild(item);
  });
}

window.deleteAlumni = async (id) => {
  if (!confirm('Remove this alumni signup?')) return;
  await deleteDoc(doc(db, 'alumni', id));
  loadAlumni();
};

document.getElementById('exportAlumniBtn').addEventListener('click', async () => {
  const snap = await getDocs(collection(db, 'alumni'));
  const rows = [['Name', 'Email', 'Grad Year', 'Position', 'Signed Up']];
  snap.forEach(d => {
    const a = d.data();
    rows.push([a.name, a.email, a.gradYear || '', a.position || '', a.signedUpAt || '']);
  });
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'admirals-alumni.csv'; a.click();
});

// ============================================
// NEWS - update save to include featured, homeCard, imageURL
// ============================================
document.getElementById('newsImageInput').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    newsImageData = e.target.result;
    currentNewsImageURL = null;
    document.getElementById('newsImagePreview').innerHTML = `<img src="${newsImageData}" style="width:120px;aspect-ratio:16/9;object-fit:cover;border-radius:4px;border:1px solid #ddd;display:block;">`;
    document.getElementById('removeNewsImage').style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
});

document.getElementById('removeNewsImage').addEventListener('click', () => {
  newsImageData = null;
  currentNewsImageURL = null;
  document.getElementById('newsImagePreview').innerHTML = '';
  document.getElementById('removeNewsImage').style.display = 'none';
});

// Load everything on startup
loadEvents();
loadQuickHits();
loadAlumni();

// ============================================
// NEWS EDITOR
// ============================================
function execCmd(cmd, val) {
  document.getElementById('newsContentVisual').focus();
  document.execCommand(cmd, false, val || null);
}

function insertLink() {
  const url = prompt('Enter URL:');
  if (url) document.execCommand('createLink', false, url);
}

// Toggle visual/html editor
const editorVisualBtnEl = document.getElementById('editorVisualBtn');
const editorHtmlBtnEl = document.getElementById('editorHtmlBtn');
if (editorVisualBtnEl && editorHtmlBtnEl) {
  editorVisualBtnEl.addEventListener('click', () => {
    const html = document.getElementById('newsContent').value;
    document.getElementById('newsContentVisual').innerHTML = html;
    document.getElementById('newsContentVisual').style.display = 'block';
    document.getElementById('newsContent').style.display = 'none';
    document.getElementById('editorToolbar').style.display = 'flex';
    editorVisualBtnEl.classList.add('active');
    editorHtmlBtnEl.classList.remove('active');
  });

  editorHtmlBtnEl.addEventListener('click', () => {
    const visual = document.getElementById('newsContentVisual').innerHTML;
    document.getElementById('newsContent').value = visual;
    document.getElementById('newsContent').style.display = 'block';
    document.getElementById('newsContentVisual').style.display = 'none';
    document.getElementById('editorToolbar').style.display = 'none';
    editorHtmlBtnEl.classList.add('active');
    editorVisualBtnEl.classList.remove('active');
  });
}

// Show/hide homeOrder when homeCard toggled
const homeCardChk = document.getElementById('newsHomeCard');
if (homeCardChk) {
  homeCardChk.addEventListener('change', async () => {
    if (homeCardChk.checked) {
      // Count existing homeCard posts excluding current post
      const currentId = document.getElementById('newsId').value;
      const snap = await getDocs(collection(db, 'news'));
      let count = 0;
      snap.forEach(d => {
        const n = d.data();
        if (n.homeCard && d.id !== currentId) count++;
      });
      if (count >= 4) {
        alert('You already have 4 supporting stories on the homepage. Remove one before adding another.');
        homeCardChk.checked = false;
        return;
      }
    }
    document.getElementById('homeCardOrder').style.display = homeCardChk.checked ? 'block' : 'none';
  });
}

// Limit featured to 1 - warn if already set
const featuredChk = document.getElementById('newsFeatured');
if (featuredChk) {
  featuredChk.addEventListener('change', async () => {
    if (featuredChk.checked) {
      const currentId = document.getElementById('newsId').value;
      const snap = await getDocs(collection(db, 'news'));
      let existing = null;
      snap.forEach(d => {
        if (d.data().featured && d.id !== currentId) existing = d.data().title;
      });
      if (existing) {
        const ok = confirm(`"${existing}" is currently the main featured post. Setting this post as featured will replace it. Continue?`);
        if (!ok) { featuredChk.checked = false; }
      }
    }
  });
}

// Homepage order manager
async function loadHomeOrderManager() {
  const snap = await getDocs(collection(db, 'news'));
  const homeCards = [];
  snap.forEach(d => { const n = d.data(); if (n.homeCard) homeCards.push({ id: d.id, ...n }); });
  homeCards.sort((a, b) => (a.homeOrder || 99) - (b.homeOrder || 99));

  const list = document.getElementById('homeOrderList');
  const manager = document.getElementById('homeOrderManager');
  if (!list || !manager) return;

  if (homeCards.length) {
    manager.style.display = 'block';
    list.innerHTML = homeCards.map((p, i) => `
      <div class="home-order-item" draggable="true" data-id="${p.id}" data-order="${i+1}">
        <span class="home-order-handle">⋮⋮</span>
        <span class="home-order-num">${i+1}</span>
        <span>${p.title}</span>
      </div>
    `).join('');
    setupDragSort(list, homeCards);
  } else {
    manager.style.display = 'none';
  }
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
    <div style="display:flex;align-items:center;gap:0.5rem;padding:4px 8px;background:white;border:1px solid #eee;border-radius:4px;font-size:0.85rem;">
      <span style="font-weight:700;min-width:28px;">#${p.number}</span>
      <span style="flex:1;">${p.name}</span>
      <span style="color:${p.position === 'Goalie' ? '#5D1725' : '#666'};font-size:0.75rem;font-weight:600;">${p.position === 'Goalie' ? 'G' : ''}</span>
      <button onclick="removeSummerPlayer(${i})" style="background:none;border:none;color:#c62828;cursor:pointer;font-size:1rem;padding:0 4px;">×</button>
    </div>`).join('');
}

window.removeSummerPlayer = function(index) {
  summerRoster.splice(index, 1);
  renderSummerRoster();
};

// Bulk roster table
function addBulkRow(name='', pos='Skater') {
  const tbody = document.getElementById('bulkRosterBody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
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
  // Focus the number field
  tr.querySelector('input[type="text"]').focus();
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
      const input = row.querySelector('input');
      const select = row.querySelector('select');
      const name = input?.value.trim();
      if (!name) return;
      const pos = select?.value || 'Skater';
      if (!summerRoster.find(p => p.name === name)) {
        summerRoster.push({ name, position: pos });
        added++;
      }
    });
    summerRoster.sort((a, b) => parseInt(a.number) - parseInt(b.number));
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
    `<option value="${s.id}">${s.label || s.id}</option>`
  ).join('');

  summerCurrentSeasonId = seasons[0].id;
  await loadSummerTeams();
  await loadSummerGames();

  select.addEventListener('change', async e => {
    summerCurrentSeasonId = e.target.value;
    await loadSummerTeams();
    await loadSummerGames();
  });
}

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
const pagesList = [
  { id: 'schedule',    label: 'Schedule',      path: '/pages/schedule.html' },
  { id: 'roster',      label: 'Roster',        path: '/pages/roster.html' },
  { id: 'stats',       label: 'Stats',         path: '/pages/stats.html' },
  { id: 'news',        label: 'News',          path: '/pages/news.html' },
  { id: 'events',      label: 'Events',        path: '/pages/events.html' },
  { id: 'summer',      label: 'Summer Hockey', path: '/pages/summer.html' },
  { id: 'alumni',      label: 'Alumni',        path: '/pages/alumni.html' },
  { id: 'tryouts',     label: 'Tryouts',       path: '/pages/tryouts.html' },
  { id: 'contact',     label: 'Contact',       path: '/pages/contact.html' },
];

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
// RSVP ADMIN
// ============================================

async function loadRsvpSeasons() {
  const snap = await getDocs(collection(db, 'summer'));
  const seasons = [];
  snap.forEach(d => seasons.push({ id: d.id, ...d.data() }));
  seasons.sort((a, b) => b.id.localeCompare(a.id));

  const sel1 = document.getElementById('rsvpSeasonSelect');
  const sel2 = document.getElementById('rsvpAdminSeasonSelect2');
  if (!sel1 || !sel2) return;

  const opts = seasons.map(s => `<option value="${s.id}">${s.label || s.id}</option>`).join('');
  sel1.innerHTML = opts;
  sel2.innerHTML = opts;

  if (seasons.length) loadRsvpGamesList(seasons[0].id);

  sel2.addEventListener('change', e => loadRsvpGamesList(e.target.value));
}

const generateRsvpLinkBtn = document.getElementById('generateRsvpLinkBtn');
if (generateRsvpLinkBtn) {
  generateRsvpLinkBtn.addEventListener('click', () => {
    const seasonId = document.getElementById('rsvpSeasonSelect').value;
    if (!seasonId) return;
    const link = `${window.location.origin}/pages/rsvp.html?season=${seasonId}`;
    document.getElementById('rsvpLinkInput').value = link;
    document.getElementById('rsvpLinkResult').style.display = 'block';
  });
}

const copyRsvpLinkBtn = document.getElementById('copyRsvpLinkBtn');
if (copyRsvpLinkBtn) {
  copyRsvpLinkBtn.addEventListener('click', () => {
    const input = document.getElementById('rsvpLinkInput');
    navigator.clipboard.writeText(input.value).then(() => {
      const status = document.getElementById('rsvpCopyStatus');
      status.textContent = '✅ Copied to clipboard!';
      setTimeout(() => { status.textContent = ''; }, 2000);
    });
  });
}

async function loadRsvpGamesList(seasonId) {
  const list = document.getElementById('rsvpGamesList');
  list.innerHTML = '<div class="empty-state">Loading...</div>';

  const [teamsSnap, gamesSnap] = await Promise.all([
    getDocs(collection(db, 'summer', seasonId, 'teams')),
    getDocs(collection(db, 'summer', seasonId, 'games'))
  ]);

  const teams = {};
  teamsSnap.forEach(d => { teams[d.id] = d.data(); });

  const games = [];
  gamesSnap.forEach(d => games.push({ id: d.id, ...d.data() }));
  games.sort((a, b) => a.date.localeCompare(b.date));

  if (!games.length) { list.innerHTML = '<div class="empty-state">No games for this season</div>'; return; }

  list.innerHTML = '';

  for (const g of games) {
    const home = teams[g.homeTeamId]?.name || '?';
    const away = teams[g.awayTeamId]?.name || '?';
    const d = new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' });

    // Load RSVPs
    const rsvpSnap = await getDocs(collection(db, 'summer', seasonId, 'games', g.id, 'rsvps'));
    const yesNames = [], noNames = [];
    rsvpSnap.forEach(d => {
      const r = d.data();
      if (r.response === 'yes') yesNames.push(r.name);
      else noNames.push(r.name);
    });

    const item = document.createElement('div');
    item.className = 'item';
    item.style.cssText = 'flex-direction:column;align-items:stretch;gap:0.5rem;';
    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div><strong>${home} vs ${away}</strong><span>${d}${g.time ? ' · ' + g.time : ''}</span></div>
        <div style="display:flex;gap:0.5rem;">
          <span style="background:#e8f5e9;color:#2e7d32;font-size:0.8rem;font-weight:600;padding:3px 8px;border-radius:4px;">✅ ${yesNames.length} In</span>
          <span style="background:#ffebee;color:#c62828;font-size:0.8rem;font-weight:600;padding:3px 8px;border-radius:4px;">❌ ${noNames.length} Out</span>
        </div>
      </div>
      ${yesNames.length || noNames.length ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.82rem;">
        <div style="color:#2e7d32;">${yesNames.join(', ') || '—'}</div>
        <div style="color:#c62828;">${noNames.join(', ') || '—'}</div>
      </div>` : ''}`;
    list.appendChild(item);
  }
}

loadRsvpSeasons();

});
