const fs = require('fs');
const path = require('path');

// Same folder as the search log — see README for why this doesn't
// survive Render's free-tier restarts.
const STATE_FILE = path.join(__dirname, 'logs', 'site-state.json');

function ensureDir() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readState() {
  ensureDir();
  if (!fs.existsSync(STATE_FILE)) {
    return { maintenanceMode: false, ips: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { maintenanceMode: false, ips: {} };
  }
}

function writeState(state) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function isMaintenanceMode() {
  return readState().maintenanceMode;
}

function setMaintenanceMode(on) {
  const state = readState();
  state.maintenanceMode = !!on;
  writeState(state);
  return state.maintenanceMode;
}

// Records a visit from this IP. First visit registers it as
// 'pending' automatically — that's the "IP logging" part: you don't
// have to do anything for someone to show up in the approval list,
// they just need to try visiting the site once.
function recordVisit(ip) {
  const state = readState();
  const now = new Date().toISOString();
  if (!state.ips[ip]) {
    state.ips[ip] = { status: 'pending', firstSeen: now, lastSeen: now };
  } else {
    state.ips[ip].lastSeen = now;
  }
  writeState(state);
  return state.ips[ip].status;
}

function isApproved(ip) {
  const state = readState();
  return state.ips[ip]?.status === 'approved';
}

function approveIp(ip) {
  const state = readState();
  const now = new Date().toISOString();
  if (!state.ips[ip]) {
    state.ips[ip] = { status: 'approved', firstSeen: now, lastSeen: now };
  } else {
    state.ips[ip].status = 'approved';
  }
  writeState(state);
}

function revokeIp(ip) {
  const state = readState();
  if (state.ips[ip]) {
    state.ips[ip].status = 'pending';
    writeState(state);
  }
}

function listIps() {
  const state = readState();
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
