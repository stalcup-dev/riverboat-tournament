import { readDataJson } from "./dataFiles.js";
export function loadWoodSpawns() {
    const json = readDataJson("wood_spawns.json");
    return json.spawns ?? [];
}
export function toWoodNodeId(spawn, index) {
    const raw = (spawn.id ?? "").trim();
    if (raw.length > 0) {
        return raw;
    }
    return `wood_${String(index + 1).padStart(2, "0")}`;
}
export function isWithinPickupRadius(sourceX, sourceY, targetX, targetY, radius) {
    const dx = sourceX - targetX;
    const dy = sourceY - targetY;
    return Math.hypot(dx, dy) <= radius;
}
