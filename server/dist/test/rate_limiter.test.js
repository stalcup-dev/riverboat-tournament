import assert from "node:assert/strict";
import test from "node:test";
import { TokenBucket } from "../src/security/rateLimiter.js";
test("token bucket allows requests until capacity then denies", () => {
    const bucket = new TokenBucket(3, 1, 0);
    assert.equal(bucket.allow(0), true);
    assert.equal(bucket.allow(0), true);
    assert.equal(bucket.allow(0), true);
    assert.equal(bucket.allow(0), false);
});
test("token bucket refills over time", () => {
    const bucket = new TokenBucket(2, 2, 0);
    assert.equal(bucket.allow(0), true);
    assert.equal(bucket.allow(0), true);
    assert.equal(bucket.allow(0), false);
    // 500ms at 2 tokens/s -> +1 token
    assert.equal(bucket.allow(500), true);
});
test("token bucket returns retry-after when empty", () => {
    const bucket = new TokenBucket(1, 1, 0);
    assert.equal(bucket.allow(0), true);
    assert.equal(bucket.allow(0), false);
    assert.equal(bucket.getRetryAfterMs(0) > 0, true);
});
