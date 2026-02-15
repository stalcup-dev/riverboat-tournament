# SOT Slices — Parallel Execution Plan (v0.1)

## Tracks
- Track S: Server (Colyseus)
- Track C: Client (Phaser)
- Track D: Data (JSON content packs)

All work must conform to SOT_CONTRACTS.md and SOT_DATA_SCHEMAS.md.

## Slice 0 — Hello Multiplayer
### Goal
Two browsers join, see each other, move around a blank world.

### Track S Deliverables
- LobbyRoom or simple MatchRoom join
- Sync PlayerState (x,y,dir,name)

### Track C Deliverables
- Join UI (enter name + invite code; dev-only server override permitted)
- Render players (simple sprites)
- Per-player camera follows local player
- Send MOVE inputs to server

### Acceptance
- Two clients join the same room and see each other move smoothly.

## Slice 1 — Marina + Wood + Canoe Unlock
### Goal
Per-player gather wood → return to Marina → build canoe.

### Track S Deliverables
- wood spawn points + pickup
- marina zone check
- BUILD_CANOE handler (wood>=3) sets boat_id="canoe"

### Track C Deliverables
- wood counter UI
- marina prompt + build button
- canoe visual state for player

### Track D Deliverables
- map_zones.json includes MARINA rect + INLAND/RIVER zones
- wood_spawns.json (or embedded in map metadata)

### Acceptance
- Each player can independently build canoe; other players see canoe state.

## Slice 2 — Fishing v1 + Hotspots + Crowding + Scoring
### Goal
Playable fishing for points; crowded hotspots reduce bite rate.

### Track S Deliverables
- hotspots registry with capacity and current fishers
- CAST → bite RNG → BITE_OFFER → CATCH_CLICK window (1.75s)
- fish resolution: species/weight/length/rarity/points
- scoring updates and CATCH_RESULT events

### Track C Deliverables
- hotspot detection and CAST UI
- bite prompt UI and CATCH click
- score UI + catch feed

### Track D Deliverables
- hotspots.json (8 hotspots, capacity=2)
- fish.json (12 species, zone constraints, weights, scoring params)
- gear.json (minimal modifiers)

### Acceptance
- Two players can fish; crowding measurably reduces bite frequency; points accrue.

## Slice 3 — Weather (Random) + Client Visuals
### Goal
Random match-wide weather shifts fishing outcomes; visuals match weather.

### Track S Deliverables
- weather scheduler: every 3–5 min choose next weather by weights
- apply weather modifiers to bite and species weighting
- emit WEATHER_CHANGED

### Track C Deliverables
- overlays (rain, fog/night tint, storm flashes)
- weather UI indicator

### Track D Deliverables
- weather.json with weights + modifiers

### Acceptance
- Weather changes for all players; distribution of fish changes (observable).

## Slice 4 — Warden + Regulations + Results + Awards
### Goal
Rules enforcement and end-of-match ceremony.

### Track S Deliverables
- regulations checks:
  - illegal zone fishing (boat gating)
  - protected species per-player limits
- suspicion meter increases with violations
- penalties: confiscate last catch + lockout
- results: scoreboard and all awards

### Track C Deliverables
- penalty feedback UI + lockout indicator
- results screen with awards

### Track D Deliverables
- regulations.json (protected limits + zone restrictions + penalty knobs)

### Acceptance
- Illegal actions trigger penalties reliably.
- End screen shows podium + all awards.

## Integration rules
- Do not start Slice N+1 until Slice N acceptance is met.
- New features must be expressed as:
  - data change OR
  - small extension to server resolver functions
- Avoid cross-track “creative redesign” during implementation.
