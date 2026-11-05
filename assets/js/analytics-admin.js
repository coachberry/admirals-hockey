// Admin "Analytics" tab.
//
// HOW TO ADD A STAT BOX: add one object to BOXES below.
//   { id, title, compute(rows) } where compute returns { value, sub, detail }.
// rows has one entry per completed game:
//   game:    the schedule doc (date, time, opponent, result, teamScore, opponentScore, homeAway ...)
//   ts:      team stats doc or null (ppOpps, ppg, pkAttempts, successfulPKs, benchPIM)
//   skaters: skaterstats docs (gp, goals, assists, ppg, ppa, shg, sha, plus, minus, sog, pim, gwg)
//   goalies: goaliestats docs (playerId, minutesPlayed, shotsAgainst, goalsAgainst, decision, gs)
// Helpers sum, pct, gaOf, gfOf are defined just below.

const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
const pct = (n, d) => d > 0 ? (n / d * 100).toFixed(1) + '%' : '0.0%';
// Goals allowed: from the goalie rows when they exist (includes empty net), else the final score.
const gaOf = r => r.goalies.length ? sum(r.goalies, g => g.goalsAgainst) : (r.game.opponentScore || 0);
const gfOf = r => r.game.teamScore || 0;
const resultType = res => ['W', 'OTW', 'SOW'].includes(res) ? 'W' : (['L', 'OTL', 'SOL'].includes(res) ? 'L' : 'T');
const byDate = (a, b) => ((a.game.date || '') + (a.game.time || '')).localeCompare((b.game.date || '') + (b.game.time || ''));

const BOXES = [
  {
    id: 'pk-goals-against',
    title: 'Goals Allowed on the Penalty Kill',
    compute(rows) {
      const used = rows.filter(r => r.ts);
      const att = sum(used, r => r.ts.pkAttempts);
      const succ = sum(used, r => r.ts.successfulPKs);
      const ga = sum(used, gaOf);
      const pkGoals = Math.max(0, att - succ);
      return {
        value: pkGoals,
        sub: `of ${ga} goals allowed (${pct(pkGoals, ga)})`,
        detail: `${Math.max(0, ga - pkGoals)} goals allowed in all other situations. Penalty kill: ${succ} of ${att} (${pct(succ, att)}) across ${used.length} games with team stats.`
      };
    }
  },
  {
    id: 'shot-share',
    title: 'Shot Share',
    compute(rows) {
      const sog = sum(rows, r => sum(r.skaters, s => s.sog));
      const sa = sum(rows, r => sum(r.goalies, g => g.shotsAgainst));
      const n = rows.length || 1;
      return {
        value: pct(sog, sog + sa),
        sub: `${sog} shots for, ${sa} against`,
        detail: `${(sog / n).toFixed(1)} shots for and ${(sa / n).toFixed(1)} against per game.`
      };
    }
  },
  {
    id: 'special-teams-goal-share',
    title: 'Goals Scored on Special Teams',
    compute(rows) {
      const pp = sum(rows, r => sum(r.skaters, s => s.ppg));
      const sh = sum(rows, r => sum(r.skaters, s => s.shg));
      const gf = sum(rows, gfOf);
      return {
        value: pct(pp + sh, gf),
        sub: `${pp + sh} of ${gf} goals scored`,
        detail: `${pp} power play goals and ${sh} shorthanded goals.`
      };
    }
  },
  {
    id: 'streaks',
    title: 'Current Streak',
    compute(rows) {
      const sorted = [...rows].sort(byDate);
      let longest = 0, run = 0;
      sorted.forEach(r => {
        if (resultType(r.game.result) === 'W') { run++; longest = Math.max(longest, run); } else { run = 0; }
      });
      let type = '', cur = 0;
      if (sorted.length) {
        type = resultType(sorted[sorted.length - 1].game.result);
        for (let i = sorted.length - 1; i >= 0 && resultType(sorted[i].game.result) === type; i--) cur++;
      }
      const w = sorted.filter(r => resultType(r.game.result) === 'W').length;
      const l = sorted.filter(r => resultType(r.game.result) === 'L').length;
      const t = sorted.length - w - l;
      return {
        value: sorted.length ? type + cur : '-',
        sub: `Longest win streak: ${longest}`,
        detail: `Record in these games: ${w}-${l}-${t}.`
      };
    }
  }
];

// ---------------------------------------------------------------------------
// Everything below loads the data and draws the tab. Normally no need to edit.
// ---------------------------------------------------------------------------
let ctx = null;
let cache = {};
const state = { team: 'varsity', season: null, seasons: [] };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function injectStyles() {
  if (document.getElementById('analyticsStyles')) return;
  const style = document.createElement('style');
  style.id = 'analyticsStyles';
  style.textContent = `
    .an-controls { display:flex; flex-wrap:wrap; gap:0.75rem; align-items:center; margin-bottom:1.25rem; }
    .an-controls label { font-size:0.8rem; font-weight:700; color:#5D1725; text-transform:uppercase; letter-spacing:0.4px; }
    .an-controls select, .an-controls button { padding:0.45rem 0.7rem; border:1px solid #ccc; border-radius:6px; font-size:0.9rem; background:#fff; }
    .an-controls button { cursor:pointer; font-weight:600; color:#5D1725; }
    .an-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:1rem; }
    .an-card { background:#fff; border:1px solid #e3e3e3; border-top:4px solid #5D1725; border-radius:8px; padding:1rem 1.1rem; }
    .an-title { font-size:0.75rem; font-weight:700; color:#777; text-transform:uppercase; letter-spacing:0.5px; }
    .an-value { font-size:2.4rem; font-weight:900; color:#5D1725; line-height:1.15; margin:0.25rem 0; }
    .an-sub { font-size:0.95rem; font-weight:600; color:#333; }
    .an-detail { font-size:0.8rem; color:#666; margin-top:0.5rem; line-height:1.4; }
    .an-note { font-size:0.85rem; color:#666; }
  `;
  document.head.appendChild(style);
}

async function loadTeamRows(team, seasonId) {
  const key = team + '|' + seasonId;
  if (cache[key]) return cache[key];
  const { db, collection, getDocs, doc, getDoc } = ctx;
  const base = team === 'jv' ? ['jv-schedule', seasonId, 'games'] : ['seasons', seasonId, 'schedule'];
  const snap = await getDocs(collection(db, ...base));
  const games = [];
  snap.forEach(d => { const g = { id: d.id, ...d.data() }; if (g.result) games.push(g); });
  const rows = await Promise.all(games.map(async game => {
    const [sk, go, ts] = await Promise.all([
      getDocs(collection(db, ...base, game.id, 'skaterstats')),
      getDocs(collection(db, ...base, game.id, 'goaliestats')),
      getDoc(doc(db, ...base, game.id, 'teamstats', 'game'))
    ]);
    return {
      game, seasonId,
      skaters: sk.docs.map(d => d.data()).filter(s => s.gp),
      goalies: go.docs.map(d => d.data()),
      ts: ts.exists() ? ts.data() : null
    };
  }));
  rows.sort(byDate);
  cache[key] = rows;
  return rows;
}

async function loadRows() {
  if (state.season === 'all') {
    const parts = await Promise.all(state.seasons.map(s => loadTeamRows(state.team, s.id)));
    return parts.flat();
  }
  return loadTeamRows(state.team, state.season);
}

async function refresh() {
  const body = document.getElementById('anBody');
  if (!body) return;
  body.innerHTML = '<p class="an-note">Loading...</p>';
  try {
    const rows = await loadRows();
    if (!rows.length) {
      body.innerHTML = '<p class="an-note">No completed games with a result for this selection yet.</p>';
      return;
    }
    const cards = BOXES.map(box => {
      let out;
      try { out = box.compute(rows); } catch (err) { out = { value: '?', sub: 'Could not calculate', detail: String(err.message || err) }; }
      return `<div class="an-card">
        <div class="an-title">${esc(box.title)}</div>
        <div class="an-value">${esc(out.value)}</div>
        <div class="an-sub">${esc(out.sub || '')}</div>
        <div class="an-detail">${esc(out.detail || '')}</div>
      </div>`;
    }).join('');
    body.innerHTML = `<p class="an-note">Based on ${rows.length} completed game${rows.length === 1 ? '' : 's'}.</p><div class="an-grid">${cards}</div>`;
  } catch (err) {
    console.error('analytics error:', err);
    body.innerHTML = `<p style="color:#c62828;">Could not load analytics: ${esc(err.message || err)}</p>`;
  }
}

function render() {
  const root = document.getElementById('analyticsRoot');
  if (!root) return;
  const seasonOpts = state.seasons.map(s => `<option value="${esc(s.id)}" ${s.id === state.season ? 'selected' : ''}>${esc(s.label)}</option>`).join('');
  root.innerHTML = `
    <div class="an-controls">
      <label for="anTeam">Team</label>
      <select id="anTeam">
        <option value="varsity" ${state.team === 'varsity' ? 'selected' : ''}>Varsity</option>
        <option value="jv" ${state.team === 'jv' ? 'selected' : ''}>JV</option>
      </select>
      <label for="anSeason">Season</label>
      <select id="anSeason">
        ${seasonOpts}
        <option value="all" ${state.season === 'all' ? 'selected' : ''}>All seasons</option>
      </select>
      <button id="anRefresh" type="button">Refresh</button>
    </div>
    <div id="anBody"></div>`;
  document.getElementById('anTeam').onchange = e => { state.team = e.target.value; refresh(); };
  document.getElementById('anSeason').onchange = e => { state.season = e.target.value; refresh(); };
  document.getElementById('anRefresh').onclick = () => { cache = {}; refresh(); };
  refresh();
}

export async function loadAnalytics(context) {
  ctx = context;
  cache = {};
  injectStyles();
  const { db, collection, getDocs } = ctx;
  const snap = await getDocs(collection(db, 'seasons'));
  state.seasons = [];
  snap.forEach(d => state.seasons.push({ id: d.id, label: d.data().label || d.id }));
  state.seasons.sort((a, b) => b.id.localeCompare(a.id));
  if (!state.season || (state.season !== 'all' && !state.seasons.some(s => s.id === state.season))) {
    state.season = state.seasons.length ? state.seasons[0].id : 'all';
  }
  render();
}
