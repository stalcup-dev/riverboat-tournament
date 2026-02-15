# SOT Deployment (Self-host Path)

## Goal
Run the server on generic PaaS/VPS with one public HTTPS/WSS endpoint and a static client build.

## Render Free notes
- Free tier may spin down after ~15 minutes of no inbound HTTP requests.
- Open WebSocket sessions are not sufficient wake traffic by themselves.
- Do not use `/robots.txt` to wake the service.
- Client uses `GET /healthz` wake + periodic keepalive (10-12 min) during Lobby/Match.

## Server env vars
- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=2567` (or platform-provided port)
- `CORS_ORIGIN=https://your-client-domain`
- `PUBLIC_WS_URL=https://your-server-domain`
- `INVITE_KEY=<friends-only-shared-secret>`
- `MATCHMAKER_SECRET=<optional-hardening-secret>`

## Local preflight
```powershell
cd C:\Users\halol\Desktop\game\server
npm ci
npm test
npm run build
```

## Docker deploy baseline
```powershell
cd C:\Users\halol\Desktop\game
docker build -t riverboat-server:latest .
docker run --rm -p 2567:2567 `
  -e NODE_ENV=production `
  -e HOST=0.0.0.0 `
  -e PORT=2567 `
  -e CORS_ORIGIN=https://your-client-domain `
  -e PUBLIC_WS_URL=https://your-server-domain `
  -e INVITE_KEY=friend-key `
  -e MATCHMAKER_SECRET=replace-me `
  riverboat-server:latest
```

## Health and API smoke
```powershell
curl https://<server-domain>/healthz
curl -X POST https://<server-domain>/match/create `
  -H "Content-Type: application/json" `
  -H "X-Invite-Key: <invite-key>" `
  -H "X-Matchmaker-Secret: <secret-if-enforced>"
curl -X POST https://<server-domain>/match/join `
  -H "Content-Type: application/json" `
  -H "X-Invite-Key: <invite-key>" `
  -d "{\"code\":\"ABCDE\"}"
```

Expected:
- `/healthz` -> `200` with `{ "ok": true, "version": "0.1.0" }`
- `/match/create` -> `{ code, roomId }`
- `/match/join` -> `{ roomId }` or typed error (`CODE_INVALID`, `CODE_EXPIRED`, `ROOM_FULL`)

## Client build-time server URL
`VITE_SERVER_URL` is injected at build time (not runtime).
- For Render deployments, use explicit `wss://<service>.onrender.com`.

Optional client-side headers for friends-only gates:
- `VITE_INVITE_KEY`
- `VITE_MATCHMAKER_SECRET` (only if server enforces create secret)

Example:
```powershell
cd C:\Users\halol\Desktop\game\client
$env:VITE_SERVER_URL="wss://your-server-domain"
$env:VITE_INVITE_KEY="friend-key"
npm ci
npm run build
```

## Platform notes
- Use `docs/DEPLOYMENT_README.md` for provider-specific command walkthroughs (Arena, Netlify, Cloudflare Pages).
- For production security baseline, also follow `docs/SOT_LAUNCH_SECURITY.md`.
