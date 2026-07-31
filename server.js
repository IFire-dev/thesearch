
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const { askClaude, askPerplexity } = require('./ai');
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

        webApp.get('/search', async (req, res) => {
            const q = req.query.q;
            if (!q) return res.json([]);

            logSearch(req.ip, q);

            try {
                const [webResult, claudeResult, perplexityResult] = await Promise.allSettled([
                    searchDuckDuckGo(q),
                    askClaude(q),
                    askPerplexity(q)
                ]);

                res.json({
                    web: webResult.status === 'fulfilled' ? webResult.value : [],
                    claude: claudeResult.status === 'fulfilled' ? claudeResult.value : { error: claudeResult.reason?.message },
                    perplexity: perplexityResult.status === 'fulfilled' ? perplexityResult.value : { error: perplexityResult.reason?.message }
                });
            } catch (err) {
                console.error('Search failed:', err);
                res.status(500).json({ error: 'Search failed' });
            }
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

async function searchDuckDuckGo(query) {
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;

    let response, html;
    try {
        response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        html = await response.text();
    } catch (err) {
        console.error('DDG fetch threw before getting a response:', err.message);
        throw err;
    }

    console.log(`DDG responded ${response.status}, ${html.length} chars`);
    if (html.length < 2000) {
        console.log('Full response (short, likely a block page):', html);
    }

    const $ = cheerio.load(html);
    const results = [];

    $('a.result-link').each((_, el) => {
        const title = $(el).text().trim();
        const link = $(el).attr('href');

        const row = $(el).closest('tr');
        const snippetRow = row.next('tr').next('tr');
        const snippet = snippetRow.text().trim();

        if (title && link) {
            results.push({ title, url: link, snippet });
        }
    });

    return results;
}

module.exports = { startServer };

if (require.main === module) {
    startServer();
}