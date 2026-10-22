'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const originalFetch = global.fetch;
const originalKey = process.env.YOUTUBE_API_KEY;
const ids = ['a'.repeat(11), 'b'.repeat(11), 'c'.repeat(11), 'd'.repeat(11), 'e'.repeat(11)];
const fresh = name => {const path = require.resolve('../api/' + name + '.js'); delete require.cache[path]; return require(path);};
const request = (url = '/api/youtube?recipe=tofu', more = {}) => ({method: 'GET', url, headers: {host: 'app.example.com'}, ...more});
const response = () => ({statusCode: 200, headers: {}, body: '', setHeader(name, value) {this.headers[name.toLowerCase()] = value;}, end(body = '') {this.body = body;}});
const result = data => ({ok: true, status: 200, json: async () => data});
const details = (indexes = [0, 1, 2]) => ({items: indexes.map(index => ({id: ids[index], snippet: {title: '고소한 두부 &amp; 계란 볶음', channelTitle: '테스트', liveBroadcastContent: 'none'}, statistics: {viewCount: String(100 + index)}, status: {privacyStatus: 'public'}}))});

test.beforeEach(() => {process.env.YOUTUBE_API_KEY = 'server-test-only-value';});
test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = originalKey;
});

test('status reports readiness, never the credential', () => {
  const res = response(); fresh('status')(request('/api/status'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).runtime, 'vercel-javascript');
  assert.equal(JSON.parse(res.body).youtubeConfigured, true);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.ok(!res.body.includes(process.env.YOUTUBE_API_KEY));
});
test('unconfigured status is explicit', () => {
  delete process.env.YOUTUBE_API_KEY;
  const res = response(); fresh('status')(request('/api/status'), res);
  assert.equal(JSON.parse(res.body).youtubeConfigured, false);
});
test('status rejects writes', () => {
  const res = response(); fresh('status')(request('/api/status', {method: 'POST'}), res);
  assert.equal(res.statusCode, 405);
});
test('missing server key does not call Google', async () => {
  delete process.env.YOUTUBE_API_KEY;
  global.fetch = () => {throw new Error('Must not call Google');};
  const res = response(); await fresh('youtube')(request(), res);
  assert.equal(res.statusCode, 503);
});
test('rejects unknown menus and cache-busting query parameters', async () => {
  global.fetch = () => {throw new Error('Must not call Google');};
  for (const path of ['/api/youtube?recipe=unknown', '/api/youtube?recipe=tofu&x=random', '/api/youtube?recipe=tofu&recipe=rice']) {
    const res = response(); await fresh('youtube')(request(path), res); assert.equal(res.statusCode, 400);
  }
});
test('canonicalizes differently encoded valid queries before lookup', async () => {
  const res = response(); await fresh('youtube')(request('/api/youtube?recipe=%74ofu'), res);
  assert.equal(res.statusCode, 308);
  assert.equal(res.headers.location, '/api/youtube?recipe=tofu');
});
test('rejects cross-site and foreign-origin calls', async () => {
  for (const headers of [{host: 'app.example.com', origin: 'https://evil.example'}, {host: 'app.example.com', 'sec-fetch-site': 'cross-site'}]) {
    const res = response(); await fresh('youtube')(request(undefined, {headers}), res); assert.equal(res.statusCode, 403);
  }
});
test('rejects unsupported methods', async () => {
  const res = response(); await fresh('youtube')(request(undefined, {method: 'POST'}), res); assert.equal(res.statusCode, 405);
});
test('returns three sorted videos with fixed URLs and shared cache headers', async () => {
  let calls = 0;
  global.fetch = async (url, init) => {
    calls++;
    assert.equal(init.headers['X-Goog-Api-Key'], 'server-test-only-value');
    assert.ok(!String(url).includes('server-test-only-value'));
    return result(String(url).includes('/search?') ? {items: ids.slice(0, 3).map(id => ({id: {videoId: id}}))} : details());
  };
  const handler = fresh('youtube'), res = response(); await handler(request(), res);
  const data = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(data.videos.map(video => video.views), [102, 101, 100]);
  assert.equal(data.videos[0].title, '고소한 두부 & 계란 볶음');
  assert.ok(data.videos.every(video => video.url.startsWith('https://www.youtube.com/watch?v=')));
  assert.ok(!res.body.includes('server-test-only-value'));
  assert.ok(res.headers['cache-control'].includes('s-maxage=21600'));
  const cached = response(); await handler(request(), cached);
  assert.equal(calls, 2);
  assert.equal(JSON.parse(cached.body).cached, true);
});
test('coalesces simultaneous requests for the same menu', async () => {
  let calls = 0;
  global.fetch = async url => {calls++; return result(String(url).includes('/search?') ? {items: ids.slice(0, 3).map(id => ({id: {videoId: id}}))} : details());};
  const handler = fresh('youtube');
  await Promise.all([handler(request(), response()), handler(request(), response())]);
  assert.equal(calls, 2);
});
test('uses relevance fallback only when fewer than three titles match', async () => {
  const replies = [
    {items: [{id: {videoId: ids[0]}}]}, details([0]),
    {items: ids.slice(0, 3).map(id => ({id: {videoId: id}}))}, details(),
  ];
  const urls = [];
  global.fetch = async url => {urls.push(String(url)); return result(replies.shift());};
  const res = response(); await fresh('youtube')(request(), res);
  assert.equal(JSON.parse(res.body).videos.length, 3);
  assert.equal(urls.length, 4);
  assert.ok(urls[2].includes('order=relevance'));
});
test('filters unrelated, live and private results without inventing replacements', async () => {
  const variants = details([0, 1, 2, 3, 4]);
  variants.items[1].snippet.title = '양배추 참치덮밥';
  variants.items[2].snippet.liveBroadcastContent = 'live';
  variants.items[3].status.privacyStatus = 'private';
  variants.items[4].snippet.title = '두부 계란찜';
  global.fetch = async url => result(String(url).includes('/search?') ? {items: ids.map(id => ({id: {videoId: id}}))} : variants);
  const res = response(); await fresh('youtube')(request(), res);
  assert.equal(JSON.parse(res.body).videos.length, 1);
});
test('upstream errors and quota failures never reveal raw data or keys', async () => {
  global.fetch = async () => ({ok: false, status: 403, json: async () => ({error: {message: 'server-test-only-value', errors: [{reason: 'quotaExceeded'}]}})});
  const res = response(); await fresh('youtube')(request(), res);
  assert.equal(res.statusCode, 429);
  assert.ok(!res.body.includes('server-test-only-value'));
});
test('network failures never reveal private upstream errors', async () => {
  global.fetch = async () => {throw new Error('server-test-only-value');};
  const res = response(); await fresh('youtube')(request(), res);
  assert.equal(res.statusCode, 502);
  assert.ok(!res.body.includes('server-test-only-value'));
});
