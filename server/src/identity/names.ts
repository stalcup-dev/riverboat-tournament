const ALLOWED_NAMES = [
  "Chrone",
  "Simpin",
  "Hankey",
  "Reece",
  "Sinjoir",
  "ComputerDude04",
  "Zagriban",
  "TankDaddy"
] as const;

const CANONICAL_NAME_BY_KEY = new Map<string, string>(
  ALLOWED_NAMES.map((name) => [name.toLowerCase(), name])
);

export function normalizeAllowedName(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) {
    return null;
  }

  return CANONICAL_NAME_BY_KEY.get(trimmed.toLowerCase()) ?? null;
}

export function listAllowedNames(): readonly string[] {
  return ALLOWED_NAMES;
}
