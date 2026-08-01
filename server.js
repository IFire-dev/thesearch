require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { askNvidiaPrimary } = require('./ai');
const { fetchLinkPreview } = require('./linkPreview');
const { logSearch, readSearchesGroupedByIp } = require('./logger');
const { checkCredentials, requireAdmin } = require('./auth');

const PREFERRED_PORT = process.env.PORT || 80;
const FALLBACK_PORT = 8080;

function startServer() {
  return new Promise((resolve) => {
    const webApp = express();

    webApp.set('trust proxy', true);

    webApp.use(express.urlencoded({ extended: true }));
    webApp.use(session({
      secret: process.env.SESSION_SECRET || 'change-me-in-.env',
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 24 * 60 * 60 * 1000, secure: 'auto' }
    }));

    webApp.use(express.static(path.join(__dirname, 'public')));

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

    webApp.get('/admin', requireAdmin, (req, res) => {
      res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html'));
    });

    webApp.get('/admin/api/searches', requireAdmin, (req, res) => {
      res.json(readSearchesGroupedByIp());
    });

    // Frontend calls GET /search?q=... and gets back a single result:
    // Nemotron 3 Ultra, retried up to 10 times, falling back to Nano
    // if Ultra's free capacity stays maxed out.
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
