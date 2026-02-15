export function resolveCatchOutcome(input) {
    if (input.fishCatalog.length === 0) {
        throw new Error("Fish catalog is empty.");
    }
    const castSeed = deriveCastSeed(input.matchSeed, input.playerId, input.castSeq, input.hotspotId);
    const rng = createMulberry32(castSeed);
    const fish = pickFishWeightedByRarity(input.fishCatalog, rng);
    const rawWeight = lerp(fish.weight_min, fish.weight_max, rng());
    const rawLength = lerp(fish.length_min, fish.length_max, rng());
    const weight = roundTo(rawWeight, 2);
    const length = roundTo(rawLength, 2);
    const rarityMult = getRarityMult(input.scoring, fish.rarity_tier);
    const points = fish.base_points *
        rarityMult *
        (1 + input.scoring.weight_k * Math.sqrt(weight)) *
        (1 + input.scoring.length_k * Math.sqrt(length));
    return {
        fish_id: fish.fish_id,
        weight,
        length,
        rarity_tier: fish.rarity_tier,
        points_delta: Math.max(0, Math.round(points))
    };
}
export function deriveCastSeed(matchSeed, playerId, castSeq, hotspotId) {
    const source = `${playerId}|${castSeq}|${hotspotId}`;
    const textHash = fnv1a32(source);
    let mixed = textHash ^ (matchSeed >>> 0);
    mixed ^= Math.imul(castSeq >>> 0, 2246822519);
    mixed = (mixed ^ (mixed >>> 13)) >>> 0;
    if (mixed === 0) {
        return 1;
    }
    return mixed;
}
function pickFishWeightedByRarity(fishCatalog, rng) {
    const weights = fishCatalog.map((fish) => 1 / Math.max(1, fish.rarity_tier));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    const roll = rng() * totalWeight;
    let cursor = 0;
    for (let index = 0; index < fishCatalog.length; index += 1) {
        cursor += weights[index] ?? 0;
        if (roll <= cursor) {
            return fishCatalog[index];
        }
    }
    return fishCatalog[fishCatalog.length - 1];
}
function getRarityMult(scoring, rarityTier) {
    const raw = scoring.rarity_mults[String(rarityTier)];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
        return 1;
    }
    return raw;
}
function fnv1a32(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
function createMulberry32(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function lerp(min, max, unit) {
    if (max <= min) {
        return min;
    }
    return min + (max - min) * unit;
}
function roundTo(value, decimals) {
    const scale = 10 ** decimals;
    return Math.round(value * scale) / scale;
}
