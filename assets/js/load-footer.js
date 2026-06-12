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
})();
