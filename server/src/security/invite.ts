export function isInviteGateSatisfied(
  nodeEnv: string,
  configuredInviteKey: string,
  providedInviteKey: string | undefined
): boolean {
  if (nodeEnv !== "production") {
    return true;
  }

  if (!configuredInviteKey) {
    return false;
  }

  return providedInviteKey === configuredInviteKey;
}
