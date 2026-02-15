import assert from "node:assert/strict";
import test from "node:test";

import { getHotspotRetryAfterMs, HOTSPOT_COOLDOWN_MS_DEFAULT, markHotspotDepleted } from "../src/fishing/depletion.js";

test("catch success -> immediate recast on same hotspot is blocked", () => {
  const depletedUntilByHotspotId = new Map<string, number>();
  const nowMs = 10_000;

  markHotspotDepleted(depletedUntilByHotspotId, "hs_river_01", nowMs, HOTSPOT_COOLDOWN_MS_DEFAULT);

  const retryAfterMs = getHotspotRetryAfterMs(depletedUntilByHotspotId, "hs_river_01", nowMs + 1);
  assert.ok(retryAfterMs > 0);
});

test("hotspot becomes available after cooldown expires", () => {
  const depletedUntilByHotspotId = new Map<string, number>();
  const nowMs = 10_000;

  markHotspotDepleted(depletedUntilByHotspotId, "hs_river_01", nowMs, HOTSPOT_COOLDOWN_MS_DEFAULT);

  const retryAfterMs = getHotspotRetryAfterMs(
    depletedUntilByHotspotId,
    "hs_river_01",
    nowMs + HOTSPOT_COOLDOWN_MS_DEFAULT + 1
  );
  assert.equal(retryAfterMs, 0);
});

test("depletion is per hotspot (different hotspot unaffected)", () => {
  const depletedUntilByHotspotId = new Map<string, number>();
  const nowMs = 10_000;

  markHotspotDepleted(depletedUntilByHotspotId, "hs_river_01", nowMs, HOTSPOT_COOLDOWN_MS_DEFAULT);

  const retryAfterMs = getHotspotRetryAfterMs(depletedUntilByHotspotId, "hs_river_02", nowMs + 1);
  assert.equal(retryAfterMs, 0);
});
