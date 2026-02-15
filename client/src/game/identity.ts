export const LOCKED_NAME_POOL = [
  "Chrone",
  "Simpin",
  "Hankey",
  "Reece",
  "Sinjoir",
  "ComputerDude04",
  "Zagriban",
  "TankDaddy"
] as const;

const NAME_TINTS: Record<string, number> = {
  Chrone: 0xf97316,
  Simpin: 0x22c55e,
  Hankey: 0x06b6d4,
  Reece: 0xeab308,
  Sinjoir: 0xf43f5e,
  ComputerDude04: 0x8b5cf6,
  Zagriban: 0x3b82f6,
  TankDaddy: 0xef4444
};

const FALLBACK_COLORS = [0x4ade80, 0x60a5fa, 0xf59e0b, 0xe879f9, 0x2dd4bf, 0xfb7185];

export function getTintForName(name: string): number {
  const known = NAME_TINTS[name];
  if (typeof known === "number") {
    return known;
  }

  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }

  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length] ?? 0x4ade80;
}

export function pickRandomLockedName(previouslyUsed: ReadonlySet<string>): string {
  const available = LOCKED_NAME_POOL.filter((name) => !previouslyUsed.has(name));
  const pool = available.length > 0 ? available : LOCKED_NAME_POOL;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex] ?? LOCKED_NAME_POOL[0];
}
