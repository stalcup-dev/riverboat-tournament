export const HOTSPOT_COOLDOWN_MS_DEFAULT = 30_000;

export function markHotspotDepleted(
  depletedUntilByHotspotId: Map<string, number>,
  hotspotId: string,
  nowMs: number,
  cooldownMs = HOTSPOT_COOLDOWN_MS_DEFAULT
): number {
  const depletedUntilMs = nowMs + cooldownMs;
  depletedUntilByHotspotId.set(hotspotId, depletedUntilMs);
  return depletedUntilMs;
}

export function getHotspotRetryAfterMs(
  depletedUntilByHotspotId: Map<string, number>,
  hotspotId: string,
  nowMs: number
): number {
  const depletedUntilMs = depletedUntilByHotspotId.get(hotspotId) ?? 0;
  if (nowMs >= depletedUntilMs) {
    return 0;
  }

  return depletedUntilMs - nowMs;
}

export function isHotspotDepleted(
  depletedUntilByHotspotId: Map<string, number>,
  hotspotId: string,
  nowMs: number
): boolean {
  return getHotspotRetryAfterMs(depletedUntilByHotspotId, hotspotId, nowMs) > 0;
}
