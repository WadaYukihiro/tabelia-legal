(function () {
  var header = document.querySelector('.site-header');
  if (!header) return;
  // Move the chrome outside narrow content wrappers so every page shares its width.
  document.body.prepend(header);
  function measure() { document.documentElement.style.setProperty('--site-header-height', header.offsetHeight + 'px'); }
  new ResizeObserver(measure).observe(header); measure();
  var link = header.querySelector('.header-search-link');
  document.querySelectorAll('.home-search input, .hub-search input').forEach(function (input) {
    input.addEventListener('focus', function () { location.assign(link.href + (input.value ? '?q=' + encodeURIComponent(input.value) : '')); });
  });
  document.querySelectorAll('.recipe-jump-search').forEach(function (button) {
    button.addEventListener('click', function (event) { event.stopImmediatePropagation(); location.assign(link.href); }, true);
  });
  document.addEventListener('click', function (event) { header.querySelectorAll('details[open]').forEach(function (menu) { if (!menu.contains(event.target)) menu.open = false; }); });
  header.addEventListener('keydown', function (event) { if (event.key === 'Escape') header.querySelectorAll('details[open]').forEach(function (menu) { menu.open = false; menu.querySelector('summary').focus(); }); });
})();
