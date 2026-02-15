export type CastState = "IDLE" | "CASTING" | "OFFERED" | "COOLDOWN";

export type FishingErrorCode = "INVALID_HOTSPOT" | "NO_ACTIVE_CAST" | "OFFER_EXPIRED" | "LOCKED_OUT";

export interface CastStartValidationInput {
  nowMs: number;
  fishLockoutUntilMs: number;
  hotspotExists: boolean;
}

export interface CatchClickValidationInput {
  nowMs: number;
  fishLockoutUntilMs: number;
  castState: CastState;
  activeOfferId: string;
  requestedOfferId: string;
  offerExpiresMs: number;
  graceMs: number;
}

export function validateCastStart(input: CastStartValidationInput): FishingErrorCode | null {
  if (input.fishLockoutUntilMs > input.nowMs) {
    return "LOCKED_OUT";
  }

  if (!input.hotspotExists) {
    return "INVALID_HOTSPOT";
  }

  return null;
}

export function validateCatchClick(input: CatchClickValidationInput): FishingErrorCode | null {
  if (input.fishLockoutUntilMs > input.nowMs) {
    return "LOCKED_OUT";
  }

  if (input.castState !== "OFFERED") {
    return "NO_ACTIVE_CAST";
  }

  if (!input.activeOfferId || input.requestedOfferId !== input.activeOfferId) {
    return "NO_ACTIVE_CAST";
  }

  if (input.nowMs > input.offerExpiresMs + input.graceMs) {
    return "OFFER_EXPIRED";
  }

  return null;
}
