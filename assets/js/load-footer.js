(function() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/assets/partials/footer.html?t=' + Date.now(), false); // synchronous, cache-busted
  try {
    xhr.send();
    if (xhr.status === 200) {
      var placeholder = document.getElementById('site-footer');
      if (placeholder) placeholder.outerHTML = xhr.responseText;
    }
  } catch (e) {}

  // Load footer quick links from Firestore
  fetch('https://firestore.googleapis.com/v1/projects/admirals-hockey/databases/(default)/documents/settings/footerLinks')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.fields || !data.fields.links) return;
      var ALL_LINKS = [
        { id: 'home',        label: 'Home',          href: '/index.html' },
        { id: 'schedule',    label: 'Schedule',      href: '/schedule' },
        { id: 'roster',      label: 'Roster',        href: '/roster' },
        { id: 'stats',       label: 'Stats',         href: '/stats' },
        { id: 'leaderboard', label: 'Leaderboard',   href: '/leaderboard' },
        { id: 'news',        label: 'News',          href: '/news' },
        { id: 'chat',        label: 'Team Chat',     href: '/chat' },
        { id: 'events',      label: 'Events',        href: '/events' },
        { id: 'gallery',     label: 'Gallery',       href: '/gallery' },
        { id: 'summer',      label: 'Summer Hockey', href: '/summer-hockey' },
        { id: 'alumni',      label: 'Alumni',        href: '/alumni' },
        { id: 'sponsors',    label: 'Sponsors',      href: '/sponsors' },
        { id: 'tryouts',     label: 'Tryouts',       href: '/tryouts' },
        { id: 'contact',     label: 'Contact',       href: '/contact' },
      ];
      var enabled = (data.fields.links.arrayValue && data.fields.links.arrayValue.values || []).map(function(v) { return v.stringValue; });
      var ql = document.querySelector('.footer-section');
      if (ql && enabled.length) {
        ql.innerHTML = '<h3>Quick Links</h3>' + ALL_LINKS.filter(function(l) { return enabled.includes(l.id); }).map(function(l) {
          return '<p><a href="' + l.href + '">' + l.label + '</a></p>';
        }).join('');
      }
    })
    .catch(function() {});

  // Load contact info from Firestore to populate footer fields
  fetch('https://firestore.googleapis.com/v1/projects/admirals-hockey/databases/(default)/documents/settings/contactInfo')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.fields) return;
      var f = data.fields;
      function str(field) { return field && field.stringValue ? field.stringValue : null; }
      var coachName  = str(f.coachName);
      var coachEmail = str(f.coachEmail);
      var schoolName = str(f.schoolName);
      var address1   = str(f.address1);
      var address2   = str(f.address2);
      if (coachName)  { var el = document.getElementById('footerCoachName'); if (el) el.textContent = coachName; }
      if (coachEmail) { var el2 = document.getElementById('footerCoachEmail'); if (el2) { el2.textContent = coachEmail; el2.href = 'mailto:' + coachEmail; } }
      if (schoolName) { var el3 = document.getElementById('footerSchoolName'); if (el3) el3.textContent = schoolName; }
      if (address1)   { var el4 = document.getElementById('footerAddress1'); if (el4) el4.textContent = address1; }
      if (address2)   { var el5 = document.getElementById('footerAddress2'); if (el5) el5.textContent = address2; }
      var teamEmail = str(f.teamEmail);
      var teamPhone = str(f.teamPhone);
      // Add team contact section if configured
      var teamSection = document.getElementById('footerTeamContact');
      if (!teamSection && (teamEmail || teamPhone)) {
        var contactSection = document.querySelector('.footer-section:nth-child(2)');
        if (contactSection) {
          if (teamEmail) {
            var p = document.createElement('p');
            p.innerHTML = '<strong>Team Email:</strong> <a href="mailto:' + teamEmail + '" style="color:white;">' + teamEmail + '</a>';
            contactSection.appendChild(p);
          }
          if (teamPhone) {
            var p2 = document.createElement('p');
            p2.innerHTML = '<strong>Team Phone:</strong> ' + teamPhone;
            contactSection.appendChild(p2);
          }
        }
      }
    })
    .catch(function() {});

  // Load copyright year
  var copy = document.querySelector('.footer-bottom p');
  if (copy) copy.innerHTML = '&copy; ' + new Date().getFullYear() + ' Franklin High School Admirals Hockey. All rights reserved.';
})();
