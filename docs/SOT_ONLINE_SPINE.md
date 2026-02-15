# SOT Online Spine (v0.1)

## Online connection model
- Dedicated Colyseus server.
- Dedicated mode is non-negotiable (no peer-host networking).
- Clients connect via `wss://` (Fly-hosted endpoint).
- Client uses `VITE_SERVER_URL` for production.
- Dev override is allowed for local testing only when `DEV && ?dev=1`.
- No host-IP input in production UX.
- Normal multiplayer flow is code-based:
  - host uses `Create Match`
  - joiners use `Join Match` with a 5-char code

## Deployment baseline (Fly)
- Runtime: persistent server process (not serverless request invocation).
- Required env vars:
  - `NODE_ENV`
  - `PORT`
  - `CORS_ORIGIN`
  - `PUBLIC_WS_URL`
  - `INVITE_KEY`
  - `MATCHMAKER_SECRET`
- Health check contract:
  - `GET /healthz` returns HTTP 200 with JSON:
    - `{ "ok": true, "version": "0.1.0" }`
- Logging baseline:
  - server start log includes port + environment
  - room join-count logs (join/leave counts)

## Matchmaker-lite contract (join-by-code)
- No public room listing in production.
- `POST /match/create`:
  - returns `{ code, roomId }`
  - in production requires header `X-Invite-Key` matching `INVITE_KEY`
  - optional extra hardening: `X-Matchmaker-Secret` matching `MATCHMAKER_SECRET`
- `POST /match/join` with `{ code }`:
  - in production requires header `X-Invite-Key` matching `INVITE_KEY`
  - returns `{ roomId }`
  - or HTTP 400 `{ error:{ code:"CODE_INVALID" } }`
  - or HTTP 409 `{ error:{ code:"ROOM_FULL" } }`
- Max players per match: `8`.

## Time sync contract
- Client sends `PING { v, client_seq, t0_client_ms }` every 2-5 seconds.
- Server replies `PONG { t0_client_ms, server_ms }`.
- Client computes:
  - RTT
  - clock offset
- Client maintains `serverNowEstimateMs` and uses it for UI countdowns, especially catch window timing.
- Server may ignore pings sent too frequently (current minimum: `500ms` per client).

## Identity + resume baseline
- Name must be from the allowlisted pool (canonicalized server-side).
- Only one active session per name in a room.
- Reconnect by same name resumes disconnected player state within grace window.
- Disconnected players are retained for `120s` then cleaned up.

## Security baseline
- Apply lightweight rate limiting for `MOVE` and `CATCH` spam.
- Enforce strict `CORS_ORIGIN` in production.
- No room listing endpoint in production.

## Online smoke tests
- Two players on different networks join the same code and move for 60 seconds.
- One player disconnects mid-cast; server cleans cast state and hotspot fishers count.
- Disconnect and reconnect within 120s using same name; verify state resumes.
