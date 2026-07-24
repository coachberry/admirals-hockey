(function() {
  var pageId = window.location.pathname.split('/').pop().replace('.html','');
  var urlParams = new URLSearchParams(window.location.search);
  var previewRole = urlParams.get('preview');

  var style = document.createElement('style');
  style.id = 'page-guard-style';
  style.textContent = '.nav-links li { visibility: hidden !important; }';
  document.head.appendChild(style);

  if (previewRole) {
    var banner = document.createElement('div');
    banner.id = 'previewBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#5D1725;color:white;text-align:center;padding:6px 1rem;font-size:0.82rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:1rem;';
    banner.innerHTML = 'Previewing as: <strong>' + previewRole.toUpperCase() + '</strong> &nbsp;&mdash;&nbsp; <a href="javascript:window.close()" style="color:white;text-decoration:underline;">Close Preview</a>';
    document.body.appendChild(banner);
    document.body.style.paddingTop = '34px';
  }

  window._previewRole = previewRole || null;

  fetch('https://firestore.googleapis.com/v1/projects/admirals-hockey/databases/(default)/documents/settings/pages')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var fields = data.fields || {};
      var isSuperAdminNotPreview = !previewRole && window._firebaseAdminUser;

      if (pageId && pageId !== 'index' && fields[pageId] && fields[pageId].booleanValue === false) {
        if (!isSuperAdminNotPreview) {
          window.location.href = '/index.html';
          return;
        }
        var hiddenBanner = document.createElement('div');
        hiddenBanner.style.cssText = 'background:#856404;color:white;text-align:center;padding:6px 1rem;font-size:0.82rem;font-weight:600;';
        hiddenBanner.innerHTML = 'This page is currently HIDDEN from visitors';
        document.body.insertAdjacentElement('afterbegin', hiddenBanner);
      }

      document.querySelectorAll('.nav-links li').forEach(function(li) {
        var link = li.querySelector('a');
        if (!link) { li.style.visibility = 'visible'; return; }
        var href = link.getAttribute('href') || '';
        var match = href.match(/\/([a-zA-Z0-9-]+)(?:\.html)?$/);
        var linkPageId = match ? match[1] : null;
        if (linkPageId && fields[linkPageId] && fields[linkPageId].booleanValue === false && !isSuperAdminNotPreview) {
          li.style.display = 'none';
        } else {
          li.style.visibility = 'visible';
        }
      });

      document.querySelectorAll('.footer-section a').forEach(function(link) {
        var href = link.getAttribute('href') || '';
        var match = href.match(/\/([a-zA-Z0-9-]+)(?:\.html)?$/);
        var linkPageId = match ? match[1] : null;
        if (linkPageId && fields[linkPageId] && fields[linkPageId].booleanValue === false && !isSuperAdminNotPreview) {
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
