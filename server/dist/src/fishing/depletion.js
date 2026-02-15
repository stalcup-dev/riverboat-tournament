export const HOTSPOT_COOLDOWN_MS_DEFAULT = 30_000;
export function markHotspotDepleted(depletedUntilByHotspotId, hotspotId, nowMs, cooldownMs = HOTSPOT_COOLDOWN_MS_DEFAULT) {
    const depletedUntilMs = nowMs + cooldownMs;
    depletedUntilByHotspotId.set(hotspotId, depletedUntilMs);
    return depletedUntilMs;
}
export function getHotspotRetryAfterMs(depletedUntilByHotspotId, hotspotId, nowMs) {
    const depletedUntilMs = depletedUntilByHotspotId.get(hotspotId) ?? 0;
    if (nowMs >= depletedUntilMs) {
        return 0;
    }
    return depletedUntilMs - nowMs;
}
export function isHotspotDepleted(depletedUntilByHotspotId, hotspotId, nowMs) {
    return getHotspotRetryAfterMs(depletedUntilByHotspotId, hotspotId, nowMs) > 0;
}
