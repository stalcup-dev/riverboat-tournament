# SOT Contracts - State + Events (v0.1)

## Stack assumptions
- Client: Phaser 3 (Vite)
- Server: Node.js + TypeScript + Colyseus
- Hosting: online dedicated server (Fly), clients connect over `wss://`

## Online baseline
- Production client uses `VITE_SERVER_URL`.
- No host-IP flow in production UX.
- No public room listing endpoint in production.
- Dedicated-server mode only (no peer-host mode).

## Matchmaker-lite contract (join-by-code)
- `createMatch()` -> `{ code, roomId }`
- `joinByCode(code)` -> `{ roomId }` or `ERROR{ code:"CODE_INVALID"|"CODE_EXPIRED"|"ROOM_FULL" }`
- `MAX_PLAYERS = 8`

### HTTP endpoints (server)
- `POST /match/create`
  - dev: open
  - production: requires header `X-Invite-Key == INVITE_KEY`
  - optional production hardening: require `X-Matchmaker-Secret == MATCHMAKER_SECRET` when configured
  - returns `{ code, roomId }`
- `POST /match/join` with `{ code }`
  - production: requires header `X-Invite-Key == INVITE_KEY`
  - success: `{ roomId }`
  - invalid code: HTTP 400 `{ error: { code: "CODE_INVALID" } }`
  - expired code: HTTP 410 `{ error: { code: "CODE_EXPIRED" } }`
  - full room: HTTP 409 `{ error: { code: "ROOM_FULL" } }`
- `GET /lobby/list`
  - production: requires header `X-Invite-Key == INVITE_KEY`
  - returns waiting rooms only (`status = "WAITING"`)

## Friends-only security baseline
- Production requires invite-code join (`join_code`) at room auth.
- No public room listing endpoint in production.
- `CORS_ORIGIN` is an allowlist (single origin or CSV); `*` is forbidden in production.
- WebSocket upgrades with non-allowlisted `Origin` are rejected.
- Server-side rate limits:
  - `MOVE`: 25 messages/sec per session
  - `CAST_START`: 5 messages/sec per session
  - `CATCH_CLICK`: 5 messages/sec per session
  - `/match/join` and `/match/create`: IP bucket throttles
- Oversized/invalid payloads are rejected.
- invite key gate:
  - missing/invalid invite key on create/join/list returns `INVITE_REQUIRED`.

## Identity + reconnect (current behavior)
- `JOIN.name` must be one of:
  - `Chrone`, `Simpin`, `Hankey`, `Reece`, `Sinjoir`, `ComputerDude04`, `Zagriban`, `TankDaddy`
- Name matching is case-insensitive, normalized to canonical casing server-side.
- One active session per name per room:
  - active duplicate -> `ERROR { code:"NAME_TAKEN" }`
- Reconnect/resume by name:
  - if same name exists in a disconnected player record, server rebinds that player state to the new session.
  - resume preserves position, wood, boat, score, suspicion, and stats.
- Disconnected grace retention:
  - on leave: `connected=false`, state is retained for `120000ms` before cleanup.

## Authority model
- Server is source of truth for:
  - timer, phases
  - player positions (server authoritative movement or server-corrected)
  - wood gathering, crafting, boat unlock
  - fishing outcomes + scoring
  - weather schedule + effects
  - warden suspicion + penalties
- Client is source of:
  - input intent (move/cast/catch/build)
  - weather visuals only (based on server weather state)

## Progression gates (v0 loop)
- Required order: forest gather -> build canoe at Marina -> enter water -> cast/fish.
- `GATHER_WOOD` requires:
  - phase `MATCH`
  - local player position inside `FOREST` zone
  - per-player gather cooldown not active
- `BUILD_CANOE` requires:
  - phase `MATCH`
  - player inside Marina
  - player wood >= 3
- `CAST_START` requires:
  - phase `MATCH`
  - `boat_id === "canoe"`
  - valid hotspot id (`INVALID_HOTSPOT` if invalid)
  - Marina is not required for fishing cast
- movement water gate:
  - movement into `WATER` requires `boat_id === "canoe"`
  - blocked movement emits `NEED_CANOE_FOR_WATER` (rate-limited server-side)
- Server rejects blocked progression actions with explicit error codes.

## Room lifecycle
- v0.1 implemented path:
  - create/join by code resolves directly to a `MatchRoom` `roomId`
  - no public room listing in production
- LobbyRoom (deferred):
  - ready/unready flow and lobby orchestration may be introduced later
- MatchRoom:
  - phase=Match runs for 15 min
  - ends in phase=Results

## Protocol version + sequencing
- All client-to-server messages include:
  - `v: "0.1.0"`
  - `client_seq: number`
- `client_seq` is monotonically increasing per client session.
- Server may ignore stale or duplicate sequence values.

## State schema (conceptual)
### PlayerState
- id: string
- name: string
- connected: boolean
- last_seen_server_ms: number
- x: number
- y: number
- dir: "up" | "down" | "left" | "right"
- wood: number
- boat_id: "none" | "canoe"
- rod_id: string
- line_id: string
- bait_id: string
- score_total: number
- suspicion: number
- fish_lockout_until_ms: number
- gather_lockout_until_ms: number
- cast_state: "IDLE" | "CASTING" | "OFFERED" | "COOLDOWN"
- cast_hotspot_id: string
- cast_offer_id: string
- cast_expires_ms: number
- cast_seq: number
- best_fish_weight: number
- best_fish_length: number
- best_fish_id: string
- best_fish_achieved_ms: number
- species_caught_count: number
- species_count_achieved_ms: number
- points_last_3min: number
- stats:
  - fish_count: number
  - biggest_weight: number
  - biggest_length: number
  - rarest_rarity: number
  - wood_collected: number

### RoomState
- world_width: number
- world_height: number
- phase: "LOBBY" | "COUNTDOWN" | "MATCH" | "RESULTS"
- time_remaining_ms: number
- weather:
  - type: "Clear" | "Overcast" | "Rain" | "Storm" | "Night"
  - ends_at_ms: number
- players: Map<string, PlayerState>
- hotspots: Array<HotspotState> // optional replication; client currently has local fallback
- marina:
  - x: number
  - y: number
  - w: number
  - h: number
- zones: Array<ZoneDef>
- warden: WardenState

### HotspotState
- id: string
- x: number
- y: number
- zone_id: string
- capacity: number
- fishers: number

### ZoneDef
- id: string
- kind: "INLAND" | "RIVER" | "MARINA" | "RESTRICTED" | "FOREST" | "WATER"
- shape: "rect" | "poly"
- rect?: { x:number, y:number, w:number, h:number }
- poly?: Array<{ x:number, y:number }>

### WardenState (v0.1 minimal)
- x: number
- y: number
- state: "patrol" | "inspect"
- target_id?: string

## Event protocol

### Client -> Server
- JOIN { v, client_seq, name: string, join_code?: string } // name allowlisted; join_code required in production room auth
- READY { v, client_seq, ready: boolean }
- SET_LOADOUT { v, client_seq, rod_id: string, line_id: string, bait_id: string }
- MOVE { v, client_seq, dx: number, dy: number }  // normalized -1..1
- GATHER_WOOD { v, client_seq }
- CAST_START { v, client_seq, hotspot_id: string }
- CATCH_CLICK { v, client_seq, offer_id: string }
- BUILD_CANOE { v, client_seq }
- PING { v, client_seq, t0_client_ms: number }

### Server -> Client
- ERROR { code: string, message: string, need?: number, have?: number, retry_after_ms?: number }

- PHASE_CHANGED { phase: "Lobby" | "Match" | "Results" }

- WEATHER_CHANGED { type: WeatherType, ends_at_ms: number }

- PONG { t0_client_ms: number, server_ms: number }
- SERVER_HEARTBEAT { server_ms: number, phase: "LOBBY" | "COUNTDOWN" | "MATCH" | "RESULTS" }

- BITE_OFFER {
    offer_id: string,
    player_id: string,
    hotspot_id: string,
    issued_server_ms: number,
    expires_server_ms: number
  } // sent only to the targeted player

- CATCH_RESULT {
    offer_id: string,
    player_id: string,
    success: boolean,
    fish_id?: string,
    weight?: number,
    length?: number,
    points_delta: number
  }

- MATCH_RESULTS {
    leaderboard: Array<{
      name: string,
      score_total: number
    }>,
    awards: Array<{
      title: string,
      winner_name: string,
      detail: string,
      achieved_server_ms: number
    }>
  }

- WARDEN_PENALTY {
    player_id: string,
    type: "confiscate" | "lockout",
    duration_ms: number,
    suspicion: number,
    reason: string
  }

## Server time rule
- Client computes RTT and clock offset from `PING/PONG`.
- Client derives `serverNowEstimateMs` and uses it for countdown UI (especially catch window).
- Server enforces catch validity using `expires_server_ms + grace_ms`.
- Grace window rule:
  - dynamic (when RTT available): `grace_ms = clamp(max(120, 0.35 * rtt_ms), 120..250)`
  - fallback: `grace_ms = 150`
- Server may rate-limit `PING` processing (current minimum interval: `500ms` per client).

## Fish Finder UX Rule (Slice 2 client behavior)
- Hotspots are hidden by default.
- Client uses signal-only feedback (no hotspot id and no exact distance in normal mode).
- Signal levels are: `NONE`, `WEAK`, `MED`, `STRONG` based on nearest hotspot distance.
- Detailed hotspot id/distance is debug-only (`DEV && ?debug=1`).
- Casting prompt appears when local player is inside the hotspot `cast_radius`.
- Cast input: `F` sends `CAST_START`.
- Catch input: mouse click or `Space` sends `CATCH_CLICK`.
- Bite countdown uses `serverNowEstimateMs` from TIME-001.
- Hotspot source priority:
  - 1) replicated room `state.hotspots` (if available)
  - 2) local fallback hotspot config (current implementation fallback)

## Error codes (recommended)
- ERR_NOT_READY
- ERR_PHASE
- ERR_LOCKOUT
- ERR_NOT_IN_MARINA
- ERR_INSUFFICIENT_WOOD
- ERR_INVALID_HOTSPOT
- ERR_NOT_NEAR_HOTSPOT
- ERR_ILLEGAL_ZONE
- ERR_NO_ACTIVE_BITE
- INVALID_HOTSPOT
- LOCKED_OUT
- CODE_INVALID
- CODE_EXPIRED
- ROOM_FULL
- RATE_LIMITED
- ORIGIN_FORBIDDEN
- INVITE_REQUIRED
- NAME_INVALID
- NAME_TAKEN
- RESUME_FAILED
- OFFER_EXPIRED
- NO_ACTIVE_CAST
- NEED_WOOD
- NEED_MARINA // build only
- NEED_CANOE
- NOT_IN_FOREST
- GATHER_COOLDOWN
- NEED_CANOE_FOR_WATER
- HOTSPOT_DEPLETED // includes retry_after_ms for remaining cooldown
- ERR_PAYLOAD
- ERR_PAYLOAD_TOO_LARGE

## Timing constants (v0.1)
- MATCH_DURATION_MS = 15 * 60 * 1000
- CATCH_WINDOW_MS = 1750
- WEATHER_SEGMENT_MS randomly chosen in [180000, 300000] // 3-5 min
- BITE_DELAY_MS randomly chosen in [1000, 4000]
- WARDEN_LOCKOUT_BASE_MS = 10000

## Mechanics constants (v0.1)
- MAX_PLAYERS = 8
- Hotspot capacity default = 2
- HOTSPOT_COOLDOWN_MS default = 30000 (depletion after successful catch)
- Crowding bite multiplier:
  - fishers <= capacity => 1.0
  - fishers > capacity => max(0.35, 1.0 - 0.25*(fishers - capacity))

## Boat gating (v0.1)
- boat_id="none" cannot start fishing (`CAST_START` -> `NEED_CANOE`).
- boat_id="canoe" is required for fishing and for entering `WATER`.
- v0.1 movement gate is zone-based (`WATER` rect), not tile-physics based.

## Results payload (computed server-side)
At phase Results:
- server emits `MATCH_RESULTS` exactly once at `MATCH -> RESULTS`
- leaderboard sorted by:
  - `score_total` descending
  - tie-break: `name` ascending (alpha)
- awards:
  - Champion: highest `score_total` (`achieved_server_ms = match_end_ms`)
  - Biggest Fish: highest `best_fish_weight`
  - Most Species: highest `species_caught_count`
- award tie-break rule:
  - primary award metric descending
  - then `achieved_server_ms` ascending (earlier wins)
  - if `achieved_server_ms` missing/zero for tie participants, fallback to `name` ascending (alpha)
