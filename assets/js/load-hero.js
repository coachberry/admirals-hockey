// Loads hero badge/title/subtitle from Firestore settings/pageHeroes
(function() {
  var pageId = window.location.pathname.replace(/^\//, '').split('/')[0] || 'home';
  // Map clean URLs to page IDs
  var urlMap = {
    'news': 'news', 'events': 'events', 'roster': 'roster',
    'schedule': 'schedule', 'stats': 'stats', 'leaderboard': 'leaderboard',
    'gallery': 'gallery', 'summer-hockey': 'summer', 'alumni': 'alumni',
    'sponsors': 'sponsors', 'contact': 'contact', 'tryouts': 'tryouts'
  };
  pageId = urlMap[pageId] || pageId;

  // Dynamic badge pages - don't overwrite badge (it's set by season logic)
  var dynamicBadge = ['roster', 'schedule', 'stats', 'tryouts'];

  fetch('https://firestore.googleapis.com/v1/projects/admirals-hockey/databases/(default)/documents/settings/pageHeroes')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.fields || !data.fields[pageId]) return;
      var pageData = data.fields[pageId].mapValue && data.fields[pageId].mapValue.fields;
      if (!pageData) return;

      function getStr(field) {
        return field && field.stringValue !== undefined ? field.stringValue : null;
      }

      var badge = getStr(pageData.badge);
      var title = getStr(pageData.title);
      var subtitle = getStr(pageData.subtitle);

      if (badge !== null && !dynamicBadge.includes(pageId)) {
        var badgeEl = document.querySelector('.hero-badge:not([id])');
        if (badgeEl) badgeEl.textContent = badge;
      }
      if (title) {
        var titleEl = document.querySelector('.hero-title');
        if (titleEl) titleEl.textContent = title;
      }
      if (subtitle) {
        var subtitleEl = document.querySelector('.hero-subtitle, .hero-section p, .hero-section .hero-subtitle');
        if (subtitleEl) subtitleEl.textContent = subtitle;
      }
    })
    .catch(function() {});
})();
