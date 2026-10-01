(function () {
  var input = document.getElementById('recipe-search-input');
  var results = document.getElementById('recipe-search-results');
  if (!input || !results) return;
  var normalizeRecipeSearch = function normalizeRecipeSearch(value){return value.normalize("NFKC").toLowerCase().replace(/œ/g,"oe").replace(/æ/g,"ae").replace(/ß/g,"ss").normalize("NFD").replace(/[\u0300-\u036f]/g,"").normalize("NFC").replace(/[ァ-ヶ]/g,letter=>String.fromCharCode(letter.charCodeAt(0)-96)).replace(/[\s・･'’ʼ‐‑–—-]+/g,"")};
  var searchRecipes = function searchRecipes(entries,query){const terms=query.trim().split(/\s+/).map(normalizeRecipeSearch).filter(Boolean);if(!terms.length)return[];return entries.map((entry,index)=>{const names=entry.names.map(normalizeRecipeSearch);const ingredients=entry.ingredients.map(normalizeRecipeSearch);const all=names.concat(ingredients);if(!terms.every(term=>all.some(text=>text.includes(term))))return{entry,index,score:0};const score=terms.reduce((total,term)=>total+(names.some(name=>name===term)?100:names.some(name=>name.startsWith(term))?30:names.some(name=>name.includes(term))?10:1),0);return{entry,index,score}}).filter(match=>match.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).map(match=>match.entry)};
  var data = null, fetchPromise = null, limit = 20, requestId = 0;
  input.setAttribute('aria-controls', results.id);
  input.setAttribute('aria-expanded', 'false');
  function hide() { requestId++; results.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  function show() { results.hidden = false; input.setAttribute('aria-expanded', 'true'); }
  function ensureData() {
    if (!fetchPromise) fetchPromise = fetch("/recipes/search-index.json", { cache: 'no-cache' })
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
    if (!matches.length) results.append(text('p', 'search-empty', "該当するレシピが見つかりませんでした"));
    matches.slice(0, limit).forEach(function (recipe) {
      var link = document.createElement('a'); link.className = 'search-result'; link.href = "/recipes/" + recipe.slug + '/';
      if (recipe.hero) { var img = document.createElement('img'); img.src = recipe.hero; img.alt = ''; img.loading = 'lazy'; img.width = 48; img.height = 48; link.append(img); }
      var body = text('span', 'search-result-body', '');
      body.append(text('span', 'search-result-title', recipe.title));
      var subtitle = text('span', 'search-result-subtitle', recipe.subtitle);
      if (multiCuisine && recipe.cuisine) subtitle.append(text('span', 'search-result-cuisine', recipe.cuisine));
      body.append(subtitle);
      link.append(body); results.append(link);
    });
    if (matches.length > limit) {
      var button = text('button', 'search-more', "さらに表示" + ' (' + (matches.length - limit) + ')'); button.type = 'button';
      button.addEventListener('click', function () { limit += 20; render(); var next = results.querySelectorAll('a')[limit - 20]; if (next) next.focus(); }); results.append(button);
    }
    show();
  }
  function update() {
    if (!input.value.trim()) { hide(); return; }
    var request = ++requestId;
    ensureData().then(function () { if (request === requestId && document.activeElement === input) render(); })
      .catch(function () { if (request !== requestId || document.activeElement !== input || !input.value.trim()) return; results.replaceChildren(text('p', 'search-empty', "検索を読み込めませんでした。もう一度入力してください。")); show(); });
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