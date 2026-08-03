const fs = require('fs');
const path = require('path');
const { redisCommand, isConfigured } = require('./upstash');

const LOG_FILE = path.join(__dirname, 'logs', 'searches.jsonl');
const REDIS_KEY = 'searches';
const MAX_ENTRIES = 2000; // keeps well within Upstash's free storage cap

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Logs one search. Uses Upstash Redis if configured (survives Render
// restarts/redeploys) — otherwise falls back to the local file, same
// as before (fine for local/Electron use, but resets on Render).
async function logSearch(ip, query) {
  const entry = { timestamp: new Date().toISOString(), ip, query };

  if (isConfigured()) {
    try {
      await redisCommand('RPUSH', REDIS_KEY, JSON.stringify(entry));
      await redisCommand('LTRIM', REDIS_KEY, -MAX_ENTRIES, -1);
      return;
    } catch (err) {
      console.error('Failed to write search log to Upstash:', err.message);
      // fall through to the local file as a backup
    }
  }

  ensureLogDir();
  fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n', (err) => {
    if (err) console.error('Failed to write search log:', err);
  });
}

// Returns all logged searches, most recent first.
async function readSearches() {
  if (isConfigured()) {
    try {
      const raw = await redisCommand('LRANGE', REDIS_KEY, 0, -1);
      return (raw || [])
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .reverse();
    } catch (err) {
      console.error('Failed to read search log from Upstash:', err.message);
      // fall through to the local file
    }
  }

  ensureLogDir();
  if (!fs.existsSync(LOG_FILE)) return [];

  const lines = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean);
  return lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null; // skip a corrupted line rather than failing the whole read
      }
    })
    .filter(Boolean)
    .reverse();
}

// Groups logged searches by IP for the admin dashboard: most recent
// search first within each IP, most recently active IP first overall.
async function readSearchesGroupedByIp() {
  const logs = await readSearches(); // already newest-first

  const groups = new Map();
  for (const entry of logs) {
    if (!groups.has(entry.ip)) groups.set(entry.ip, []);
    groups.get(entry.ip).push(entry);
  }

  const result = [];
  for (const [ip, entries] of groups.entries()) {
    result.push({ ip, entries, lastSeen: entries[0].timestamp });
  }

  result.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
  return result;
}

module.exports = { logSearch, readSearches, readSearchesGroupedByIp };
