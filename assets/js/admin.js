// Admin Portal JavaScript
const DEFAULT_USER = { username: 'admin', password: 'admin' };

class AdminPortal {
  constructor() {
    this.currentUser = null;
    this.loadData();
    this.setupEventListeners();
    this.checkLogin();
  }

  loadData() {
    this.users = JSON.parse(localStorage.getItem('admirals_users')) || { admin: DEFAULT_USER };
    this.roster = JSON.parse(localStorage.getItem('admirals_roster')) || [];
    this.schedule = JSON.parse(localStorage.getItem('admirals_schedule')) || [];
    this.stats = JSON.parse(localStorage.getItem('admirals_stats')) || { wins: 12, losses: 4, ties: 2 };
    this.news = JSON.parse(localStorage.getItem('admirals_news')) || [];
  }

  saveData() {
    localStorage.setItem('admirals_users', JSON.stringify(this.users));
    localStorage.setItem('admirals_roster', JSON.stringify(this.roster));
    localStorage.setItem('admirals_schedule', JSON.stringify(this.schedule));
    localStorage.setItem('admirals_stats', JSON.stringify(this.stats));
    localStorage.setItem('admirals_news', JSON.stringify(this.news));
  }

  checkLogin() {
    this.currentUser = localStorage.getItem('admirals_currentUser');
    if (this.currentUser) {
      this.showDashboard();
    }
  }

  setupEventListeners() {
    // Login
    document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
    document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Roster
    document.getElementById('addPlayerBtn').addEventListener('click', () => this.showPlayerForm());
    document.getElementById('savePlayerBtn').addEventListener('click', () => this.savePlayer());
    document.getElementById('cancelPlayerBtn').addEventListener('click', () => this.hidePlayerForm());

    // Schedule
    document.getElementById('addGameBtn').addEventListener('click', () => this.showGameForm());
    document.getElementById('saveGameBtn').addEventListener('click', () => this.saveGame());
    document.getElementById('cancelGameBtn').addEventListener('click', () => this.hideGameForm());

    // Stats
    document.getElementById('saveStatsBtn').addEventListener('click', () => this.saveStats());

    // News
    document.getElementById('addNewsBtn').addEventListener('click', () => this.showNewsForm());
    document.getElementById('saveNewsBtn').addEventListener('click', () => this.saveNews());
    document.getElementById('cancelNewsBtn').addEventListener('click', () => this.hideNewsForm());
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
      document.getElementById('loginError').textContent = 'Invalid credentials';
    }
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('admirals_currentUser');
    location.reload();
  }

  showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    this.loadRoster();
    this.loadSchedule();
    this.loadStats();
    this.loadNews();
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabName + 'Tab').classList.add('active');
    event.target.classList.add('active');
  }

  // ROSTER MANAGEMENT
  showPlayerForm() {
    document.getElementById('playerForm').style.display = 'block';
    this.clearPlayerForm();
  }

  hidePlayerForm() {
    document.getElementById('playerForm').style.display = 'none';
  }

  clearPlayerForm() {
    document.getElementById('playerId').value = '';
    document.getElementById('playerName').value = '';
    document.getElementById('playerNumber').value = '';
    document.getElementById('playerPosition').value = '';
    document.getElementById('playerGrade').value = '';
  }

  savePlayer() {
    const id = document.getElementById('playerId').value;
    const player = {
      id: id || Date.now().toString(),
      name: document.getElementById('playerName').value,
      number: document.getElementById('playerNumber').value,
      position: document.getElementById('playerPosition').value,
      grade: document.getElementById('playerGrade').value
    };

    if (id) {
      const index = this.roster.findIndex(p => p.id === id);
      this.roster[index] = player;
    } else {
      this.roster.push(player);
    }

    this.saveData();
    this.loadRoster();
    this.hidePlayerForm();
  }

  loadRoster() {
    const list = document.getElementById('playersList');
    list.innerHTML = '';
    this.roster.forEach(p => {
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <div><strong>#${p.number} - ${p.name}</strong><br>${p.position} | ${p.grade}</div>
        <div>
          <button class="btn-small" onclick="admin.editPlayer('${p.id}')">Edit</button>
          <button class="btn-small" onclick="admin.deletePlayer('${p.id}')">Delete</button>
        </div>
      `;
      list.appendChild(item);
    });
  }

  editPlayer(id) {
    const p = this.roster.find(x => x.id === id);
    document.getElementById('playerId').value = p.id;
    document.getElementById('playerName').value = p.name;
    document.getElementById('playerNumber').value = p.number;
    document.getElementById('playerPosition').value = p.position;
    document.getElementById('playerGrade').value = p.grade;
    this.showPlayerForm();
  }

  deletePlayer(id) {
    if (confirm('Delete player?')) {
      this.roster = this.roster.filter(p => p.id !== id);
      this.saveData();
      this.loadRoster();
    }
  }

  // SCHEDULE MANAGEMENT
  showGameForm() {
    document.getElementById('gameForm').style.display = 'block';
    this.clearGameForm();
  }

  hideGameForm() {
    document.getElementById('gameForm').style.display = 'none';
  }

  clearGameForm() {
    document.getElementById('gameId').value = '';
    document.getElementById('gameDate').value = '';
    document.getElementById('gameTime').value = '';
    document.getElementById('gameOpponent').value = '';
    document.getElementById('gameType').value = '';
    document.getElementById('gameLocation').value = '';
  }

  saveGame() {
    const id = document.getElementById('gameId').value;
    const game = {
      id: id || Date.now().toString(),
      date: document.getElementById('gameDate').value,
      time: document.getElementById('gameTime').value,
      opponent: document.getElementById('gameOpponent').value,
      type: document.getElementById('gameType').value,
      location: document.getElementById('gameLocation').value
    };

    if (id) {
      const index = this.schedule.findIndex(g => g.id === id);
      this.schedule[index] = game;
    } else {
      this.schedule.push(game);
    }

    this.saveData();
    this.loadSchedule();
    this.hideGameForm();
  }

  loadSchedule() {
    const list = document.getElementById('gamesList');
    list.innerHTML = '';
    const sorted = [...this.schedule].sort((a, b) => new Date(a.date) - new Date(b.date));
    sorted.forEach(g => {
      const dateStr = new Date(g.date).toLocaleDateString();
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <div><strong>${dateStr} @ ${g.time}</strong><br>${g.opponent} (${g.type}) - ${g.location}</div>
        <div>
          <button class="btn-small" onclick="admin.editGame('${g.id}')">Edit</button>
          <button class="btn-small" onclick="admin.deleteGame('${g.id}')">Delete</button>
        </div>
      `;
      list.appendChild(item);
    });
  }

  editGame(id) {
    const g = this.schedule.find(x => x.id === id);
    document.getElementById('gameId').value = g.id;
    document.getElementById('gameDate').value = g.date;
    document.getElementById('gameTime').value = g.time;
    document.getElementById('gameOpponent').value = g.opponent;
    document.getElementById('gameType').value = g.type;
    document.getElementById('gameLocation').value = g.location;
    this.showGameForm();
  }

  deleteGame(id) {
    if (confirm('Delete game?')) {
      this.schedule = this.schedule.filter(g => g.id !== id);
      this.saveData();
      this.loadSchedule();
    }
  }

  // STATS MANAGEMENT
  saveStats() {
    this.stats.wins = parseInt(document.getElementById('wins').value) || 0;
    this.stats.losses = parseInt(document.getElementById('losses').value) || 0;
    this.stats.ties = parseInt(document.getElementById('ties').value) || 0;
    this.saveData();
    alert('Stats saved!');
  }

  loadStats() {
    document.getElementById('wins').value = this.stats.wins;
    document.getElementById('losses').value = this.stats.losses;
    document.getElementById('ties').value = this.stats.ties;
  }

  // NEWS MANAGEMENT
  showNewsForm() {
    document.getElementById('newsForm').style.display = 'block';
    this.clearNewsForm();
  }

  hideNewsForm() {
    document.getElementById('newsForm').style.display = 'none';
  }

  clearNewsForm() {
    document.getElementById('newsId').value = '';
    document.getElementById('newsTitle').value = '';
    document.getElementById('newsDate').value = '';
    document.getElementById('newsCategory').value = '';
    document.getElementById('newsContent').value = '';
  }

  saveNews() {
    const id = document.getElementById('newsId').value;
    const post = {
      id: id || Date.now().toString(),
      title: document.getElementById('newsTitle').value,
      date: document.getElementById('newsDate').value,
      category: document.getElementById('newsCategory').value,
      content: document.getElementById('newsContent').value
    };

    if (id) {
      const index = this.news.findIndex(n => n.id === id);
      this.news[index] = post;
    } else {
      this.news.push(post);
    }

    this.saveData();
    this.loadNews();
    this.hideNewsForm();
  }

  loadNews() {
    const list = document.getElementById('newsList');
    list.innerHTML = '';
    const sorted = [...this.news].sort((a, b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(n => {
      const dateStr = new Date(n.date).toLocaleDateString();
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <div><strong>${n.title}</strong><br>${n.category} | ${dateStr}<br><small>${n.content.substring(0, 100)}...</small></div>
        <div>
          <button class="btn-small" onclick="admin.editNews('${n.id}')">Edit</button>
          <button class="btn-small" onclick="admin.deleteNews('${n.id}')">Delete</button>
        </div>
      `;
      list.appendChild(item);
    });
  }

  editNews(id) {
    const n = this.news.find(x => x.id === id);
    document.getElementById('newsId').value = n.id;
    document.getElementById('newsTitle').value = n.title;
    document.getElementById('newsDate').value = n.date;
    document.getElementById('newsCategory').value = n.category;
    document.getElementById('newsContent').value = n.content;
    this.showNewsForm();
  }

  deleteNews(id) {
    if (confirm('Delete post?')) {
      this.news = this.news.filter(n => n.id !== id);
      this.saveData();
      this.loadNews();
    }
  }
}

const admin = new AdminPortal();
