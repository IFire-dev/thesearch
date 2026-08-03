const fetch = require('node-fetch');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function isConfigured() {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

// Runs one Redis command via Upstash's REST API, e.g.
// redisCommand('GET', 'site-state') or redisCommand('RPUSH', 'searches', json).
// Each argument becomes one path segment — Upstash's REST format is
// <url>/<command>/<arg1>/<arg2>/... with the token as a bearer header.
async function redisCommand(...args) {
  if (!isConfigured()) {
    throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set in .env');
  }

  const url = `${UPSTASH_URL}/${args.map(encodeURIComponent).join('/')}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

module.exports = { redisCommand, isConfigured };
