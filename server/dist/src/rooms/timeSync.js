export const MIN_PING_INTERVAL_MS = 500;
export const CATCH_GRACE_MIN_MS = 120;
export const CATCH_GRACE_MAX_MS = 250;
export function shouldProcessPing(lastPingAtMs, nowMs, minIntervalMs = MIN_PING_INTERVAL_MS) {
    if (lastPingAtMs === undefined) {
        return true;
    }
    return nowMs - lastPingAtMs >= minIntervalMs;
}
export function parsePingClientTimestamp(payload) {
    const value = payload?.t0_client_ms;
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    return value;
}
export function computeCatchGraceMs(rttMs, fallbackMs = 150) {
    if (typeof rttMs !== "number" || !Number.isFinite(rttMs) || rttMs < 0) {
        return fallbackMs;
    }
    const grace = Math.max(CATCH_GRACE_MIN_MS, 0.35 * rttMs);
    return Math.max(CATCH_GRACE_MIN_MS, Math.min(CATCH_GRACE_MAX_MS, Math.round(grace)));
}
