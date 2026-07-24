(function() {
  // Hide nav immediately to avoid flashing the default menu before nav-render.js decides
  var navHideStyle = document.createElement('style');
  navHideStyle.id = 'nav-hide-style';
  navHideStyle.textContent = '#navLinks{display:none!important;}';
  document.head.appendChild(navHideStyle);

  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/assets/partials/header.html', false); // synchronous
  try {
    xhr.send();
    if (xhr.status === 200) {
      var placeholder = document.getElementById('site-header');
      if (placeholder) placeholder.outerHTML = xhr.responseText;
    }
  } catch (e) {}

  // Mark active nav link based on current page
  var path = window.location.pathname;
  var page = path.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a.nav-link').forEach(function(link) {
    var href = link.getAttribute('href') || '';
    var linkPage = href.split('/').pop();
    if (linkPage === page) {
      link.classList.add('active');
    }
  });

  // Hamburger toggle (since this used to be set up by a separate inline script)
  var btn = document.getElementById('navToggle');
  var nav = document.getElementById('navLinks');
  if (btn && nav) {
    btn.addEventListener('click', function() {
      // Remove hide style so mobile open class can take effect
      var hideStyle = document.getElementById('nav-hide-style');
      if (hideStyle) hideStyle.remove();
      btn.classList.toggle('open');
      nav.classList.toggle('open');
    });
  }

  // Load custom navigation renderer (no-op unless a custom nav structure is configured)
  var navScript = document.createElement('script');
  navScript.type = 'module';
  navScript.src = '/assets/js/nav-render.js';
  document.body.appendChild(navScript);
})();

// Register service worker for PWA install capability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration failed:', err));
  });
}
