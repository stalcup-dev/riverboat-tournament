import test from "node:test";
import assert from "node:assert/strict";

import {
  CATCH_GRACE_MAX_MS,
  CATCH_GRACE_MIN_MS,
  MIN_PING_INTERVAL_MS,
  computeCatchGraceMs,
  parsePingClientTimestamp,
  shouldProcessPing
} from "../src/rooms/timeSync.js";

test("shouldProcessPing accepts first ping and rate limits rapid repeats", () => {
  const nowMs = 10_000;

  assert.equal(shouldProcessPing(undefined, nowMs), true);
  assert.equal(shouldProcessPing(nowMs, nowMs + MIN_PING_INTERVAL_MS - 1), false);
  assert.equal(shouldProcessPing(nowMs, nowMs + MIN_PING_INTERVAL_MS), true);
});

test("parsePingClientTimestamp returns finite number payloads only", () => {
  assert.equal(parsePingClientTimestamp({ t0_client_ms: 123.45 }), 123.45);
  assert.equal(parsePingClientTimestamp({ t0_client_ms: Number.NaN }), null);
  assert.equal(parsePingClientTimestamp({ t0_client_ms: "123" }), null);
  assert.equal(parsePingClientTimestamp(undefined), null);
});

test("computeCatchGraceMs applies dynamic clamp and fallback", () => {
  assert.equal(computeCatchGraceMs(undefined, 150), 150);
  assert.equal(computeCatchGraceMs(-1, 150), 150);
  assert.equal(computeCatchGraceMs(100), CATCH_GRACE_MIN_MS);
  assert.equal(computeCatchGraceMs(300), Math.max(CATCH_GRACE_MIN_MS, Math.min(CATCH_GRACE_MAX_MS, 105)));
  assert.equal(computeCatchGraceMs(5_000), CATCH_GRACE_MAX_MS);
});
