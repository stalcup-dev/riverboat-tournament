import assert from "node:assert/strict";
import test from "node:test";
import { MatchCodeRegistry, generateCode, normalizeCode } from "../src/matchmaker/registry.js";
test("generateCode creates five-char uppercase code in allowed alphabet", () => {
    const code = generateCode();
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
});
test("normalizeCode uppercases valid values and rejects invalid values", () => {
    assert.equal(normalizeCode("abcde"), "ABCDE");
    assert.equal(normalizeCode("a0cde"), undefined);
    assert.equal(normalizeCode(""), undefined);
});
test("registry create + resolve returns stored room id", () => {
    const registry = new MatchCodeRegistry();
    const created = registry.create("room-123", 1000);
    const resolved = registry.resolve(created.code, 1000);
    assert.ok(resolved);
    assert.equal(resolved.roomId, "room-123");
});
test("registry expires entries after ttl", () => {
    const ttlMs = 100;
    const registry = new MatchCodeRegistry(ttlMs);
    const created = registry.create("room-xyz", 0);
    const beforeExpiry = registry.resolve(created.code, 99);
    assert.ok(beforeExpiry);
    const afterExpiry = registry.resolve(created.code, 100);
    assert.equal(afterExpiry, undefined);
});
test("registry lookup reports expired status", () => {
    const ttlMs = 100;
    const registry = new MatchCodeRegistry(ttlMs);
    const created = registry.create("room-xyz", 0);
    const lookup = registry.lookup(created.code, 100);
    assert.equal(lookup.status, "expired");
});
