// ============================================
// GAME STATS
// ============================================
// This code is appended to admin.js

let currentStatsGameId = null;
let currentStatsSeasonId = null;

// Setup game stats modal event listeners
document.getElementById('closeGameStatsModal').addEventListener('click', () => {
  document.getElementById('gameStatsModal').classList.remove('active');
});
document.getElementById('cancelGameStatsBtn').addEventListener('click', () => {
  document.getElementById('gameStatsModal').classList.remove('active');
});
document.getElementById('gameStatsModal').addEventListener('click', e => {
  if (e.target === document.getElementById('gameStatsModal')) {
    document.getElementById('gameStatsModal').classList.remove('active');
  }
});

// Stats modal tabs
document.querySelectorAll('.stats-tab-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    const tab = e.target.dataset.stab;
    document.querySelectorAll('.stats-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.stats-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tab + 'StatsTab').classList.add('active');
    e.target.classList.add('active');
  });
});

// Open game stats
window.openGameStats = async (gameId, seasonId) => {
  currentStatsGameId = gameId;
  currentStatsSeasonId = seasonId;

  // Get game info
  const gameSnap = await getDoc(doc(db, 'seasons', seasonId, 'schedule', gameId));
  const game = gameSnap.data();

  const homeAway = game.homeAway === 'Home' ? 'vs.' : '@';
  const dateStr = new Date(game.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const resultStr = game.result ? `<span class="game-stats-result">${game.result} ${game.teamScore}-${game.opponentScore}</span>` : '<span style="color:#999;">No Result</span>';

  document.getElementById('gameStatsTitle').textContent = `Game Stats`;
  document.getElementById('gameStatsInfo').innerHTML = `
    <div class="game-stats-info-inner">
      <div><strong>${dateStr}</strong> ${homeAway} ${game.opponent}</div>
      <div>${resultStr}</div>
    </div>
  `;

  // Load players for this season
  const playersSnap = await getDocs(collection(db, 'roster', seasonId, 'players'));
  const players = [];
  playersSnap.forEach(d => players.push(d.data()));

  const skaters = players.filter(p => p.position !== 'Goaltender').sort((a, b) => parseInt(a.number) - parseInt(b.number));
  const goalies = players.filter(p => p.position === 'Goaltender').sort((a, b) => parseInt(a.number) - parseInt(b.number));

  // Load existing stats
  const existingSkaterSnap = await getDocs(collection(db, 'seasons', seasonId, 'schedule', gameId, 'skaterstats'));
  const existingSkaterStats = {};
  existingSkaterSnap.forEach(d => { existingSkaterStats[d.id] = d.data(); });

  const existingGoalieSnap = await getDocs(collection(db, 'seasons', seasonId, 'schedule', gameId, 'goaliestats'));
  const existingGoalieStats = {};
  existingGoalieSnap.forEach(d => { existingGoalieStats[d.id] = d.data(); });

  // Build skater rows
  const skaterBody = document.getElementById('skaterStatsBody');
  skaterBody.innerHTML = skaters.length === 0
    ? '<tr><td colspan="7" style="text-align:center;color:#999;padding:1rem;">No skaters on roster</td></tr>'
    : skaters.map(p => {
        const s = existingSkaterStats[p.id] || {};
        return `
          <tr data-player-id="${p.id}">
            <td style="color:#5e1825;font-weight:700;">${p.number || '-'}</td>
            <td style="font-weight:600;min-width:140px;">${p.name}</td>
            <td><input type="number" class="stat-input" data-field="goals" value="${s.goals || 0}" min="0"></td>
            <td><input type="number" class="stat-input" data-field="assists" value="${s.assists || 0}" min="0"></td>
            <td><input type="number" class="stat-input" data-field="pim" value="${s.pim || 0}" min="0"></td>
            <td><input type="number" class="stat-input" data-field="plusMinus" value="${s.plusMinus || 0}"></td>
            <td><input type="number" class="stat-input" data-field="sog" value="${s.sog || 0}" min="0"></td>
          </tr>
        `;
      }).join('');

  // Build goalie rows
  const goalieBody = document.getElementById('goalieStatsBody');
  goalieBody.innerHTML = goalies.length === 0
    ? '<tr><td colspan="7" style="text-align:center;color:#999;padding:1rem;">No goaltenders on roster</td></tr>'
    : goalies.map(p => {
        const g = existingGoalieStats[p.id] || {};
        return `
          <tr data-player-id="${p.id}">
            <td style="color:#5e1825;font-weight:700;">${p.number || '-'}</td>
            <td style="font-weight:600;min-width:140px;">${p.name}</td>
            <td><input type="number" class="stat-input" data-field="shotsAgainst" value="${g.shotsAgainst || 0}" min="0"></td>
            <td><input type="number" class="stat-input" data-field="saves" value="${g.saves || 0}" min="0"></td>
            <td><input type="number" class="stat-input" data-field="goalsAgainst" value="${g.goalsAgainst || 0}" min="0"></td>
            <td><input type="number" class="stat-input" data-field="minutesPlayed" value="${g.minutesPlayed || 0}" min="0"></td>
            <td>
              <select class="stat-input" data-field="decision">
                <option value="" ${!g.decision ? 'selected' : ''}>-</option>
                <option value="W" ${g.decision === 'W' ? 'selected' : ''}>W</option>
                <option value="L" ${g.decision === 'L' ? 'selected' : ''}>L</option>
                <option value="T" ${g.decision === 'T' ? 'selected' : ''}>T</option>
              </select>
            </td>
          </tr>
        `;
      }).join('');

  document.getElementById('gameStatsModal').classList.add('active');
};

// Save game stats
document.getElementById('saveGameStatsBtn').addEventListener('click', async () => {
  const status = document.getElementById('gameStatsSaveStatus');
  status.textContent = 'Saving...';
  status.style.color = '#666';

  const seasonId = currentStatsSeasonId;
  const gameId = currentStatsGameId;

  // Save skater stats
  const skaterRows = document.querySelectorAll('#skaterStatsBody tr[data-player-id]');
  for (const row of skaterRows) {
    const playerId = row.dataset.playerId;
    const inputs = row.querySelectorAll('.stat-input');
    const stats = { playerId };
    inputs.forEach(input => {
      const val = input.dataset.field === 'plusMinus'
        ? parseInt(input.value) || 0
        : parseInt(input.value) || 0;
      stats[input.dataset.field] = val;
    });
    await setDoc(doc(db, 'seasons', seasonId, 'schedule', gameId, 'skaterstats', playerId), stats);
  }

  // Save goalie stats
  const goalieRows = document.querySelectorAll('#goalieStatsBody tr[data-player-id]');
  for (const row of goalieRows) {
    const playerId = row.dataset.playerId;
    const inputs = row.querySelectorAll('.stat-input');
    const stats = { playerId };
    inputs.forEach(input => {
      const field = input.dataset.field;
      stats[field] = field === 'decision' ? input.value : (parseInt(input.value) || 0);
    });
    await setDoc(doc(db, 'seasons', seasonId, 'schedule', gameId, 'goaliestats', playerId), stats);
  }

  status.textContent = '✅ Stats saved!';
  status.style.color = 'green';
});
