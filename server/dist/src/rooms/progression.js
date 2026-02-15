import { pointInRect } from "../world/zones.js";
export const REQUIRED_WOOD_FOR_CANOE = 3;
export function validateBuildProgress(player, marina) {
    if (!pointInRect(marina, player.x, player.y)) {
        return {
            code: "NEED_MARINA",
            message: "Go to the Marina to craft a canoe."
        };
    }
    if (player.wood < REQUIRED_WOOD_FOR_CANOE) {
        return {
            code: "NEED_WOOD",
            message: "Need 3 wood to craft canoe.",
            need: REQUIRED_WOOD_FOR_CANOE,
            have: player.wood
        };
    }
    return null;
}
export function applyBuildCanoe(player) {
    player.wood -= REQUIRED_WOOD_FOR_CANOE;
    player.boat_id = "canoe";
}
export function validateCastProgress(player) {
    if (player.boat_id !== "canoe") {
        return {
            code: "NEED_CANOE",
            message: "Craft a canoe before fishing."
        };
    }
    return null;
}
