import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPhaseTransitions,
  assignHostSessionId,
  canControlMatchStartStop,
  createMatchStatePayload,
  phaseLockErrorForGameplay,
  startCountdown,
  type MatchPhaseState
} from "../src/rooms/phases.js";

test("host assignment and host-only control checks", () => {
  const host = assignHostSessionId("", "host_a");
  assert.equal(host, "host_a");
  assert.equal(assignHostSessionId(host, "host_b"), "host_a");

  assert.equal(canControlMatchStartStop(host, "host_a"), true);
  assert.equal(canControlMatchStartStop(host, "host_b"), false);
});

test("countdown transitions to match", () => {
  const state: MatchPhaseState = {
    phase: "LOBBY",
    countdown_end_ms: 0,
    match_start_ms: 0,
    match_end_ms: 0
  };

  const started = startCountdown(state, 1000);
  assert.equal(started, true);
  assert.equal(state.phase, "COUNTDOWN");
  assert.ok(state.countdown_end_ms > 1000);

  const changed = applyPhaseTransitions(state, state.countdown_end_ms);
  assert.equal(changed, true);
  assert.equal(state.phase, "MATCH");
  assert.ok(state.match_start_ms >= 1000);
  assert.ok(state.match_end_ms > state.match_start_ms);
});

test("match transitions to results on end", () => {
  const state: MatchPhaseState = {
    phase: "MATCH",
    countdown_end_ms: 0,
    match_start_ms: 5000,
    match_end_ms: 6000
  };

  const changed = applyPhaseTransitions(state, 6000);
  assert.equal(changed, true);
  assert.equal(state.phase, "RESULTS");
});

test("phase gating blocks gameplay actions in results", () => {
  assert.equal(phaseLockErrorForGameplay("RESULTS"), "PHASE_LOCKED");
  assert.equal(phaseLockErrorForGameplay("LOBBY"), "PHASE_LOCKED");
  assert.equal(phaseLockErrorForGameplay("COUNTDOWN"), "PHASE_LOCKED");
  assert.equal(phaseLockErrorForGameplay("MATCH"), null);
});

test("match state payload includes host_session_id", () => {
  const payload = createMatchStatePayload(
    {
      phase: "LOBBY",
      countdown_end_ms: 0,
      match_start_ms: 0,
      match_end_ms: 0,
      host_session_id: "host_123"
    },
    42
  );

  assert.deepEqual(payload, {
    phase: "LOBBY",
    server_ms: 42,
    countdown_end_ms: 0,
    match_start_ms: 0,
    match_end_ms: 0,
    host_session_id: "host_123"
  });
});
