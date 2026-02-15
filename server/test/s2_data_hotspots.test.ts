import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ZoneRecord {
  id: string;
  kind: string;
  shape: string;
  rect?: Rect;
}

interface HotspotRecord {
  id: string;
  x: number;
  y: number;
  cast_radius: number;
  cap: number;
  zone_id: string;
  kind: string;
}

interface FishRecord {
  fish_id: string;
  name: string;
  base_points: number;
  weight_min: number;
  weight_max: number;
  length_min: number;
  length_max: number;
  rarity_tier: number;
}

interface ScoringRecord {
  weight_k: number;
  length_k: number;
  rarity_mults: Record<string, number>;
}

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadJson<T>(relativePath: string): T {
  const fullPath = path.join(ROOT_DIR, relativePath);
  return JSON.parse(readFileSync(fullPath, "utf-8")) as T;
}

function pointInRect(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

test("S2 hotspot data parses, has unique ids, and stays within referenced rect zones", () => {
  const mapZones = loadJson<{ zones: ZoneRecord[] }>("data/map_zones.json");
  const hotspots = loadJson<{ hotspots: HotspotRecord[] }>("data/hotspots.json");

  assert.ok(Array.isArray(mapZones.zones));
  assert.ok(Array.isArray(hotspots.hotspots));
  assert.ok(hotspots.hotspots.length >= 8, "Expected at least 8 hotspots.");

  const ids = hotspots.hotspots.map((hotspot) => hotspot.id);
  assert.equal(new Set(ids).size, ids.length, "Hotspot ids must be unique.");

  const riverCount = hotspots.hotspots.filter((hotspot) => hotspot.kind === "river").length;
  const inlandEdgeCount = hotspots.hotspots.filter((hotspot) => hotspot.kind === "inland_edge").length;
  assert.ok(riverCount >= 3, "Expected at least 3 river hotspots.");
  assert.ok(inlandEdgeCount >= 3, "Expected at least 3 inland-water edge hotspots.");

  const zoneById = new Map(mapZones.zones.map((zone) => [zone.id, zone]));

  hotspots.hotspots.forEach((hotspot) => {
    assert.match(hotspot.id, /^[a-z0-9_]+$/, "Hotspot id must be lowercase snake_case.");
    assert.ok(isFiniteNumber(hotspot.x));
    assert.ok(isFiniteNumber(hotspot.y));
    assert.ok(isFiniteNumber(hotspot.cast_radius) && hotspot.cast_radius > 0);
    assert.ok(isFiniteNumber(hotspot.cap) && hotspot.cap > 0);
    assert.equal(typeof hotspot.zone_id, "string");

    const zone = zoneById.get(hotspot.zone_id);
    assert.ok(zone, `Hotspot ${hotspot.id} must reference an existing zone.`);
    assert.equal(zone?.shape, "rect", `Hotspot zone ${hotspot.zone_id} must use rect shape.`);
    assert.ok(zone?.rect, `Hotspot zone ${hotspot.zone_id} must include rect data.`);
    assert.equal(pointInRect(zone.rect as Rect, hotspot.x, hotspot.y), true, `Hotspot ${hotspot.id} must be inside ${hotspot.zone_id}.`);

    if (hotspot.kind === "river") {
      assert.equal(zone?.kind, "RIVER", `River hotspot ${hotspot.id} must reference a RIVER zone.`);
    }

    if (hotspot.kind === "inland_edge") {
      assert.equal(zone?.kind, "INLAND", `Inland-edge hotspot ${hotspot.id} must reference an INLAND zone.`);
    }
  });
});

test("S2 fish + scoring data parses and validates required ranges", () => {
  const fish = loadJson<{ fish: FishRecord[] }>("data/fish.json");
  const scoring = loadJson<ScoringRecord>("data/scoring.json");

  assert.ok(Array.isArray(fish.fish), "Fish file must contain a fish array.");
  assert.ok(fish.fish.length >= 10 && fish.fish.length <= 12, "Fish count must be between 10 and 12.");

  const fishIds = fish.fish.map((entry) => entry.fish_id);
  assert.equal(new Set(fishIds).size, fishIds.length, "Fish ids must be unique.");

  fish.fish.forEach((entry) => {
    assert.match(entry.fish_id, /^[a-z0-9_]+$/, "fish_id must be lowercase snake_case.");
    assert.equal(typeof entry.name, "string");
    assert.ok(entry.name.trim().length > 0);

    assert.ok(isFiniteNumber(entry.base_points) && entry.base_points > 0);
    assert.ok(isFiniteNumber(entry.weight_min) && isFiniteNumber(entry.weight_max));
    assert.ok(isFiniteNumber(entry.length_min) && isFiniteNumber(entry.length_max));
    assert.ok(entry.weight_min > 0 && entry.weight_max >= entry.weight_min);
    assert.ok(entry.length_min > 0 && entry.length_max >= entry.length_min);
    assert.ok(Number.isInteger(entry.rarity_tier) && entry.rarity_tier >= 1 && entry.rarity_tier <= 5);
  });

  assert.ok(isFiniteNumber(scoring.weight_k) && scoring.weight_k > 0);
  assert.ok(isFiniteNumber(scoring.length_k) && scoring.length_k > 0);
  assert.ok(scoring.rarity_mults && typeof scoring.rarity_mults === "object");
  ["1", "2", "3", "4", "5"].forEach((tier) => {
    assert.ok(isFiniteNumber(scoring.rarity_mults[tier]) && scoring.rarity_mults[tier] > 0, `Missing rarity_mults tier ${tier}.`);
  });
});
