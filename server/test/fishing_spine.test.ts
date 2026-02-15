import test from "node:test";
import assert from "node:assert/strict";

import { validateCastStart, validateCatchClick } from "../src/fishing/guards.js";
import { resolveCatchOutcome } from "../src/fishing/resolver.js";

test("resolveCatchOutcome is deterministic for same seed inputs", () => {
  const fishCatalog = [
    {
      fish_id: "bluegill",
      name: "Bluegill",
      base_points: 8,
      weight_min: 0.2,
      weight_max: 1.1,
      length_min: 12,
      length_max: 30,
      rarity_tier: 1
    },
    {
      fish_id: "river_trout",
      name: "River Trout",
      base_points: 12,
      weight_min: 0.4,
      weight_max: 3.2,
      length_min: 22,
      length_max: 62,
      rarity_tier: 2
    },
    {
      fish_id: "northern_pike",
      name: "Northern Pike",
      base_points: 28,
      weight_min: 2.0,
      weight_max: 18.0,
      length_min: 50,
      length_max: 140,
      rarity_tier: 4
    }
  ];

  const scoring = {
    weight_k: 0.14,
    length_k: 0.025,
    rarity_mults: {
      "1": 1.0,
      "2": 1.15,
      "3": 1.35,
      "4": 1.7,
      "5": 2.1
    }
  };

  const baseInput = {
    matchSeed: 123456,
    playerId: "player_a",
    castSeq: 7,
    hotspotId: "hs_river_01",
    fishCatalog,
    scoring
  };

  const first = resolveCatchOutcome(baseInput);
  const second = resolveCatchOutcome(baseInput);

  assert.deepEqual(first, second);
});

test("validateCatchClick returns OFFER_EXPIRED after expiry + grace", () => {
  const code = validateCatchClick({
    nowMs: 10_001,
    fishLockoutUntilMs: 0,
    castState: "OFFERED",
    activeOfferId: "offer_1",
    requestedOfferId: "offer_1",
    offerExpiresMs: 9_800,
    graceMs: 150
  });

  assert.equal(code, "OFFER_EXPIRED");
});

test("validateCatchClick accepts click inside grace window", () => {
  const code = validateCatchClick({
    nowMs: 9_920,
    fishLockoutUntilMs: 0,
    castState: "OFFERED",
    activeOfferId: "offer_1",
    requestedOfferId: "offer_1",
    offerExpiresMs: 9_800,
    graceMs: 150
  });

  assert.equal(code, null);
});

test("validateCatchClick returns NO_ACTIVE_CAST when no offer is active", () => {
  const code = validateCatchClick({
    nowMs: 5000,
    fishLockoutUntilMs: 0,
    castState: "IDLE",
    activeOfferId: "",
    requestedOfferId: "offer_1",
    offerExpiresMs: 0,
    graceMs: 150
  });

  assert.equal(code, "NO_ACTIVE_CAST");
});

test("validateCastStart returns INVALID_HOTSPOT for unknown hotspot", () => {
  const code = validateCastStart({
    nowMs: 1000,
    fishLockoutUntilMs: 0,
    hotspotExists: false
  });

  assert.equal(code, "INVALID_HOTSPOT");
});

test("lockout rejects cast start and catch click with LOCKED_OUT", () => {
  const castCode = validateCastStart({
    nowMs: 1000,
    fishLockoutUntilMs: 1200,
    hotspotExists: true
  });
  assert.equal(castCode, "LOCKED_OUT");

  const catchCode = validateCatchClick({
    nowMs: 1000,
    fishLockoutUntilMs: 1200,
    castState: "OFFERED",
    activeOfferId: "offer_1",
    requestedOfferId: "offer_1",
    offerExpiresMs: 1100,
    graceMs: 150
  });
  assert.equal(catchCode, "LOCKED_OUT");
});
