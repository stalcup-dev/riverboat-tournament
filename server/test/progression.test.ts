import assert from "node:assert/strict";
import test from "node:test";

import { beginCast, createBiteOffer } from "../src/fishing/castState.js";
import { validateCastStart } from "../src/fishing/guards.js";
import { applyBuildCanoe, validateBuildProgress, validateCastProgress } from "../src/rooms/progression.js";

const marina = { x: 100, y: 100, w: 220, h: 160 };

test("cast without canoe => NEED_CANOE", () => {
  const player = {
    x: 140,
    y: 140,
    wood: 3,
    boat_id: "none" as const
  };

  const error = validateCastProgress(player);
  assert.equal(error?.code, "NEED_CANOE");
});

test("build outside marina => NEED_MARINA", () => {
  const player = {
    x: 20,
    y: 20,
    wood: 3,
    boat_id: "none" as const
  };

  const error = validateBuildProgress(player, marina);
  assert.equal(error?.code, "NEED_MARINA");
});

test("build with less than 3 wood => NEED_WOOD with need/have", () => {
  const player = {
    x: 140,
    y: 140,
    wood: 2,
    boat_id: "none" as const
  };

  const error = validateBuildProgress(player, marina);
  assert.equal(error?.code, "NEED_WOOD");
  assert.equal(error?.need, 3);
  assert.equal(error?.have, 2);
});

test("build with 3 wood consumes wood and sets canoe", () => {
  const player = {
    x: 140,
    y: 140,
    wood: 3,
    boat_id: "none" as const
  };

  const error = validateBuildProgress(player, marina);
  assert.equal(error, null);

  applyBuildCanoe(player);
  assert.equal(player.wood, 0);
  assert.equal(player.boat_id, "canoe");
});

test("cast with canoe off-marina at hotspot works (reaches OFFERED)", () => {
  const player = {
    id: "p1",
    x: 20,
    y: 20,
    wood: 0,
    boat_id: "canoe" as const,
    cast_state: "IDLE" as const,
    cast_hotspot_id: "",
    cast_offer_id: "",
    cast_expires_ms: 0,
    cast_seq: 0
  };

  assert.equal(validateCastProgress(player), null);
  assert.equal(
    validateCastStart({
      nowMs: 1000,
      fishLockoutUntilMs: 0,
      hotspotExists: true
    }),
    null
  );

  beginCast(player, "hs_01");
  const offer = createBiteOffer(player, 5_000, 1_750);
  assert.ok(offer);
  assert.equal(player.cast_state, "OFFERED");
  assert.equal(offer?.hotspot_id, "hs_01");
});

test("cast with canoe in marina but not at hotspot => INVALID_HOTSPOT", () => {
  const player = {
    x: 140,
    y: 140,
    wood: 0,
    boat_id: "canoe" as const
  };

  assert.equal(validateCastProgress(player), null);
  assert.equal(
    validateCastStart({
      nowMs: 1000,
      fishLockoutUntilMs: 0,
      hotspotExists: false
    }),
    "INVALID_HOTSPOT"
  );
});
