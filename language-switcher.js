/* Progressive enhancement: native details still opens when JavaScript is unavailable. */
(function () {
  document.querySelectorAll('.language-switcher').forEach(function (switcher) {
    var trigger = switcher.querySelector('.language-trigger');
    var options = switcher.querySelector('.language-options');
    if (!trigger || !options) return;
    function setOpen(open) {
      switcher.open = open;
      trigger.setAttribute('aria-expanded', String(open));
    }
    setOpen(switcher.open);
    function close(returnFocus) {
      setOpen(false);
      if (returnFocus) trigger.focus();
    }
    switcher.addEventListener('toggle', function () {
      trigger.setAttribute('aria-expanded', String(switcher.open));
    });
    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      setOpen(!switcher.open);
    });
    trigger.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      setOpen(true);
      var links = options.querySelectorAll('a');
      var next = event.key === 'ArrowUp' ? links[links.length - 1] : links[0];
      if (next) next.focus();
    });
    options.addEventListener('keydown', function (event) {
      var links = Array.from(options.querySelectorAll('a'));
      var index = links.indexOf(document.activeElement);
      var next;
      if (event.key === 'ArrowDown') next = (index + 1) % links.length;
      else if (event.key === 'ArrowUp') next = (index - 1 + links.length) % links.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = links.length - 1;
      else return;
      if (links[next]) { event.preventDefault(); links[next].focus(); }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && switcher.open) {
        event.preventDefault();
        close(true);
      }
    });
    document.addEventListener('click', function (event) {
      if (!switcher.contains(event.target)) close(false);
    });
    document.addEventListener('focusin', function (event) {
      if (!switcher.contains(event.target)) close(false);
    });
  });
})();
