// tabelia.app/img/<bucket>/<path>?width=&height=&resize=&quality= を配信する。
// Supabase Storage は公開画像にも X-Robots-Tag: none を付けて返すため、Google が画像を索引に登録せず、
// 検索結果にサムネイルが出ない（2026-10-08 確認）。Storage の画像変換エンドポイントから取得し、
// そのヘッダーを外して自ドメインから返す。/img/ 以外は静的ファイル（env.ASSETS）に渡す。
//
// 生成側の対応は project-authentica の scripts/lib/web-image-url.ts。バケットとクエリはそちらと揃える。

const STORAGE_RENDER = 'https://zyvkuzjemabnvbxwzxll.supabase.co/storage/v1/render/image/public/';
const BUCKETS = new Set(['recipe-images', 'learn-images']);
const PARAMS = ['width', 'height', 'resize', 'quality'];
// 画像のファイル名は保存時刻を含み、差し替えると URL が変わる。7日キャッシュしても古い画像は残らない。
const CACHE_CONTROL = 'public, max-age=604800';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/img/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const objectPath = url.pathname.slice('/img/'.length);
    const segments = objectPath.split('/');
    if (!BUCKETS.has(segments[0]) || segments.length < 2 || segments.some((s) => !s || s === '.' || s === '..')) {
      return new Response('Not Found', { status: 404 });
    }
    // 任意のクエリで変換を走らせないよう、既知のパラメータだけを決まった順で渡す（キャッシュキーも揃う）
    const query = new URLSearchParams();
    for (const key of PARAMS) {
      const value = url.searchParams.get(key);
      if (value !== null) query.set(key, value);
    }
    const search = query.toString() ? `?${query}` : '';

    // Storage は Accept を見て WebP か原形式を返すが Vary を付けない。形式ごとにキャッシュを分ける
    const webp = (request.headers.get('Accept') || '').includes('image/webp');
    const cacheKey = new Request(`${url.origin}/img/${objectPath}${search}${search ? '&' : '?'}format=${webp ? 'webp' : 'original'}`);
    const cache = caches.default;
    let response = await cache.match(cacheKey);
    if (!response) {
      const upstream = await fetch(`${STORAGE_RENDER}${objectPath}${search}`, {
        headers: { Accept: webp ? 'image/webp,*/*' : '*/*' },
      });
      const type = upstream.headers.get('Content-Type') || '';
      if (!upstream.ok || !type.startsWith('image/')) {
        // Storage は存在しない画像に 400 を返す。検索エンジンには 404 として見せる
        const status = upstream.ok ? 502 : upstream.status === 400 ? 404 : upstream.status;
        return new Response(status === 404 ? 'Not Found' : 'Bad Gateway', { status, headers: { 'Cache-Control': 'no-store' } });
      }
      response = new Response(upstream.body, {
        status: 200,
        headers: { 'Content-Type': type, 'Cache-Control': CACHE_CONTROL, Vary: 'Accept' },
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return request.method === 'HEAD' ? new Response(null, { headers: response.headers }) : response;
  },
};
