require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { askNvidia, askPerplexity } = require('./ai');
const { logSearch, readSearchesGroupedByIp } = require('./logger');
const { checkCredentials, requireAdmin } = require('./auth');

// PaaS platforms (Render, Railway, etc.) assign a port via the PORT
// env var and route their own domain/HTTPS to it — you don't pick 80
// yourself there. Locally (or on your own VPS) PORT won't be set, so
// this still defaults to 80 with the 8080 fallback below.
const PREFERRED_PORT = process.env.PORT || 80;
const FALLBACK_PORT = 8080;

function startServer() {
  return new Promise((resolve) => {
    const webApp = express();

    // Needed so req.ip reflects the real visitor's address (from the
    // X-Forwarded-For header) instead of ngrok's, Render's, or a
    // reverse proxy's own IP. Safe here because you control what's in
    // front of this server — don't set this to true behind a proxy
    // you don't trust, since the header can otherwise be spoofed.
    webApp.set('trust proxy', true);

    webApp.use(express.urlencoded({ extended: true })); // for the login form POST
    webApp.use(session({
      secret: process.env.SESSION_SECRET || 'change-me-in-.env',
      resave: false,
      saveUninitialized: false,
      // 'auto' marks the cookie secure (HTTPS-only) when the
      // connection is HTTPS, using the trust proxy setting above to
      // read that off Render/Railway's forwarded headers.
      cookie: { maxAge: 24 * 60 * 60 * 1000, secure: 'auto' }
    }));

    webApp.use(express.static(path.join(__dirname, 'public')));

    // --- Admin routes ---

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

    // --- Search route ---

    // Frontend calls GET /search?q=... and gets back { nvidia, perplexity }.
    // (DuckDuckGo scraping was dropped: cloud host IPs like Render's get
    // network-level blocked by DDG, so it never worked reliably there.)
    webApp.get('/search', async (req, res) => {
      const q = req.query.q;
      if (!q) return res.json({});

      logSearch(req.ip, q);

      try {
        const [nvidiaResult, perplexityResult] = await Promise.allSettled([
          askNvidia(q),
          askPerplexity(q)
        ]);

        res.json({
          nvidia: nvidiaResult.status === 'fulfilled' ? nvidiaResult.value : { error: nvidiaResult.reason?.message },
          perplexity: perplexityResult.status === 'fulfilled' ? perplexityResult.value : { error: perplexityResult.reason?.message }
        });
      } catch (err) {
        console.error('Search failed:', err);
        res.status(500).json({ error: 'Search failed' });
      }
    });

    // Port 80 needs root/admin privileges on most systems. If binding
    // fails (permissions, or something else already on :80), fall
    // back to :8080 instead of crashing.
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

// When Electron's main.js requires this file, it calls startServer()
// itself after the app is ready. When this file is run directly
// (`node server.js`, which is what Render/Railway will do — there's
// no Electron window on a server), start immediately instead.
if (require.main === module) {
  startServer();
}
