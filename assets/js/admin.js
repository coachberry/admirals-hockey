class AdminPortal {
  constructor() {
    this.loadData();
    this.setupEventListeners();
    this.checkLogin();
    this.checkInvite();
  }

  loadData() {
    this.users = JSON.parse(localStorage.getItem('admirals_users')) || { admin: { password: 'admin', email: 'coachberry03@gmail.com' } };
    this.roster = JSON.parse(localStorage.getItem('admirals_roster')) || [];
    this.schedule = JSON.parse(localStorage.getItem('admirals_schedule')) || [];
    this.stats = JSON.parse(localStorage.getItem('admirals_stats')) || { wins: 12, losses: 4, ties: 2, scorers: [], goaltenders: [] };
    this.news = JSON.parse(localStorage.getItem('admirals_news')) || [];
    this.invites = JSON.parse(localStorage.getItem('admirals_invites')) || {};
  }

  saveData() {
    localStorage.setItem('admirals_users', JSON.stringify(this.users));
    localStorage.setItem('admirals_roster', JSON.stringify(this.roster));
    localStorage.setItem('admirals_schedule', JSON.stringify(this.schedule));
    localStorage.setItem('admirals_stats', JSON.stringify(this.stats));
    localStorage.setItem('admirals_news', JSON.stringify(this.news));
    localStorage.setItem('admirals_invites', JSON.stringify(this.invites));
  }

  checkLogin() {
    this.currentUser = localStorage.getItem('admirals_currentUser');
    if (this.currentUser) this.showDashboard();
  }

  checkInvite() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (token && this.invites[token] && !this.invites[token].used) {
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('signupScreen').style.display = 'flex';
      document.getElementById('signupEmail').value = this.invites[token].email;
    }
  }

  setupEventListeners() {
    // Login/Logout
    document.getElementById('loginForm').addEventListener('submit', e => this.handleLogin(e));
    document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
    document.getElementById('signupForm').addEventListener('submit', e => this.handleSignup(e));

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', e => this.switchTab(e.target.dataset.tab));
    });

    // Roster
    document.getElementById('addPlayerBtn').addEventListener('click', () => { this.clearPlayerForm(); document.getElementById('playerForm').style.display = 'block'; });
    document.getElementById('savePlayerBtn').addEventListener('click', () => this.savePlayer());
    document.getElementById('cancelPlayerBtn').addEventListener('click', () => document.getElementById('playerForm').style.display = 'none');

    // Schedule
    document.getElementById('addGameBtn').addEventListener('click', () => { this.clearGameForm(); document.getElementById('gameForm').style.display = 'block'; });
    document.getElementById('saveGameBtn').addEventListener('click', () => this.saveGame());
    document.getElementById('cancelGameBtn').addEventListener('click', () => document.getElementById('gameForm').style.display = 'none');

    // Stats
    document.getElementById('saveStatsBtn').addEventListener('click', () => this.saveStats());
    document.getElementById('addScorerBtn').addEventListener('click', () => { this.clearScorerForm(); document.getElementById('scorerForm').style.display = 'block'; });
    document.getElementById('saveScorerBtn').addEventListener('click', () => this.saveScorer());
    document.getElementById('cancelScorerBtn').addEventListener('click', () => document.getElementById('scorerForm').style.display = 'none');
    document.getElementById('addGoaltenderBtn').addEventListener('click', () => { this.clearGoaltenderForm(); document.getElementById('goaltenderForm').style.display = 'block'; });
    document.getElementById('saveGoaltenderBtn').addEventListener('click', () => this.saveGoaltender());
    document.getElementById('cancelGoaltenderBtn').addEventListener('click', () => document.getElementById('goaltenderForm').style.display = 'none');

    // News
    document.getElementById('addNewsBtn').addEventListener('click', () => { this.clearNewsForm(); document.getElementById('newsForm').style.display = 'block'; });
    document.getElementById('saveNewsBtn').addEventListener('click', () => this.saveNews());
    document.getElementById('cancelNewsBtn').addEventListener('click', () => document.getElementById('newsForm').style.display = 'none');

    // Users
    document.getElementById('inviteUserBtn').addEventListener('click', () => document.getElementById('inviteForm').style.display = 'block');
    document.getElementById('generateInviteBtn').addEventListener('click', () => this.generateInvite());
    document.getElementById('cancelInviteBtn').addEventListener('click', () => document.getElementById('inviteForm').style.display = 'none');
    document.getElementById('copyLinkBtn').addEventListener('click', () => { document.getElementById('inviteLink').select(); document.execCommand('copy'); alert('Link copied!'); });

    // Settings
    document.getElementById('updateEmailBtn').addEventListener('click', () => this.updateEmail());
    document.getElementById('updatePasswordBtn').addEventListener('click', () => this.updatePassword());
  }

  handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    if (this.users[username] && this.users[username].password === password) {
      this.currentUser = username;
      localStorage.setItem('admirals_currentUser', username);
      this.showDashboard();
    } else {
      document.getElementById('loginError').textContent = 'Invalid username or password';
    }
  }

  handleSignup(e) {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirm = document.getElementById('signupConfirm').value;
    if (password !== confirm) { document.getElementById('signupError').textContent = 'Passwords do not match'; return; }
    const username = email.split('@')[0];
    this.users[username] = { password, email };
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (token) this.invites[token].used = true;
    this.saveData();
    this.currentUser = username;
    localStorage.setItem('admirals_currentUser', username);
    document.getElementById('signupScreen').style.display = 'none';
    this.showDashboard();
  }

  logout() {
    localStorage.removeItem('admirals_currentUser');
    location.reload();
  }

  showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('currentUser').textContent = this.currentUser;
    document.getElementById('settingsUsername').textContent = this.currentUser;
    document.getElementById('settingsEmail').value = this.users[this.currentUser]?.email || '';
    this.loadRoster();
    this.loadSchedule();
    this.loadStats();
    this.loadNews();
    this.loadUsers();
  }

  switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tab + 'Tab').classList.add('active');
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  }

  // ROSTER
  clearPlayerForm() { ['playerId','playerName','playerNumber','playerPosition','playerGrade'].forEach(id => document.getElementById(id).value = ''); }
  savePlayer() {
    const id = document.getElementById('playerId').value;
    const player = { id: id || Date.now().toString(), name: document.getElementById('playerName').value, number: document.getElementById('playerNumber').value, position: document.getElementById('playerPosition').value, grade: document.getElementById('playerGrade').value };
    if (id) { this.roster[this.roster.findIndex(p => p.id === id)] = player; } else { this.roster.push(player); }
    this.saveData(); this.loadRoster(); document.getElementById('playerForm').style.display = 'none';
  }
  loadRoster() {
    const list = document.getElementById('playersList');
    list.innerHTML = this.roster.length === 0 ? '<div class="empty-state">No players added yet</div>' : '';
    this.roster.forEach(p => {
      const item = document.createElement('div'); item.className = 'item';
      item.innerHTML = `<div class="item-info"><strong>#${p.number} - ${p.name}</strong><span>${p.position} | ${p.grade}</span></div><div><button class="btn-edit" onclick="portal.editPlayer('${p.id}')">Edit</button><button class="btn-delete" onclick="portal.deletePlayer('${p.id}')">Delete</button></div>`;
      list.appendChild(item);
    });
  }
  editPlayer(id) { const p = this.roster.find(x => x.id === id); document.getElementById('playerId').value = p.id; document.getElementById('playerName').value = p.name; document.getElementById('playerNumber').value = p.number; document.getElementById('playerPosition').value = p.position; document.getElementById('playerGrade').value = p.grade; document.getElementById('playerForm').style.display = 'block'; }
  deletePlayer(id) { if (confirm('Delete player?')) { this.roster = this.roster.filter(p => p.id !== id); this.saveData(); this.loadRoster(); } }

  // SCHEDULE
  clearGameForm() { ['gameId','gameDate','gameTime','gameOpponent','gameType','gameLocation'].forEach(id => document.getElementById(id).value = ''); }
  saveGame() {
    const id = document.getElementById('gameId').value;
    const game = { id: id || Date.now().toString(), date: document.getElementById('gameDate').value, time: document.getElementById('gameTime').value, opponent: document.getElementById('gameOpponent').value, type: document.getElementById('gameType').value, location: document.getElementById('gameLocation').value };
    if (id) { this.schedule[this.schedule.findIndex(g => g.id === id)] = game; } else { this.schedule.push(game); }
    this.saveData(); this.loadSchedule(); document.getElementById('gameForm').style.display = 'none';
  }
  loadSchedule() {
    const list = document.getElementById('gamesList');
    const sorted = [...this.schedule].sort((a, b) => new Date(a.date) - new Date(b.date));
    list.innerHTML = sorted.length === 0 ? '<div class="empty-state">No games added yet</div>' : '';
    sorted.forEach(g => {
      const dateStr = new Date(g.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const item = document.createElement('div'); item.className = 'item';
      item.innerHTML = `<div class="item-info"><strong>${dateStr} @ ${g.time} - ${g.opponent}</strong><span>${g.type} | ${g.location}</span></div><div><button class="btn-edit" onclick="portal.editGame('${g.id}')">Edit</button><button class="btn-delete" onclick="portal.deleteGame('${g.id}')">Delete</button></div>`;
      list.appendChild(item);
    });
  }
  editGame(id) { const g = this.schedule.find(x => x.id === id); document.getElementById('gameId').value = g.id; document.getElementById('gameDate').value = g.date; document.getElementById('gameTime').value = g.time; document.getElementById('gameOpponent').value = g.opponent; document.getElementById('gameType').value = g.type; document.getElementById('gameLocation').value = g.location; document.getElementById('gameForm').style.display = 'block'; }
  deleteGame(id) { if (confirm('Delete game?')) { this.schedule = this.schedule.filter(g => g.id !== id); this.saveData(); this.loadSchedule(); } }

  // STATS
  saveStats() { this.stats.wins = parseInt(document.getElementById('wins').value) || 0; this.stats.losses = parseInt(document.getElementById('losses').value) || 0; this.stats.ties = parseInt(document.getElementById('ties').value) || 0; this.saveData(); alert('Stats saved!'); }
  loadStats() { document.getElementById('wins').value = this.stats.wins; document.getElementById('losses').value = this.stats.losses; document.getElementById('ties').value = this.stats.ties; this.loadScorers(); this.loadGoaltenders(); }

  clearScorerForm() { ['scorerId','scorerName','scorerGoals','scorerAssists'].forEach(id => document.getElementById(id).value = ''); }
  saveScorer() {
    const id = document.getElementById('scorerId').value;
    const scorer = { id: id || Date.now().toString(), name: document.getElementById('scorerName').value, goals: parseInt(document.getElementById('scorerGoals').value) || 0, assists: parseInt(document.getElementById('scorerAssists').value) || 0 };
    if (!this.stats.scorers) this.stats.scorers = [];
    if (id) { this.stats.scorers[this.stats.scorers.findIndex(s => s.id === id)] = scorer; } else { this.stats.scorers.push(scorer); }
    this.saveData(); this.loadScorers(); document.getElementById('scorerForm').style.display = 'none';
  }
  loadScorers() {
    const list = document.getElementById('scorersList');
    if (!this.stats.scorers || this.stats.scorers.length === 0) { list.innerHTML = '<div class="empty-state">No scorers added yet</div>'; return; }
    list.innerHTML = '';
    [...this.stats.scorers].sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists)).forEach(s => {
      const item = document.createElement('div'); item.className = 'item';
      item.innerHTML = `<div class="item-info"><strong>${s.name}</strong><span>${s.goals}G | ${s.assists}A | ${s.goals + s.assists}PTS</span></div><div><button class="btn-edit" onclick="portal.editScorer('${s.id}')">Edit</button><button class="btn-delete" onclick="portal.deleteScorer('${s.id}')">Delete</button></div>`;
      list.appendChild(item);
    });
  }
  editScorer(id) { const s = this.stats.scorers.find(x => x.id === id); document.getElementById('scorerId').value = s.id; document.getElementById('scorerName').value = s.name; document.getElementById('scorerGoals').value = s.goals; document.getElementById('scorerAssists').value = s.assists; document.getElementById('scorerForm').style.display = 'block'; }
  deleteScorer(id) { if (confirm('Delete scorer?')) { this.stats.scorers = this.stats.scorers.filter(s => s.id !== id); this.saveData(); this.loadScorers(); } }

  clearGoaltenderForm() { ['goaltenderId','goaltenderName','goaltenderGames','goaltenderGAA','goaltenderSave'].forEach(id => document.getElementById(id).value = ''); }
  saveGoaltender() {
    const id = document.getElementById('goaltenderId').value;
    const g = { id: id || Date.now().toString(), name: document.getElementById('goaltenderName').value, games: parseInt(document.getElementById('goaltenderGames').value) || 0, gaa: parseFloat(document.getElementById('goaltenderGAA').value) || 0, save: parseFloat(document.getElementById('goaltenderSave').value) || 0 };
    if (!this.stats.goaltenders) this.stats.goaltenders = [];
    if (id) { this.stats.goaltenders[this.stats.goaltenders.findIndex(x => x.id === id)] = g; } else { this.stats.goaltenders.push(g); }
    this.saveData(); this.loadGoaltenders(); document.getElementById('goaltenderForm').style.display = 'none';
  }
  loadGoaltenders() {
    const list = document.getElementById('goaltendersList');
    if (!this.stats.goaltenders || this.stats.goaltenders.length === 0) { list.innerHTML = '<div class="empty-state">No goaltenders added yet</div>'; return; }
    list.innerHTML = '';
    this.stats.goaltenders.forEach(g => {
      const item = document.createElement('div'); item.className = 'item';
      item.innerHTML = `<div class="item-info"><strong>${g.name}</strong><span>${g.games}GP | ${g.gaa} GAA | ${g.save}% SV</span></div><div><button class="btn-edit" onclick="portal.editGoaltender('${g.id}')">Edit</button><button class="btn-delete" onclick="portal.deleteGoaltender('${g.id}')">Delete</button></div>`;
      list.appendChild(item);
    });
  }
  editGoaltender(id) { const g = this.stats.goaltenders.find(x => x.id === id); document.getElementById('goaltenderId').value = g.id; document.getElementById('goaltenderName').value = g.name; document.getElementById('goaltenderGames').value = g.games; document.getElementById('goaltenderGAA').value = g.gaa; document.getElementById('goaltenderSave').value = g.save; document.getElementById('goaltenderForm').style.display = 'block'; }
  deleteGoaltender(id) { if (confirm('Delete goaltender?')) { this.stats.goaltenders = this.stats.goaltenders.filter(g => g.id !== id); this.saveData(); this.loadGoaltenders(); } }

  // NEWS
  clearNewsForm() { ['newsId','newsTitle','newsDate','newsCategory','newsContent'].forEach(id => document.getElementById(id).value = ''); }
  saveNews() {
    const id = document.getElementById('newsId').value;
    const post = { id: id || Date.now().toString(), title: document.getElementById('newsTitle').value, date: document.getElementById('newsDate').value, category: document.getElementById('newsCategory').value, content: document.getElementById('newsContent').value };
    if (id) { this.news[this.news.findIndex(n => n.id === id)] = post; } else { this.news.push(post); }
    this.saveData(); this.loadNews(); document.getElementById('newsForm').style.display = 'none';
  }
  loadNews() {
    const list = document.getElementById('newsList');
    const sorted = [...this.news].sort((a, b) => new Date(b.date) - new Date(a.date));
    list.innerHTML = sorted.length === 0 ? '<div class="empty-state">No posts added yet</div>' : '';
    sorted.forEach(n => {
      const dateStr = new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const item = document.createElement('div'); item.className = 'item';
      item.innerHTML = `<div class="item-info"><strong>${n.title}</strong><span>${n.category} | ${dateStr}</span></div><div><button class="btn-edit" onclick="portal.editNews('${n.id}')">Edit</button><button class="btn-delete" onclick="portal.deleteNews('${n.id}')">Delete</button></div>`;
      list.appendChild(item);
    });
  }
  editNews(id) { const n = this.news.find(x => x.id === id); document.getElementById('newsId').value = n.id; document.getElementById('newsTitle').value = n.title; document.getElementById('newsDate').value = n.date; document.getElementById('newsCategory').value = n.category; document.getElementById('newsContent').value = n.content; document.getElementById('newsForm').style.display = 'block'; }
  deleteNews(id) { if (confirm('Delete post?')) { this.news = this.news.filter(n => n.id !== id); this.saveData(); this.loadNews(); } }

  // USERS
  generateInvite() {
    const email = document.getElementById('inviteEmail').value;
    if (!email) { alert('Please enter an email'); return; }
    const token = Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    this.invites[token] = { email, used: false };
    this.saveData();
    const link = `${window.location.origin}/admin.html?invite=${token}`;
    document.getElementById('inviteLink').value = link;
    document.getElementById('inviteForm').style.display = 'none';
    document.getElementById('inviteResult').style.display = 'block';
  }
  loadUsers() {
    const list = document.getElementById('usersList');
    list.innerHTML = '';
    Object.entries(this.users).forEach(([username, info]) => {
      const item = document.createElement('div'); item.className = 'item';
      item.innerHTML = `<div class="item-info"><strong>${username}</strong><span>${info.email || ''}</span></div><div>${username !== 'admin' ? `<button class="btn-delete" onclick="portal.deleteUser('${username}')">Remove</button>` : '<span style="font-size:0.8rem;color:#999;">Master Admin</span>'}</div>`;
      list.appendChild(item);
    });
  }
  deleteUser(username) { if (confirm('Remove user?')) { delete this.users[username]; this.saveData(); this.loadUsers(); } }

  // SETTINGS
  updateEmail() {
    const email = document.getElementById('settingsEmail').value;
    if (!email) { alert('Please enter an email'); return; }
    this.users[this.currentUser].email = email;
    this.saveData();
    document.getElementById('settingsMsg').textContent = '✅ Email updated!';
    document.getElementById('settingsMsg').style.color = 'green';
  }
  updatePassword() {
    const current = document.getElementById('currentPassword').value;
    const newPwd = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    if (this.users[this.currentUser].password !== current) { document.getElementById('settingsMsg').textContent = '❌ Current password incorrect'; document.getElementById('settingsMsg').style.color = 'red'; return; }
    if (newPwd !== confirm) { document.getElementById('settingsMsg').textContent = '❌ Passwords do not match'; document.getElementById('settingsMsg').style.color = 'red'; return; }
    this.users[this.currentUser].password = newPwd;
    this.saveData();
    document.getElementById('settingsMsg').textContent = '✅ Password updated!';
    document.getElementById('settingsMsg').style.color = 'green';
    ['currentPassword','newPassword','confirmPassword'].forEach(id => document.getElementById(id).value = '');
  }
}

const portal = new AdminPortal();
