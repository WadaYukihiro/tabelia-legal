// 「作りたい」ボタンと件数表示（docs/epics/WEB_WANT_TO_COOK.md）。
// 生成器が scripts/lib/web-recipe-save.ts の部品を静的HTMLに出し、このスクリプトが
//   ・押下状態をブラウザに記憶して復元する（localStorage。使えない環境ではページ内だけ）
//   ・押すと同時に表示を進め（楽観更新）、toggle-recipe-save へ送る
//   ・get-recipe-saves の最新値で件数（ボタン・byline・ハブの節・累計1行）を差し替える
// 数字は押された実数だけを出す。0 件は出さない。
(function () {
  'use strict';

  var configNode = document.getElementById('recipe-save-config');
  if (!configNode) return;
  var config;
  try { config = JSON.parse(configNode.textContent || '{}'); } catch (_) { return; }

  var SAVED_KEY = 'tabelia-saved-recipes';
  // web-recipe-reviews.js と同じブラウザ識別子を使う（サーバーは用途ごとに別の HMAC で保存する）
  var BROWSER_KEY = 'tabelia-reviewer-id';
  var UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var memorySaved = [];

  function readSaved() {
    try {
      var list = JSON.parse(window.localStorage.getItem(SAVED_KEY) || '[]');
      return Array.isArray(list) ? list.filter(function (id) { return typeof id === 'string'; }) : [];
    } catch (_) {
      return memorySaved.slice();
    }
  }
  function writeSaved(list) {
    memorySaved = list.slice();
    try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (_) { /* ページ内だけ保つ */ }
  }
  function browserId() {
    try {
      var stored = window.localStorage.getItem(BROWSER_KEY);
      if (stored && UUID_V4.test(stored)) return stored;
      var id = window.crypto.randomUUID();
      window.localStorage.setItem(BROWSER_KEY, id);
      return id;
    } catch (_) {
      // 識別子を保てない環境では件数を送らない（同じ人が何度も数えられるのを防ぐ）
      return null;
    }
  }

  function fmt(n, numberLocale) {
    return Number(n).toLocaleString(numberLocale || 'ja-JP');
  }
  function fromTemplate(el, n) {
    var template = n === 1 ? el.getAttribute('data-one') : el.getAttribute('data-other');
    return (template || '{n}').replace('{n}', fmt(n, el.getAttribute('data-number-locale') || 'ja-JP'));
  }
  function track(name, params) {
    if (typeof window.tabeliaTrack === 'function') window.tabeliaTrack(name, params);
  }
  function headers() {
    return { 'Content-Type': 'application/json', apikey: config.anonKey, Authorization: 'Bearer ' + config.anonKey };
  }
  // fresh: 詳細ページはブラウザのキャッシュを使わない（押した直後の再読み込みで自分が抜けた件数を出さない）
  function fetchCounts(ids, days, fresh) {
    var query = '?recipeId=' + encodeURIComponent(ids.join(',')) + (days ? '&days=' + days : '');
    return fetch(config.countsUrl + query, { headers: headers(), cache: fresh ? 'no-store' : 'default' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });
  }

  // --- レシピ詳細: 浮遊ボタンと byline ---
  var button = document.querySelector('[data-recipe-save]');
  if (button) {
    var recipeId = button.getAttribute('data-recipe-id');
    var numberLocale = button.getAttribute('data-number-locale');
    var countEl = button.querySelector('[data-recipe-save-count]');
    var bylines = document.querySelectorAll('[data-recipe-save-byline]');
    var saved = readSaved().indexOf(recipeId) !== -1;
    // サーバーで確かめた件数と押下状態。表示は「確かめた件数＋まだ届いていない自分の押下」で出す
    var baseCount = Math.max(0, Number(button.getAttribute('data-count')) || 0);
    var serverSaved = saved;
    var optimistic = false;
    var inFlight = false;
    var touched = false;

    var displayCount = function () {
      var n = baseCount;
      if (optimistic) n += (saved ? 1 : 0) - (serverSaved ? 1 : 0);
      return Math.max(0, n);
    };
    var render = function () {
      var count = displayCount();
      button.setAttribute('aria-pressed', saved ? 'true' : 'false');
      countEl.hidden = count <= 0;
      countEl.textContent = count > 0 ? fmt(count, numberLocale) : '';
      for (var i = 0; i < bylines.length; i++) {
        bylines[i].hidden = count <= 0;
        bylines[i].textContent = count > 0 ? fromTemplate(bylines[i], count) : '';
      }
    };
    var bounce = function () {
      button.classList.remove('is-bouncing');
      void button.offsetWidth; // アニメーションを最初から再生させる
      button.classList.add('is-bouncing');
    };
    button.addEventListener('animationend', function () { button.classList.remove('is-bouncing'); });

    // 送信は同時に1本だけ。応答が返った時点で押下状態とずれていれば、最後の状態を送り直す
    // （save と unsave を同時に飛ばすと、サーバーに届く順が入れ替わって状態が食い違うため）
    var sync = function (id) {
      if (inFlight || serverSaved === saved) return;
      inFlight = true;
      fetch(config.toggleUrl, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ recipeId: recipeId, browserId: id, action: saved ? 'save' : 'unsave' }),
      })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
        .then(function (body) {
          inFlight = false;
          if (typeof body.count === 'number') baseCount = Math.max(0, body.count);
          serverSaved = body.saved === true;
          if (serverSaved !== saved) { render(); sync(id); return; }
          optimistic = false;
          render();
        })
        .catch(function () {
          // 押下状態はブラウザに残し、届かなかった分の件数だけを戻す
          inFlight = false;
          optimistic = false;
          render();
        });
    };

    button.hidden = false;
    render();

    // 生成時の件数を最新値へ。押した後に届いた応答は本人の押下を含まない可能性があるので捨てる
    fetchCounts([recipeId], null, true).then(function (body) {
      if (touched || !body || !body.counts || typeof body.counts[recipeId] !== 'number') return;
      baseCount = Math.max(0, body.counts[recipeId]);
      render();
    });

    button.addEventListener('click', function () {
      touched = true;
      saved = !saved;
      var list = readSaved().filter(function (id) { return id !== recipeId; });
      if (saved) list.push(recipeId);
      writeSaved(list);
      // 識別子を保てない環境では送らないので、件数も動かさない
      var id = browserId();
      optimistic = Boolean(id);
      render();
      bounce();

      var engaged = window.TABELIA_ENGAGED && (window.TABELIA_ENGAGED.servings || window.TABELIA_ENGAGED.substitution) ? 1 : 0;
      track(saved ? 'recipe_saved' : 'recipe_unsaved', {
        recipe_slug: button.getAttribute('data-recipe-slug') || '',
        locale: button.getAttribute('data-locale') || 'ja',
        placement: 'float',
        engaged: engaged,
      });

      if (id) sync(id);
    });
  }

  // --- レシピハブ: 「タベリスタが作りたい一皿」と累計1行 ---
  var summary = document.querySelector('[data-recipe-save-summary]');
  var totalEl = document.querySelector('[data-recipe-save-total]');
  if (summary || totalEl) {
    var cards = summary ? summary.querySelectorAll('[data-recipe-save-card]') : [];
    var ids = [];
    for (var c = 0; c < cards.length; c++) ids.push(cards[c].getAttribute('data-recipe-save-card'));
    fetchCounts(ids, summary ? summary.getAttribute('data-days') : '').then(function (body) {
      if (!body) return;
      for (var k = 0; k < cards.length; k++) {
        var n = body.counts && body.counts[ids[k]];
        var caption = cards[k].querySelector('.recipe-card-caption');
        // 並びと顔ぶれは生成時のまま。数字だけを最新にする（減って 0 になった品も数字は消さない）
        if (caption && typeof n === 'number' && n > 0) caption.textContent = fromTemplate(summary, n);
      }
      if (totalEl && typeof body.total === 'number') {
        var value = totalEl.querySelector('[data-recipe-save-total-value]');
        if (value) value.textContent = fmt(body.total, totalEl.getAttribute('data-number-locale'));
        totalEl.hidden = body.total < Number(totalEl.getAttribute('data-min') || 0);
      }
    });
  }
})();
