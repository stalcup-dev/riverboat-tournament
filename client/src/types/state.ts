export interface PlayerStateSnapshot {
  id: string;
  name: string;
  x: number;
  y: number;
  wood: number;
  boat_id: "none" | "canoe" | string;
  score_total: number;
}

export interface RectSnapshot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomStateSnapshot {
  players: unknown;
  marina?: unknown;
  hotspots?: unknown;
  zones?: unknown;
  world_width?: unknown;
  world_height?: unknown;
}

export interface SchemaMapLike<T> {
  forEach?: (cb: (value: T, key: string) => void) => void;
  entries?: () => IterableIterator<[string, T]>;
}

export function getPlayerEntries(players: unknown): Array<[string, PlayerStateSnapshot]> {
  const mapLike = players as SchemaMapLike<PlayerStateSnapshot> | undefined;
  if (!mapLike) {
    return [];
  }

  if (typeof mapLike.forEach === "function") {
    const entries: Array<[string, PlayerStateSnapshot]> = [];
    mapLike.forEach((value, key) => entries.push([key, value]));
    return entries;
  }

  if (typeof mapLike.entries === "function") {
    return Array.from(mapLike.entries());
  }

  return [];
}

export function parseRectSnapshot(value: unknown): RectSnapshot | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const input = value as Record<string, unknown>;
  const { x, y, w, h } = input;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)) {
    return undefined;
  }

  return { x, y, w, h };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
