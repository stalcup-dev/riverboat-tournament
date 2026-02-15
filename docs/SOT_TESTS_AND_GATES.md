# SOT Tests + Gates (v0.1)

## Definition of Done (global)
- Feature conforms to SOT_CONTRACTS.md (state + events)
- No new systems beyond current Slice
- Basic tests exist for any server resolver logic added
- Smoke test works with 2 clients (local or online)

## Commands (suggested)
### Server
- npm run lint
- npm test
- npm run dev

### Client
- npm run lint
- npm test
- npm run build
- npm run dev

## Online gates
- Matchmaker create/join flow:
  - `POST /match/create` returns `{ code, roomId }`
  - `POST /match/join` with valid code returns `{ roomId }`
  - invalid code returns `CODE_INVALID`
  - full room returns `ROOM_FULL`
  - missing/invalid invite key returns `INVITE_REQUIRED` in production
  - `GET /lobby/list` requires invite key and returns `WAITING` rooms only
- Identity gate:
  - non-allowlisted name rejected with `NAME_INVALID`
  - active duplicate name rejected with `NAME_TAKEN`
  - reconnect by same name within 120s resumes prior state
- Time sync gate:
  - client sends `PING` every 2-5s
  - client receives `PONG` and updates RTT/offset
  - UI can use `serverNowEstimateMs` for countdown timing
- Security gate:
  - direct room join without valid `join_code` fails in production
  - non-allowlisted origins are rejected
  - MOVE/CAST/CATCH spam is throttled (or disconnected if abusive)

## Slice gates

### Slice 0 gate
- Two clients join same room and see each other move
- No desync that makes player disappear

### Slice 1 gate
- Wood pickup increments per-player
- Marina build requires wood>=3 and being inside marina zone
- Canoe state replicates to other clients

### Slice 2 gate
- CAST only works near a hotspot
- Bite offer triggers sometimes; click catch within 1.75s yields catch
- Crowding reduces bite frequency measurably
- Score updates and catch feed visible

### Slice 3 gate
- Weather changes every 3–5 min match-wide
- WEATHER_CHANGED event received by all clients
- Fishing results shift across weather types (manual observation acceptable)

### Slice 4 gate
- Illegal zone fishing triggers penalty
- Protected fish over limit triggers penalty
- Confiscation removes points reliably
- Results screen shows:
  - podium + score totals
  - biggest fish
  - highest points
  - most fish
  - rarest catch
  - best helper (most wood collected)

## Minimal server tests (recommended)
- fishing_resolver.test:
  - bite chance with crowding
  - catch window enforcement (reject after expiry)
  - weather modifier application
- regulations.test:
  - illegal zone penalty
  - protected limit penalty
  - suspicion escalation
- marina_crafting.test:
  - require inside zone + wood>=3

## Manual smoke test checklist (local)
1. Host runs server+client
2. Client A joins (name A)
3. Client B joins (name B)
4. Both move and see each other
5. Both collect wood and build canoe independently
6. Both fish at same hotspot; observe crowding penalty
7. Wait for weather change; observe visuals and outcome shifts
8. Trigger an illegal action; observe warden penalty
9. Let timer end; verify results/awards display

## Online smoke test checklist
1. Deploy server and client with production env vars.
2. Verify `GET /healthz` returns `200`.
3. Create match from client A, copy code.
4. Join with client B using code.
5. Host starts match; both move for 60s.
6. Fish once from each client and verify score updates.
7. Confirm invalid code returns `CODE_INVALID` and expired code returns `CODE_EXPIRED`.

## Abuse harness gate
Run:
```powershell
cd C:\Users\halol\Desktop\game\server
npm run abuse:smoke -- http://localhost:2567
```

Expected:
- Server stays alive.
- Rate-limit logs appear.
- No room crash or tick stall.
