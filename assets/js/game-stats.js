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
  const resultStr = game.result ? `<span class="game-stats-result">${game.result} ${game.teamScore}-${game.opponentScore}</span>` : '<span style="color:#999;">No Result Yet</span>';

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
  // Columns: GP(checkbox), SOG, G, A, PPG, PPA, SHG, SHA, +, -, PIM
  const skaterBody = document.getElementById('skaterStatsBody');
  if (!skaters.length) {
    skaterBody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:#999;padding:1rem;">No skaters on roster</td></tr>';
  } else {
    skaterBody.innerHTML = skaters.map(p => {
      const s = existingSkaterStats[p.id] || {};
      const gp = s.gp === 1;
      return `
        <tr data-player-id="${p.id}">
          <td style="color:#5e1825;font-weight:700;">${p.number || '-'}</td>
          <td style="font-weight:600;min-width:120px;white-space:nowrap;">${p.name}</td>
          <td><input type="checkbox" class="stat-checkbox" data-field="gpCheck" ${gp ? 'checked' : ''}></td>
          <td><input type="number" class="stat-input" data-field="sog" value="${s.sog || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="goals" value="${s.goals || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="assists" value="${s.assists || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="ppg" value="${s.ppg || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="ppa" value="${s.ppa || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="shg" value="${s.shg || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="sha" value="${s.sha || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="plus" value="${s.plus || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="minus" value="${s.minus || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="pim" value="${s.pim || 0}" min="0"></td>
        </tr>
      `;
    }).join('');
  }

  // Build goalie rows
  // Columns: GS(checkbox), GP(checkbox), DEC, MIN, SA, GA, A, PIM
  const goalieBody = document.getElementById('goalieStatsBody');
  if (!goalies.length) {
    goalieBody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#999;padding:1rem;">No goaltenders on roster</td></tr>';
  } else {
    goalieBody.innerHTML = goalies.map(p => {
      const g = existingGoalieStats[p.id] || {};
      const gs = g.gs === 1;
      const gp = g.gp === 1;
      return `
        <tr data-player-id="${p.id}">
          <td style="color:#5e1825;font-weight:700;">${p.number || '-'}</td>
          <td style="font-weight:600;min-width:120px;white-space:nowrap;">${p.name}</td>
          <td><input type="checkbox" class="stat-checkbox" data-field="gsCheck" ${gs ? 'checked' : ''}></td>
          <td><input type="checkbox" class="stat-checkbox" data-field="gpCheck" ${gp ? 'checked' : ''}></td>
          <td>
            <select class="stat-input" data-field="decision">
              <option value="" ${!g.decision ? 'selected' : ''}>-</option>
              <option value="W" ${g.decision==='W'?'selected':''}>W</option>
              <option value="L" ${g.decision==='L'?'selected':''}>L</option>
              <option value="T" ${g.decision==='T'?'selected':''}>T</option>
              <option value="OTW" ${g.decision==='OTW'?'selected':''}>OTW</option>
              <option value="OTL" ${g.decision==='OTL'?'selected':''}>OTL</option>
              <option value="SOW" ${g.decision==='SOW'?'selected':''}>SOW</option>
              <option value="SOL" ${g.decision==='SOL'?'selected':''}>SOL</option>
            </select>
          </td>
          <td><input type="number" class="stat-input" data-field="minutesPlayed" value="${g.minutesPlayed || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="shotsAgainst" value="${g.shotsAgainst || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="goalsAgainst" value="${g.goalsAgainst || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="assists" value="${g.assists || 0}" min="0"></td>
          <td><input type="number" class="stat-input" data-field="pim" value="${g.pim || 0}" min="0"></td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('gameStatsModal').classList.add('active');
};

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
    const stats = { playerId };
    row.querySelectorAll('.stat-input').forEach(input => {
      stats[input.dataset.field] = parseInt(input.value) || 0;
    });
    // Handle GP checkbox
    const gpCheck = row.querySelector('[data-field="gpCheck"]');
    stats.gp = gpCheck && gpCheck.checked ? 1 : 0;
    // Calculate derived stats
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
      stats[field] = field === 'decision' ? input.value : (parseInt(input.value) || 0);
    });
    // Handle checkboxes
    const gsCheck = row.querySelector('[data-field="gsCheck"]');
    const gpCheck = row.querySelector('[data-field="gpCheck"]');
    stats.gs = gsCheck && gsCheck.checked ? 1 : 0;
    stats.gp = gpCheck && gpCheck.checked ? 1 : 0;
    // Calculate derived stats
    const sa = stats.shotsAgainst || 0;
    const ga = stats.goalsAgainst || 0;
    const min = stats.minutesPlayed || 0;
    stats.saves = sa - ga;
    stats.savePct = sa > 0 ? parseFloat((stats.saves / sa).toFixed(3)) : 0;
    stats.gaa = min > 0 ? parseFloat(((ga * 60) / min).toFixed(2)) : 0;
    await setDoc(doc(db, 'seasons', seasonId, 'schedule', gameId, 'goaliestats', playerId), stats);
  }

  status.textContent = '✅ Stats saved!';
  status.style.color = 'green';
});
