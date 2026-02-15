import assert from "node:assert/strict";
import test from "node:test";

import { isInviteGateSatisfied } from "../src/security/invite.js";

test("prod create/join is forbidden without invite key", () => {
  assert.equal(isInviteGateSatisfied("production", "friend-key", undefined), false);
  assert.equal(isInviteGateSatisfied("production", "friend-key", ""), false);
});

test("prod create/join is allowed with matching invite key", () => {
  assert.equal(isInviteGateSatisfied("production", "friend-key", "friend-key"), true);
});

test("non-production does not require invite key", () => {
  assert.equal(isInviteGateSatisfied("development", "", undefined), true);
  assert.equal(isInviteGateSatisfied("test", "", undefined), true);
});
