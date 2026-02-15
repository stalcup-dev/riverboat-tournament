# SOT Data Schemas - JSON Packs (v0.1)

All balancing/content should be expressed in JSON when possible.

## Active Slice 2 files
- `data/hotspots.json`
- `data/fish.json`
- `data/scoring.json`

## Other packs (existing/deferred usage)
- `data/gear.json`
- `data/map_zones.json`
- `data/wood_spawns.json`
- `data/weather.json` (deferred for current scope)
- `data/regulations.json` (deferred for current scope)
- `data/boats.json` (deferred for current scope)

## hotspots.json
### Schema
```json
{
  "hotspots": [
    {
      "id": "hs_river_01",
      "x": 120,
      "y": 560,
      "cast_radius": 42,
      "cap": 2,
      "zone_id": "river_main",
      "kind": "river"
    }
  ]
}
```

### Notes
- `id` should be lowercase snake_case.
- `cast_radius` is used client-side for cast prompt/eligibility.
- `cap` is hotspot capacity knob used by server logic and future crowding tuning.
- `kind` currently includes `"river"` and `"inland_edge"` values.

## fish.json
### Schema
```json
{
  "fish": [
    {
      "fish_id": "river_trout",
      "name": "River Trout",
      "base_points": 12,
      "weight_min": 0.4,
      "weight_max": 3.2,
      "length_min": 22,
      "length_max": 62,
      "rarity_tier": 2
    }
  ]
}
```

### Notes
- `fish_id` should be lowercase snake_case.
- `rarity_tier` is an integer bucket in `[1..5]`.
- Weight/length ranges are rolled server-side per catch.

## scoring.json
### Schema
```json
{
  "weight_k": 0.14,
  "length_k": 0.025,
  "rarity_mults": {
    "1": 1.0,
    "2": 1.15,
    "3": 1.35,
    "4": 1.7,
    "5": 2.1
  }
}
```

### Points formula (current server)
```text
points_delta =
  round(
    base_points
    * rarity_mults[rarity_tier]
    * (1 + weight_k * sqrt(weight))
    * (1 + length_k * sqrt(length))
  )
```

## Fish Finder UX Rule
- Hotspots are hidden until the player is within finder radius.
- When finder triggers, only nearest hotspot is revealed.
- `F` casts (`CAST_START`) when in `cast_radius`.
- `Click` or `Space` catches (`CATCH_CLICK`) during bite window.
- Bite countdown uses client `serverNowEstimateMs` (TIME-001).
- Hotspot source priority:
  - 1) replicated room hotspot state (if present)
  - 2) local fallback hotspot list (current client fallback)

## Recommended v0.1 content counts
- Hotspots: 8+
- Fish species: 10-12
- Rarity tiers: 5 buckets

## map_zones.json (Slice 5 world)
### Schema
```json
{
  "meta": {
    "world_width": 2400,
    "world_height": 1600,
    "units": "px"
  },
  "zones": [
    { "id": "inland_main", "kind": "INLAND", "shape": "rect", "rect": { "x": 0, "y": 0, "w": 2400, "h": 1170 } },
    { "id": "forest_main", "kind": "FOREST", "shape": "rect", "rect": { "x": 260, "y": 220, "w": 820, "h": 560 } },
    { "id": "marina", "kind": "MARINA", "shape": "rect", "rect": { "x": 920, "y": 1030, "w": 320, "h": 140 } },
    { "id": "river_main", "kind": "RIVER", "shape": "rect", "rect": { "x": 120, "y": 1170, "w": 1200, "h": 250 } },
    { "id": "water_main", "kind": "WATER", "shape": "rect", "rect": { "x": 0, "y": 1170, "w": 2400, "h": 430 } },
    { "id": "restricted_eddy", "kind": "RESTRICTED", "shape": "rect", "rect": { "x": 1720, "y": 1240, "w": 220, "h": 180 } }
  ]
}
```

### Notes
- All rect zones must stay within `meta.world_width/world_height`.
- Server uses zones for gather legality (`FOREST`) and water entry gating (`WATER`).
- Client overlays read these zones for readability and prompts.

## Core Loop (v0)
1. Spawn inland and wait for host start.
2. Enter `FOREST` and press `F` to send `GATHER_WOOD`.
3. Gather until wood count reaches 3.
4. Travel to `MARINA`.
5. Build canoe (`BUILD_CANOE`) inside Marina.
6. Enter `WATER` (blocked before canoe).
7. Approach hotspot and press `F` to cast.
8. React to bite window with click or space.
9. Earn points from `CATCH_RESULT`.
10. Repeat until match end.
