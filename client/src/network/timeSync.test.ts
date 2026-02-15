import test from "node:test";
import assert from "node:assert/strict";

import { TimeSyncClient } from "./timeSync";

class ProtocolSenderStub {
  public readonly sent: Array<{ type: string; payload: Record<string, unknown> }> = [];

  send(type: string, payload?: Record<string, unknown>): void {
    this.sent.push({ type, payload: payload ?? {} });
  }
}

test("TimeSyncClient computes RTT and offset from PONG payload", () => {
  const protocol = new ProtocolSenderStub();
  const sync = new TimeSyncClient(protocol as never);

  sync.handlePong(
    {
      t0_client_ms: 1000,
      server_ms: 1100
    },
    1200
  );

  const snapshot = sync.getSnapshot();
  assert.equal(snapshot.sampleCount, 1);
  assert.equal(snapshot.rttMs, 200);
  assert.equal(snapshot.offsetMs, 0);
});

test("TimeSyncClient keeps rolling average over latest samples", () => {
  const protocol = new ProtocolSenderStub();
  const sync = new TimeSyncClient(protocol as never, 2500, 2);

  sync.handlePong({ t0_client_ms: 0, server_ms: 100 }, 200); // rtt=200 offset=0
  sync.handlePong({ t0_client_ms: 0, server_ms: 150 }, 200); // rtt=200 offset=50
  sync.handlePong({ t0_client_ms: 0, server_ms: 190 }, 200); // rtt=200 offset=90 (last 2 => 70 avg)

  const snapshot = sync.getSnapshot();
  assert.equal(snapshot.sampleCount, 2);
  assert.equal(snapshot.rttMs, 200);
  assert.equal(snapshot.offsetMs, 70);
});
