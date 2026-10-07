// Generated pages all use their canonical URL, never tracking parameters or hashes.
// SNSボタンはこのスクリプトが data 属性から組み立てる。生成済みHTMLを再生成せずに
// ボタン構成を更新できるよう、コンテナの中身はここが唯一の正。
// Instagram はURL共有のWeb用エンドポイントを提供していないため載せない。
(function () {
  var COPY_LABELS = { ja: 'リンクをコピー', en: 'Copy link', it: 'Copia il link' };
  var ICONS = {
    x: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231L18.244 2.25Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"/></svg>',
    line: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>',
    facebook: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M10.5 13.5a4.2 4.2 0 0 0 6 0l3-3a4.243 4.243 0 0 0-6-6l-1.2 1.2"/><path d="M13.5 10.5a4.2 4.2 0 0 0-6 0l-3 3a4.243 4.243 0 0 0 6 6l1.2-1.2"/></svg>',
  };
  document.querySelectorAll('[data-recipe-share], [data-article-share]').forEach(function (container) {
    var data = container.dataset;
    if (data.shareInitialized) return;
    data.shareInitialized = 'true';
    var encodedUrl = encodeURIComponent(data.shareUrl);
    var title = data.shareTitle;
    if (container.hasAttribute('data-recipe-share') && !title.endsWith('- TABELIA')) title += '- TABELIA';
    var encodedTitle = encodeURIComponent(title);
    function track(method) {
      if (!window.tabeliaTrack) return;
      if (container.hasAttribute('data-article-share')) {
        window.tabeliaTrack('article_shared', { article_slug: data.shareSlug, locale: data.shareLocale, method: method });
      } else {
        window.tabeliaTrack('recipe_shared', { recipe_slug: data.shareSlug, locale: data.shareLocale, method: method });
      }
    }
    container.textContent = '';
    [
      { method: 'x', label: 'X', href: 'https://x.com/intent/tweet?text=' + encodedTitle + '&url=' + encodedUrl },
      { method: 'line', label: 'LINE', href: 'https://social-plugins.line.me/lineit/share?url=' + encodedUrl },
      { method: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/sharer/sharer.php?u=' + encodedUrl },
    ].forEach(function (target) {
      var link = document.createElement('a');
      link.className = 'recipe-share-button';
      link.href = target.href;
      link.target = target.method === 'x' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '_self' : '_blank';
      link.rel = 'noopener noreferrer';
      link.innerHTML = ICONS[target.method] + '<span>' + target.label + '</span>';
      link.addEventListener('click', function () { track(target.method); });
      container.appendChild(link);
    });
    var copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'recipe-share-button';
    copyButton.innerHTML = ICONS.copy + '<span>' + (data.shareCopyLabel || COPY_LABELS[data.shareLocale] || COPY_LABELS.ja) + '</span>';
    var status = document.createElement('span');
    status.className = 'recipe-share-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    var manual = document.createElement('input');
    manual.className = 'recipe-share-url';
    manual.type = 'url';
    manual.readOnly = true;
    manual.value = data.shareUrl;
    manual.hidden = true;
    manual.setAttribute('aria-label', data.shareFailed);
    copyButton.addEventListener('click', async function () {
      status.textContent = '';
      manual.hidden = true;
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
    });
    container.appendChild(copyButton);
    container.appendChild(status);
    container.appendChild(manual);
  });
})();
