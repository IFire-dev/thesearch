const fs = require('fs');
const path = require('path');
const { redisCommand, isConfigured } = require('./upstash');

// Local-file fallback path — used only when Upstash isn't configured
// (e.g. running locally via Electron without setting up an account).
const STATE_FILE = path.join(__dirname, 'logs', 'site-state.json');
const REDIS_KEY = 'site-state';

function ensureDir() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStateFromFile() {
  ensureDir();
  if (!fs.existsSync(STATE_FILE)) return { maintenanceMode: false, ips: {} };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { maintenanceMode: false, ips: {} };
  }
}

function writeStateToFile(state) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Reads the full state object, from Upstash if configured (falls
// back to the local file on any Upstash error), otherwise the file
// directly.
async function readState() {
  if (isConfigured()) {
    try {
      const raw = await redisCommand('GET', REDIS_KEY);
      return raw ? JSON.parse(raw) : { maintenanceMode: false, ips: {} };
    } catch (err) {
      console.error('Failed to read site state from Upstash:', err.message);
    }
  }
  return readStateFromFile();
}

async function writeState(state) {
  if (isConfigured()) {
    try {
      await redisCommand('SET', REDIS_KEY, JSON.stringify(state));
      return;
    } catch (err) {
      console.error('Failed to write site state to Upstash:', err.message);
      // fall through to the local file as a backup
    }
  }
  writeStateToFile(state);
}

async function isMaintenanceMode() {
  return (await readState()).maintenanceMode;
}

async function setMaintenanceMode(on) {
  const state = await readState();
  state.maintenanceMode = !!on;
  await writeState(state);
  return state.maintenanceMode;
}

// Records a visit from this IP. First visit registers it as
// 'pending' automatically — that's the "IP logging" part: you don't
// have to do anything for someone to show up in the approval list,
// they just need to try visiting the site once.
async function recordVisit(ip) {
  const state = await readState();
  const now = new Date().toISOString();
  if (!state.ips[ip]) {
    state.ips[ip] = { status: 'pending', firstSeen: now, lastSeen: now };
  } else {
    state.ips[ip].lastSeen = now;
  }
  await writeState(state);
  return state.ips[ip].status;
}

async function isApproved(ip) {
  return (await readState()).ips[ip]?.status === 'approved';
}

async function approveIp(ip) {
  const state = await readState();
  const now = new Date().toISOString();
  if (!state.ips[ip]) {
    state.ips[ip] = { status: 'approved', firstSeen: now, lastSeen: now };
  } else {
    state.ips[ip].status = 'approved';
  }
  await writeState(state);
}

async function revokeIp(ip) {
  const state = await readState();
  if (state.ips[ip]) {
    state.ips[ip].status = 'pending';
    await writeState(state);
  }
}

async function listIps() {
  const state = await readState();
  return Object.entries(state.ips)
    .map(([ip, info]) => ({ ip, ...info }))
    .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
}

module.exports = {
  isMaintenanceMode,
  setMaintenanceMode,
  recordVisit,
  isApproved,
  approveIp,
  revokeIp,
  listIps
};
