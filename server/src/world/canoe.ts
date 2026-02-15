import { pointInRect, type RectLike } from "./zones.js";

export const CANOE_WOOD_COST = 3;

export type BuildCanoeErrorCode = "ERR_NOT_IN_MARINA" | "ERR_INSUFFICIENT_WOOD";

interface BuildCanoeInput {
  playerX: number;
  playerY: number;
  playerWood: number;
  marina: RectLike;
}

export type BuildCanoeValidation =
  | { ok: true }
  | {
      ok: false;
      code: BuildCanoeErrorCode;
      message: string;
    };

export function validateBuildCanoe(input: BuildCanoeInput): BuildCanoeValidation {
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
