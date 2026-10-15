(function () {
  'use strict';

  var page = window.TABELIA_PAGE || {};
  function track(name, params) {
    if (typeof window.tabeliaTrack === 'function') window.tabeliaTrack(name, params);
  }
  // 端末の判定は analytics.js のキャンペーン告知（detectDevice）と同じ規則。iPadOS は Mac として名乗るのでタッチ点数で見分ける
  var ua = navigator.userAgent || '';
  var isAndroid = /Android/i.test(ua);
  var isIos = /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

  // 最上部のアプリ案内の帯（generate-web-recipes.ts の appBand）。iPhone・iPad だけに出し、×で閉じたら30日出さない。
  // 確認用に ?app_band_preview=1 を付けると端末と記録に関係なく出す（記録も残さない）。
  var band = document.querySelector('[data-app-band]');
  var bandPreview = /[?&]app_band_preview=1(?:&|$)/.test(window.location.search);
  if (band && (isIos || bandPreview)) {
    var BAND_KEY = 'tabelia-app-band-closed-at';
    var BAND_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
    var closedAt = 0;
    try { closedAt = Number(window.localStorage.getItem(BAND_KEY)) || 0; } catch (_) { /* 記録できない環境では毎回出す */ }
    if (bandPreview || Date.now() - closedAt > BAND_SNOOZE_MS) {
      band.hidden = false;
      if (!bandPreview) track('app_band_view', { recipe_slug: page.recipe_slug || '' });
      var bandClose = band.querySelector('[data-app-band-close]');
      if (bandClose) {
        bandClose.addEventListener('click', function () {
          band.hidden = true;
          if (bandPreview) return;
          try { window.localStorage.setItem(BAND_KEY, String(Date.now())); } catch (_) { /* ページ内だけ閉じる */ }
          track('app_band_closed', { recipe_slug: page.recipe_slug || '' });
        });
      }
    }
  }

  // Android はアプリが未リリースで App Store から入れられないので、作り方の後のアプリ導線ブロックを出さない
  // （材料欄の代替確定後の1行と同じ判定。web-recipe-interactions.js）。Android 版を出したらこの判定を消す
  if (isAndroid) {
    var ctas = document.querySelectorAll('.recipe-article .app-cta');
    for (var c = 0; c < ctas.length; c++) ctas[c].hidden = true;
  }

  var article = document.querySelector('.recipe-article');
  var nav = document.querySelector('.recipe-jump-nav');
  var ingredients = document.getElementById('ingredients');
  if (!article || !nav || !ingredients) return;

  var desktop = window.matchMedia('(min-width: 900px)');
  // 600px 以下では目次を画面下端に固定する（style.css の同じブレークポイント）。上端を覆わないので節のスクロール余白は 0。
  var mobile = window.matchMedia('(max-width: 600px)');
  function onMediaChange(query, handler) {
    if (typeof query.addEventListener === 'function') query.addEventListener('change', handler);
    else if (typeof query.addListener === 'function') query.addListener(handler);
  }

  function updateLayout() {
    // Measure the actual sticky navigation, including wrapped/zoomed text.
    var navHeight = mobile.matches ? 0 : nav.getBoundingClientRect().height;
    article.style.setProperty('--recipe-nav-height', navHeight + 'px');
    // Native Arrow/Page/Home/End scrolling; no wheel or keyboard interception.
    if (desktop.matches && ingredients.scrollHeight > ingredients.clientHeight) {
      ingredients.setAttribute('tabindex', '0');
    } else {
      ingredients.removeAttribute('tabindex');
    }
  }
  if (typeof ResizeObserver === 'function') {
    var observer = new ResizeObserver(updateLayout);
    observer.observe(nav);
    observer.observe(ingredients);
  }
  window.addEventListener('resize', updateLayout);
  updateLayout();

  // 「作りたい」ボタン: SP では目次バーの末尾に入れ、PC では元の位置（画面右下に浮かせる）へ戻す。
  // ボタンは1つだけで、押下の処理（recipe-save.js）は要素に付いているので、移しても切れない。
  // PC の目次は backdrop-filter を持ち、中に入れると fixed の基準が目次になるため、SP のときだけ移す。
  var saveButton = document.querySelector('[data-recipe-save]');
  if (saveButton && saveButton.parentNode) {
    var saveHome = document.createComment('recipe-save');
    saveButton.parentNode.insertBefore(saveHome, saveButton);
    var placeSave = function () {
      if (mobile.matches) {
        if (saveButton.parentNode !== nav) nav.appendChild(saveButton);
      } else if (saveButton.parentNode === nav && saveHome.parentNode) {
        saveHome.parentNode.insertBefore(saveButton, saveHome);
      }
    };
    placeSave();
    onMediaChange(mobile, placeSave);
  }

  // 現在地: 目次が指す節のうち、基準線（下端固定なら画面の上 1/3、上端固定なら目次の直下）を通過した最後の節を aria-current にする。
  var targets = [];
  var links = nav.querySelectorAll('a[href^="#"]');
  for (var i = 0; i < links.length; i++) {
    var target = document.getElementById(links[i].getAttribute('href').slice(1));
    if (target) targets.push({ link: links[i], el: target });
  }
  var ticking = false;
  function updateCurrent() {
    ticking = false;
    var threshold = mobile.matches ? window.innerHeight / 3 : nav.getBoundingClientRect().height + 24;
    var current = null;
    for (var j = 0; j < targets.length; j++) {
      if (targets[j].el.getBoundingClientRect().top <= threshold) current = targets[j];
    }
    for (var k = 0; k < targets.length; k++) {
      if (targets[k] === current) {
        targets[k].link.setAttribute('aria-current', 'location');
      } else {
        targets[k].link.removeAttribute('aria-current');
      }
    }
  }
  function requestCurrent() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateCurrent);
  }
  if (targets.length > 0) {
    window.addEventListener('scroll', requestCurrent, { passive: true });
    window.addEventListener('resize', requestCurrent);
    updateCurrent();
  }

  // どこまで読まれたか（docs/ANALYTICS.md の section_reached）。GA4 の拡張計測の scroll は 90% 到達しか送らないので、
  // 材料・作り方・作り方の終わり・料理の背景が画面の上 7 割に入った時点で、節ごとに1回だけ送る。
  // #steps は人数変更・代替で中身だけ描き直され、要素そのものは残るので監視が切れない。
  if (typeof IntersectionObserver === 'function') {
    var sections = [
      ['ingredients', ingredients],
      ['steps', document.getElementById('steps')],
      ['steps_end', document.querySelector('[data-section-sentinel="steps_end"]')],
      ['story', document.getElementById('story')],
    ].filter(function (pair) { return pair[1]; });
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        for (var s = 0; s < sections.length; s++) {
          if (sections[s][1] !== entry.target) continue;
          sectionObserver.unobserve(entry.target);
          track('section_reached', { section: sections[s][0], recipe_slug: page.recipe_slug || '' });
        }
      });
    }, { rootMargin: '0px 0px -30% 0px' });
    sections.forEach(function (pair) { sectionObserver.observe(pair[1]); });
  }
})();
