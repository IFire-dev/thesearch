const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'logs', 'searches.jsonl');

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// One JSON object per line (JSON Lines), appended as searches come in.
// Avoids the read-modify-write race a single JSON array would have if
// two searches land close together.
function logSearch(ip, query) {
  ensureLogDir();
  const entry = { timestamp: new Date().toISOString(), ip, query };
  fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n', (err) => {
    if (err) console.error('Failed to write search log:', err);
  });
}

// Returns all logged searches, most recent first.
function readSearches() {
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
function readSearchesGroupedByIp() {
  const logs = readSearches(); // already newest-first

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
