# SOT Overview — Riverboat Tournament (v0.1)

## One-liner
Multiplayer (2–8) top-down 2D fishing tournament: gather 3 wood inland, build a canoe at the Marina, fish for points at hotspots under changing weather while avoiding a strict warden. 15-minute session, friendly competition.

## Pillars (non-negotiable)
- Session-based: Lobby → Match (15:00) → Results → Lobby
- Players always visible to each other; each player has their own camera view
- Strategy-first fishing: cast → bite offer → timed click catch (1.75s)
- Individual progression: each player must collect their own 3 wood and build their own canoe at the Marina
- Hotspots exist and can be crowded; crowding reduces bite rate
- Random match-wide weather affects bite/species/rarity; client renders weather visuals
- Warden enforces rules: illegal zone fishing + protected species limits; penalties are mean

## Game fantasy / theme
Young boys building their first canoe inland and competing in a local community fishing tournament to win a grand prize. Start with a canoe; better boats exist later.

## v0.1 Scope (SHIP THIS)
### World
- 1 handcrafted map with land + river + Marina
- Hotspots: ~8 along the river (capacity=2 per hotspot)

### Progression (within session only)
- Gather wood nodes inland (wood is per-player)
- Marina is the only crafting station
- Canoe unlock: 3 wood + build action in Marina

### Fishing
- Cast at a hotspot (server-authoritative)
- Bite offer appears (server to player); player must click CATCH within 1.75s
- Fish outcome is server RNG (fish are NOT world entities in v0.1)
- Points depend on fish type + weight + length + rarity

### Weather
- Random weather changes every 3–5 minutes
- Weather modifies bite chance + species weighting + rarity weighting
- Weather visuals are client-only overlays (rain, fog/night tint, storm flashes)

### Warden + rules
- Illegal zone checks (boat gating)
- Protected species limits per player per match
- Suspicion meter per player
- Penalties: confiscate last catch (remove awarded points) + lockout from fishing (10s)
- Escalation: repeated violations increase lockout duration and suspicion

### Results
- Scoreboard + podium
- Awards: biggest fish, highest points, most fish, rarest catch, best helper (defined as most wood collected in v0.1)

## Deferred (DO NOT BUILD IN v0.1)
- Deep sea boat + deep sea zone
- Persistent progression across sessions (accounts, saves)
- Fish as visible swimming entities
- Complex crafting trees / inventory management
- Chat, matchmaking ranks, cosmetics shop
- Advanced netcode prediction

## Terminology
- Marina: central crafting station zone for building canoes
- Hotspot: a fishing point with capacity and crowding penalty
- Protected fish: regulated species with per-player limits
- Suspicion: warden attention score; higher means harsher penalties
- Boat gating: zones require certain boat tiers (v0.1 uses canoe only)

## “Don’t drift” list
- No new systems until Slice acceptance criteria are met.
- No persistence in v0.1.
- No fish world entities in v0.1.
- No deep sea content in v0.1.
- All gameplay outcomes are server-authoritative.
