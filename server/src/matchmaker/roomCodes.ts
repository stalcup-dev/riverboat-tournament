const roomCodeByRoomId = new Map<string, { code: string; createdAtMs: number }>();

export function setRoomJoinCode(roomId: string, code: string, createdAtMs = Date.now()): void {
  roomCodeByRoomId.set(roomId, { code, createdAtMs });
}

export function getRoomJoinCode(roomId: string): string | undefined {
  return roomCodeByRoomId.get(roomId)?.code;
}

export function deleteRoomJoinCodeByRoomId(roomId: string): void {
  roomCodeByRoomId.delete(roomId);
}

export function cleanupExpiredRoomJoinCodes(ttlMs: number, nowMs = Date.now()): number {
  let removed = 0;
  for (const [roomId, entry] of roomCodeByRoomId.entries()) {
    if (nowMs - entry.createdAtMs < ttlMs) {
      continue;
    }
    roomCodeByRoomId.delete(roomId);
    removed += 1;
  }
  return removed;
}
