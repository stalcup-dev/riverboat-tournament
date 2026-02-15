export function validateCastStart(input) {
    if (input.fishLockoutUntilMs > input.nowMs) {
        return "LOCKED_OUT";
    }
    if (!input.hotspotExists) {
        return "INVALID_HOTSPOT";
    }
    return null;
}
export function validateCatchClick(input) {
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
