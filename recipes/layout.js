(function () {
  'use strict';

  var article = document.querySelector('.recipe-article');
  var nav = document.querySelector('.recipe-jump-nav');
  var ingredients = document.getElementById('ingredients');
  if (!article || !nav || !ingredients) return;

  var desktop = window.matchMedia('(min-width: 900px)');
  function updateLayout() {
    // Measure the actual sticky navigation, including wrapped/zoomed text.
    article.style.setProperty('--recipe-nav-height', nav.getBoundingClientRect().height + 'px');
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
})();
