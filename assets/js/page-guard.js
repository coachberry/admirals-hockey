(function() {
  var pageId = window.location.pathname.split('/').pop().replace('.html','');

  fetch('https://firestore.googleapis.com/v1/projects/admirals-hockey/databases/(default)/documents/settings/pages')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var fields = data.fields || {};

      // Redirect if this page is hidden (skip homepage)
      if (pageId && pageId !== 'index' && fields[pageId] && fields[pageId].booleanValue === false) {
        window.location.href = '/index.html';
        return;
      }

      // Hide nav links for all hidden pages on every page
      Object.keys(fields).forEach(function(id) {
        if (fields[id].booleanValue === false) {
          document.querySelectorAll('a[href*="/' + id + '.html"]').forEach(function(l) {
            var li = l.parentElement;
            if (li && li.tagName === 'LI') li.style.display = 'none';
          });
        }
      });
    }).catch(function() {});
})();
