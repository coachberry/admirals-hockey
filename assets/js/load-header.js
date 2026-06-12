(function() {
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
      btn.classList.toggle('open');
      nav.classList.toggle('open');
    });
  }
})();
