import { readDataJson } from "./dataFiles.js";
export function pointInRect(rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
export function pointInZoneKind(zones, kind, x, y) {
    return zones.some((zone) => zone.kind === kind && zone.shape === "rect" && zone.rect && pointInRect(zone.rect, x, y));
}
export function isRectWithinWorld(rect, worldWidth, worldHeight) {
    return rect.x >= 0 && rect.y >= 0 && rect.w >= 0 && rect.h >= 0 && rect.x + rect.w <= worldWidth && rect.y + rect.h <= worldHeight;
}
export function loadZones() {
    const json = readDataJson("map_zones.json");
    const worldWidth = json.meta?.world_width ?? 1000;
    const worldHeight = json.meta?.world_height ?? 700;
    const worldUnits = json.meta?.units ?? "px";
    const zones = json.zones ?? [];
    const marinaZone = zones.find((zone) => zone.kind === "MARINA");
    if (!marinaZone || marinaZone.shape !== "rect" || !marinaZone.rect) {
        throw new Error(`Missing required MARINA rect in data/map_zones.json`);
    }
    return {
        zones,
        marina: marinaZone.rect,
        world: {
            width: worldWidth,
            height: worldHeight,
            units: worldUnits
        }
    };
}
