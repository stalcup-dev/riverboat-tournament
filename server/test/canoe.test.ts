import test from "node:test";
import assert from "node:assert/strict";

import { CANOE_WOOD_COST, validateBuildCanoe } from "../src/world/canoe.js";

const marina = { x: 80, y: 440, w: 240, h: 70 };

test("validateBuildCanoe fails outside marina", () => {
  const result = validateBuildCanoe({
    playerX: 50,
    playerY: 50,
    playerWood: CANOE_WOOD_COST,
    marina
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "ERR_NOT_IN_MARINA");
  }
});

test("validateBuildCanoe fails if wood is below threshold", () => {
  const result = validateBuildCanoe({
    playerX: 100,
    playerY: 460,
    playerWood: CANOE_WOOD_COST - 1,
    marina
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "ERR_INSUFFICIENT_WOOD");
  }
});

test("validateBuildCanoe succeeds in marina with enough wood", () => {
  const result = validateBuildCanoe({
    playerX: 100,
    playerY: 460,
    playerWood: CANOE_WOOD_COST,
    marina
  });

  assert.equal(result.ok, true);
});
