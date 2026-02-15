import { pointInRect, type RectLike } from "../world/zones.js";

export const REQUIRED_WOOD_FOR_CANOE = 3;

export interface BuildProgressError {
  code: "NEED_MARINA" | "NEED_WOOD";
  message: string;
  need?: number;
  have?: number;
}

export interface CastProgressError {
  code: "NEED_CANOE";
  message: string;
}

export interface ProgressPlayerShape {
  x: number;
  y: number;
  wood: number;
  boat_id: "none" | "canoe";
}

export function validateBuildProgress(player: ProgressPlayerShape, marina: RectLike): BuildProgressError | null {
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

export function applyBuildCanoe(player: ProgressPlayerShape): void {
  player.wood -= REQUIRED_WOOD_FOR_CANOE;
  player.boat_id = "canoe";
}

export function validateCastProgress(player: ProgressPlayerShape): CastProgressError | null {
  if (player.boat_id !== "canoe") {
    return {
      code: "NEED_CANOE",
      message: "Craft a canoe before fishing."
    };
  }

  return null;
}
