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
    const link = `${window.location.origin}/rsvp?season=${seasonId}`;
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
