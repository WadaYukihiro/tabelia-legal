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
// 出し方（2026-10-12 決定）:
// - 開いた直後には出さない。検索から来た読者の本文を覆うと Google が「煩わしいインタースティシャル」と
//   みなすため。レシピ詳細は作り方（#steps）が画面の上 6 割に入ったとき、ほかのページは半分まで
//   スクロールしたときに出す
// - iPhone/iPad は下から出るシート（本文は覆わない）に App Store バッジ、PC は中央のダイアログに
//   QR コード。Android はアプリが無いので出さない
// - 最後の3日（10/29〜31）は期限の行を「あと N 日」に替え、Chef Authen のせりふも替える
//
// 確認用: `?campaign_preview=1` を付けると期間・表示済みの記録・スクロール位置に関係なくすぐ出す
// （記録も残さない）。`&campaign_device=ios|desktop` で端末、`&campaign_now=2026-10-30` で日付を指定できる。
(function () {
  var CAMPAIGN = {
    // 2026-10-13 00:00 〜 2026-10-31 24:00（日本時間）。App Store Connect の開始日・終了日と揃える
    startsAt: Date.UTC(2026, 9, 12, 15, 0, 0),
    endsAt: Date.UTC(2026, 9, 31, 15, 0, 0),
    // 期限の行とせりふを替える日（2026-10-29 00:00 日本時間）
    lastDaysFrom: Date.UTC(2026, 9, 28, 15, 0, 0),
    storageKey: 'tabelia-campaign-pro_intro_202610',
    // ct はページ種別から下で付ける（generate-web-recipes.ts の appStoreCampaignToken と同じ形）
    appStoreUrl: 'https://apps.apple.com/jp/app/id6773620076?pt=128959190&mt=8',
    // PC の QR コード。読み取り先は ct=web_campaign_qr_ja の App Store URL（37×37 モジュール・誤り訂正 M、
    // 余白 4 モジュール込みで 45×45）。URL を変えたら作り直す
    qrPath: 'M4 4h7v1h-7zM12 4h2v1h-2zM15 4h2v1h-2zM20 4h1v1h-1zM22 4h1v1h-1zM27 4h1v1h-1zM29 4h1v1h-1zM31 4h1v1h-1zM34 4h7v1h-7zM4 5h1v1h-1zM10 5h1v1h-1zM14 5h2v1h-2zM18 5h4v1h-4zM23 5h2v1h-2zM28 5h3v1h-3zM34 5h1v1h-1zM40 5h1v1h-1zM4 6h1v1h-1zM6 6h3v1h-3zM10 6h1v1h-1zM13 6h1v1h-1zM16 6h8v1h-8zM25 6h3v1h-3zM31 6h1v1h-1zM34 6h1v1h-1zM36 6h3v1h-3zM40 6h1v1h-1zM4 7h1v1h-1zM6 7h3v1h-3zM10 7h1v1h-1zM12 7h2v1h-2zM15 7h2v1h-2zM23 7h2v1h-2zM26 7h6v1h-6zM34 7h1v1h-1zM36 7h3v1h-3zM40 7h1v1h-1zM4 8h1v1h-1zM6 8h3v1h-3zM10 8h1v1h-1zM12 8h1v1h-1zM15 8h4v1h-4zM24 8h1v1h-1zM27 8h1v1h-1zM30 8h3v1h-3zM34 8h1v1h-1zM36 8h3v1h-3zM40 8h1v1h-1zM4 9h1v1h-1zM10 9h1v1h-1zM12 9h3v1h-3zM17 9h2v1h-2zM22 9h3v1h-3zM28 9h2v1h-2zM34 9h1v1h-1zM40 9h1v1h-1zM4 10h7v1h-7zM12 10h1v1h-1zM14 10h1v1h-1zM16 10h1v1h-1zM18 10h1v1h-1zM20 10h1v1h-1zM22 10h1v1h-1zM24 10h1v1h-1zM26 10h1v1h-1zM28 10h1v1h-1zM30 10h1v1h-1zM32 10h1v1h-1zM34 10h7v1h-7zM12 11h1v1h-1zM16 11h4v1h-4zM21 11h5v1h-5zM30 11h3v1h-3zM4 12h1v1h-1zM8 12h1v1h-1zM10 12h4v1h-4zM15 12h13v1h-13zM32 12h6v1h-6zM40 12h1v1h-1zM4 13h2v1h-2zM7 13h1v1h-1zM9 13h1v1h-1zM11 13h2v1h-2zM15 13h2v1h-2zM18 13h1v1h-1zM22 13h1v1h-1zM25 13h1v1h-1zM27 13h1v1h-1zM31 13h3v1h-3zM35 13h3v1h-3zM39 13h1v1h-1zM4 14h3v1h-3zM10 14h1v1h-1zM13 14h2v1h-2zM16 14h2v1h-2zM19 14h1v1h-1zM22 14h1v1h-1zM24 14h1v1h-1zM27 14h2v1h-2zM30 14h2v1h-2zM33 14h1v1h-1zM35 14h1v1h-1zM37 14h2v1h-2zM4 15h1v1h-1zM9 15h1v1h-1zM14 15h1v1h-1zM16 15h10v1h-10zM27 15h2v1h-2zM32 15h1v1h-1zM35 15h1v1h-1zM37 15h3v1h-3zM6 16h1v1h-1zM9 16h3v1h-3zM13 16h1v1h-1zM16 16h1v1h-1zM18 16h1v1h-1zM20 16h3v1h-3zM25 16h4v1h-4zM32 16h4v1h-4zM37 16h4v1h-4zM5 17h5v1h-5zM13 17h3v1h-3zM19 17h1v1h-1zM24 17h2v1h-2zM27 17h1v1h-1zM29 17h5v1h-5zM36 17h2v1h-2zM39 17h1v1h-1zM5 18h2v1h-2zM10 18h1v1h-1zM12 18h2v1h-2zM15 18h2v1h-2zM19 18h1v1h-1zM22 18h1v1h-1zM25 18h7v1h-7zM33 18h6v1h-6zM4 19h1v1h-1zM8 19h2v1h-2zM11 19h1v1h-1zM13 19h1v1h-1zM15 19h4v1h-4zM21 19h1v1h-1zM24 19h2v1h-2zM28 19h1v1h-1zM30 19h3v1h-3zM35 19h2v1h-2zM38 19h2v1h-2zM4 20h1v1h-1zM8 20h1v1h-1zM10 20h1v1h-1zM12 20h1v1h-1zM14 20h2v1h-2zM18 20h1v1h-1zM21 20h1v1h-1zM23 20h1v1h-1zM25 20h4v1h-4zM34 20h1v1h-1zM37 20h2v1h-2zM40 20h1v1h-1zM4 21h4v1h-4zM11 21h1v1h-1zM13 21h2v1h-2zM17 21h1v1h-1zM20 21h1v1h-1zM22 21h2v1h-2zM27 21h1v1h-1zM29 21h5v1h-5zM35 21h5v1h-5zM5 22h1v1h-1zM9 22h4v1h-4zM16 22h1v1h-1zM18 22h1v1h-1zM20 22h1v1h-1zM25 22h4v1h-4zM30 22h4v1h-4zM35 22h1v1h-1zM38 22h1v1h-1zM4 23h1v1h-1zM6 23h1v1h-1zM8 23h2v1h-2zM12 23h1v1h-1zM14 23h1v1h-1zM16 23h2v1h-2zM21 23h3v1h-3zM25 23h1v1h-1zM27 23h1v1h-1zM30 23h1v1h-1zM33 23h1v1h-1zM36 23h4v1h-4zM4 24h1v1h-1zM9 24h2v1h-2zM12 24h1v1h-1zM14 24h2v1h-2zM18 24h9v1h-9zM28 24h1v1h-1zM30 24h1v1h-1zM33 24h3v1h-3zM37 24h2v1h-2zM7 25h1v1h-1zM9 25h1v1h-1zM12 25h2v1h-2zM17 25h3v1h-3zM21 25h1v1h-1zM26 25h8v1h-8zM35 25h2v1h-2zM39 25h1v1h-1zM5 26h2v1h-2zM10 26h2v1h-2zM14 26h1v1h-1zM16 26h7v1h-7zM24 26h1v1h-1zM27 26h2v1h-2zM30 26h4v1h-4zM35 26h4v1h-4zM5 27h2v1h-2zM9 27h1v1h-1zM11 27h2v1h-2zM15 27h1v1h-1zM17 27h1v1h-1zM19 27h4v1h-4zM25 27h1v1h-1zM27 27h2v1h-2zM30 27h1v1h-1zM35 27h2v1h-2zM38 27h1v1h-1zM40 27h1v1h-1zM5 28h1v1h-1zM7 28h1v1h-1zM9 28h2v1h-2zM12 28h4v1h-4zM21 28h1v1h-1zM25 28h4v1h-4zM31 28h1v1h-1zM34 28h1v1h-1zM37 28h3v1h-3zM4 29h3v1h-3zM8 29h2v1h-2zM11 29h6v1h-6zM27 29h1v1h-1zM30 29h2v1h-2zM33 29h1v1h-1zM35 29h2v1h-2zM6 30h6v1h-6zM15 30h3v1h-3zM19 30h2v1h-2zM22 30h1v1h-1zM24 30h10v1h-10zM38 30h1v1h-1zM11 31h1v1h-1zM14 31h2v1h-2zM19 31h3v1h-3zM25 31h2v1h-2zM31 31h3v1h-3zM36 31h5v1h-5zM4 32h2v1h-2zM9 32h2v1h-2zM15 32h2v1h-2zM18 32h9v1h-9zM28 32h1v1h-1zM32 32h7v1h-7zM40 32h1v1h-1zM12 33h2v1h-2zM16 33h1v1h-1zM18 33h2v1h-2zM25 33h3v1h-3zM29 33h2v1h-2zM32 33h1v1h-1zM36 33h1v1h-1zM39 33h1v1h-1zM4 34h7v1h-7zM12 34h2v1h-2zM15 34h1v1h-1zM19 34h4v1h-4zM24 34h1v1h-1zM27 34h3v1h-3zM32 34h1v1h-1zM34 34h1v1h-1zM36 34h1v1h-1zM39 34h1v1h-1zM4 35h1v1h-1zM10 35h1v1h-1zM15 35h1v1h-1zM18 35h4v1h-4zM23 35h4v1h-4zM28 35h1v1h-1zM31 35h2v1h-2zM36 35h5v1h-5zM4 36h1v1h-1zM6 36h3v1h-3zM10 36h1v1h-1zM12 36h1v1h-1zM14 36h1v1h-1zM18 36h1v1h-1zM20 36h3v1h-3zM26 36h4v1h-4zM32 36h9v1h-9zM4 37h1v1h-1zM6 37h3v1h-3zM10 37h1v1h-1zM13 37h2v1h-2zM16 37h4v1h-4zM26 37h2v1h-2zM29 37h1v1h-1zM31 37h5v1h-5zM39 37h2v1h-2zM4 38h1v1h-1zM6 38h3v1h-3zM10 38h1v1h-1zM13 38h1v1h-1zM17 38h1v1h-1zM19 38h1v1h-1zM24 38h6v1h-6zM31 38h2v1h-2zM34 38h1v1h-1zM37 38h1v1h-1zM4 39h1v1h-1zM10 39h1v1h-1zM14 39h1v1h-1zM17 39h3v1h-3zM21 39h1v1h-1zM23 39h4v1h-4zM28 39h1v1h-1zM30 39h1v1h-1zM33 39h2v1h-2zM36 39h4v1h-4zM4 40h7v1h-7zM12 40h1v1h-1zM15 40h3v1h-3zM19 40h4v1h-4zM24 40h2v1h-2zM27 40h2v1h-2zM33 40h3v1h-3zM37 40h4v1h-4z',
  };

  var lang = (document.documentElement.getAttribute('lang') || 'ja').slice(0, 2);
  if (lang !== 'ja') return;

  var search = window.location.search;
  var preview = /[?&]campaign_preview=1(?:&|$)/.test(search);
  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(search);
    return m ? decodeURIComponent(m[1]) : '';
  }

  var now = Date.now();
  if (preview && param('campaign_now')) {
    var forced = Date.parse(param('campaign_now') + 'T12:00:00+09:00');
    if (!isNaN(forced)) now = forced;
  }
  if (!preview && (now < CAMPAIGN.startsAt || now >= CAMPAIGN.endsAt)) return;

  // iPadOS の Safari は Mac と同じ UA を名乗るので、タッチ点の数で見分ける
  function detectDevice() {
    var ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPod|iPad/.test(ua)) return 'ios';
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
    if (/Mobi/i.test(ua)) return 'other-mobile';
    return 'desktop';
  }
  var device = (preview && param('campaign_device')) || detectDevice();
  if (device !== 'ios' && device !== 'desktop') return;

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
  function alreadyShown() {
    return !storage || !!storage.getItem(CAMPAIGN.storageKey);
  }
  if (!preview && alreadyShown()) return;

  var page = window.TABELIA_PAGE || {};
  function track(name, params) {
    if (typeof window.tabeliaTrack === 'function') window.tabeliaTrack(name, params);
  }

  // 読み進めたかどうか。作り方のあるページはその見出しの位置、ないページはスクロール量で見る
  function hasReadEnough() {
    var steps = document.getElementById('steps');
    var viewport = window.innerHeight || document.documentElement.clientHeight;
    if (steps) return steps.getBoundingClientRect().top < viewport * 0.6;
    var scrollable = document.documentElement.scrollHeight - viewport;
    if (scrollable <= 0) return false;
    return (window.pageYOffset || document.documentElement.scrollTop) >= scrollable * 0.5;
  }

  var lastDays = now >= CAMPAIGN.lastDaysFrom;
  var daysLeft = Math.ceil((CAMPAIGN.endsAt - now) / 86400000);
  var deadline = !lastDays
    ? '10月31日まで'
    : daysLeft <= 1
      ? '今日まで ・ 10月31日'
      : 'あと' + daysLeft + '日 ・ 10月31日まで';
  var quote = lastDays ? '迷っている間に、<br>ブロードがひと鍋取れてしまいますよ。' : '週末の献立、<br>私が横で見ていましょう。';

  var closeIcon =
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  var arrowIcon =
    '<svg class="campaign-popup-arrow" viewBox="0 0 24 12" width="22" height="11" aria-hidden="true"><path d="M1 6h20M16 1.5L21 6l-5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // シートとダイアログで共通の中身。料金は「通常¥900 → ¥300」の比較で見せ、文章は1行に絞る
  var body =
    '<p class="campaign-popup-quote">「' + quote + '」</p>' +
    '<p class="campaign-popup-speaker">Chef Authen</p>' +
    '<hr class="campaign-popup-rule">' +
    '<p class="campaign-popup-deadline' + (lastDays ? ' is-last-days' : '') + '">' + deadline + '</p>' +
    '<h2 class="campaign-popup-title" id="campaign-popup-title">Tabelia アプリの Proプラン、最初の1か月</h2>' +
    '<p class="campaign-popup-price">' +
    '<s class="campaign-popup-was"><span class="campaign-popup-sr">通常 </span>¥900</s>' +
    arrowIcon +
    '<strong class="campaign-popup-now"><span class="campaign-popup-sr">最初の1か月 </span>¥300</strong>' +
    '<span class="campaign-popup-save">¥600 お得</span>' +
    '</p>' +
    '<p class="campaign-popup-lead">献立の全工程を1本のタイムラインにする<br class="campaign-popup-br">コーチングが月100回使えます</p>';
  var note =
    '<p class="campaign-popup-note">2か月目から月額¥900。日本の App Store で Proプランを初めて申し込み、月額を選んだ方が対象です。</p>';
  var closeButton =
    '<button type="button" class="campaign-popup-close" data-campaign-close aria-label="閉じる">' + closeIcon + '</button>';

  function sheetHtml() {
    var ct = ['web_campaign', page.page_type || 'other', 'ja'].join('_').replace(/[^A-Za-z0-9_-]/g, '_');
    var href = CAMPAIGN.appStoreUrl.replace('&mt=8', '&ct=' + ct + '&mt=8');
    return (
      '<div class="campaign-popup-dialog" role="dialog" aria-modal="false" aria-labelledby="campaign-popup-title" tabindex="-1">' +
      '<img class="campaign-popup-chef" src="/chef/chef-authen-tip.png" alt="" width="88" height="88">' +
      closeButton +
      body +
      '<a class="appstore-badge campaign-popup-badge" data-cta-placement="campaign_popup" href="' + href + '" aria-label="Download on the App Store">' +
      '<svg class="appstore-badge-icon" viewBox="0 0 814 1000" fill="white" aria-hidden="true"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105.9-57.8-156.7-127C46.5 682.8 3 581.1 3 483.3c0-149.8 97.7-229.2 190.1-229.2 80.2 0 131.1 53.3 181.6 53.3 48.4 0 106.3-56.3 197.7-56.3zm-161.1-153.9c49.3-58.4 85.5-139.9 85.5-221.3 0-11.3-.6-22.6-2.6-31.9-80.8 3.2-177 54.6-234.4 124.1-44.5 50.3-88.9 131.8-88.9 214.5 0 13.9 1.9 27.9 3.2 32.5 4.5.6 11.9 1.3 19.2 1.3 71.9 0 160.5-48.4 218-119.2z"/></svg>' +
      '<span class="appstore-badge-text"><span class="appstore-badge-sub">Download on the</span><span class="appstore-badge-main">App Store</span></span>' +
      '</a>' +
      note +
      '</div>'
    );
  }

  function dialogHtml() {
    return (
      '<div class="campaign-popup-backdrop" data-campaign-close></div>' +
      '<div class="campaign-popup-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-popup-title" tabindex="-1">' +
      '<img class="campaign-popup-chef" src="/chef/chef-authen-tip-640.jpg" alt="" width="240" height="240">' +
      '<div class="campaign-popup-body">' +
      closeButton +
      body +
      note +
      '</div>' +
      '<div class="campaign-popup-qr">' +
      '<svg viewBox="0 0 45 45" width="124" height="124" role="img" aria-label="App Store の Tabelia のページを開く QR コード" shape-rendering="crispEdges">' +
      '<rect width="45" height="45" fill="#fff"/><path fill="#111" d="' + CAMPAIGN.qrPath + '"/></svg>' +
      '<p>iPhone のカメラで読み取ると<br>App Store が開きます</p>' +
      '</div>' +
      '</div>'
    );
  }

  var shown = false;
  var root = null;
  var previousFocus = null;

  function onKeydown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') close();
  }

  function close() {
    if (!root) return;
    var closing = root;
    root = null;
    document.removeEventListener('keydown', onKeydown);
    document.documentElement.classList.remove('campaign-popup-open');
    closing.classList.remove('is-visible');
    window.setTimeout(function () {
      if (closing.parentNode) closing.parentNode.removeChild(closing);
    }, 250);
    if (device === 'desktop' && previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    track('campaign_popup_close', { page_type: page.page_type || '', locale: lang });
  }

  function show() {
    if (shown) return;
    // Cookie 同意バナーが出ている間は重ねない。表示済みにもしないので、同意を選んだ後に出る
    if (document.querySelector('.consent-banner')) return;
    // 別のタブで先に出ていたら出さない
    if (!preview && alreadyShown()) return stopWatching();
    shown = true;
    stopWatching();

    root = document.createElement('div');
    root.className = 'campaign-popup ' + (device === 'ios' ? 'campaign-popup--sheet' : 'campaign-popup--dialog');
    root.innerHTML = device === 'ios' ? sheetHtml() : dialogHtml();
    root.addEventListener('click', function (e) {
      var target = e.target;
      if (target && typeof target.closest === 'function' && target.closest('[data-campaign-close]')) close();
    });
    document.addEventListener('keydown', onKeydown);

    previousFocus = document.activeElement;
    document.body.appendChild(root);
    // シートは本文を覆わないので、スクロールもフォーカスも奪わない。ダイアログは背面を止めて本体に移す
    if (device === 'desktop') document.documentElement.classList.add('campaign-popup-open');
    if (!preview) storage.setItem(CAMPAIGN.storageKey, String(Date.now()));
    var shownRoot = root;
    // 描画後にクラスを付けてフェードインさせる（同意バナーと同じ手順）
    window.requestAnimationFrame(function () {
      shownRoot.classList.add('is-visible');
      if (device !== 'desktop') return;
      // 閉じるボタンではなくダイアログ本体に移す。ボタンに当てると開いた直後からフォーカス枠が出る
      var dialog = shownRoot.querySelector('.campaign-popup-dialog');
      if (dialog) dialog.focus({ preventScroll: true });
    });

    track('campaign_popup_view', { page_type: page.page_type || '', locale: lang });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      if (hasReadEnough()) show();
    });
  }
  function stopWatching() {
    window.removeEventListener('scroll', onScroll);
  }

  if (preview) {
    show();
    return;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  // 作り方へのアンカーで開いたときなど、読み込んだ時点で条件を満たしていることがある
  if (hasReadEnough()) show();
})();
