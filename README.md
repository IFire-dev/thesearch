# Local Search Engine

A self-hosted search UI: an Electron app (or headless server, for
online deployment) that answers your query with NVIDIA's Nemotron 3
Ultra (free via build.nvidia.com), retrying automatically if the
shared free endpoint is busy and falling back to the smaller
Nemotron 3 Nano model if Ultra never comes through. URLs in the
answer get linkified and get a preview card (title/description/
thumbnail). (Earlier versions tried DuckDuckGo scraping and
Perplexity, but scraping gets network-blocked from cloud hosts like
Render, and Perplexity needs a paid key — this version is fully
free.)

## Setup

```
npm install
cp .env.example .env
```

Then fill in `.env` with your NVIDIA key (see below), and:

```
npm start
```

`npm start` launches Electron, which starts the Express server and
opens a window pointed at it.

## Getting an API key (free)

1. Go to https://build.nvidia.com and sign in or create a free account.
2. Open any model card (e.g. Nemotron 3 Ultra) and click **Get API Key**.
3. Copy the key (starts with `nvapi-`) — it's only shown once.
4. Paste it into `.env` as `NVIDIA_API_KEY`.

No payment method required — there's a recurring free request
allowance. If a key is missing, the response card just shows
"not available" instead of breaking the search.

## Port 80

Binding to port 80 requires elevated privileges on Linux/macOS
(and admin rights on Windows). Options:

- Run with elevated privileges: `sudo npm start` (Linux/macOS).
- Or just let it run — the server automatically falls back to port
  8080 if it can't bind to 80, and prints which port it used to the
  console (View > Toggle Developer Tools > Console in the Electron
  window, or your terminal).

## Persistent storage (search logs & settings survive restarts)

By default, search logs and site settings (maintenance mode, IP
approvals) live in local files under `logs/`, which Render's free
tier wipes on every restart/redeploy — so they'd keep resetting.

To fix that, this app can use **Upstash Redis** instead — a separate
free service (not part of Render) built for exactly this: genuinely
free forever, no 30-day expiry (unlike Render's own free Postgres/Key
Value, which I checked and neither actually solves this), works over
plain HTTPS.

**Setup (optional but recommended for Render):**
1. Go to https://upstash.com and create a free account.
2. Create a Redis database (any region close to your Render service's
   region is fine).
3. On the database's page, find the **REST API** section and copy
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. Paste both into `.env` (or Render's Environment tab).

If you skip this, everything still works exactly as before — it just
resets on Render restarts, same as it did previously. This is
transparent to the rest of the app: `logger.js` and `siteState.js`
automatically use Upstash when it's configured and fall back to local
files when it's not.

## Admin dashboard (search log by IP)

Every search is logged with the requester's IP, the query, and a
timestamp. View it at:

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

**Important — if you're exposing this publicly (ngrok, Render, etc.):**
Anyone who finds the URL can reach `/admin`, not just you. A few
things that matter as a result:
- Use a genuinely strong, unique password — this isn't a hardened
  auth system (single hardcoded admin account, no rate-limiting on
  login attempts, no 2FA).
- The search log will contain the real IP addresses of everyone who
  uses the search engine, not just you — worth keeping in mind before
  sharing the link.

## Health check

`/health` is a plain, unauthenticated endpoint that returns `200 ok` —
it's what Render (or any host with health checks) should ping to
confirm the service is up. It always works regardless of maintenance
mode or the IP allowlist below, since Render's load balancer hits it
directly with no login.

**Setup on Render:** your service's dashboard → **Settings** → **Health
Checks** → set the path to `/health`. Docs:
https://render.com/docs/health-checks

## Maintenance mode & IP allowlist ("who can use this site")

Both live under `/admin/settings` (linked from the admin dashboard).
`/admin` itself is always reachable regardless of either setting below
— you can never lock yourself out.

**Maintenance mode**: a manual switch. When on, *everyone* (including
already-approved IPs) sees "Sorry! The Search is being updated..."
instead of the site. Useful while you're actively redeploying.
Note: this can't automatically detect Render's cold-start/spin-down —
during that window the app isn't running yet, so nothing can serve a
message. This only covers when you deliberately flip it on.

**IP allowlist**: the site is closed by default. The first time
anyone visits from a new IP, it's automatically logged as "pending" —
no action needed for that part, they just have to try visiting once.
They see "You are not allowed on this site yet. Please ask the
developer for Access." until you approve their IP from
`/admin/settings`. Once approved, that IP gets straight in from then
on — until the state resets (see the Render limitation below).
You'll need to approve your own IP the first time too, via
`/admin/login` → `/admin/settings` (that path is never gated).

**Persistence:** these are stored via Upstash if you've set it up
(see "Persistent storage" above) — in which case approvals and the
maintenance toggle genuinely survive Render restarts. Without
Upstash, they're stored in `logs/site-state.json` on local disk and
will reset on Render's free-tier restarts, same as the search log.

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
4. Add `NVIDIA_API_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, and
   `SESSION_SECRET` under the service's **Environment** tab in the
   dashboard — not as a committed `.env` file. Don't set `PORT`;
   Render sets that itself. Also add `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` here if you want search logs and
   settings to survive restarts (see "Persistent storage" above) —
   otherwise skip them and it'll work the same as before.
5. Set the health check path to `/health` under Settings → Health Checks.
6. Render gives you an HTTPS URL like `your-app.onrender.com` — no
   ngrok, no port 80 to worry about, no PC needed.

Two real limitations of Render's free tier worth knowing before you
commit to it (current as of mid-2026):
- **Cold starts**: free web services spin down after 15 minutes with
  no traffic and take roughly 30–60 seconds to wake back up on the
  next request. Upstash doesn't change this — it only fixes data
  resetting, not the spin-down itself.
- **No persistent disk on the free tier**: without Upstash configured,
  everything in `logs/` (search log, maintenance mode, IP approvals)
  is wiped on every restart/redeploy. With Upstash configured, this
  no longer applies — that's the whole point of setting it up.

## How it works

- `main.js` — Electron entry point, opens the window.
- `server.js` — Express server. Routes: `/search` (Nemotron 3 Ultra
  with retry + Nano fallback), `/preview` (link preview cards),
  `/health` (Render health check), `/admin/*` (auth, dashboard,
  settings). Applies the maintenance-mode and IP-allowlist gates only
  to `/`, `/search`, and `/preview` — static assets and `/admin/*`
  skip them (see `GATED_PATHS`), which also means each check costs
  one Upstash call per pageview, not one per file loaded.
- `upstash.js` — thin REST client for Upstash Redis, used by
  `logger.js` and `siteState.js` when configured.
- `ai.js` — the NVIDIA API client: retry logic, fallback, and the
  timing/attempt telemetry the UI displays.
- `linkPreview.js` — fetches OpenGraph/title/description for URLs
  mentioned in an answer, with guards against being used to probe
  internal/private addresses (relevant since `/preview` is public).
- `siteState.js` — maintenance-mode flag and the IP allowlist. Uses
  Upstash if configured, otherwise `logs/site-state.json`.
- `statusPages.js` — the two visitor-facing messages (maintenance /
  not-allowed), self-contained HTML so they don't depend on gated
  static assets.
- `logger.js` — writes/reads the search log. Uses Upstash if
  configured, otherwise `logs/searches.jsonl`.
- `auth.js` — admin login check and route guard.
- `views/` — admin login, dashboard, and settings pages (not served
  as static files, so they're only reachable through the
  authenticated routes).
- `scripts/generate-admin-hash.js` — CLI helper to hash your admin password.
- `public/` — the frontend (plain HTML/CSS/JS, no framework). The
  response card's border/dot color reflects what actually happened
  (answered first try / answered after retrying / fell back to Nano),
  driven by real data from the server, not decoration.

## Limitations

- One model family, one provider. No live web search — Nemotron 3
  answers from its training data, not real-time results, so any URLs
  it mentions (and their preview cards) could be stale or occasionally
  made up. Re-adding actual web search would mean a paid search API
  (Brave Search, Bing) or self-hosting something like SearxNG.
- Nemotron 3 Ultra's free shared capacity is limited (it's a 550B
  model on NVIDIA's demo endpoint), so expect the retry path — and
  occasional Nano fallback — to kick in during busy periods.
- IP-based allowlisting is inherently approximate: dynamic IPs, mobile
  networks, and VPNs mean the same person can look like a different
  visitor over time, and get asked to be re-approved.
