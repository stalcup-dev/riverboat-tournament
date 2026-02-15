# SOT Network Modes (v0.1)

## Non-negotiable mode
- Dedicated server only.
- No peer-host / player-host networking.
- Clients always connect to a hosted Colyseus server over `wss://` in production.

## Friends-only mode (current)
- Access is invite-only.
- Match flow is join-by-code:
  - `POST /match/create` -> `{ code, roomId }`
  - `POST /match/join { code }` -> `{ roomId }`
- No public room listing without an invite gate.
- Production uses strict origin allowlist (`CORS_ORIGIN`), no wildcard `*`.

## Steam mode (later)
- Still dedicated-server only.
- Replace name-only identity with Steam identity/auth binding.
- Keep join-by-code and/or Steam friends lobby UX on top of dedicated rooms.
- Do not switch to peer-host in Steam mode.

## Dev exceptions
- Local direct endpoint override is allowed only in dev (`DEV && ?dev=1`).
- This override is for local testing only and is ignored in production builds.
