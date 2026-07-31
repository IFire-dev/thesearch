# Local Search Engine

A minimal self-hosted meta-search engine: an Electron app that runs
a local Express server and scrapes DuckDuckGo Lite's HTML results.

## Setup

```
npm install
cp .env.example .env
```

Then fill in `.env` with your API keys (see below), and:

```
npm start
```

`npm start` launches Electron, which starts the Express server and
opens a window pointed at it.

## Getting API keys

Both Claude and Perplexity now show a short AI-generated summary
above the web results — Claude answers from its own knowledge,
Perplexity does its own live web search and returns citations.
Both are optional: if a key is missing, that panel just shows
"Not available" instead of breaking the search.

**Claude (Anthropic):**
1. Go to https://console.anthropic.com and sign in or create an account.
2. Add a payment method / credits under Billing.
3. Go to Settings > API Keys, create a new key.
4. Paste it into `.env` as `ANTHROPIC_API_KEY`.

**Perplexity:**
1. Go to https://perplexity.ai and create an account.
2. Open the API section of your account settings, add a payment method
   and purchase credits — there's no free tier, and no key is issued
   until a payment method is on file.
3. Generate a key in the API Keys tab.
4. Paste it into `.env` as `PERPLEXITY_API_KEY`.

Both APIs are pay-as-you-go (roughly $1–3 per million tokens on the
cheaper models) — a handful of test searches costs a fraction of a
cent, but keep an eye on usage if you leave this running.

## Port 80

Binding to port 80 requires elevated privileges on Linux/macOS
(and admin rights on Windows). Options:

- Run with elevated privileges: `sudo npm start` (Linux/macOS).
- Or just let it run — the server automatically falls back to port
  8080 if it can't bind to 80, and prints which port it used to the
  console (View > Toggle Developer Tools > Console in the Electron
  window, or your terminal).

## Admin dashboard (search log by IP)

Every search is logged to `logs/searches.jsonl` (created automatically)
with the requester's IP, the query, and a timestamp. View it at:

```
http://localhost/admin
```

**Setup:**
1. Pick a username and a strong password.
2. Generate the password hash: `node scripts/generate-admin-hash.js yourpassword`
3. Put the output in `.env` as `ADMIN_PASSWORD_HASH`, and your chosen
   username as `ADMIN_USERNAME`.
4. Set `SESSION_SECRET` to any random string (e.g. output of
   `openssl rand -hex 32`) — this signs the login session cookie.
5. Restart the server, log in at `/admin/login`.

**Important — you mentioned using ngrok:**
Once ngrok is pointed at this server, `/admin` is reachable by
anyone who finds or guesses the ngrok URL, not just you. A few things
that matter as a result:
- Use a genuinely strong, unique password — this isn't a hardened
  auth system (single hardcoded admin account, no rate-limiting on
  login attempts, no 2FA).
- The search log will contain the real IP addresses of everyone who
  uses the search engine through the ngrok URL, not just you. If
  anyone besides you might use that link, that's personal data about
  them you're collecting — worth keeping that in mind for who you
  share the URL with.
- Consider layering ngrok's own access control on top (e.g. an ngrok
  edge with OAuth or IP restrictions, on paid plans) rather than
  relying solely on this app's login.

## URL shortcut

The server is a normal web server, so you can trigger a search
straight from the URL in any browser tab (not just the Electron
window) instead of typing into the box:

```
http://localhost/?search=your+query
```

## Deploying to Render (no PC required)

Electron itself can't run on a server — `npm run web` runs just the
Express server headlessly (no window), which is what you'll deploy.

1. Push this folder to a GitHub repo (`.gitignore` already excludes
   `node_modules`, `.env`, and `logs/` — never commit `.env`).
2. On https://render.com, create a **Web Service**, connect the repo.
3. Build command: `npm install`. Start command: `npm run web`.
4. Add your env vars (`ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`,
   `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`) under
   the service's **Environment** tab in the dashboard — not as a
   committed `.env` file. Don't set `PORT`; Render sets that itself.
5. Render gives you an HTTPS URL like `your-app.onrender.com` — no
   ngrok, no port 80 to worry about, no PC needed.

Two real limitations of Render's free tier worth knowing before you
commit to it (current as of mid-2026):
- **Cold starts**: free web services spin down after 15 minutes with
  no traffic and take roughly 30–60 seconds to wake back up on the
  next request. Fine for personal use, noticeable if you send someone
  a link and they hit that spin-up delay.
- **No persistent disk on the free tier**: `logs/searches.jsonl`
  lives on the container's local disk, which is wiped on every
  restart/redeploy (including the spin-down/wake cycle above) —
  so your search log won't reliably accumulate over time. Render's
  paid Starter tier ($7/mo) adds persistent disks if you want the
  log to actually persist; otherwise treat it as a rolling log that
  resets periodically.

## How it works

- `main.js` — Electron entry point, opens the window.
- `server.js` — Express server. `/search?q=...` runs the DuckDuckGo
  scrape and both AI calls in parallel and returns them together as
  `{ web, claude, perplexity }`. Also logs each search and hosts the
  admin routes.
- `ai.js` — Claude and Perplexity API clients.
- `logger.js` — writes/reads the search log (`logs/searches.jsonl`).
- `auth.js` — admin login check and route guard.
- `views/` — admin login + dashboard pages (not served as static files,
  so they're only reachable through the authenticated routes).
- `scripts/generate-admin-hash.js` — CLI helper to hash your admin password.
- `public/` — the frontend (plain HTML/CSS/JS, no framework).

## Limitations

- Only one backend (DuckDuckGo Lite) is wired up. It's scraped HTML,
  not an official API — there's no key, no rate-limit handling, and
  DuckDuckGo could change their markup at any time, which would break
  the `cheerio` selectors in `server.js`.
- No caching, pagination, images, or other engines. This is a
  starting point, not a SearxNG replacement — SearxNG (150+ engines,
  maintained, more robust) is the better option if you just want a
  working meta-search engine rather than a project to build on.
