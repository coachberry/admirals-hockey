(function() {
  var pageId = window.location.pathname.split('/').pop().replace('.html','');

  // Immediately hide all nav links to prevent flash, will reveal after check
  var style = document.createElement('style');
  style.id = 'page-guard-style';
  style.textContent = '.nav-links li { visibility: hidden !important; }';
  document.head.appendChild(style);

  fetch('https://firestore.googleapis.com/v1/projects/admirals-hockey/databases/(default)/documents/settings/pages')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var fields = data.fields || {};

      // Redirect if this page is hidden (skip homepage)
      if (pageId && pageId !== 'index' && fields[pageId] && fields[pageId].booleanValue === false) {
        window.location.href = '/index.html';
        return;
      }

      // Hide nav links for hidden pages, reveal the rest
      document.querySelectorAll('.nav-links li').forEach(function(li) {
        var link = li.querySelector('a');
        if (!link) { li.style.visibility = 'visible'; return; }
        var href = link.getAttribute('href') || '';
        var match = href.match(/\/([a-zA-Z0-9-]+)\.html/);
        var linkPageId = match ? match[1] : null;
        if (linkPageId && fields[linkPageId] && fields[linkPageId].booleanValue === false) {
          li.style.display = 'none';
        } else {
          li.style.visibility = 'visible';
        }
      });

      var s = document.getElementById('page-guard-style');
      if (s) s.remove();
    }).catch(function() {
      // On error, just reveal everything
      document.querySelectorAll('.nav-links li').forEach(function(li) { li.style.visibility = 'visible'; });
      var s = document.getElementById('page-guard-style');
      if (s) s.remove();
    });
})();
