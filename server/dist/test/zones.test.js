import test from "node:test";
import assert from "node:assert/strict";
import { pointInRect } from "../src/world/zones.js";
test("pointInRect returns true for points inside or on boundary", () => {
    const rect = { x: 10, y: 20, w: 100, h: 60 };
    assert.equal(pointInRect(rect, 10, 20), true);
    assert.equal(pointInRect(rect, 110, 80), true);
    assert.equal(pointInRect(rect, 55, 50), true);
});
test("pointInRect returns false outside rect", () => {
    const rect = { x: 10, y: 20, w: 100, h: 60 };
    assert.equal(pointInRect(rect, 9, 20), false);
    assert.equal(pointInRect(rect, 111, 80), false);
    assert.equal(pointInRect(rect, 55, 81), false);
});
