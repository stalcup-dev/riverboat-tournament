import { pointInRect } from "./zones.js";
export const GATHER_COOLDOWN_MS = 1750;
export function isInsideZoneKind(zones, kind, x, y) {
    return zones.some((zone) => zone.kind === kind && zone.shape === "rect" && zone.rect && pointInRect(zone.rect, x, y));
}
export function validateGatherWood(input) {
    if (!input.inForest) {
        return "NOT_IN_FOREST";
    }
    if (input.gatherLockoutUntilMs > input.nowMs) {
        return "GATHER_COOLDOWN";
    }
    return null;
}
export function applyGatherWood(player, nowMs) {
    player.wood += 1;
    player.stats.wood_collected += 1;
    player.gather_lockout_until_ms = nowMs + GATHER_COOLDOWN_MS;
}
export function validateWaterEntry(input) {
    const insideWater = isInsideZoneKind(input.zones, "WATER", input.nextX, input.nextY);
    if (insideWater && input.boatId !== "canoe") {
        return { ok: false, code: "NEED_CANOE_FOR_WATER" };
    }
    return { ok: true };
}
export function chooseSpawnPoint(zones, fallback) {
    const inlandZones = zones.filter((zone) => zone.kind === "INLAND" && zone.shape === "rect" && zone.rect);
    for (const zone of inlandZones) {
        const candidate = {
            x: (zone.rect?.x ?? 0) + Math.floor((zone.rect?.w ?? 0) * 0.35),
            y: (zone.rect?.y ?? 0) + Math.floor((zone.rect?.h ?? 0) * 0.72)
        };
        const insideRestricted = isInsideZoneKind(zones, "RESTRICTED", candidate.x, candidate.y);
        const insideWater = isInsideZoneKind(zones, "WATER", candidate.x, candidate.y);
        if (!insideRestricted && !insideWater) {
            return candidate;
        }
    }
    return fallback;
}
