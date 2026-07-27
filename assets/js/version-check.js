(function() {
  var CHECK_INTERVAL = 5 * 60 * 1000; // check every 5 minutes while app is open

  function showUpdateBanner() {
    if (document.getElementById('appUpdateBanner')) return;
    var banner = document.createElement('div');
    banner.id = 'appUpdateBanner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:999999;background:#5D1725;color:white;padding:0.8rem 1rem;font-size:0.85rem;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:1rem;box-shadow:0 -2px 10px rgba(0,0,0,0.2);';
    banner.innerHTML = '<span>🔄 A new version is available</span>'
      + '<button id="appUpdateBtn" style="background:white;color:#5D1725;border:none;border-radius:6px;padding:0.4rem 1rem;font-weight:700;cursor:pointer;font-size:0.82rem;">Update Now</button>';
    document.body.appendChild(banner);

    document.getElementById('appUpdateBtn').addEventListener('click', function() {
      forceUpdate();
    });
  }

  function forceUpdate() {
    // Clear all caches and unregister service worker, then hard reload
    if ('caches' in window) {
      caches.keys().then(function(names) {
        return Promise.all(names.map(function(name) { return caches.delete(name); }));
      }).finally(finishUpdate);
    } else {
      finishUpdate();
    }
  }

  function finishUpdate() {
    fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function(r) { return r.json(); })
      .then(function(data) { localStorage.setItem('admirals_app_version', data.version); })
      .catch(function() {})
      .finally(function() {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(function(regs) {
            Promise.all(regs.map(function(r) { return r.update(); }))
              .finally(function() { window.location.reload(); });
          }).catch(function() { window.location.reload(); });
        } else {
          window.location.reload();
        }
      });
  }

  function checkVersion() {
    fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var latest = data.version;
        var stored = localStorage.getItem('admirals_app_version');
        if (!stored) {
          localStorage.setItem('admirals_app_version', latest);
          return;
        }
        if (parseInt(stored) < parseInt(latest)) {
          showUpdateBanner();
        }
      })
      .catch(function() {});
  }

  checkVersion();
  setInterval(checkVersion, CHECK_INTERVAL);

  // Also check when app returns to foreground (common on mobile)
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') checkVersion();
  });
})();
