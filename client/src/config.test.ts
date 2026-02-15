import test from "node:test";
import assert from "node:assert/strict";

import { normalizeToWebSocketUrl, resolveWebSocketEndpoint, shouldEnableDevOverride, webSocketToHttpBaseUrl } from "./config";

test("prod + missing VITE_SERVER_URL throws", () => {
  assert.throws(
    () =>
      resolveWebSocketEndpoint({
        isDev: false,
        search: ""
      }),
    /Missing VITE_SERVER_URL in production/
  );
});

test("dev + missing env uses ws://localhost:2567", () => {
  const endpoint = resolveWebSocketEndpoint({
    isDev: true,
    search: ""
  });

  assert.equal(endpoint, "ws://localhost:2567");
});

test("prod + https env converts to wss", () => {
  const endpoint = resolveWebSocketEndpoint({
    envServerUrl: "https://x",
    isDev: false,
    search: ""
  });

  assert.equal(endpoint, "wss://x");
});

test("dev + http env converts to ws", () => {
  const endpoint = resolveWebSocketEndpoint({
    envServerUrl: "http://localhost:2567",
    isDev: true,
    search: ""
  });

  assert.equal(endpoint, "ws://localhost:2567");
});

test("prod + ?dev=1 does not enable override logic or UI gating", () => {
  assert.equal(shouldEnableDevOverride(false, "?dev=1"), false);

  const endpoint = resolveWebSocketEndpoint({
    envServerUrl: "https://prod.fly.dev",
    isDev: false,
    search: "?dev=1",
    devOverrideUrl: "http://localhost:2567"
  });

  assert.equal(endpoint, "wss://prod.fly.dev");
});

test("webSocketToHttpBaseUrl converts ws/wss to http/https", () => {
  assert.equal(webSocketToHttpBaseUrl("ws://localhost:2567"), "http://localhost:2567");
  assert.equal(webSocketToHttpBaseUrl("wss://game.fly.dev"), "https://game.fly.dev");
});

test("Render production URL must be explicit wss", () => {
  assert.throws(() => normalizeToWebSocketUrl("https://my-game.onrender.com", false), /requires VITE_SERVER_URL to use wss/);
  assert.equal(normalizeToWebSocketUrl("wss://my-game.onrender.com", false), "wss://my-game.onrender.com");
});
