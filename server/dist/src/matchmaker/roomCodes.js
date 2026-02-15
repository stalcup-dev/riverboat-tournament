const roomCodeByRoomId = new Map();
export function setRoomJoinCode(roomId, code, createdAtMs = Date.now()) {
    roomCodeByRoomId.set(roomId, { code, createdAtMs });
}
export function getRoomJoinCode(roomId) {
    return roomCodeByRoomId.get(roomId)?.code;
}
export function deleteRoomJoinCodeByRoomId(roomId) {
    roomCodeByRoomId.delete(roomId);
}
export function cleanupExpiredRoomJoinCodes(ttlMs, nowMs = Date.now()) {
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
