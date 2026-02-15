import { readDataJson } from "../world/dataFiles.js";

export interface HotspotData {
  id: string;
  x: number;
  y: number;
  cast_radius: number;
  cap: number;
  zone_id: string;
  kind: string;
}

export interface FishData {
  fish_id: string;
  name: string;
  base_points: number;
  weight_min: number;
  weight_max: number;
  length_min: number;
  length_max: number;
  rarity_tier: number;
}

export interface ScoringData {
  weight_k: number;
  length_k: number;
  rarity_mults: Record<string, number>;
}

interface HotspotsFile {
  hotspots?: HotspotData[];
}

interface FishFile {
  fish?: FishData[];
}

export interface FishingDataPack {
  hotspots: HotspotData[];
  hotspotsById: Map<string, HotspotData>;
  fish: FishData[];
  scoring: ScoringData;
}

export function loadFishingDataPack(): FishingDataPack {
  const hotspotsJson = readDataJson<HotspotsFile>("hotspots.json");
  const fishJson = readDataJson<FishFile>("fish.json");
  const scoringJson = readDataJson<ScoringData>("scoring.json");

  const hotspots = hotspotsJson.hotspots ?? [];
  const fish = fishJson.fish ?? [];

  return {
    hotspots,
    hotspotsById: new Map(hotspots.map((hotspot) => [hotspot.id, hotspot])),
    fish,
    scoring: scoringJson
  };
}
