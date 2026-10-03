(function () {
  var input = document.getElementById('recipe-search-input');
  var results = document.getElementById('recipe-search-results');
  if (!input || !results) return;
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

  var normalizeRecipeSearch = normalizeSearchText;
  var searchRecipes = function(entries,query) {
    if (!searchTokens(query).length) return [];
    return entries.map(function(entry,index) {
      var names=entry.names.map(normalizeSearchText), all=names.concat(entry.ingredients.map(normalizeSearchText));
      var nameScore=rankNameMatch(names,query), allScore=rankNameMatch(all,query);
      return {entry:entry,index:index,score:nameScore || (allScore ? allScore / 1000 : 0)};
    }).filter(function(match){return match.score>0;}).sort(function(a,b){return b.score-a.score||a.index-b.index;}).map(function(match){return match.entry;});
  };
  var data = null, fetchPromise = null, limit = 20, requestId = 0;
  input.setAttribute('aria-controls', results.id);
  input.setAttribute('aria-expanded', 'false');
  function hide() { requestId++; results.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  function show() { results.hidden = false; input.setAttribute('aria-expanded', 'true'); }
  function ensureData() {
    if (!fetchPromise) fetchPromise = fetch("/it/ricette/search-index.json", { cache: 'no-cache' })
      .then(function (response) { if (!response.ok) throw new Error('Search unavailable'); return response.json(); })
      .then(function (json) { if (!Array.isArray(json)) throw new Error('Invalid search index'); data = json; return json; })
      .catch(function (error) { fetchPromise = null; throw error; });
    return fetchPromise;
  }
  function text(tag, className, value) {
    var el = document.createElement(tag); el.className = className; el.textContent = value; return el;
  }
  function render() {
    var query = input.value.trim(); results.replaceChildren();
    if (!query) { hide(); return; }
    var matches = searchRecipes(data || [], query);
    var multiCuisine = new Set((data || []).map(function (recipe) { return recipe.cuisine; })).size > 1;
    if (!matches.length) results.append(text('p', 'search-empty', "Nessuna ricetta trovata"));
    matches.slice(0, limit).forEach(function (recipe) {
      var link = document.createElement('a'); link.className = 'search-result'; link.href = "/it/ricette/" + recipe.slug + '/';
      if (recipe.hero) { var img = document.createElement('img'); img.src = recipe.hero; img.alt = ''; img.loading = 'lazy'; img.width = 48; img.height = 48; link.append(img); }
      var body = text('span', 'search-result-body', '');
      body.append(text('span', 'search-result-title', recipe.title));
      var subtitle = text('span', 'search-result-subtitle', recipe.subtitle);
      if (multiCuisine && recipe.cuisine) subtitle.append(text('span', 'search-result-cuisine', recipe.cuisine));
      body.append(subtitle);
      link.append(body); results.append(link);
    });
    if (matches.length > limit) {
      var button = text('button', 'search-more', "Mostra altre" + ' (' + (matches.length - limit) + ')'); button.type = 'button';
      button.addEventListener('click', function () { limit += 20; render(); var next = results.querySelectorAll('a')[limit - 20]; if (next) next.focus(); }); results.append(button);
    }
    show();
  }
  function update() {
    if (!input.value.trim()) { hide(); return; }
    var request = ++requestId;
    ensureData().then(function () { if (request === requestId && document.activeElement === input) render(); })
      .catch(function () { if (request !== requestId || document.activeElement !== input || !input.value.trim()) return; results.replaceChildren(text('p', 'search-empty', "Ricerca non disponibile. Digita di nuovo per riprovare.")); show(); });
  }
  input.addEventListener('focus', update);
  input.addEventListener('input', function (event) { if (!event.isComposing) { limit = 20; update(); } });
  input.addEventListener('compositionend', function () { limit = 20; update(); });
  input.addEventListener('keydown', function (event) { if (event.key === 'ArrowDown' && !results.hidden) { var first = results.querySelector('a'); if (first) { event.preventDefault(); first.focus(); } } if (event.key === 'Escape') hide(); });
  results.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { input.focus(); hide(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    var links = Array.from(results.querySelectorAll('a, button')); var next = links.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1);
    event.preventDefault(); if (next < 0) input.focus(); else if (links[next]) links[next].focus();
  });
  document.addEventListener('click', function (event) { if (!event.composedPath().includes(input.closest('.header-search'))) hide(); });
  document.addEventListener('focusin', function (event) { if (!event.target.closest('.header-search')) hide(); });
})();