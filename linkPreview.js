const fetch = require('node-fetch');
const cheerio = require('cheerio');
const dns = require('dns').promises;
const net = require('net');

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 1_000_000; // don't download huge pages just for meta tags

// Private/loopback/link-local ranges — a preview URL resolving to any
// of these gets rejected. This endpoint fetches whatever URL it's
// given server-side, so without this check anyone could use it to
// probe your own internal network or cloud metadata endpoints
// (e.g. Render/AWS's 169.254.169.254) through your public site.
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true; // link-local + cloud metadata
    if (parts[0] === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (lower.startsWith('fe80')) return true; // link-local
    return false;
  }
  return true; // couldn't parse — treat as unsafe
}

async function isUrlSafe(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  try {
    const { address } = await dns.lookup(parsed.hostname);
    return !isPrivateAddress(address);
  } catch {
    return false; // DNS failure — reject rather than guess
  }
}

// Fetches a URL and pulls OpenGraph tags (falling back to <title>/
// <meta name="description">). Returns { title, description, image, url }
// with whatever fields it could find, or { error } if it couldn't be
// fetched at all.
async function fetchLinkPreview(url) {
  const safe = await isUrlSafe(url);
  if (!safe) {
    return { error: 'URL not allowed' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LocalSearchPreview/1.0)' }
    });

    if (!response.ok) {
      return { error: `Fetch returned ${response.status}` };
    }

    // Cap how much we read — meta tags are always near the top of
    // <head>, no need to download an entire large page.
    let html = '';
    for await (const chunk of response.body) {
      html += chunk.toString();
      if (html.length > MAX_BYTES) break;
    }

    const $ = cheerio.load(html);
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('title').first().text() ||
      url;
    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';
    const image = $('meta[property="og:image"]').attr('content') || null;

    return {
      url,
      title: title.trim().slice(0, 200),
      description: description.trim().slice(0, 300),
      image: image || null
    };
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'Timed out' : err.message };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { fetchLinkPreview };
