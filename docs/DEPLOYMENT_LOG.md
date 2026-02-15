# Deployment Log (Evidence Pack)

## Deployment target
- Platform: Render Free
- Service URL: `https://<service>.onrender.com`
- WS URL: `wss://<service>.onrender.com`

## Env vars configured (names only)
- `NODE_ENV`
- `PORT`
- `CORS_ORIGIN`
- `INVITE_KEY`
- `MATCHMAKER_SECRET` (optional)
- `PUBLIC_WS_URL` (optional)

## Render Free constraints acknowledged
- [ ] 15-minute idle spin-down considered
- [ ] WebSockets do not count as wake traffic
- [ ] `/robots.txt` is not used for waking
- [ ] Client wake button + `/healthz` keepalive enabled

## Smoke test results
- [ ] `GET /healthz` returns 200 + `{ ok: true, version: "0.1.0" }`
- [ ] Create match works with invite key
- [ ] Join by code works
- [ ] Two players on different networks move for 60s
- [ ] Cast -> offer -> catch works
- [ ] Mid-cast disconnect cleans cast/fisher state

## Abuse smoke summary
- Command run:
  - `cd server && npm run abuse:smoke -- https://<service>.onrender.com`
- Observed:
  - [ ] Rate limits triggered (`RATE_LIMITED` / throttling)
  - [ ] Server stayed responsive
  - [ ] No room crash/stall

## Fixes applied during deploy
- `<list fixes>`

## Date/time
- Date:
- Operator:
