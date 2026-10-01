// Generated pages all use their canonical URL, never tracking parameters or hashes.
(function () {
  document.querySelectorAll('[data-recipe-share]').forEach(function (container) {
    var button = container.querySelector('button');
    var status = container.querySelector('[role="status"]');
    var manual = container.querySelector('input');
    var data = container.dataset;
    button.hidden = false;
    function track(method) {
      if (window.tabeliaTrack) window.tabeliaTrack('recipe_shared', { recipe_slug: data.shareSlug, locale: data.shareLocale, method: method });
    }
    async function copyLink() {
      try {
        if (!navigator.clipboard) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(data.shareUrl);
        status.textContent = data.shareCopied;
        track('copy');
      } catch (_) {
        status.textContent = data.shareFailed;
        manual.hidden = false;
        manual.focus();
        manual.select();
      }
    }
    button.addEventListener('click', async function () {
      if (button.disabled) return;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      status.textContent = '';
      manual.hidden = true;
      try {
        var payload = { title: data.shareTitle, text: data.shareTitle, url: data.shareUrl };
        if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
          try {
            await navigator.share(payload);
            track('native');
          } catch (error) {
            if (!error || error.name !== 'AbortError') await copyLink();
          }
        } else {
          await copyLink();
        }
      } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    });
  });
})();
