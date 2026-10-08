(function(){
const LATIN_LIGATURES = {
    'œ': 'oe', 'æ': 'ae', 'ß': 'ss', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th',
};
const SMALL_KANA_TO_LARGE = {
    'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
    'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ',
};
const KANJI_READINGS = [
    ['薩摩芋', 'さつまいも'],
    ['玉ねぎ', 'たまねぎ'], ['玉葱', 'たまねぎ'],
    ['茄子', 'なす'], ['烏賊', 'いか'], ['牛蒡', 'ごぼう'], ['大蒜', 'にんにく'],
    ['南瓜', 'かぼちゃ'], ['人参', 'にんじん'], ['胡瓜', 'きゅうり'],
    ['牛肉', 'ぎゅうにく'], ['豚肉', 'ぶたにく'], ['鶏肉', 'とりにく'],
    ['蛸', 'たこ'], ['葱', 'ねぎ'], ['韮', 'にら'], ['蕪', 'かぶ'], ['茄', 'なす'],
];
const SEPARATORS = /[\s　・･、。，,．.'’‘`´\-‐–—―_~〜～:：;；/／&＆!！?？()（）[\]「」『』【】"“”]/g;
const cache = new Map();
const CACHE_LIMIT = 4000;
function normalizeSearchText(input) {
    const hit = cache.get(input);
    if (hit !== undefined)
        return hit;
    let s = input.normalize('NFKC').toLowerCase();
    s = s.replace(/[œæßøłđðþ]/g, (ch) => { var _a; return (_a = LATIN_LIGATURES[ch]) !== null && _a !== void 0 ? _a : ch; });
    s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
    for (const [kanji, reading] of KANJI_READINGS)
        s = s.split(kanji).join(reading);
    s = s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    s = s.replace(/ゔぁ/g, 'ば').replace(/ゔぃ/g, 'び').replace(/ゔぇ/g, 'べ').replace(/ゔぉ/g, 'ぼ').replace(/ゔ/g, 'ぶ');
    s = s.replace(/っ/g, '');
    s = s.replace(/[ぁぃぅぇぉゃゅょゎ]/g, (ch) => { var _a; return (_a = SMALL_KANA_TO_LARGE[ch]) !== null && _a !== void 0 ? _a : ch; });
    s = s.replace(/ー/g, '');
    s = s.replace(SEPARATORS, '');
    if (cache.size >= CACHE_LIMIT)
        cache.clear();
    cache.set(input, s);
    return s;
}
function foldKanaVoicing(key) {
    return key.normalize('NFD').replace(/[゙゚]/g, '');
}
function searchTokens(query) {
    return query
        .split(/[\s　・･,、]+/)
        .map((t) => normalizeSearchText(t))
        .filter((t) => t.length > 0);
}
function searchKeyIncludes(haystackKey, needleKey) {
    if (needleKey.length === 0)
        return true;
    if (haystackKey.length === 0)
        return false;
    if (haystackKey.includes(needleKey))
        return true;
    return foldKanaVoicing(haystackKey).includes(foldKanaVoicing(needleKey));
}
function rankNameMatch(keys, query) {
    const tokens = searchTokens(query);
    if (tokens.length === 0)
        return 0;
    const joined = tokens.join('');
    let best = 0;
    for (const key of keys) {
        if (!key)
            continue;
        if (key === joined || foldKanaVoicing(key) === foldKanaVoicing(joined))
            return 100;
        if (key.startsWith(joined) || foldKanaVoicing(key).startsWith(foldKanaVoicing(joined)))
            best = Math.max(best, 80);
        else if (searchKeyIncludes(key, joined))
            best = Math.max(best, 60);
    }
    if (best > 0)
        return best;
    const all = keys.join(' ');
    return tokens.every((t) => searchKeyIncludes(all, t)) ? 50 : 0;
}

// 検索ページ（/recipes/search/）の絞り込み。web-discovery.ts が検索語の正規化関数と一緒に包んで discovery.js に書き出す。
// 国・コース・難易度はどれも複数選択。同じ項目の中は OR、項目の間は AND。コースは選んだ国にだけ効く。
// 600px 以下は「条件を決める画面」と「結果を見る画面」を main[data-view] で切り替え、601px 以上は両方を並べる。
function startDiscovery(copy, facets) {
  var main = document.getElementById('discovery');
  if (!main) return;
  var input = document.getElementById('discovery-query');
  var cuisinesEl = document.getElementById('discovery-cuisines');
  var difficultyEl = document.getElementById('discovery-difficulty');
  var applyButton = document.getElementById('discovery-apply');
  var clearButton = document.getElementById('discovery-clear');
  var resetLink = document.getElementById('discovery-reset');
  var summary = document.getElementById('discovery-summary');
  var summaryQuery = document.getElementById('discovery-summary-query');
  var summaryFilters = document.getElementById('discovery-summary-filters');
  var results = document.getElementById('discovery-results');
  var status = document.getElementById('discovery-status');
  var heading = document.getElementById('discovery-heading');
  var conditions = document.getElementById('discovery-conditions');
  var more = document.getElementById('discovery-more');
  var retry = document.getElementById('discovery-retry');
  var mobile = window.matchMedia('(max-width: 600px)');
  var ja = document.documentElement.lang === 'ja';
  var SEP = ja ? { course: '：', item: '・', part: '　' } : { course: ': ', item: ', ', part: ' · ' };
  var STAR = '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M6 1l1.5 3.1 3.4.5-2.5 2.4.6 3.4L6 8.8 3 10.4l.6-3.4L1.1 4.6l3.4-.5z" fill="currentColor"/></svg>';
  var CHECK = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="m2.5 6.2 2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var PAGE = 24;
  var data = [], loaded = false, limit = PAGE;
  var state = { q: '', cuisines: [], courses: [], difficulty: [] };
  var cuisineButtons = {}, courseBoxes = {}, courseButtons = {}, difficultyButtons = {};

  function fill(template, n) { return template.replace('{n}', n); }
  function has(list, value) { return list.indexOf(value) >= 0; }
  function toggle(list, value) { var i = list.indexOf(value); if (i < 0) list.push(value); else list.splice(i, 1); }
  function cuisineOf(code) { for (var i = 0; i < facets.length; i++) if (facets[i].code === code) return facets[i]; return null; }
  function courseOf(cuisine, code) { for (var i = 0; i < cuisine.courses.length; i++) if (cuisine.courses[i].code === code) return cuisine.courses[i]; return null; }
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; }
  function hasFilters() { return !!(state.q || state.cuisines.length || state.courses.length || state.difficulty.length); }
  function list(value) { return (value || '').split(',').filter(Boolean); }

  // URL は ?country=Italian,French&course=Italian:secondo&difficulty=2,3。旧形式（単一値）もそのまま読める
  function readUrl() {
    var params = new URLSearchParams(location.search);
    state.q = (params.get('q') || '').trim();
    state.cuisines = list(params.get('country')).filter(function (code) { return cuisineOf(code); });
    state.courses = list(params.get('course')).filter(function (key) {
      var parts = key.split(':'), cuisine = cuisineOf(parts[0]);
      return cuisine && has(state.cuisines, parts[0]) && courseOf(cuisine, parts[1]);
    });
    state.difficulty = list(params.get('difficulty')).map(Number).filter(function (d) { return d >= 1 && d <= 5; });
    input.value = state.q;
  }
  function queryString() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    var cuisines = facets.filter(function (c) { return has(state.cuisines, c.code); }).map(function (c) { return encodeURIComponent(c.code); });
    if (cuisines.length) parts.push('country=' + cuisines.join(','));
    if (state.courses.length) parts.push('course=' + state.courses.map(function (key) { return encodeURIComponent(key).replace('%3A', ':'); }).join(','));
    if (state.difficulty.length) parts.push('difficulty=' + state.difficulty.slice().sort().join(','));
    return parts.length ? '?' + parts.join('&') : '';
  }
  function remember(push) {
    var entry = { view: main.dataset.view, applied: push || !!(history.state && history.state.applied) };
    if (push) history.pushState(entry, '', location.pathname + queryString());
    else history.replaceState(entry, '', location.pathname + queryString());
  }

  function placeMatches(r) {
    if (state.cuisines.length && !has(state.cuisines, r.cuisineCode)) return false;
    var selected = state.courses.filter(function (key) { return key.split(':')[0] === r.cuisineCode; });
    return !selected.length || has(selected, r.cuisineCode + ':' + r.course);
  }
  function difficultyMatches(r) { return !state.difficulty.length || has(state.difficulty, r.difficulty); }

  function conditionText() {
    var parts = [];
    facets.forEach(function (cuisine) {
      if (!has(state.cuisines, cuisine.code)) return;
      var courses = cuisine.courses.filter(function (course) { return has(state.courses, cuisine.code + ':' + course.code); }).map(function (course) { return course.name; });
      parts.push(cuisine.label + (courses.length ? SEP.course + courses.join(SEP.item) : ''));
    });
    if (state.difficulty.length) parts.push(copy.difficulty + ' ' + state.difficulty.slice().sort().join(SEP.item));
    return parts.join(SEP.part);
  }

  function buildFacets() {
    facets.forEach(function (cuisine) {
      var total = data.filter(function (d) { return d.r.cuisineCode === cuisine.code; });
      if (!total.length) return;
      var item = el('div', 'discovery-cuisine');
      var button = el('button', 'discovery-cuisine-button');
      button.type = 'button';
      button.dataset.cuisine = cuisine.code;
      var ribbon = el('span', 'cuisine-ribbon');
      ribbon.style.background = cuisine.ribbon;
      ribbon.setAttribute('aria-hidden', 'true');
      var name = el('span', 'discovery-cuisine-name');
      var native = el('span', 'discovery-cuisine-native', cuisine.native);
      native.lang = cuisine.nativeLang;
      name.append(native, el('span', 'discovery-cuisine-label', cuisine.label));
      var count = el('span', 'discovery-cuisine-count');
      var box = el('span', 'discovery-check');
      box.innerHTML = CHECK;
      box.setAttribute('aria-hidden', 'true');
      button.append(ribbon, name, count, box);
      var courses = el('div', 'discovery-courses');
      courses.hidden = true;
      cuisine.courses.forEach(function (course) {
        // 掲載のないコース（飲み物など）は出さない
        if (!total.some(function (d) { return d.r.course === course.code; })) return;
        var chip = el('button', 'discovery-course');
        chip.type = 'button';
        chip.dataset.course = cuisine.code + ':' + course.code;
        chip.append(el('span', '', course.name));
        if (course.note) chip.append(el('small', '', course.note));
        courses.append(chip);
        courseButtons[chip.dataset.course] = chip;
      });
      item.append(button, courses);
      cuisinesEl.append(item);
      cuisineButtons[cuisine.code] = button;
      courseBoxes[cuisine.code] = courses;
    });
    for (var d = 1; d <= 5; d++) {
      var button = el('button', 'discovery-difficulty-button');
      button.type = 'button';
      button.dataset.difficulty = String(d);
      button.setAttribute('aria-label', copy.difficulty + ' ' + d);
      button.innerHTML = STAR + d;
      difficultyEl.append(button);
      difficultyButtons[d] = button;
    }
  }

  function render() {
    if (!loaded) return;
    var terms = searchTokens(state.q);
    var textMatch = data.map(function (d) { return terms.every(function (t) { return d.keys.some(function (k) { return searchKeyIncludes(k, t); }); }); });
    // 各ボタンの品数は「その項目以外の条件」で数える（押したときに出る品数）
    Object.keys(cuisineButtons).forEach(function (code) {
      var button = cuisineButtons[code], on = has(state.cuisines, code);
      var n = data.filter(function (d, i) { return textMatch[i] && d.r.cuisineCode === code && difficultyMatches(d.r); }).length;
      button.setAttribute('aria-pressed', String(on));
      button.querySelector('.discovery-cuisine-count').innerHTML = n + '<small>' + copy.unit + '</small>';
      button.classList.toggle('is-empty', n === 0);
      var box = courseBoxes[code];
      if (on && box.hidden) { box.hidden = false; box.classList.add('is-opening'); }
      if (!on) box.hidden = true;
    });
    Object.keys(courseButtons).forEach(function (key) {
      var parts = key.split(':');
      var n = data.filter(function (d, i) { return textMatch[i] && d.r.cuisineCode === parts[0] && d.r.course === parts[1] && difficultyMatches(d.r); }).length;
      courseButtons[key].setAttribute('aria-pressed', String(has(state.courses, key)));
      courseButtons[key].classList.toggle('is-empty', n === 0);
    });
    Object.keys(difficultyButtons).forEach(function (d) {
      var n = data.filter(function (item, i) { return textMatch[i] && item.r.difficulty === Number(d) && placeMatches(item.r); }).length;
      difficultyButtons[d].setAttribute('aria-pressed', String(has(state.difficulty, Number(d))));
      difficultyButtons[d].classList.toggle('is-empty', n === 0);
    });

    var matches = data.filter(function (d, i) { return textMatch[i] && placeMatches(d.r) && difficultyMatches(d.r); })
      .map(function (d) { return { d: d, score: state.q ? rankNameMatch(d.names, state.q) : 0 }; })
      .sort(function (a, b) { return b.score - a.score || (a.d.r.featuredRank || 9999) - (b.d.r.featuredRank || 9999) || a.d.order - b.d.order; });
    var n = matches.length, condition = conditionText();
    heading.textContent = hasFilters() ? copy.results : copy.featured;
    status.textContent = n ? fill(copy.count, n) : copy.empty;
    status.classList.toggle('is-count', n > 0);
    conditions.textContent = [state.q, condition].filter(Boolean).join(SEP.part);
    resetLink.hidden = !hasFilters();
    summaryQuery.textContent = state.q || copy.title;
    summaryFilters.textContent = condition || copy.allDishes;
    applyButton.disabled = n === 0;
    applyButton.textContent = n ? fill(copy.show, n) : copy.none;

    results.replaceChildren();
    matches.slice(0, limit).forEach(function (m) {
      var r = m.d.r, cuisine = cuisineOf(r.cuisineCode), course = cuisine && courseOf(cuisine, r.course);
      var link = el('a', 'discovery-card');
      link.href = copy.root + r.slug + '/';
      if (r.hero) { var img = document.createElement('img'); img.src = r.hero; img.alt = ''; img.loading = 'lazy'; img.width = 320; img.height = 240; link.append(img); }
      var body = el('div', 'discovery-card-body');
      body.append(el('h3', '', r.nameOriginal || r.title));
      if (r.title !== r.nameOriginal) body.append(el('p', '', r.title));
      else if (r.nameJa || r.subtitle) body.append(el('p', '', r.nameJa || r.subtitle));
      var meta = el('small', 'discovery-card-meta');
      if (cuisine) { var ribbon = el('span', 'cuisine-ribbon'); ribbon.style.background = cuisine.ribbon; ribbon.setAttribute('aria-hidden', 'true'); meta.append(ribbon); }
      if (course) meta.append(el('span', '', course.name));
      var difficulty = el('span', 'discovery-card-difficulty');
      difficulty.append(el('span', 'discovery-card-difficulty-label', copy.difficulty + ' '), document.createTextNode('★'.repeat(r.difficulty) + '☆'.repeat(5 - r.difficulty)));
      meta.append(difficulty);
      body.append(meta);
      link.append(body);
      results.append(link);
    });
    more.hidden = n <= limit;
  }

  function update() { limit = PAGE; remember(false); document.dispatchEvent(new Event('discoverychange')); render(); }
  function clearAll() { state = { q: '', cuisines: [], courses: [], difficulty: [] }; input.value = ''; update(); }
  function showView(view, push) {
    main.dataset.view = view;
    remember(push);
    if (mobile.matches) window.scrollTo(0, 0);
  }

  function load() {
    status.textContent = '…';
    retry.hidden = true;
    fetch(copy.root + 'search-index.json', { cache: 'no-cache' }).then(function (response) { if (!response.ok) throw Error(); return response.json(); }).then(function (json) {
      if (!Array.isArray(json)) throw Error();
      data = json.map(function (r, order) {
        var names = (r.names || [r.title, r.nameOriginal]).filter(Boolean).map(normalizeSearchText);
        return { r: r, order: order, names: names, keys: names.concat((r.ingredients || []).map(normalizeSearchText)) };
      });
      buildFacets();
      loaded = true;
      render();
    }).catch(function () { status.textContent = copy.error; retry.hidden = false; });
  }

  cuisinesEl.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.cuisine) {
      var code = button.dataset.cuisine;
      toggle(state.cuisines, code);
      // 国を外したら、その国のコースの選択も外す
      if (!has(state.cuisines, code)) state.courses = state.courses.filter(function (key) { return key.split(':')[0] !== code; });
    } else if (button.dataset.course) {
      toggle(state.courses, button.dataset.course);
    }
    update();
  });
  cuisinesEl.addEventListener('animationend', function (event) { event.target.classList.remove('is-opening'); });
  difficultyEl.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;
    toggle(state.difficulty, Number(button.dataset.difficulty));
    update();
  });
  input.addEventListener('input', function (event) { if (event.isComposing) return; state.q = input.value.trim(); update(); });
  input.addEventListener('compositionend', function () { state.q = input.value.trim(); update(); });
  input.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || event.isComposing || !mobile.matches) return;
    event.preventDefault();
    input.blur();
    if (!applyButton.disabled) showView('results', true);
  });
  applyButton.addEventListener('click', function () { showView('results', true); });
  summary.addEventListener('click', function () {
    // 条件の画面から来たときは戻る操作と同じにする（ブラウザの戻るで条件の画面に戻れるように）
    if (history.state && history.state.applied) history.back();
    else showView('filters', false);
  });
  clearButton.addEventListener('click', clearAll);
  resetLink.addEventListener('click', function () { clearAll(); input.focus(); });
  more.addEventListener('click', function () { var previous = limit; limit += PAGE; render(); var next = results.children[previous]; if (next) next.focus(); });
  retry.addEventListener('click', load);
  window.addEventListener('popstate', function (event) {
    readUrl();
    main.dataset.view = (event.state && event.state.view) || (hasFilters() ? 'results' : 'filters');
    limit = PAGE;
    render();
  });

  readUrl();
  // 条件付きの URL（共有リンク・戻る操作）で開いたときは、結果の画面から始める
  main.dataset.view = hasFilters() ? 'results' : 'filters';
  history.replaceState({ view: main.dataset.view, applied: false }, '', location.href);
  load();
}

startDiscovery({"root":"/en/recipes/","recipes":"Recipes","allRecipes":"All recipes","search":"Search recipes or ingredients","title":"Find a recipe","cuisine":"Cuisine","difficulty":"Difficulty","allDishes":"All recipes","featured":"Featured recipes","results":"Search results","empty":"No recipes match these filters","none":"No recipes match","error":"Search could not be loaded.","retry":"Retry","more":"Show more","clear":"Clear","clearAll":"Clear filters","change":"Edit","show":"Show {n} recipes","count":"{n} recipes","unit":"recipes"}, [{"code":"Italian","href":"/en/recipes/search/?country=Italian","native":"Cucina Italiana","nativeLang":"it","label":"Italian","ribbon":"linear-gradient(90deg, #2E7D4F 0%, #2E7D4F 33%, #F2EDE3 33%, #F2EDE3 67%, #A93B32 67%, #A93B32 100%)","courses":[{"code":"antipasto","name":"Antipasti","note":""},{"code":"primo","name":"Primi courses","note":""},{"code":"secondo","name":"Main courses","note":""},{"code":"contorno","name":"Side dishes","note":""},{"code":"dolce","name":"Dolci","note":"Italian desserts"},{"code":"bevanda","name":"Drinks","note":""}]},{"code":"French","href":"/en/recipes/search/?country=French","native":"Cuisine Française","nativeLang":"fr","label":"French","ribbon":"linear-gradient(90deg, #2F4C7E 0%, #2F4C7E 33%, #F2EDE3 33%, #F2EDE3 67%, #A93B32 67%, #A93B32 100%)","courses":[{"code":"entree","name":"Entrées","note":"French starters"},{"code":"plat","name":"Plats","note":"French main courses"},{"code":"accompagnement","name":"Accompagnements","note":"French sides"},{"code":"dessert","name":"Desserts","note":"French sweets"}]},{"code":"Spanish","href":"/en/recipes/search/?country=Spanish","native":"Cocina Española","nativeLang":"es","label":"Spanish","ribbon":"linear-gradient(90deg, #A93B32 0%, #A93B32 50%, #D3AD46 50%, #D3AD46 100%)","courses":[{"code":"entrante","name":"Entrantes","note":"Spanish starters"},{"code":"primer-plato","name":"Primer plato","note":"Spanish first courses"},{"code":"segundo-plato","name":"Segundo plato","note":"Spanish second courses"},{"code":"guarnicion","name":"Guarniciones","note":"Spanish sides"},{"code":"postre","name":"Postres","note":"Spanish desserts"}]}]);
})();
