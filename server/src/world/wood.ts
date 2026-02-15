import { readDataJson } from "./dataFiles.js";

export interface WoodSpawn {
  id?: string;
  x: number;
  y: number;
  zone_id?: string;
}

interface WoodSpawnsFile {
  spawns: WoodSpawn[];
}

export function loadWoodSpawns(): WoodSpawn[] {
  const json = readDataJson<WoodSpawnsFile>("wood_spawns.json");
  return json.spawns ?? [];
}

export function toWoodNodeId(spawn: WoodSpawn, index: number): string {
  const raw = (spawn.id ?? "").trim();
  if (raw.length > 0) {
    return raw;
  }

  return `wood_${String(index + 1).padStart(2, "0")}`;
}

export function isWithinPickupRadius(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  radius: number
): boolean {
  const dx = sourceX - targetX;
  const dy = sourceY - targetY;
  return Math.hypot(dx, dy) <= radius;
}
