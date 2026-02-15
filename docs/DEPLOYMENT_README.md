# Deployment README (S6-DEPLOY-001 -> S6-SMOKE-001)

This repo deploys as:
- Server: Colyseus Node server (Arena/Colyseus Cloud preferred)
- Client: static Vite build (Netlify or Cloudflare Pages)

## 1) Server Runtime Contract

Server env vars (production):
- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=2567` (or platform-provided)
- `CORS_ORIGIN=https://<your-client-domain>`
- `PUBLIC_WS_URL=https://<your-server-domain>`
- `MATCHMAKER_SECRET=<long-random-secret>`
- `INVITE_KEY=<friends-only-shared-secret>`

Implemented behavior:
- Server binds using `HOST` + `PORT` (`0.0.0.0` + `PORT` by default)
- Health check: `GET /healthz` -> `{"ok":true,"version":"0.1.0"}`

## 2) Docker (Server)

Dockerfile is at repo root (`Dockerfile`) and builds only server + shared `data/`.

### Build image
```powershell
cd C:\Users\halol\Desktop\game
docker build -t riverboat-server:latest .
```

### Run container locally
```powershell
docker run --rm -p 2567:2567 `
  -e NODE_ENV=production `
  -e HOST=0.0.0.0 `
  -e PORT=2567 `
  -e CORS_ORIGIN=http://localhost:5173 `
  -e PUBLIC_WS_URL=http://localhost:2567 `
  -e MATCHMAKER_SECRET=replace-me `
  -e INVITE_KEY=friend-key `
  riverboat-server:latest
```

### Verify
```powershell
curl http://localhost:2567/healthz
```

## 3) Arena Cloud First (Colyseus Cloud)

Official deploy command:
- `npx @colyseus/cloud deploy`

### First deploy
```powershell
cd C:\Users\halol\Desktop\game\server
npm ci
npm run build
npx @colyseus/cloud deploy
```

Expected:
- Browser opens for app selection
- `.colyseus-cloud.json` is generated for subsequent deploys

Set production env vars in cloud dashboard/application settings:
- `NODE_ENV`, `HOST`, `PORT`, `CORS_ORIGIN`, `PUBLIC_WS_URL`, `INVITE_KEY`, `MATCHMAKER_SECRET`

Then redeploy:
```powershell
cd C:\Users\halol\Desktop\game\server
npx @colyseus/cloud deploy
```

> If your Arena/Colyseus Cloud project requires template-specific bootstrapping (`@colyseus/tools`, `ecosystem.config.js`), configure that in cloud build settings or migrate server bootstrapping before deploy.

## 3b) Render Free Constraints (Important)

- Render Free spins down after roughly 15 minutes without inbound HTTP traffic.
- Existing open WebSocket sessions do not count as fresh inbound requests for wake.
- Do not rely on `/robots.txt` as a wake strategy.
- Use `wss://<service>.onrender.com` for `VITE_SERVER_URL` in production client builds.
- Client mitigation implemented:
  - Wake button calls `GET /healthz` before connect.
  - While connected in Lobby/Match, client sends a lightweight `/healthz` keepalive every 10-12 minutes.
  - WebSocket reconnect uses exponential backoff after disconnects.

## 4) Client Deploy (Netlify)

This repo includes `client/netlify.toml` and SPA fallback (`client/public/_redirects`).

Important: `VITE_SERVER_URL` is **build-time**. You must set it before/deuring build.
For Render: set `VITE_SERVER_URL` to `wss://<service>.onrender.com` (not `https://...`).
If friends-only invite gate is enabled, also set `VITE_INVITE_KEY`.

### Netlify CLI deploy
```powershell
npm i -g netlify-cli
cd C:\Users\halol\Desktop\game\client
netlify login
netlify init
netlify env:set VITE_SERVER_URL wss://<your-server-domain> --scope builds --context production
netlify env:set VITE_INVITE_KEY friend-key --scope builds --context production
netlify deploy --build --prod
```

### Local production-like build with injected URL
```powershell
cd C:\Users\halol\Desktop\game\client
$env:VITE_SERVER_URL="wss://<your-server-domain>"
$env:VITE_INVITE_KEY="friend-key"
npm ci
npm run build
```

## 5) Client Deploy (Cloudflare Pages)

This repo includes `client/wrangler.toml` with `pages_build_output_dir = "dist"`.

Important: `VITE_SERVER_URL` is **build-time**. Set it in Pages project variables (production), or inject before local build.

### Cloudflare Pages via Wrangler
```powershell
npm i -g wrangler
wrangler login
cd C:\Users\halol\Desktop\game\client
npx wrangler pages project create riverboat-client
```

Set `VITE_SERVER_URL` in Cloudflare dashboard:
- Workers & Pages -> your project -> Settings -> Environment variables
Set `VITE_INVITE_KEY` too when invite gate is enabled.

Deploy:
```powershell
cd C:\Users\halol\Desktop\game\client
npm ci
$env:VITE_SERVER_URL="wss://<your-server-domain>"
$env:VITE_INVITE_KEY="friend-key"
npm run build
npx wrangler pages deploy dist --project-name riverboat-client
```

## 6) S6-SMOKE-001 (Post-Deploy Smoke)

### Server smoke
```powershell
curl https://<your-server-domain>/healthz
```
Expected:
- HTTP 200
- JSON includes `"ok": true` and `"version": "0.1.0"`

### Matchmaker smoke
```powershell
curl -X POST https://<your-server-domain>/match/create `
  -H "Content-Type: application/json" `
  -H "X-Invite-Key: <invite-key>" `
  -H "X-Matchmaker-Secret: <your-secret-if-enforced>"
```
Expected:
- `{ "code": "...", "roomId": "..." }`

Join check:
```powershell
curl -X POST https://<your-server-domain>/match/join `
  -H "Content-Type: application/json" `
  -H "X-Invite-Key: <invite-key>" `
  -d "{\"code\":\"ABCDE\"}"
```
Expected:
- valid code -> `{ "roomId": "..." }`
- invalid code -> `{ "error": { "code": "CODE_INVALID" } }`

### End-to-end smoke
1. Open deployed client in 2 browser tabs.
2. Create match in tab A.
3. Join by code in tab B.
4. Host start match.
5. Move both players.
6. Gather wood -> craft canoe -> fish once.
7. Confirm no console errors and expected HUD/toast flow.

## 7) VITE_SERVER_URL Rule (Build-time)

`VITE_SERVER_URL` is read by Vite during build (not dynamic at runtime for static hosting).

If you change server URL:
1. Update env var on Netlify/Cloudflare Pages
2. Trigger a new build/deploy

Use `client/.env.production.example` as template for local production builds.

## 8) Evidence Pack

Use `docs/DEPLOYMENT_LOG.md` to record:
- Render service URL
- env var names configured (no secrets)
- smoke test outcomes
- abuse smoke summary
