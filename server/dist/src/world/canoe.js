import { pointInRect } from "./zones.js";
export const CANOE_WOOD_COST = 3;
export function validateBuildCanoe(input) {
    if (!pointInRect(input.marina, input.playerX, input.playerY)) {
        return {
            ok: false,
            code: "ERR_NOT_IN_MARINA",
            message: "Player must be inside Marina to build a canoe."
        };
    }
    if (input.playerWood < CANOE_WOOD_COST) {
        return {
            ok: false,
            code: "ERR_INSUFFICIENT_WOOD",
            message: `Player needs at least ${CANOE_WOOD_COST} wood to build a canoe.`
        };
    }
    return { ok: true };
}
