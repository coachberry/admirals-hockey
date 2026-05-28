// Data Loader - Updates existing page elements with admin data
// This is smart: it finds existing elements and updates content only

class DataLoader {
  constructor() {
    this.loadData();
    this.updatePage();
    setInterval(() => this.checkForUpdates(), 5000);
  }

  loadData() {
    this.stats = JSON.parse(localStorage.getItem('admirals_stats')) || { wins: 12, losses: 4, ties: 2 };
    this.roster = JSON.parse(localStorage.getItem('admirals_roster')) || [];
    this.schedule = JSON.parse(localStorage.getItem('admirals_schedule')) || [];
  }

  checkForUpdates() {
    this.loadData();
    this.updatePage();
  }

  updatePage() {
    const path = window.location.pathname;
    
    if (path.includes('index.html') || path === '/' || path === '') {
      this.updateHomePage();
    } else if (path.includes('roster')) {
      this.updateRosterPage();
    } else if (path.includes('schedule')) {
      this.updateSchedulePage();
    } else if (path.includes('stats')) {
      this.updateStatsPage();
    }
  }

  updateHomePage() {
    // Update stat cards (find by .stat-card class)
    const statCards = document.querySelectorAll('.stat-card');
    if (statCards.length >= 3) {
      const statNumbers = statCards[0].querySelectorAll('.stat-number');
      if (statNumbers.length >= 1) statNumbers[0].textContent = this.stats.wins;
      
      const cards2 = document.querySelectorAll('.stat-card');
      if (cards2[1]) {
        const nums = cards2[1].querySelectorAll('.stat-number');
        if (nums[0]) nums[0].textContent = this.stats.losses;
      }
      
      if (cards2[2]) {
        const nums = cards2[2].querySelectorAll('.stat-number');
        if (nums[0]) nums[0].textContent = this.stats.ties;
      }
    }

    // Update first game card if schedule exists
    if (this.schedule.length > 0) {
      const gameCards = document.querySelectorAll('.game-card');
      if (gameCards.length > 0) {
        const nextGame = this.schedule[0];
        const matchup = gameCards[0].querySelector('.matchup');
        if (matchup) {
          matchup.innerHTML = `
            <div class="team">
              <div class="team-name">Admirals</div>
              <div class="team-record">${this.stats.wins}-${this.stats.losses}-${this.stats.ties}</div>
            </div>
            <div class="vs">vs</div>
            <div class="team">
              <div class="team-name">${nextGame.opponent}</div>
              <div class="team-record">-</div>
            </div>
          `;
        }
      }
    }
  }

  updateRosterPage() {
    const rosterGrids = document.querySelectorAll('.roster-grid');
    if (rosterGrids.length === 0 || this.roster.length === 0) return;

    const grid = rosterGrids[0];
    // Only update if we have new data
    if (this.roster.length > 0 && grid.querySelectorAll('.player-card').length !== this.roster.length) {
      grid.innerHTML = '';
      this.roster.forEach(p => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
          <div class="player-number">${p.number}</div>
          <div class="player-info">
            <div class="player-name">${p.name}</div>
            <div class="player-position">${p.position}</div>
            <span class="player-grade">${p.grade}</span>
          </div>
        `;
        grid.appendChild(card);
      });
    }
  }

  updateSchedulePage() {
    const grids = document.querySelectorAll('.games-grid');
    if (grids.length === 0 || this.schedule.length === 0) return;

    const grid = grids[0];
    if (this.schedule.length > 0 && grid.querySelectorAll('.game-card').length !== this.schedule.length) {
      grid.innerHTML = '';
      const sorted = [...this.schedule].sort((a, b) => new Date(a.date) - new Date(b.date));
      sorted.forEach(game => {
        const dateStr = new Date(game.date).toLocaleDateString('en-US', { 
          weekday: 'long', 
          month: 'long', 
          day: 'numeric' 
        });
        
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
          <div class="game-header">Regular Season</div>
          <div class="game-content">
            <div class="game-date">${dateStr}</div>
            <div class="matchup">
              <div class="team">
                <div class="team-name">Admirals</div>
                <div class="team-record">${this.stats.wins}-${this.stats.losses}-${this.stats.ties}</div>
              </div>
              <div class="vs">${game.type === 'Home' ? 'vs' : '@'}</div>
              <div class="team">
                <div class="team-name">${game.opponent}</div>
                <div class="team-record">-</div>
              </div>
            </div>
            <div class="game-time">${game.time}</div>
            <div class="game-location">${game.location}</div>
          </div>
        `;
        grid.appendChild(card);
      });
    }
  }

  updateStatsPage() {
    // Update stat cards
    const statCards = document.querySelectorAll('.stat-card');
    if (statCards.length >= 3) {
      const updateCard = (index, value) => {
        const nums = statCards[index].querySelectorAll('.stat-number');
        if (nums[0]) nums[0].textContent = value;
      };
      updateCard(0, this.stats.wins);
      updateCard(1, this.stats.losses);
      updateCard(2, this.stats.ties);
    }
  }
}

new DataLoader();
