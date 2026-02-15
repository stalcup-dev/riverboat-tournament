# SOT Launch Security (Friends-only Baseline)

## Scope
This baseline is for invite-only playtests with friends. It is not a public-launch hardening guide.

## Required settings
- `NODE_ENV=production`
- `CORS_ORIGIN=https://your-client-domain` (single origin or CSV allowlist)
- `INVITE_KEY=<friends-only-shared-secret>`
- `MATCHMAKER_SECRET=<optional-hardening-secret>`

## Join model
- No public room listing in production.
- Match flow is create/join by invite code only.
- Production room auth requires `join_code` and rejects invalid/missing values with `CODE_INVALID`.
- Friends-only HTTP gate:
  - `/match/create` and `/match/join` require header `X-Invite-Key` matching `INVITE_KEY`.
  - missing/invalid invite key returns `403 INVITE_REQUIRED`.
- Optional extra hardening:
  - `/match/create` can also require `X-Matchmaker-Secret` when `MATCHMAKER_SECRET` is configured to a non-placeholder value.

## Origin controls
- HTTP and WebSocket requests with non-allowlisted `Origin` are rejected.
- `CORS_ORIGIN="*"` is forbidden in production.

## Rate limits
- Per-session token buckets:
  - `MOVE`: 25/s
  - `CAST_START`: 5/s
  - `CATCH_CLICK`: 5/s
  - `JOIN` message: lightweight guard
- Per-IP throttles on `/match/create` and `/match/join`.
- Repeated rate-limit abuse can trigger disconnect (`RATE_LIMITED`).

## Payload validation
- Envelope required on client->server messages:
  - `v: "0.1.0"`
  - `client_seq: number`
- Oversized payloads are rejected (`ERR_PAYLOAD_TOO_LARGE`).
- Invalid payloads are rejected (`ERR_PAYLOAD`).

## Current non-goals
- Steam auth / OAuth
- Account persistence
- Advanced anti-cheat beyond server authority

## Friends-only checklist
- [ ] `CORS_ORIGIN` set to deployed client domain(s)
- [ ] `INVITE_KEY` set in server environment
- [ ] `/match/create` and `/match/join` reject missing invite key with `INVITE_REQUIRED`
- [ ] Optional: `MATCHMAKER_SECRET` set for extra create hardening
- [ ] Join-by-code works; direct room join without code is rejected
- [ ] Rate-limit and payload errors observed in logs during abuse smoke run
