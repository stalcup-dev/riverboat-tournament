import { readDataJson } from "../world/dataFiles.js";
export function loadFishingDataPack() {
    const hotspotsJson = readDataJson("hotspots.json");
    const fishJson = readDataJson("fish.json");
    const scoringJson = readDataJson("scoring.json");
    const hotspots = hotspotsJson.hotspots ?? [];
    const fish = fishJson.fish ?? [];
    return {
        hotspots,
        hotspotsById: new Map(hotspots.map((hotspot) => [hotspot.id, hotspot])),
        fish,
        scoring: scoringJson
    };
}
