import { readDataJson } from "./dataFiles.js";

export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ZoneKind = "INLAND" | "RIVER" | "MARINA" | "RESTRICTED" | "FOREST" | "WATER";

export interface ZoneDef {
  id: string;
  kind: ZoneKind;
  shape: "rect" | "poly";
  rect?: RectLike;
  poly?: Array<{ x: number; y: number }>;
}

interface MapZonesFile {
  meta?: {
    world_width?: number;
    world_height?: number;
    units?: string;
  };
  zones: ZoneDef[];
}

export interface LoadedZones {
  zones: ZoneDef[];
  marina: RectLike;
  world: {
    width: number;
    height: number;
    units: string;
  };
}

export function pointInRect(rect: RectLike, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function pointInZoneKind(zones: ZoneDef[], kind: ZoneKind, x: number, y: number): boolean {
  return zones.some((zone) => zone.kind === kind && zone.shape === "rect" && zone.rect && pointInRect(zone.rect, x, y));
}

export function isRectWithinWorld(rect: RectLike, worldWidth: number, worldHeight: number): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.w >= 0 && rect.h >= 0 && rect.x + rect.w <= worldWidth && rect.y + rect.h <= worldHeight;
}

export function loadZones(): LoadedZones {
  const json = readDataJson<MapZonesFile>("map_zones.json");
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
