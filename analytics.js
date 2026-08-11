// Tabelia Web のアクセス解析（Google Analytics 4）クライアント。
// generate-web-recipes.ts が legal-site/analytics.js としてコピーする。直接 legal-site 側を編集しない。
//
// 役割は3つ:
//   1. EU/英国向けの Cookie 同意バナー（オプトイン）
//   2. 流入〜App Store 導線のカスタムイベント送信
//   3. window.tabeliaTrack() の提供（他スクリプトからの計測用フック）
//
// 同意の実体は gtag の Consent Mode v2 が握る。head 側で EEA+UK を region 指定して
// analytics_storage を既定拒否にしてあるため、このバナーの地域判定（タイムゾーン）が
// 外れて EU の閲覧者にバナーが出なかった場合でも、Cookie は置かれず拒否のまま保たれる。
// つまり判定ミスの向きは「データが減る」側にしか倒れない。
(function () {
  var GA_ID = window.TABELIA_GA_ID;
  if (!GA_ID || !window.dataLayer) return;

  var CONSENT_KEY = 'tabelia-consent';
  var page = window.TABELIA_PAGE || {};
  var lang = (document.documentElement.getAttribute('lang') || 'ja').slice(0, 2);

  function gtag() {
    window.dataLayer.push(arguments);
  }

  function track(name, params) {
    gtag('event', name, params || {});
  }

  // 他スクリプト（search.js / interactions.js など）からの計測フック
  window.tabeliaTrack = track;

  function readConsent() {
    try {
      return window.localStorage.getItem(CONSENT_KEY);
    } catch (e) {
      return null;
    }
  }

  function writeConsent(value) {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch (e) {
      /* プライベートブラウズ等で保存できない場合は毎回バナーを出す */
    }
  }

  // -------------------------------------------------------------------------
  // 1. Cookie 同意バナー（EEA + 英国）
  // -------------------------------------------------------------------------

  // タイムゾーンによる地域推定。ネットワークアクセスも Cloudflare Functions も要らない代わりに
  // 精度は完全ではないが、上記のとおり外した場合は「拒否のまま」に倒れるため安全側。
  var EEA_EXTRA_ZONES = [
    'Atlantic/Reykjavik', // アイスランド
    'Atlantic/Canary', // スペイン領カナリア諸島
    'Atlantic/Madeira', // ポルトガル領マデイラ諸島
    'Atlantic/Azores', // ポルトガル領アゾレス諸島
    'Indian/Reunion', // フランス海外県
    'America/Cayenne', // フランス領ギアナ
    'America/Martinique',
    'America/Guadeloupe',
  ];

  function likelyEeaVisitor() {
    var zone = '';
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (e) {
      zone = '';
    }
    if (zone.indexOf('Europe/') === 0) return true;
    if (EEA_EXTRA_ZONES.indexOf(zone) !== -1) return true;
    // タイムゾーンが取れない古い環境では、イタリア語版ページのみ EU 圏とみなす
    if (!zone && lang === 'it') return true;
    return false;
  }

  var BANNER_TEXT = {
    ja: {
      body: 'タベリアは、サイトの利用状況を把握して改善するために Google アナリティクスの Cookie を使用します。',
      link: 'プライバシーポリシー',
      href: '/privacy/',
      accept: '同意する',
      decline: '同意しない',
    },
    en: {
      body: 'Tabelia uses Google Analytics cookies to understand how the site is used and to improve it.',
      link: 'Privacy Policy',
      href: '/privacy/',
      accept: 'Accept',
      decline: 'Decline',
    },
    it: {
      body: 'Tabelia utilizza i cookie di Google Analytics per capire come viene usato il sito e migliorarlo.',
      link: 'Informativa sulla privacy',
      href: '/privacy/',
      accept: 'Accetta',
      decline: 'Rifiuta',
    },
  };

  function showConsentBanner() {
    var t = BANNER_TEXT[lang] || BANNER_TEXT.ja;

    var banner = document.createElement('div');
    banner.className = 'consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', t.link);

    var body = document.createElement('p');
    body.className = 'consent-banner-body';
    body.appendChild(document.createTextNode(t.body + ' '));
    var link = document.createElement('a');
    link.href = t.href;
    link.textContent = t.link;
    body.appendChild(link);

    var actions = document.createElement('div');
    actions.className = 'consent-banner-actions';

    var decline = document.createElement('button');
    decline.type = 'button';
    decline.className = 'consent-banner-button consent-banner-decline';
    decline.textContent = t.decline;

    var accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'consent-banner-button consent-banner-accept';
    accept.textContent = t.accept;

    actions.appendChild(decline);
    actions.appendChild(accept);
    banner.appendChild(body);
    banner.appendChild(actions);

    function close() {
      banner.classList.add('is-closing');
      window.setTimeout(function () {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
      }, 200);
    }

    accept.addEventListener('click', function () {
      writeConsent('granted');
      gtag('consent', 'update', { analytics_storage: 'granted' });
      // 同意前の page_view は Cookie なしの計測に留まるため、同意後に改めて1件送る
      gtag('event', 'page_view', page);
      close();
    });

    decline.addEventListener('click', function () {
      writeConsent('denied');
      close();
    });

    document.body.appendChild(banner);
    // 描画後にクラスを付けてスライドインさせる
    window.requestAnimationFrame(function () {
      banner.classList.add('is-visible');
    });
  }

  if (!readConsent() && likelyEeaVisitor()) {
    showConsentBanner();
  }

  // -------------------------------------------------------------------------
  // 2. 流入〜App Store 導線のイベント
  // -------------------------------------------------------------------------

  // レシピ詳細の閲覧。page_view とは別に送ることで、GA4 のカスタム
  // ディメンション登録なしでもイベント一覧から料理単位の人気が読める
  if (page.page_type === 'recipe') {
    track('recipe_view', page);
  }

  function closestLink(target, selector) {
    if (!target || typeof target.closest !== 'function') return null;
    return target.closest(selector);
  }

  // App Store 遷移。GA4 の拡張計測（outbound click）でも取れるが、
  // どのページ・どの料理から降りたかを残すため明示的に送る
  document.addEventListener('click', function (e) {
    var link = closestLink(e.target, 'a[href*="apps.apple.com"]');
    if (!link) return;
    var placement = 'link';
    if (link.classList.contains('appstore-badge')) {
      placement = closestLink(link, '.app-cta') ? 'app_cta' : 'badge';
    }
    track('app_store_click', {
      page_type: page.page_type || '',
      recipe_slug: page.recipe_slug || '',
      locale: lang,
      placement: placement,
    });
  });

  // -------------------------------------------------------------------------
  // 3. サイト内検索（全ロケールの search.js が共通の ID を使う）
  // -------------------------------------------------------------------------
  var searchInput = document.getElementById('recipe-search-input');
  if (searchInput) {
    var searchTimer = null;
    var lastSentTerm = '';
    searchInput.addEventListener('input', function () {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () {
        var term = searchInput.value.trim();
        // 打鍵途中の断片を送らないよう、入力が止まってから2文字以上のときだけ送る
        if (term.length < 2 || term === lastSentTerm) return;
        lastSentTerm = term;
        track('site_search', { search_term: term, locale: lang });
      }, 1200);
    });

    document.addEventListener('click', function (e) {
      var result = closestLink(e.target, '.search-result');
      if (!result) return;
      track('search_result_click', {
        search_term: searchInput.value.trim(),
        link_url: result.getAttribute('href') || '',
        locale: lang,
      });
    });
  }
})();
