import test from "node:test";
import assert from "node:assert/strict";

import { normalizeAllowedName } from "../src/identity/names.js";
import { decideNameClaim, selectDisconnectedForCleanup, type IdentityPlayerView } from "../src/identity/session.js";

test("normalizeAllowedName resolves allowlisted names and rejects unknown names", () => {
  assert.equal(normalizeAllowedName("  chrone "), "Chrone");
  assert.equal(normalizeAllowedName("ComputerDude04"), "ComputerDude04");
  assert.equal(normalizeAllowedName("not_allowed"), null);
  assert.equal(normalizeAllowedName(""), null);
});

test("decideNameClaim rejects when an active player already has the requested name", () => {
  const players = new Map<string, IdentityPlayerView>([
    ["active_1", { name: "Reece", connected: true, last_seen_server_ms: 1_000 }]
  ]);

  const decision = decideNameClaim("new_session", "Reece", players);
  assert.deepEqual(decision, { kind: "reject", code: "NAME_TAKEN" });
});

test("decideNameClaim returns resume target for disconnected player with same name", () => {
  const players = new Map<string, IdentityPlayerView>([
    ["old_session", { name: "TankDaddy", connected: false, last_seen_server_ms: 50_000 }],
    ["new_session", { name: "Player", connected: true, last_seen_server_ms: 60_000 }]
  ]);

  const decision = decideNameClaim("new_session", "TankDaddy", players);
  assert.deepEqual(decision, { kind: "resume", fromSessionId: "old_session" });
});

test("resume rebind preserves prior state while updating session id key", () => {
  const players = new Map<
    string,
    IdentityPlayerView & { id: string; x: number; y: number; wood: number; boat_id: "none" | "canoe"; score_total: number }
  >([
    [
      "old_session",
      {
        id: "old_session",
        name: "Simpin",
        connected: false,
        last_seen_server_ms: 70_000,
        x: 123,
        y: 456,
        wood: 4,
        boat_id: "canoe",
        score_total: 88
      }
    ],
    [
      "new_session",
      {
        id: "new_session",
        name: "Player",
        connected: true,
        last_seen_server_ms: 80_000,
        x: 0,
        y: 0,
        wood: 0,
        boat_id: "none",
        score_total: 0
      }
    ]
  ]);

  const decision = decideNameClaim("new_session", "Simpin", players);
  assert.deepEqual(decision, { kind: "resume", fromSessionId: "old_session" });

  if (decision.kind !== "resume") {
    assert.fail("Expected resume decision");
  }

  const resumePlayer = players.get(decision.fromSessionId);
  assert.ok(resumePlayer);

  players.delete("new_session");
  players.delete(decision.fromSessionId);
  resumePlayer.id = "new_session";
  resumePlayer.connected = true;
  resumePlayer.last_seen_server_ms = 90_000;
  players.set("new_session", resumePlayer);

  const rebound = players.get("new_session");
  assert.ok(rebound);
  assert.equal(rebound.x, 123);
  assert.equal(rebound.y, 456);
  assert.equal(rebound.wood, 4);
  assert.equal(rebound.boat_id, "canoe");
  assert.equal(rebound.score_total, 88);
  assert.equal(rebound.connected, true);
});

test("selectDisconnectedForCleanup returns only stale disconnected sessions", () => {
  const players = new Map<string, IdentityPlayerView>([
    ["active", { name: "Chrone", connected: true, last_seen_server_ms: 10_000 }],
    ["recent_dc", { name: "Hankey", connected: false, last_seen_server_ms: 110_000 }],
    ["stale_dc", { name: "Zagriban", connected: false, last_seen_server_ms: 0 }]
  ]);

  const stale = selectDisconnectedForCleanup(players, 120_000, 120_000);
  assert.deepEqual(stale, ["stale_dc"]);
});
