export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;
  private readonly capacity: number;
  private readonly refillPerSecond: number;

  constructor(capacity: number, refillPerSecond: number, nowMs = Date.now()) {
    this.capacity = Math.max(1, capacity);
    this.refillPerSecond = Math.max(0.01, refillPerSecond);
    this.tokens = this.capacity;
    this.lastRefillMs = nowMs;
  }

  allow(nowMs = Date.now(), cost = 1): boolean {
    this.refill(nowMs);
    if (this.tokens < cost) {
      return false;
    }

    this.tokens -= cost;
    return true;
  }

  getRetryAfterMs(nowMs = Date.now(), cost = 1): number {
    this.refill(nowMs);
    if (this.tokens >= cost) {
      return 0;
    }

    const deficit = cost - this.tokens;
    const refillPerMs = this.refillPerSecond / 1000;
    return Math.ceil(deficit / refillPerMs);
  }

  private refill(nowMs: number): void {
    if (nowMs <= this.lastRefillMs) {
      return;
    }

    const elapsedMs = nowMs - this.lastRefillMs;
    const refillAmount = (elapsedMs / 1000) * this.refillPerSecond;
    this.tokens = Math.min(this.capacity, this.tokens + refillAmount);
    this.lastRefillMs = nowMs;
  }
}

export function getOrCreateBucket<K>(
  map: Map<K, TokenBucket>,
  key: K,
  capacity: number,
  refillPerSecond: number,
  nowMs = Date.now()
): TokenBucket {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const created = new TokenBucket(capacity, refillPerSecond, nowMs);
  map.set(key, created);
  return created;
}
