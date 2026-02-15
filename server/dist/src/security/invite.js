export function isInviteGateSatisfied(nodeEnv, configuredInviteKey, providedInviteKey) {
    if (nodeEnv !== "production") {
        return true;
    }
    if (!configuredInviteKey) {
        return false;
    }
    return providedInviteKey === configuredInviteKey;
}
