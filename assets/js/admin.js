import { showFramer } from '/assets/js/image-framer.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, getDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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

async function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('currentUser').textContent = currentUser;
  document.getElementById('settingsUsername').textContent = currentUser;
  document.getElementById('settingsEmail').value = users[currentUser]?.email || '';
  await loadSeasons();
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

  // Load roster for current season
  if (currentSeasonId) {
    loadRoster(currentSeasonId);
    loadScheduleGames(currentSeasonId);
  }

  // Populate seasons list tab
  renderSeasonsList();
}

document.getElementById('scheduleSeasonSelect').addEventListener('change', e => {
  loadScheduleGames(e.target.value);
});

document.getElementById('rosterSeasonSelect').addEventListener('change', e => {
  currentSeasonId = e.target.value;
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
let savedRinks = [];
let savedLeagues = [];
let savedTournaments = [];

document.getElementById('addGameBtn').addEventListener('click', () => openGameModal());

async function openGameModal(data = null) {
  currentGameId = data?.id || null;
  // Load saved rinks, leagues, tournaments
  await loadSavedOptions();
  showGameModal(data);
}

function showGameModal(data = null) {
  const modal = document.getElementById('gameModal');
  if (!modal) createGameModal();

  // Reset fields
  const fields = ['gameDate','gameTime','gameTimezone','gameOpponent','gameHomeAway','gameRinkName','gameRinkAddress','gameResult','gameTeamScore','gameOpponentScore'];
  fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = data?.[id.replace('game', '').toLowerCase()] || ''; });

  if (data) {
    document.getElementById('gameDate').value = data.date || '';
    document.getElementById('gameTime').value = data.time || '';
    document.getElementById('gameTimezone').value = data.timezone || 'CT';
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
    if (data.opponentLogo) {
      document.getElementById('gameOpponentLogoPreview').innerHTML = `<img src="${data.opponentLogo}" style="height:50px;object-fit:contain;">`;
    }
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
        <div class="form-row">
          <input type="date" id="gameDate" placeholder="Date">
          <input type="time" id="gameTime" placeholder="Time">
          <select id="gameTimezone">
            <option value="ET">ET</option>
            <option value="CT" selected>CT</option>
            <option value="MT">MT</option>
            <option value="PT">PT</option>
          </select>
        </div>

        <div class="form-row">
          <select id="gameGameType">
            <option value="">Game Type</option>
            <option value="Exhibition">Exhibition</option>
            <option value="League">League</option>
            <option value="Tournament">Tournament</option>
          </select>
          <select id="gameSubtype">
            <option value="">Sub-Type</option>
            <option value="Regular Season">Regular Season</option>
            <option value="Playoffs">Playoffs</option>
            <option value="Championship">Championship</option>
          </select>
        </div>

        <div id="leagueField" style="display:none;">
          <input type="text" id="gameLeagueName" placeholder="League Name" list="leaguesList">
          <datalist id="leaguesList"></datalist>
        </div>
        <div id="tournamentField" style="display:none;">
          <input type="text" id="gameTournamentName" placeholder="Tournament Name" list="tournamentsList">
          <datalist id="tournamentsList"></datalist>
        </div>

        <div class="form-row">
          <input type="text" id="gameOpponent" placeholder="Opponent Name">
          <select id="gameHomeAway">
            <option value="">Home or Away</option>
            <option value="Home">Home</option>
            <option value="Away">Away</option>
          </select>
        </div>

        <div class="photo-upload-section" style="margin-bottom:0.75rem;">
          <label style="font-size:0.85rem;font-weight:600;display:block;margin-bottom:0.4rem;">Opponent Logo (optional)</label>
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <div id="gameOpponentLogoPreview" class="opp-logo-admin-preview"></div>
            <label class="btn-secondary photo-btn photo-choose-label" style="font-size:0.8rem;">
              Choose Logo
              <input type="file" id="gameOpponentLogo" accept="image/*" style="display:none;">
            </label>
            <button type="button" id="removeOpponentLogo" class="btn-delete photo-btn" style="font-size:0.8rem;display:none;">Remove</button>
          </div>
        </div>

        <div class="form-row">
          <input type="text" id="gameRinkName" placeholder="Rink Name" list="rinkNamesList">
          <datalist id="rinkNamesList"></datalist>
          <input type="text" id="gameRinkAddress" placeholder="Rink Address" list="rinkAddressList">
          <datalist id="rinkAddressList"></datalist>
        </div>

        <h4 style="margin:1rem 0 0.5rem;color:#5e1825;">Result (add after game)</h4>
        <div class="form-row">
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
          <input type="number" id="gameTeamScore" placeholder="Our Score" min="0">
          <input type="number" id="gameOpponentScore" placeholder="Opp Score" min="0">
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
  let opponentLogoData = null;
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
  games.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(g => {
    const dateStr = new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const homeAway = g.homeAway === 'Home' ? 'vs.' : '@';
    const resultStr = g.result ? ` | ${g.result} ${g.teamScore}-${g.opponentScore}` : '';
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `
      <div class="item-info">
        <div>
          <strong>${dateStr} ${g.time} · ${homeAway} ${g.opponent}</strong>
          <span>${g.gameType}${g.subtype ? ' · ' + g.subtype : ''}${resultStr}</span>
        </div>
      </div>
      <div>
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
  if (!posts.length) { list.innerHTML = '<div class="empty-state">No posts added yet</div>'; return; }
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
