import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGatherWood,
  chooseSpawnPoint,
  isInsideZoneKind,
  validateGatherWood,
  validateWaterEntry
} from "../src/world/gameplay.js";
import { isRectWithinWorld, loadZones } from "../src/world/zones.js";

test("S5 map zones include FOREST/WATER and rects stay within world bounds", () => {
  const loaded = loadZones();

  assert.equal(loaded.world.width, 2400);
  assert.equal(loaded.world.height, 1600);

  let hasForest = false;
  let hasWater = false;
  loaded.zones.forEach((zone) => {
    if (zone.kind === "FOREST") {
      hasForest = true;
    }
    if (zone.kind === "WATER") {
      hasWater = true;
    }

    if (zone.shape !== "rect" || !zone.rect) {
      return;
    }

    assert.equal(
      isRectWithinWorld(zone.rect, loaded.world.width, loaded.world.height),
      true,
      `zone ${zone.id} must fit inside world bounds`
    );
  });

  assert.equal(hasForest, true);
  assert.equal(hasWater, true);
});

test("gather wood validation checks forest membership and cooldown", () => {
  assert.equal(
    validateGatherWood({
      nowMs: 10_000,
      gatherLockoutUntilMs: 0,
      inForest: false
    }),
    "NOT_IN_FOREST"
  );

  assert.equal(
    validateGatherWood({
      nowMs: 10_000,
      gatherLockoutUntilMs: 10_500,
      inForest: true
    }),
    "GATHER_COOLDOWN"
  );

  assert.equal(
    validateGatherWood({
      nowMs: 10_000,
      gatherLockoutUntilMs: 0,
      inForest: true
    }),
    null
  );
});

test("applyGatherWood increments wood and wood_collected and sets cooldown", () => {
  const player = {
    wood: 2,
    gather_lockout_until_ms: 0,
    stats: {
      wood_collected: 4
    }
  };

  applyGatherWood(player, 5_000);

  assert.equal(player.wood, 3);
  assert.equal(player.stats.wood_collected, 5);
  assert.equal(player.gather_lockout_until_ms, 6_750);
});

test("water gate blocks entry without canoe and allows with canoe", () => {
  const zones = [
    {
      id: "water_main",
      kind: "WATER",
      shape: "rect",
      rect: { x: 0, y: 1170, w: 2400, h: 430 }
    }
  ];

  const blocked = validateWaterEntry({
    zones,
    nextX: 200,
    nextY: 1300,
    boatId: "none"
  });
  assert.deepEqual(blocked, { ok: false, code: "NEED_CANOE_FOR_WATER" });

  const allowed = validateWaterEntry({
    zones,
    nextX: 200,
    nextY: 1300,
    boatId: "canoe"
  });
  assert.deepEqual(allowed, { ok: true });
});

test("spawn picker chooses inland point outside water/restricted", () => {
  const zones = [
    {
      id: "inland_main",
      kind: "INLAND",
      shape: "rect",
      rect: { x: 0, y: 0, w: 2400, h: 1170 }
    },
    {
      id: "water_main",
      kind: "WATER",
      shape: "rect",
      rect: { x: 0, y: 1170, w: 2400, h: 430 }
    },
    {
      id: "restricted_eddy",
      kind: "RESTRICTED",
      shape: "rect",
      rect: { x: 1720, y: 1240, w: 220, h: 180 }
    }
  ];

  const spawn = chooseSpawnPoint(zones, { x: 100, y: 100 });
  assert.equal(isInsideZoneKind(zones, "INLAND", spawn.x, spawn.y), true);
  assert.equal(isInsideZoneKind(zones, "WATER", spawn.x, spawn.y), false);
  assert.equal(isInsideZoneKind(zones, "RESTRICTED", spawn.x, spawn.y), false);
});
