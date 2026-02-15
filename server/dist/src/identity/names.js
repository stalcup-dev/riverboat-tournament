const ALLOWED_NAMES = [
    "Chrone",
    "Simpin",
    "Hankey",
    "Reece",
    "Sinjoir",
    "ComputerDude04",
    "Zagriban",
    "TankDaddy"
];
const CANONICAL_NAME_BY_KEY = new Map(ALLOWED_NAMES.map((name) => [name.toLowerCase(), name]));
export function normalizeAllowedName(raw) {
    const trimmed = (raw ?? "").trim();
    if (trimmed.length === 0) {
        return null;
    }
    return CANONICAL_NAME_BY_KEY.get(trimmed.toLowerCase()) ?? null;
}
export function listAllowedNames() {
    return ALLOWED_NAMES;
}
