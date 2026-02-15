import type { ProtocolSender } from "./protocol";

const DEFAULT_PING_INTERVAL_MS = 2500;
const DEFAULT_SAMPLE_WINDOW_SIZE = 5;

interface TimeSample {
  rttMs: number;
  offsetMs: number;
}

export interface PongPayload {
  t0_client_ms?: unknown;
  server_ms?: unknown;
}

export interface TimeSyncSnapshot {
  rttMs: number;
  offsetMs: number;
  sampleCount: number;
  serverNowEstimateMs: number;
}

export class TimeSyncClient {
  private readonly protocol: ProtocolSender;
  private readonly pingIntervalMs: number;
  private readonly sampleWindowSize: number;
  private readonly samples: TimeSample[] = [];
  private intervalHandle: ReturnType<typeof setInterval> | undefined;
  private rttMs = 0;
  private offsetMs = 0;

  constructor(protocol: ProtocolSender, pingIntervalMs = DEFAULT_PING_INTERVAL_MS, sampleWindowSize = DEFAULT_SAMPLE_WINDOW_SIZE) {
    this.protocol = protocol;
    this.pingIntervalMs = pingIntervalMs;
    this.sampleWindowSize = sampleWindowSize;
  }

  start(): void {
    if (this.intervalHandle) {
      return;
    }

    this.sendPing();
    this.intervalHandle = setInterval(() => {
      this.sendPing();
    }, this.pingIntervalMs);
  }

  stop(): void {
    if (!this.intervalHandle) {
      return;
    }

    clearInterval(this.intervalHandle);
    this.intervalHandle = undefined;
  }

  handlePong(payload: PongPayload, nowClientMs = Date.now()): void {
    const t0ClientMs = payload.t0_client_ms;
    const serverMs = payload.server_ms;
    if (!isFiniteNumber(t0ClientMs) || !isFiniteNumber(serverMs)) {
      return;
    }

    const rttMs = nowClientMs - t0ClientMs;
    if (!Number.isFinite(rttMs) || rttMs < 0) {
      return;
    }

    const offsetMs = serverMs - (t0ClientMs + rttMs / 2);
    this.pushSample({ rttMs, offsetMs });
  }

  getSnapshot(): TimeSyncSnapshot {
    return {
      rttMs: this.rttMs,
      offsetMs: this.offsetMs,
      sampleCount: this.samples.length,
      serverNowEstimateMs: this.getServerNowEstimateMs()
    };
  }

  getServerNowEstimateMs(nowClientMs = Date.now()): number {
    return nowClientMs + this.offsetMs;
  }

  private sendPing(): void {
    this.protocol.send("PING", {
      t0_client_ms: Date.now()
    });
  }

  private pushSample(sample: TimeSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.sampleWindowSize) {
      this.samples.shift();
    }

    const totals = this.samples.reduce(
      (acc, item) => {
        acc.rttMs += item.rttMs;
        acc.offsetMs += item.offsetMs;
        return acc;
      },
      { rttMs: 0, offsetMs: 0 }
    );

    const count = this.samples.length;
    this.rttMs = count > 0 ? totals.rttMs / count : 0;
    this.offsetMs = count > 0 ? totals.offsetMs / count : 0;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
