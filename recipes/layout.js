(function () {
  'use strict';

  var article = document.querySelector('.recipe-article');
  var nav = document.querySelector('.recipe-jump-nav');
  var ingredients = document.getElementById('ingredients');
  if (!article || !nav || !ingredients) return;

  var desktop = window.matchMedia('(min-width: 900px)');
  // 600px 以下では目次を画面下端に固定する（style.css の同じブレークポイント）。上端を覆わないので節のスクロール余白は 0。
  var mobile = window.matchMedia('(max-width: 600px)');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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

  // 検索ボタン: ヘッダーの検索欄へフォーカスを移してページ先頭へ戻す。検索 UI はヘッダーのものを使う。
  var searchButton = nav.querySelector('.recipe-jump-search');
  var searchInput = document.getElementById('recipe-search-input');
  if (searchButton) {
    if (!searchInput) {
      searchButton.hidden = true;
    } else {
      searchButton.addEventListener('click', function () {
        searchInput.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      });
    }
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
})();
