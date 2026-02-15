import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMoveIntent, nextDirection } from "../src/rooms/movement.js";
test("normalizeMoveIntent clamps inputs to [-1, 1]", () => {
    const normalized = normalizeMoveIntent({ dx: 3, dy: -2 });
    assert.ok(normalized.dx <= 1);
    assert.ok(normalized.dx >= -1);
    assert.ok(normalized.dy <= 1);
    assert.ok(normalized.dy >= -1);
});
test("normalizeMoveIntent normalizes diagonal magnitude over 1", () => {
    const normalized = normalizeMoveIntent({ dx: 1, dy: 1 });
    const magnitude = Math.hypot(normalized.dx, normalized.dy);
    assert.ok(magnitude <= 1);
});
test("nextDirection chooses major axis and keeps previous on idle", () => {
    assert.equal(nextDirection("down", { dx: 0, dy: -1 }), "up");
    assert.equal(nextDirection("down", { dx: -1, dy: 0.1 }), "left");
    assert.equal(nextDirection("left", { dx: 0, dy: 0 }), "left");
});
