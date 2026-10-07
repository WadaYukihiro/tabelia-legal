(function () {
  var header = document.querySelector('.site-header');
  if (!header) return;
  // Move the chrome outside narrow content wrappers so every page shares its width.
  document.body.prepend(header);
  var mobile = window.matchMedia('(max-width: 600px)');
  var nav = header.querySelector('.site-nav');
  var link = header.querySelector('.header-search-link');
  var expandedHeight = 0;
  var spacer = document.createElement('div');
  spacer.className = 'header-scroll-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  header.after(spacer);
  var menuButton;
  if (nav && link) {
    var labels = { ja: 'メニュー', en: 'Menu', it: 'Menu' };
    menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'header-menu-toggle';
    menuButton.setAttribute('aria-label', labels[document.documentElement.lang] || labels.en);
    menuButton.setAttribute('aria-expanded', 'false');
    nav.id = nav.id || 'site-navigation';
    menuButton.setAttribute('aria-controls', nav.id);
    menuButton.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    header.append(menuButton);
    // Keep the link's accessible name when only its search icon is visible.
    var searchLabel = document.createElement('span');
    searchLabel.className = 'header-search-label';
    Array.from(link.childNodes).forEach(function (node) { if (node.nodeType === 3) searchLabel.append(node); });
    link.append(searchLabel);
    header.classList.add('header-mobile-enhanced');
    menuButton.addEventListener('click', function () { setMenu(menuButton.getAttribute('aria-expanded') !== 'true'); });
  }
  function setMenu(open) {
    header.classList.toggle('header-menu-open', open);
    if (menuButton) menuButton.setAttribute('aria-expanded', String(open));
    if (!open && nav) nav.querySelectorAll('details[open]').forEach(function (menu) { menu.open = false; });
  }
  function measure() {
    var height = header.offsetHeight;
    if (!header.classList.contains('header-compact')) expandedHeight = height;
    spacer.style.height = mobile.matches ? Math.max(0, expandedHeight - height) + 'px' : '0px';
    document.documentElement.style.setProperty('--site-header-height', height + 'px');
  }
  function updateHeader() {
    if (!menuButton) return;
    var threshold = header.classList.contains('header-compact') ? 24 : 80;
    var compact = mobile.matches && window.scrollY > threshold;
    // Do not move a control while someone is using it.
    var keyboardFocus = header.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
    if (compact && (keyboardFocus || header.classList.contains('header-menu-open') || header.querySelector('details[open]'))) return;
    header.classList.toggle('header-compact', compact);
    measure();
  }
  var scrollPending = false;
  window.addEventListener('scroll', function () {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(function () { scrollPending = false; updateHeader(); });
  }, { passive: true });
  mobile.addEventListener('change', function () { setMenu(false); header.classList.remove('header-compact'); measure(); updateHeader(); });
  new ResizeObserver(measure).observe(header); measure();
  updateHeader();
  function markCuisine() {
    var isSearch = /\/(?:recipes|ricette)\/search\/?$/.test(location.pathname);
    var selected = new URLSearchParams(location.search).get('country') || '';
    header.querySelectorAll('[data-cuisine]').forEach(function (option) {
      var hubPath = new URL(option.href).pathname;
      var isHub = location.pathname === hubPath || (option.dataset.cuisine && location.pathname.indexOf(hubPath) === 0);
      if (isHub || (isSearch && option.dataset.cuisine === selected)) option.setAttribute('aria-current', 'true');
      else option.removeAttribute('aria-current');
    });
  }
  markCuisine();
  document.addEventListener('discoverychange', markCuisine);
  window.addEventListener('popstate', markCuisine);
  document.querySelectorAll('.home-search input, .hub-search input').forEach(function (input) {
    input.addEventListener('focus', function () { location.assign(link.href + (input.value ? '?q=' + encodeURIComponent(input.value) : '')); });
  });
  document.querySelectorAll('.recipe-jump-search').forEach(function (button) {
    button.addEventListener('click', function (event) { event.stopImmediatePropagation(); location.assign(link.href); }, true);
  });
  document.addEventListener('click', function (event) {
    header.querySelectorAll('details[open]').forEach(function (menu) { if (!menu.contains(event.target)) menu.open = false; });
    if (!header.contains(event.target)) setMenu(false);
  });
  header.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var openMenu = header.querySelector('details[open]');
    if (openMenu) { openMenu.open = false; openMenu.querySelector('summary').focus(); }
    else if (header.classList.contains('header-menu-open')) { setMenu(false); menuButton.focus(); }
  });
})();
