(function() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/assets/partials/footer.html', false); // synchronous
  try {
    xhr.send();
    if (xhr.status === 200) {
      var placeholder = document.getElementById('site-footer');
      if (placeholder) placeholder.outerHTML = xhr.responseText;
    }
  } catch (e) {}

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
    })
    .catch(function() {});

  // Load copyright year
  var copy = document.querySelector('.footer-bottom p');
  if (copy) copy.innerHTML = '&copy; ' + new Date().getFullYear() + ' Franklin High School Admirals Hockey. All rights reserved.';
})();
