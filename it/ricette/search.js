(function () {
  var input = document.getElementById('recipe-search-input');
  var results = document.getElementById('recipe-search-results');
  if (!input || !results) return;

  var data = null;
  var fetchPromise = null;

  function ensureData() {
    if (!fetchPromise) {
      fetchPromise = fetch('/it/ricette/search-index.json')
        .then(function (r) { return r.json(); })
        .then(function (json) { data = json; return json; });
    }
    return fetchPromise;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function render(query) {
    if (!query) {
      results.innerHTML = '';
      results.hidden = true;
      return;
    }
    var q = query.toLowerCase();
    var matches = (data || [])
      .filter(function (r) {
        return (
          r.title.toLowerCase().indexOf(q) !== -1 ||
          r.nameOriginal.toLowerCase().indexOf(q) !== -1
        );
      })
      .slice(0, 20);

    if (matches.length === 0) {
      results.innerHTML = '<p class="search-empty">Nessuna ricetta trovata</p>';
      results.hidden = false;
      return;
    }

    results.innerHTML = matches
      .map(function (r) {
        return (
          '<a class="search-result" href="/it/ricette/' + r.slug + '/">' +
          (r.hero ? '<img src="' + escapeHtml(r.hero) + '" alt="" loading="lazy" width="48" height="48">' : '') +
          '<span class="search-result-body">' +
          '<span class="search-result-title">' + escapeHtml(r.title) + '</span>' +
          '<span class="search-result-subtitle">' + escapeHtml(r.nameOriginal) + '</span>' +
          '</span></a>'
        );
      })
      .join('');
    results.hidden = false;
  }

  input.addEventListener('focus', function () {
    ensureData().then(function () {
      if (input.value.trim()) render(input.value.trim());
    });
  });
  input.addEventListener('input', function () {
    ensureData().then(function () { render(input.value.trim()); });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.header-search')) results.hidden = true;
  });
})();
