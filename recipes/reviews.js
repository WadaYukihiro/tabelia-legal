(function () {
  'use strict';

  var dataNode = document.getElementById('recipe-review-data');
  if (!dataNode) return;

  var data;
  try { data = JSON.parse(dataNode.textContent || '{}'); } catch (_) { return; }
  if (!data.recipe || !data.aggregate) return;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 評価の視覚表現に★は使わない（難易度表示の meta-chip の★と意味が衝突するため）。
  // generate-web-recipes.ts の ratingBarHtml と同じ矩形セグメントを描く（レンダリングロジックは
  // web-recipe-interactions.js の fmtQty 等と同様、ビルド時TSと実行時JSで意図的に重複させている）。
  function ratingBarHtml(rating) {
    var filled = Math.max(0, Math.min(5, Math.round(rating)));
    var html = '';
    for (var i = 0; i < 5; i++) {
      html += '<span class="rating-segment' + (i < filled ? ' is-filled' : '') + '"></span>';
    }
    return '<span class="rating-bar" role="img" aria-label="評価 ' + rating + '/5">' + html + '</span>';
  }

  function distributionRowsHtml(distribution, total) {
    return [5, 4, 3, 2, 1].map(function (star) {
      var count = (distribution && distribution[String(star)]) || 0;
      var pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return '<div class="rating-distribution-row">' +
        '<span class="rating-distribution-label">' + star + '</span>' +
        '<span class="rating-distribution-track"><span class="rating-distribution-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="rating-distribution-count">' + count + '</span>' +
        '</div>';
    }).join('');
  }

  function reviewCardHtml(review) {
    var date = String(review.createdAt || '').slice(0, 10).replace(/-/g, '.');
    var body = review.commentBody ? '<p class="review-card-body">' + esc(review.commentBody) + '</p>' : '';
    return '<article class="review-card">' +
      '<div class="review-card-head">' + ratingBarHtml(review.rating) + '<span class="review-card-date">' + esc(date) + '</span></div>' +
      '<p class="review-card-name">' + esc(review.authorDisplayName || '匿名') + '</p>' +
      body +
      '</article>';
  }

  // 件数に応じた出し分け（generate-web-recipes.ts の reviewsHtml と同じ規則。少数データでの分布可視化はしない）:
  //   0件    … 空状態メッセージのみ
  //   1〜9件 … 何も描画しない（一覧のみで十分。平均値・分布は出さない）
  //   10件以上 … 平均値・件数・分布バー
  function renderSummary() {
    var mount = document.getElementById('reviews-summary-mount');
    if (!mount) return;
    var count = data.aggregate.reviewCount || 0;
    if (count === 0) {
      mount.innerHTML = '<div class="reviews-empty">まだ評価が届いていません。最初のレビューを投稿してみませんか。</div>';
      return;
    }
    if (count < 10) { mount.innerHTML = ''; return; }
    var average = Number(data.aggregate.averageRating) || 0;
    mount.innerHTML =
      '<div class="reviews-summary">' +
        '<div class="reviews-summary-score">' +
          '<span class="reviews-summary-average">' + average.toFixed(1) + '</span>' +
          '<span class="reviews-summary-scale">/ 5</span>' +
        '</div>' +
        '<div class="reviews-summary-meta">' +
          ratingBarHtml(average) +
          '<span class="reviews-summary-count">' + count + '件の評価</span>' +
        '</div>' +
        '<div class="reviews-distribution">' + distributionRowsHtml(data.aggregate.ratingDistribution, count) + '</div>' +
      '</div>';
  }

  function renderList() {
    var mount = document.getElementById('reviews-list-mount');
    if (!mount) return;
    if (!data.reviews || !data.reviews.length) { mount.innerHTML = ''; return; }
    mount.innerHTML = data.reviews.map(reviewCardHtml).join('');
  }

  renderSummary();
  renderList();

  // ── 投稿フォーム ────────────────────────────────────────────────
  var form = document.getElementById('review-form');
  if (!form) return;
  var errorEl = document.getElementById('review-form-error');
  var thanksEl = document.getElementById('review-form-thanks');
  var submitButton = form.querySelector('.review-submit-button');

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function showThanks() {
    // 送信フォームを無効化する。実際の公開はモデレーション承認後なので、
    // ここで投稿内容を一覧に足すことはしない（この時点では他ユーザーにも投稿者自身にも見えない）。
    form.hidden = true;
    if (thanksEl) thanksEl.hidden = false;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (errorEl) errorEl.hidden = true;

    var formData = new FormData(form);

    // honeypot: 入力があればボットとみなし、サーバーには送らずに成功したフリをする（ボットに学習させない）。
    if (formData.get('website')) {
      showThanks();
      return;
    }

    var rating = Number(formData.get('rating'));
    if (!rating || rating < 1 || rating > 5) {
      showError('評価を選択してください。');
      return;
    }
    var email = String(formData.get('email') || '').trim();
    if (!email) {
      showError('メールアドレスを入力してください（公開されません）。');
      return;
    }
    var turnstileToken = formData.get('cf-turnstile-response');
    if (!turnstileToken) {
      showError('認証を確認しています。少し待ってからもう一度お試しください。');
      return;
    }

    var payload = {
      recipeId: data.recipe.id,
      rating: rating,
      commentBody: String(formData.get('comment') || '').trim() || null,
      authorDisplayName: String(formData.get('displayName') || '').trim() || null,
      authorEmail: email,
      turnstileToken: turnstileToken,
    };

    if (submitButton) submitButton.disabled = true;
    fetch(data.recipe.submitReviewUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: data.recipe.supabaseAnonKey,
        Authorization: 'Bearer ' + data.recipe.supabaseAnonKey,
      },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('submit-failed');
        showThanks();
      })
      .catch(function () {
        if (submitButton) submitButton.disabled = false;
        showError('送信に失敗しました。しばらくしてからもう一度お試しください。');
      });
  });
})();
