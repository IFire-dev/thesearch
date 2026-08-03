require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { askNvidiaPrimary } = require('./ai');
const { fetchLinkPreview } = require('./linkPreview');
const { logSearch, readSearchesGroupedByIp } = require('./logger');
const { checkCredentials, requireAdmin } = require('./auth');
const {
  isMaintenanceMode,
  setMaintenanceMode,
  recordVisit,
  isApproved,
  approveIp,
  revokeIp,
  listIps
} = require('./siteState');
const { maintenancePage, notAllowedPage } = require('./statusPages');

const PREFERRED_PORT = process.env.PORT || 80;
const FALLBACK_PORT = 8080;

// Paths that always work regardless of maintenance mode or the IP
// allowlist: admin routes (so you're never locked out of managing
// the site from an unapproved IP) and the health check (Render's
// load balancer hits this directly, unauthenticated — see README).
function isExemptPath(reqPath) {
  return reqPath.startsWith('/admin') || reqPath === '/health';
}

function startServer() {
  return new Promise((resolve) => {
    const webApp = express();

    webApp.set('trust proxy', true);

    webApp.use(express.urlencoded({ extended: true })); // admin login form
    webApp.use(express.json()); // admin settings API calls
    webApp.use(session({
      secret: process.env.SESSION_SECRET || 'change-me-in-.env',
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 24 * 60 * 60 * 1000, secure: 'auto' }
    }));

    // Render's health check: plain, fast, unauthenticated. Configure
    // this exact path ("/health") in Render's dashboard under your
    // service's Settings > Health Checks.
    webApp.get('/health', (req, res) => {
      res.status(200).send('ok');
    });

    // --- Gate 1: maintenance mode. Blocks everyone, including
    // already-approved IPs, except /admin/* and an already-logged-in
    // admin session (so /admin/settings can still load its own
    // /style.css etc. even before your IP is approved). ---
    webApp.use((req, res, next) => {
      if (isExemptPath(req.path) || req.session?.isAdmin) return next();
      if (isMaintenanceMode()) {
        return res.status(503).send(maintenancePage());
      }
      next();
    });

    // --- Gate 2: IP allowlist. First visit from a new IP auto-logs
    // it as pending; only 'approved' IPs get through. ---
    webApp.use((req, res, next) => {
      if (isExemptPath(req.path) || req.session?.isAdmin) return next();
      const status = recordVisit(req.ip);
      if (status !== 'approved') {
        return res.status(403).send(notAllowedPage());
      }
      next();
    });

    webApp.use(express.static(path.join(__dirname, 'public')));

    // --- Admin auth routes ---

    webApp.get('/admin/login', (req, res) => {
      const template = fs.readFileSync(path.join(__dirname, 'views', 'admin-login.html'), 'utf-8');
      const errorBlock = req.query.error ? '<p style="color:#d08f8f;">Invalid username or password.</p>' : '';
      res.send(template.replace('{{ERROR_BLOCK}}', errorBlock));
    });

    webApp.post('/admin/login', async (req, res) => {
      const { username, password } = req.body;
      const ok = await checkCredentials(username, password);
      if (!ok) return res.redirect('/admin/login?error=1');
      req.session.isAdmin = true;
      res.redirect('/admin');
    });

    webApp.get('/admin/logout', (req, res) => {
      req.session.destroy(() => res.redirect('/admin/login'));
    });

    // --- Admin dashboard (search log) ---

    webApp.get('/admin', requireAdmin, (req, res) => {
      res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html'));
    });

    webApp.get('/admin/api/searches', requireAdmin, (req, res) => {
      res.json(readSearchesGroupedByIp());
    });

    // --- Admin settings (maintenance mode + IP approvals) ---

    webApp.get('/admin/settings', requireAdmin, (req, res) => {
      res.sendFile(path.join(__dirname, 'views', 'admin-settings.html'));
    });

    webApp.get('/admin/api/settings', requireAdmin, (req, res) => {
      const ips = listIps();
      res.json({
        maintenanceMode: isMaintenanceMode(),
        pending: ips.filter((i) => i.status === 'pending'),
        approved: ips.filter((i) => i.status === 'approved')
      });
    });

    webApp.post('/admin/api/settings/maintenance', requireAdmin, (req, res) => {
      const enabled = setMaintenanceMode(!!req.body.enabled);
      res.json({ maintenanceMode: enabled });
    });

    webApp.post('/admin/api/settings/approve', requireAdmin, (req, res) => {
      if (!req.body.ip) return res.status(400).json({ error: 'missing ip' });
      approveIp(req.body.ip);
      res.json({ ok: true });
    });

    webApp.post('/admin/api/settings/revoke', requireAdmin, (req, res) => {
      if (!req.body.ip) return res.status(400).json({ error: 'missing ip' });
      revokeIp(req.body.ip);
      res.json({ ok: true });
    });

    // --- Search route ---

    webApp.get('/search', async (req, res) => {
      const q = req.query.q;
      if (!q) return res.json({});

      logSearch(req.ip, q);

      try {
        const result = await askNvidiaPrimary(q);
        res.json(result);
      } catch (err) {
        console.error('Search failed:', err);
        res.status(500).json({ error: 'Search failed' });
      }
    });

    // Frontend calls this once per URL it finds in the answer text,
    // to render a preview card (title/description/thumbnail).
    webApp.get('/preview', async (req, res) => {
      const url = req.query.url;
      if (!url) return res.status(400).json({ error: 'missing url' });
      const preview = await fetchLinkPreview(url);
      res.json(preview);
    });

    const server = webApp.listen(PREFERRED_PORT, () => {
      console.log(`Listening on port ${PREFERRED_PORT}`);
      resolve(PREFERRED_PORT);
    });

    server.on('error', (err) => {
      if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
        console.warn(`Port ${PREFERRED_PORT} unavailable (${err.code}), falling back to ${FALLBACK_PORT}`);
        webApp.listen(FALLBACK_PORT, () => {
          console.log(`Listening on port ${FALLBACK_PORT}`);
          resolve(FALLBACK_PORT);
        });
      } else {
        throw err;
      }
    });
  });
}

module.exports = { startServer };

if (require.main === module) {
  startServer();
}
