'use strict';

// Server-only: credentials are never returned or injected into HTML/JavaScript.
module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end(JSON.stringify({error: 'GET 요청만 지원합니다.'}));
  }
  res.statusCode = 200;
  return res.end(JSON.stringify({
    runtime: 'vercel-javascript',
    youtubeConfigured: Boolean((process.env.YOUTUBE_API_KEY || '').trim()),
    visionConfigured: false,
  }));
};
