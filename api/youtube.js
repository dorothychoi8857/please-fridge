'use strict';

const QUERIES = {
  tofu: '두부 계란 볶음 레시피', chicken: '간장 닭고기 덮밥 레시피',
  pancake: '애호박전 레시피', rice: '야채 계란 볶음밥 레시피',
  spinach: '시금치 계란 볶음 레시피', soup: '두부 된장국 레시피',
};
const cache = new Map();
const pending = new Map();
const CACHE_MS = 6 * 60 * 60 * 1000;

class PublicError extends Error {
  constructor(message, status = 502, code = 'YOUTUBE_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function decode(value) {
  const entities = {amp: '&', quot: '"', apos: "'", lt: '<', gt: '>'};
  return String(value || '').replace(/&(amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (whole, entity) => {
    if (Object.hasOwn(entities, entity.toLowerCase())) return entities[entity.toLowerCase()];
    const numeric = entity.toLowerCase().startsWith('#x') ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isFinite(numeric) && numeric > 0 && numeric <= 0x10ffff ? String.fromCodePoint(numeric) : whole;
  });
}

function matchesMenu(recipe, title) {
  const text = decode(title).replace(/\s+/g, '').toLowerCase();
  const groups = {
    tofu: [['두부', 'tofu'], ['계란', '달걀', 'egg'], ['볶음', '스크램블', 'scrambl']],
    chicken: [['닭', '치킨', 'chicken'], ['덮밥', 'ricebowl', 'donburi'], ['간장', '데리야끼', '데리야키', 'teriyaki']],
    pancake: [['애호박', '호박전', 'zucchini'], ['전', 'pancake']],
    rice: [['볶음밥', 'friedrice'], ['야채', '채소', '계란', '달걀', 'egg', 'vegetable']],
    spinach: [['시금치', 'spinach'], ['계란', '달걀', 'egg'], ['볶음', '스크램블', 'scrambl']],
    soup: [['된장국', 'doenjangguk', 'doenjangsoup'], ['두부', 'tofu']],
  };
  if (!Object.hasOwn(groups, recipe)) return false;
  if (recipe === 'pancake' && !text.includes('애호박') && ['단호박', '늙은호박'].some(word => text.includes(word))) return false;
  if (recipe === 'rice' && ['김치', 'kimchi'].some(word => text.includes(word))) return false;
  return groups[recipe].every(group => group.some(word => text.includes(word)));
}

async function googleJSON(resource, parameters, key) {
  const url = new URL('https://www.googleapis.com/youtube/v3/' + resource);
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, String(value));
  let response, data;
  try {
    response = await fetch(url, {headers: {'X-Goog-Api-Key': key, Accept: 'application/json'}, signal: AbortSignal.timeout(12000)});
    data = await response.json();
  } catch {
    throw new PublicError('YouTube에 연결하지 못했어요. 잠시 후 다시 시도하세요.');
  }
  if (!response.ok) {
    const reasons = data?.error?.errors?.map(item => item.reason) || [];
    if (response.status === 429 || reasons.some(reason => ['quotaExceeded', 'dailyLimitExceeded'].includes(reason))) {
      throw new PublicError('YouTube 무료 할당량에 도달했어요. 한도 초기화 후 다시 시도하세요. 자동 추가 결제는 하지 않습니다.', 429, 'YOUTUBE_QUOTA');
    }
    throw new PublicError('YouTube 연결 설정이나 API 사용 권한을 확인해 주세요.', 502, 'YOUTUBE_ACCESS');
  }
  return data;
}

async function searchVideos(recipe, key) {
  const byID = new Map();
  for (const order of ['viewCount', 'relevance']) {
    const result = await googleJSON('search', {part: 'snippet', type: 'video', q: QUERIES[recipe], order, maxResults: 50, regionCode: 'KR', relevanceLanguage: 'ko', safeSearch: 'strict'}, key);
    const ids = [...new Set((result.items || []).map(item => item.id?.videoId).filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id)))];
    if (ids.length) {
      const details = await googleJSON('videos', {part: 'snippet,statistics,status', id: ids.join(','), fields: 'items(id,snippet(title,channelTitle,publishedAt,liveBroadcastContent),statistics(viewCount),status(privacyStatus))'}, key);
      for (const item of details.items || []) {
        const snippet = item.snippet || {};
        if (!ids.includes(item.id) || (snippet.liveBroadcastContent || 'none') !== 'none' || (item.status?.privacyStatus || 'public') !== 'public' || !matchesMenu(recipe, snippet.title)) continue;
        const raw = item.statistics?.viewCount;
        const views = raw == null || raw === '' ? null : Number(raw);
        byID.set(item.id, {id: item.id, title: decode(snippet.title).slice(0, 300), channel: decode(snippet.channelTitle).slice(0, 150), views: Number.isFinite(views) ? Math.max(0, views) : null, publishedAt: snippet.publishedAt || '', url: 'https://www.youtube.com/watch?v=' + item.id});
      }
    }
    if (byID.size >= 3) break;
  }
  return {videos: [...byID.values()].sort((a, b) => (b.views ?? -1) - (a.views ?? -1)).slice(0, 3), query: QUERIES[recipe], fetchedAt: new Date().toISOString(), cached: false};
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (status === 200) {
    // Shared CDN cache limits Google quota use across visitors; no credentials in cached data.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400');
    res.setHeader('Vercel-CDN-Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
  }
  return res.end(JSON.stringify(data));
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, {error: 'GET 요청만 지원합니다.'});
  }
  const origin = req.headers.origin;
  if (req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, {error: '이 앱에서만 영상 검색을 요청해 주세요.'});
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return send(res, 403, {error: '다른 사이트의 요청은 지원하지 않습니다.'}); }
    catch { return send(res, 403, {error: '올바르지 않은 요청입니다.'}); }
  }
  const url = new URL(req.url, 'https://app.invalid');
  const recipe = url.searchParams.get('recipe');
  if (url.searchParams.size !== 1 || url.searchParams.getAll('recipe').length !== 1 || !Object.hasOwn(QUERIES, recipe)) return send(res, 400, {error: '지원하는 메뉴를 선택해 주세요.'});
  if (url.search !== '?recipe=' + recipe) {
    res.statusCode = 308;
    res.setHeader('Location', '/api/youtube?recipe=' + recipe);
    return res.end();
  }
  const key = (process.env.YOUTUBE_API_KEY || '').trim();
  if (!key) return send(res, 503, {error: '서버의 YouTube 연결을 준비 중이에요. 직접 검색 버튼을 이용해 주세요.', code: 'YOUTUBE_NOT_CONFIGURED'});
  try {
    const previous = cache.get(recipe);
    if (previous && previous.expires > Date.now()) return send(res, 200, {...previous.data, cached: true});
    if (!pending.has(recipe)) {
      const task = searchVideos(recipe, key).then(data => {cache.set(recipe, {data, expires: Date.now() + CACHE_MS}); return data;}).finally(() => pending.delete(recipe));
      pending.set(recipe, task);
    }
    return send(res, 200, await pending.get(recipe));
  } catch (error) {
    return send(res, error instanceof PublicError ? error.status : 502, {error: error instanceof PublicError ? error.message : '영상 검색에 실패했어요. 잠시 후 다시 시도하세요.', code: error instanceof PublicError ? error.code : 'YOUTUBE_ERROR'});
  }
}

module.exports = handler;
module.exports.matchesMenu = matchesMenu;
