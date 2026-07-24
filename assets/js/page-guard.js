(function() {
  var pageId = window.location.pathname.split('/').pop().replace('.html','');

  var style = document.createElement('style');
  style.id = 'page-guard-style';
  style.textContent = '.nav-links li { visibility: hidden !important; }';
  document.head.appendChild(style);

  fetch('https://firestore.googleapis.com/v1/projects/admirals-hockey/databases/(default)/documents/settings/pages')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var fields = data.fields || {};

      if (pageId && pageId !== 'index' && fields[pageId] && fields[pageId].booleanValue === false) {
        window.location.href = '/index.html';
        return;
      }

      document.querySelectorAll('.nav-links li').forEach(function(li) {
        var link = li.querySelector('a');
        if (!link) { li.style.visibility = 'visible'; return; }
        var href = link.getAttribute('href') || '';
        var match = href.match(/\/([a-zA-Z0-9-]+)(?:\.html)?$/);
        var linkPageId = match ? match[1] : null;
        if (linkPageId && fields[linkPageId] && fields[linkPageId].booleanValue === false) {
          li.style.display = 'none';
        } else {
          li.style.visibility = 'visible';
        }
      });

      document.querySelectorAll('.footer-section a').forEach(function(link) {
        var href = link.getAttribute('href') || '';
        var match = href.match(/\/([a-zA-Z0-9-]+)(?:\.html)?$/);
        var linkPageId = match ? match[1] : null;
        if (linkPageId && fields[linkPageId] && fields[linkPageId].booleanValue === false) {
          var p = link.closest('p');
          if (p) p.style.display = 'none';
        }
      });

      var s = document.getElementById('page-guard-style');
      if (s) s.remove();
    }).catch(function() {
      document.querySelectorAll('.nav-links li').forEach(function(li) { li.style.visibility = 'visible'; });
      var s = document.getElementById('page-guard-style');
      if (s) s.remove();
    });
})();
