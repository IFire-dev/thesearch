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

**Important limitation on Render's free tier:** both of these are
stored in `logs/site-state.json` on local disk, which is wiped on
every restart/redeploy — same as the search log. So approvals and the
maintenance toggle won't survive Render's free-tier restarts reliably;
expect to occasionally re-approve people. Render's paid Starter tier
adds a persistent disk if you want this to actually stick.

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
   Render sets that itself.
5. Set the health check path to `/health` under Settings → Health Checks.
6. Render gives you an HTTPS URL like `your-app.onrender.com` — no
   ngrok, no port 80 to worry about, no PC needed.

Two real limitations of Render's free tier worth knowing before you
commit to it (current as of mid-2026):
- **Cold starts**: free web services spin down after 15 minutes with
  no traffic and take roughly 30–60 seconds to wake back up on the
  next request.
- **No persistent disk on the free tier**: everything in `logs/`
  (search log, maintenance mode, IP approvals) is wiped on every
  restart/redeploy — treat it all as rolling/temporary, not permanent
  storage. Render's paid Starter tier ($7/mo) adds persistent disks
  if you want it to actually accumulate.

## How it works

- `main.js` — Electron entry point, opens the window.
- `server.js` — Express server. Routes: `/search` (Nemotron 3 Ultra
  with retry + Nano fallback), `/preview` (link preview cards),
  `/health` (Render health check), `/admin/*` (auth, dashboard,
  settings). Also applies the maintenance-mode and IP-allowlist gates
  to everything except `/admin` and `/health`.
- `ai.js` — the NVIDIA API client: retry logic, fallback, and the
  timing/attempt telemetry the UI displays.
- `linkPreview.js` — fetches OpenGraph/title/description for URLs
  mentioned in an answer, with guards against being used to probe
  internal/private addresses (relevant since `/preview` is public).
- `siteState.js` — maintenance-mode flag and the IP allowlist,
  persisted to `logs/site-state.json`.
- `statusPages.js` — the two visitor-facing messages (maintenance /
  not-allowed), self-contained HTML so they don't depend on gated
  static assets.
- `logger.js` — writes/reads the search log (`logs/searches.jsonl`).
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
