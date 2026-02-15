import test from "node:test";
import assert from "node:assert/strict";

import { isWithinPickupRadius } from "../src/world/wood.js";

test("isWithinPickupRadius returns true when point is inside radius", () => {
  assert.equal(isWithinPickupRadius(100, 100, 112, 109, 20), true);
});

test("isWithinPickupRadius includes exact radius edge", () => {
  assert.equal(isWithinPickupRadius(0, 0, 20, 0, 20), true);
});

test("isWithinPickupRadius returns false outside radius", () => {
  assert.equal(isWithinPickupRadius(0, 0, 20.1, 0, 20), false);
});
