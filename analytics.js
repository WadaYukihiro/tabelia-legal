// Tabelia Web のアクセス解析（Google Analytics 4）クライアント。
// generate-web-recipes.ts が legal-site/analytics.js としてコピーする。直接 legal-site 側を編集しない。
//
// 役割は4つ:
//   1. EU/英国向けの Cookie 同意バナー（オプトイン）
//   2. 流入〜App Store 導線のカスタムイベント送信
//   3. window.tabeliaTrack() の提供（他スクリプトからの計測用フック）
//   4. 期間限定のキャンペーン告知（ファイル末尾の別 IIFE。全ページが読む唯一のスクリプトなのでここに置く）
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

  // 記事本文の閲覧。recipe_view と同じ理由で page_view とは別に送る
  if (page.page_type === 'article') {
    track('article_view', page);
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
    // data-cta-placement を持つ導線（材料欄の代替確定後など）はその値をそのまま使う
    var placement = link.getAttribute('data-cta-placement') || 'link';
    if (!link.hasAttribute('data-cta-placement') && link.classList.contains('appstore-badge')) {
      placement = closestLink(link, '.app-cta') ? 'app_cta' : 'badge';
    }
    // engaged: このページで人数変更か代替確定を済ませてから降りたか（interactions.js が立てる）。
    // 「価値を体験した人がアプリへ行くか」を CTA 位置の判断に使う（docs/KPI.md 第3層）
    var engaged = window.TABELIA_ENGAGED || {};
    track('app_store_click', {
      page_type: page.page_type || '',
      recipe_slug: page.recipe_slug || '',
      locale: lang,
      placement: placement,
      engaged: engaged.substitution || engaged.servings ? 1 : 0,
    });
  });

  // 記事 → 関連レシピカード（/articles/<slug>/ の .article-recipe-card）
  document.addEventListener('click', function (e) {
    var link = closestLink(e.target, 'a[data-article-recipe]');
    if (!link) return;
    track('article_recipe_click', {
      article_slug: page.article_slug || '',
      recipe_slug: link.getAttribute('data-recipe-slug') || '',
    });
  });

  // レシピ → 関連記事カード（/recipes/<slug>/ の .recipe-article-card）
  document.addEventListener('click', function (e) {
    var link = closestLink(e.target, 'a[data-recipe-article]');
    if (!link) return;
    track('recipe_article_click', {
      recipe_slug: page.recipe_slug || '',
      article_slug: link.getAttribute('data-article-slug') || '',
    });
  });

  // 記事トップのフィルター操作（article_filter）は /articles/filter.js が
  // window.tabeliaTrack 経由で送る（scripts/lib/web-articles.ts の ARTICLE_FILTER_JS）。

  // 取り寄せリンク（Amazon / 楽天市場）。アプリの affiliate_link_opened と同じイベント名・パラメータで、
  // source だけ Web の配置名にする（docs/ANALYTICS.md）
  document.addEventListener('click', function (e) {
    var link = closestLink(e.target, 'a[data-affiliate]');
    if (!link) return;
    // 商品紹介欄（道具・ワイン）: 同じイベント名で商品系パラメータを送る。
    // 商品名は ingredient_name に入れない（docs/design/RECIPE_RELATED_PRODUCTS.md §9）
    if (link.getAttribute('data-source') === 'recipe_products') {
      track('affiliate_link_opened', {
        merchant: link.getAttribute('data-affiliate') || '',
        source: 'recipe_products',
        product_id: link.getAttribute('data-product-id') || '',
        product_kind: link.getAttribute('data-product-kind') || '',
        recipe_slug: page.recipe_slug || '',
      });
      return;
    }
    track('affiliate_link_opened', {
      merchant: link.getAttribute('data-affiliate') || '',
      source: 'recipe_ingredients',
      ingredient_name: link.getAttribute('data-ingredient') || '',
      recipe_slug: page.recipe_slug || '',
    });
  });

  // -------------------------------------------------------------------------
  // 3. サイト内検索（全ロケールの search.js が共通の ID を使う）
  // -------------------------------------------------------------------------
  var searchInput = document.getElementById('discovery-query') || document.getElementById('recipe-search-input');
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
      var result = closestLink(e.target, '.search-result, .discovery-card');
      if (!result) return;
      track('search_result_click', {
        search_term: searchInput.value.trim(),
        link_url: result.getAttribute('href') || '',
        locale: lang,
      });
    });
  }
})();

// ---------------------------------------------------------------------------
// 4. キャンペーン告知（Pro月額の最初の1か月¥300、docs/MONETIZATION.md）
// ---------------------------------------------------------------------------
// 日本語ページだけに、期間中、ブラウザごとに1回だけ出す。オファーは日本の App Store 限定のため、
// en/it のページには出さない。期間外は何もしないので、終了後にコードを消し忘れても表示は止まる。
// 計測に依存させないよう、上の IIFE（GA 未設定なら return する）とは分けている。
//
// 確認用: `?campaign_preview=1` を付けると期間と表示済みの記録に関係なく出す（記録も残さない）。
(function () {
  var CAMPAIGN = {
    // 2026-10-13 00:00 〜 2026-10-31 24:00（日本時間）。App Store Connect の開始日・終了日と揃える
    startsAt: Date.UTC(2026, 9, 12, 15, 0, 0),
    endsAt: Date.UTC(2026, 9, 31, 15, 0, 0),
    storageKey: 'tabelia-campaign-pro_intro_202610',
    // ct はページ種別から下で付ける（generate-web-recipes.ts の appStoreCampaignToken と同じ形）
    appStoreUrl: 'https://apps.apple.com/jp/app/id6773620076?pt=128959190&mt=8',
  };

  var lang = (document.documentElement.getAttribute('lang') || 'ja').slice(0, 2);
  if (lang !== 'ja') return;

  var preview = /[?&]campaign_preview=1(?:&|$)/.test(window.location.search);
  var now = Date.now();
  if (!preview && (now < CAMPAIGN.startsAt || now >= CAMPAIGN.endsAt)) return;

  // 表示済みの記録は localStorage（ブラウザ単位）。使えない環境では sessionStorage（タブ単位）に退避し、
  // どちらも使えなければ出さない（ページを移るたびに出るよりは、出さないほうがよい）
  function pickStorage() {
    var names = ['localStorage', 'sessionStorage'];
    for (var i = 0; i < names.length; i++) {
      try {
        var s = window[names[i]];
        s.setItem('tabelia-storage-test', '1');
        s.removeItem('tabelia-storage-test');
        return s;
      } catch (e) {
        /* 次の候補へ */
      }
    }
    return null;
  }

  var storage = pickStorage();
  if (!preview && (!storage || storage.getItem(CAMPAIGN.storageKey))) return;

  // Cookie 同意バナーが出ているページでは重ねない。表示済みにもしないので、同意を選んだ後のページで出る
  if (document.querySelector('.consent-banner')) return;

  var page = window.TABELIA_PAGE || {};
  function track(name, params) {
    if (typeof window.tabeliaTrack === 'function') window.tabeliaTrack(name, params);
  }

  var ct = ['web_campaign', page.page_type || 'other', 'ja'].join('_').replace(/[^A-Za-z0-9_-]/g, '_');
  var href = CAMPAIGN.appStoreUrl.replace('&mt=8', '&ct=' + ct + '&mt=8');

  var root = document.createElement('div');
  root.className = 'campaign-popup';
  root.innerHTML =
    '<div class="campaign-popup-backdrop" data-campaign-close></div>' +
    '<div class="campaign-popup-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-popup-title" tabindex="-1">' +
    '<button type="button" class="campaign-popup-close" data-campaign-close aria-label="閉じる">' +
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
    '</button>' +
    '<p class="campaign-popup-kicker">10月31日までのお申し込みで</p>' +
    '<h2 class="campaign-popup-title" id="campaign-popup-title">Proプラン<br>最初の1か月 <span>¥300</span></h2>' +
    '<p class="campaign-popup-lead">Tabelia アプリのProプランを初めて申し込むと、最初の1か月は¥300、2か月目からは月額¥900です。' +
    '献立に選んだ料理すべての工程を1本のタイムラインにまとめる「コーチング」を、月100回まで使えます。</p>' +
    '<a class="appstore-badge campaign-popup-badge" data-cta-placement="campaign_popup" href="' + href + '" aria-label="Download on the App Store">' +
    '<svg class="appstore-badge-icon" viewBox="0 0 814 1000" fill="white" aria-hidden="true"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105.9-57.8-156.7-127C46.5 682.8 3 581.1 3 483.3c0-149.8 97.7-229.2 190.1-229.2 80.2 0 131.1 53.3 181.6 53.3 48.4 0 106.3-56.3 197.7-56.3zm-161.1-153.9c49.3-58.4 85.5-139.9 85.5-221.3 0-11.3-.6-22.6-2.6-31.9-80.8 3.2-177 54.6-234.4 124.1-44.5 50.3-88.9 131.8-88.9 214.5 0 13.9 1.9 27.9 3.2 32.5 4.5.6 11.9 1.3 19.2 1.3 71.9 0 160.5-48.4 218-119.2z"/></svg>' +
    '<span class="appstore-badge-text"><span class="appstore-badge-sub">Download on the</span><span class="appstore-badge-main">App Store</span></span>' +
    '</a>' +
    '<p class="campaign-popup-note">¥300の料金は、日本の App Store で月額プランを申し込んだ場合に限ります。適用されるかどうかは App Store 側で決まります。</p>' +
    '</div>';

  var previousFocus = document.activeElement;

  function onKeydown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') close();
  }

  function close() {
    document.removeEventListener('keydown', onKeydown);
    document.documentElement.classList.remove('campaign-popup-open');
    root.classList.remove('is-visible');
    window.setTimeout(function () {
      if (root.parentNode) root.parentNode.removeChild(root);
    }, 200);
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }

  root.addEventListener('click', function (e) {
    var target = e.target;
    if (target && typeof target.closest === 'function' && target.closest('[data-campaign-close]')) close();
  });
  document.addEventListener('keydown', onKeydown);

  document.body.appendChild(root);
  document.documentElement.classList.add('campaign-popup-open');
  if (!preview) storage.setItem(CAMPAIGN.storageKey, String(now));
  // 描画後にクラスを付けてフェードインさせる（同意バナーと同じ手順）
  window.requestAnimationFrame(function () {
    root.classList.add('is-visible');
    // 閉じるボタンではなくダイアログ本体に移す。ボタンに当てると開いた直後からフォーカス枠が出る
    var dialog = root.querySelector('.campaign-popup-dialog');
    if (dialog) dialog.focus({ preventScroll: true });
  });

  track('campaign_popup_view', { page_type: page.page_type || '', locale: lang });
})();
