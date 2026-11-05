// Shared renderer for the game stats modal.
// Used by index.html, pages/schedule.html and pages/jv-schedule.html so the
// pop-up (team stat cards, skaters, goalies, totals rows) is built by one piece
// of code and looks the same everywhere.
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const fallbackMinToMMSS = min => {
  const total = Math.round((min || 0) * 60);
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
};
const svPctFmt = (sv, sa) => sa > 0 ? (sv >= sa ? '1.000' : '.' + (sv / sa).toFixed(3).slice(2)) : '.000';

export async function renderGameStats({ db, team, game, seasonId, minToMMSS }) {
  const fmtMin = typeof minToMMSS === 'function' ? minToMMSS : fallbackMinToMMSS;
  const isJv = team === 'jv';
  const gamePath = isJv
    ? ['jv-schedule', seasonId, 'games', game.id]
    : ['seasons', seasonId, 'schedule', game.id];
  const rosterPath = [isJv ? 'jv-roster' : 'roster', seasonId, 'players'];
  const el = id => document.getElementById(id);

  const [tsSnap, rosterSnap, skaterSnap, goalieSnap] = await Promise.all([
    getDoc(doc(db, ...gamePath, 'teamstats', 'game')),
    getDocs(collection(db, ...rosterPath)),
    getDocs(collection(db, ...gamePath, 'skaterstats')),
    getDocs(collection(db, ...gamePath, 'goaliestats'))
  ]);

  // ---- Team stat cards ----
  const ts = tsSnap.exists() ? tsSnap.data() : null;
  const gvmTeamStats = el('gvmTeamStats');
  if (gvmTeamStats) {
    if (ts && (ts.ppOpps || ts.ppg || ts.pkAttempts || ts.successfulPKs || ts.benchPIM)) {
      const ppPct = ts.ppOpps > 0 ? ((ts.ppg / ts.ppOpps) * 100).toFixed(1) + '%' : '0.0%';
      const pkPct = ts.pkAttempts > 0 ? ((ts.successfulPKs / ts.pkAttempts) * 100).toFixed(1) + '%' : '0.0%';
      gvmTeamStats.innerHTML = `
        <div class="gvm-team-stat-card"><div class="gvm-ts-label">PPG</div><div class="gvm-ts-value">${ts.ppg||0}</div></div>
        <div class="gvm-team-stat-card"><div class="gvm-ts-label">PP Opp</div><div class="gvm-ts-value">${ts.ppOpps||0}</div></div>
        <div class="gvm-team-stat-card"><div class="gvm-ts-label">PP%</div><div class="gvm-ts-value">${ppPct}</div></div>
        <div class="gvm-team-stat-card"><div class="gvm-ts-label">Succ PKs</div><div class="gvm-ts-value">${ts.successfulPKs||0}</div></div>
        <div class="gvm-team-stat-card"><div class="gvm-ts-label">PK Att</div><div class="gvm-ts-value">${ts.pkAttempts||0}</div></div>
        <div class="gvm-team-stat-card"><div class="gvm-ts-label">PK%</div><div class="gvm-ts-value">${pkPct}</div></div>
        ${ts.benchPIM ? `<div class="gvm-team-stat-card"><div class="gvm-ts-label">Bench PIM</div><div class="gvm-ts-value">${ts.benchPIM}</div></div>` : ''}
      `;
      gvmTeamStats.style.display = 'flex';
    } else {
      gvmTeamStats.style.display = 'none';
    }
  }

  // ---- Roster lookup for names and numbers ----
  const rosterMap = {};
  rosterSnap.forEach(d => { rosterMap[d.id] = d.data(); });
  rosterMap['EMPTY_NET'] = { name: 'EMPTY NET', number: '0', position: 'Goaltender' };

  // ---- Skaters ----
  const skaters = [];
  skaterSnap.forEach(d => {
    const s = d.data();
    const player = rosterMap[s.playerId] || {};
    skaters.push({ ...s, name: player.name || s.name || '?', number: player.number || s.number || '-' });
  });
  skaters.sort((a, b) => ((b.goals||0)+(b.assists||0)) - ((a.goals||0)+(a.assists||0)));

  let hasGWG = false;
  const skaterRows = skaters
    .filter(s => s.gp)
    .map(s => {
      const pts = (s.goals||0) + (s.assists||0);
      const pm = (s.plus||0) - (s.minus||0);
      const isGWG = s.gwg === 1;
      if (isGWG) hasGWG = true;
      return `<tr class="${isGWG ? 'gwg-row' : ''}">
        <td style="color:#5D1725;font-weight:700;">${s.number}</td>
        <td style="font-weight:600;">${s.name}${isGWG ? ' ⭐' : ''}</td>
        <td>${s.goals||0}</td>
        <td>${s.assists||0}</td>
        <td style="font-weight:700;color:#5D1725;">${pts}</td>
        <td>${s.ppg||0}</td><td>${s.ppa||0}</td>
        <td>${s.shg||0}</td><td>${s.sha||0}</td>
        <td>${s.plus||0}</td><td>${s.minus||0}</td>
        <td>${pm > 0 ? '+'+pm : pm}</td>
        <td>${s.sog||0}</td><td>${s.pim||0}</td>
      </tr>`;
    }).join('');

  const tt = 'style="background:#5D1725;color:#fff;font-weight:700;"';
  const sTot = skaters.filter(s => s.gp).reduce((t, s) => {
    t.g += s.goals||0; t.a += s.assists||0; t.ppg += s.ppg||0; t.ppa += s.ppa||0;
    t.shg += s.shg||0; t.sha += s.sha||0; t.plus += s.plus||0; t.minus += s.minus||0;
    t.sog += s.sog||0; t.pim += s.pim||0;
    return t;
  }, { g:0, a:0, ppg:0, ppa:0, shg:0, sha:0, plus:0, minus:0, sog:0, pim:0 });
  const sPm = sTot.plus - sTot.minus;
  const skaterTotalsRow = `<tr class="stats-totals-row">
        <td colspan="2" ${tt}>TEAM TOTALS</td>
        <td ${tt}>${sTot.g}</td><td ${tt}>${sTot.a}</td><td ${tt}>${sTot.g + sTot.a}</td>
        <td ${tt}>${sTot.ppg}</td><td ${tt}>${sTot.ppa}</td><td ${tt}>${sTot.shg}</td><td ${tt}>${sTot.sha}</td>
        <td ${tt}>${sTot.plus}</td><td ${tt}>${sTot.minus}</td><td ${tt}>${sPm > 0 ? '+' + sPm : sPm}</td>
        <td ${tt}>${sTot.sog}</td><td ${tt}>${sTot.pim}</td>
      </tr>`;
  const skatersBody = el('gvmSkatersBody');
  if (skatersBody) {
    skatersBody.innerHTML = (skaterRows ? skaterRows + skaterTotalsRow : '') ||
      '<tr><td colspan="14" style="text-align:center;color:#999;padding:1rem;">No stats entered</td></tr>';
  }
  const gwgKey = el('gvmGwgKey');
  if (gwgKey) gwgKey.style.display = hasGWG ? 'block' : 'none';

  // ---- Goalies ----
  const goalies = [];
  goalieSnap.forEach(d => {
    const g = d.data();
    const player = rosterMap[g.playerId] || {};
    goalies.push({ ...g, name: player.name || g.name || '?', number: player.number || g.number || '-' });
  });

  const goalieRows = goalies
    .filter(g => {
      if (g.playerId === 'EMPTY_NET') return g.gp && g.minutesPlayed > 0;
      return true;
    })
    .sort((a, b) => {
      // Starter first, then by minutes played, empty net always last
      if (a.playerId === 'EMPTY_NET') return 1;
      if (b.playerId === 'EMPTY_NET') return -1;
      if (b.gs !== a.gs) return (b.gs||0) - (a.gs||0);
      return (b.minutesPlayed||0) - (a.minutesPlayed||0);
    })
    .map(g => {
      const sv = Math.max(0, (g.shotsAgainst||0) - (g.goalsAgainst||0));
      const isEN = g.playerId === 'EMPTY_NET';
      return `<tr ${isEN ? 'style="background:#f5f5f5;font-style:italic;"' : ''}>
        <td style="color:#5D1725;font-weight:700;">${g.number}</td>
        <td style="font-weight:600;">${g.name}</td>
        <td>${isEN ? '-' : (g.decision||'-')}</td>
        <td>${fmtMin(g.minutesPlayed||0)}</td>
        <td>${g.shotsAgainst||0}</td>
        <td>${sv}</td>
        <td>${isEN ? '-' : svPctFmt(sv, g.shotsAgainst||0)}</td>
        <td>${g.goalsAgainst||0}</td>
      </tr>`;
    }).join('');

  const gTot = goalies.filter(g => g.playerId !== 'EMPTY_NET' || (g.gp && g.minutesPlayed > 0)).reduce((t, g) => {
    t.min += g.minutesPlayed||0; t.sa += g.shotsAgainst||0; t.ga += g.goalsAgainst||0;
    t.sv += Math.max(0, (g.shotsAgainst||0) - (g.goalsAgainst||0));
    return t;
  }, { min:0, sa:0, sv:0, ga:0 });
  const goalieTotalsRow = `<tr class="stats-totals-row">
        <td colspan="2" ${tt}>TOTALS</td><td ${tt}>-</td>
        <td ${tt}>${fmtMin(gTot.min)}</td><td ${tt}>${gTot.sa}</td><td ${tt}>${gTot.sv}</td>
        <td ${tt}>${svPctFmt(gTot.sv, gTot.sa)}</td><td ${tt}>${gTot.ga}</td>
      </tr>`;
  const goaliesBody = el('gvmGoaliesBody');
  if (goaliesBody) {
    goaliesBody.innerHTML = (goalieRows ? goalieRows + goalieTotalsRow : '') ||
      '<tr><td colspan="8" style="text-align:center;color:#999;padding:1rem;">No stats entered</td></tr>';
  }

  // ---- "Full Stats Page" link (created if this page's modal markup does not have one) ----
  let share = el('gvmShareLink');
  if (!share) {
    const body = document.querySelector('#gameViewModal .gvm-modal .modal-body');
    if (body && body.parentNode) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'padding:0.5rem 1.25rem 0;text-align:right;';
      wrap.innerHTML = '<a id="gvmShareLink" href="#" style="font-size:0.8rem;color:#5D1725;font-weight:600;text-decoration:none;">🔗 Full Stats Page</a>';
      body.parentNode.insertBefore(wrap, body);
      share = wrap.firstChild;
    }
  }
  if (share && game.id) share.href = '/game/' + (isJv ? 'jv' : 'varsity') + '/' + seasonId + '/' + game.id;
}
