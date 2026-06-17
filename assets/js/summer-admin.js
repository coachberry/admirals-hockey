// ============================================
// SUMMER HOCKEY ADMIN
// ============================================

let summerCurrentSeasonId = null;
let summerTeams = {};

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
          <span style="width:16px;height:16px;border-radius:50%;background:${t.color || '#999'};display:inline-block;flex-shrink:0;"></span>
          <strong>${t.name}</strong>
          <span>${t.abbreviation || ''}</span>
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
    await setDoc(doc(db, 'summer', summerCurrentSeasonId, 'teams', id), {
      id,
      name,
      abbreviation: document.getElementById('summerTeamAbbr').value.trim().toUpperCase(),
      color: document.getElementById('summerTeamColor').value
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
          <button class="btn-secondary" onclick="viewGameRsvp('${g.id}','${summerCurrentSeasonId}')">📋 RSVP</button>
          <button class="btn-edit" onclick="editSummerGame('${g.id}')">Edit</button>
          <button class="btn-delete" onclick="deleteSummerGame('${g.id}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}

// Close RSVP modal
const closeSummerRsvpModal = document.getElementById('closeSummerRsvpModal');
if (closeSummerRsvpModal) closeSummerRsvpModal.addEventListener('click', () => document.getElementById('summerRsvpModal').classList.remove('active'));

window.viewGameRsvp = async function(gameId, seasonId) {
  const modal = document.getElementById('summerRsvpModal');
  const content = document.getElementById('summerRsvpContent');
  const titleEl = document.getElementById('summerRsvpModalTitle');
  content.innerHTML = '<p style="color:#999;">Loading...</p>';
  modal.classList.add('active');

  // Get game info
  const gameSnap = await getDoc(doc(db, 'summer', seasonId, 'games', gameId));
  const game = gameSnap.exists() ? gameSnap.data() : {};
  const home = summerTeams[game.homeTeamId];
  const away = summerTeams[game.awayTeamId];
  const d = game.date ? new Date(game.date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) : '';
  titleEl.textContent = `${home?.name || '?'} vs ${away?.name || '?'} — ${d}${game.time ? ' · ' + game.time : ''}`;

  // Get all RSVPs for this game
  const rsvpSnap = await getDocs(collection(db, 'summer', seasonId, 'games', gameId, 'rsvps'));
  const rsvps = {};
  rsvpSnap.forEach(d => { rsvps[d.id] = d.data().response; });

  function renderTeamRsvp(team) {
    if (!team) return '<p style="color:#999;font-style:italic;">Team not found</p>';
    const roster = Array.isArray(team.roster) ? team.roster : [];
    if (!roster.length) return '<p style="color:#999;font-style:italic;">No players on roster</p>';

    const players = [...roster].sort((a, b) => parseInt(a.number) - parseInt(b.number));
    const inPlayers = players.filter(p => rsvps[p.uid] === 'yes');
    const outPlayers = players.filter(p => rsvps[p.uid] === 'no');
    const pendingPlayers = players.filter(p => !rsvps[p.uid]);

    function playerRow(p, status) {
      const color = status === 'yes' ? '#2e7d32' : status === 'no' ? '#c62828' : '#888';
      const label = status === 'yes' ? '✅ In' : status === 'no' ? '❌ Out' : '⏳ No RSVP';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:0.88rem;">
        <span>${p.number ? `<strong>#${p.number}</strong> ` : ''}${p.name}</span>
        <span style="color:${color};font-weight:600;font-size:0.8rem;">${label}</span>
      </div>`;
    }

    return `
      <div style="margin-bottom:0.5rem;display:flex;gap:1rem;font-size:0.82rem;font-weight:600;">
        <span style="color:#2e7d32;">✅ In: ${inPlayers.length}</span>
        <span style="color:#c62828;">❌ Out: ${outPlayers.length}</span>
        <span style="color:#888;">⏳ No RSVP: ${pendingPlayers.length}</span>
      </div>
      ${[...inPlayers, ...outPlayers, ...pendingPlayers].map(p => playerRow(p, rsvps[p.uid])).join('')}`;
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
