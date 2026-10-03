(function () {
  var root = document.querySelector('[data-article-filters]');
  var list = document.querySelector('[data-article-list]');
  if (!root || !list) return;
  var featured = document.querySelector('[data-article-featured]');
  var empty = document.querySelector('[data-article-empty]');
  var pagination = document.querySelector('[data-article-pagination]');
  var PAGE_SIZE = 20;

  var categoryChips = [].slice.call(root.querySelectorAll('[data-filter-category]'));
  var cuisineChips = [].slice.call(root.querySelectorAll('[data-filter-cuisine]'));
  var cards = [].slice.call(list.querySelectorAll('.article-card[data-category]'));

  var knownCategories = categoryChips
    .map(function (c) { return c.getAttribute('data-filter-category'); })
    .filter(Boolean);
  var knownCuisines = cuisineChips
    .map(function (c) { return c.getAttribute('data-filter-cuisine'); })
    .filter(Boolean);

  var state = { category: null, cuisines: [], page: 1 };

  function parseSearch(search) {
    var params = new URLSearchParams(search);
    var category = params.get('category');
    state.category = category && knownCategories.indexOf(category) !== -1 ? category : null;
    var seen = {};
    state.cuisines = params.getAll('cuisine')
      .filter(function (c) { return knownCuisines.indexOf(c) !== -1; })
      .filter(function (c) { if (seen[c]) return false; seen[c] = true; return true; })
      .sort();
    var page = parseInt(params.get('page') || '1', 10);
    state.page = isFinite(page) && page >= 1 ? page : 1;
  }

  function buildSearch() {
    var parts = [];
    if (state.category) parts.push('category=' + encodeURIComponent(state.category));
    state.cuisines.slice().sort().forEach(function (c) {
      parts.push('cuisine=' + encodeURIComponent(c));
    });
    if (state.page > 1) parts.push('page=' + state.page);
    return parts.length ? '?' + parts.join('&') : '';
  }

  function matches(card) {
    if (state.category && card.getAttribute('data-category') !== state.category) return false;
    if (state.cuisines.length === 0) return true;
    var raw = card.getAttribute('data-cuisines') || '';
    var tags = raw ? raw.split(',') : [];
    for (var i = 0; i < state.cuisines.length; i++) {
      var c = state.cuisines[i];
      if (c === 'common' ? tags.length === 0 : tags.indexOf(c) !== -1) return true;
    }
    return false;
  }

  function renderPagination(totalPages) {
    if (!pagination) return;
    if (totalPages <= 1) {
      pagination.hidden = true;
      pagination.innerHTML = '';
      return;
    }
    var html = '';
    for (var p = 1; p <= totalPages; p++) {
      html += p === state.page
        ? '<span class="article-page is-current" aria-current="page">' + p + '</span>'
        : '<button type="button" class="article-page" data-page="' + p + '">' + p + '</button>';
    }
    pagination.innerHTML = html;
    pagination.hidden = false;
  }

  function apply() {
    var filtering = state.category !== null || state.cuisines.length > 0;
    categoryChips.forEach(function (chip) {
      var value = chip.getAttribute('data-filter-category') || '';
      var active = value === '' ? state.category === null : state.category === value;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    cuisineChips.forEach(function (chip) {
      var active = state.cuisines.indexOf(chip.getAttribute('data-filter-cuisine')) !== -1;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    var matched = cards.filter(matches);
    var totalPages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * PAGE_SIZE;
    var visible = matched.slice(start, start + PAGE_SIZE);
    cards.forEach(function (card) { card.hidden = visible.indexOf(card) === -1; });
    [].slice.call(list.querySelectorAll('[data-article-group]')).forEach(function (group) {
      group.hidden = ![].slice.call(group.querySelectorAll('.article-card')).some(function (card) { return !card.hidden; });
    });
    // フィルター中はおすすめ枠を出さない（一致記事だけを表示する）
    if (featured) featured.hidden = filtering || state.page > 1;
    if (empty) empty.hidden = matched.length !== 0;
    renderPagination(totalPages);
  }

  function push() {
    history.pushState(null, '', location.pathname + buildSearch());
  }

  function trackFilter() {
    if (typeof window.tabeliaTrack !== 'function') return;
    window.tabeliaTrack('article_filter', {
      category: state.category || 'all',
      cuisine: state.cuisines.length ? state.cuisines.join(',') : 'all',
    });
  }

  function closestIn(target, selector) {
    return target && typeof target.closest === 'function' ? target.closest(selector) : null;
  }

  root.addEventListener('click', function (e) {
    var chip = closestIn(e.target, '[data-filter-category],[data-filter-cuisine]');
    if (!chip) return;
    var cat = chip.getAttribute('data-filter-category');
    if (cat !== null) {
      state.category = cat === '' ? null : state.category === cat ? null : cat;
    } else {
      var cui = chip.getAttribute('data-filter-cuisine');
      var i = state.cuisines.indexOf(cui);
      if (i === -1) state.cuisines.push(cui);
      else state.cuisines.splice(i, 1);
      state.cuisines.sort();
    }
    state.page = 1;
    push();
    apply();
    trackFilter();
  });

  if (pagination) {
    pagination.addEventListener('click', function (e) {
      var button = closestIn(e.target, '[data-page]');
      if (!button) return;
      state.page = parseInt(button.getAttribute('data-page'), 10) || 1;
      push();
      apply();
      list.scrollIntoView();
    });
  }

  if (empty) {
    empty.addEventListener('click', function (e) {
      if (!closestIn(e.target, '[data-filter-clear]')) return;
      state.category = null;
      state.cuisines = [];
      state.page = 1;
      push();
      apply();
      trackFilter();
    });
  }

  // 戻る・進むで選択を復元する
  window.addEventListener('popstate', function () {
    parseSearch(location.search);
    apply();
  });

  parseSearch(location.search);
  apply();
})();
