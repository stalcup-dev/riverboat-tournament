import assert from "node:assert/strict";
import test from "node:test";

import { validateRoomJoinCode } from "../src/security/joinCode.js";

test("join code is not required in development mode", () => {
  const result = validateRoomJoinCode({}, "ABCDE", false);
  assert.equal(result, null);
});

test("production join requires code when room has expected code", () => {
  const missing = validateRoomJoinCode({}, "ABCDE", true);
  assert.equal(missing, "CODE_INVALID");

  const invalid = validateRoomJoinCode({ join_code: "ZZZZZ" }, "ABCDE", true);
  assert.equal(invalid, "CODE_INVALID");

  const valid = validateRoomJoinCode({ join_code: "abcde" }, "ABCDE", true);
  assert.equal(valid, null);
});

test("production join fails when room has no expected code", () => {
  const result = validateRoomJoinCode({ join_code: "ABCDE" }, undefined, true);
  assert.equal(result, "CODE_INVALID");
});
