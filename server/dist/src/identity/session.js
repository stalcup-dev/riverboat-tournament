export function decideNameClaim(joiningSessionId, canonicalName, players) {
    let resumeCandidate = null;
    for (const [sessionId, player] of players) {
        if (player.name !== canonicalName) {
            continue;
        }
        if (sessionId === joiningSessionId) {
            return { kind: "assign" };
        }
        if (player.connected) {
            return { kind: "reject", code: "NAME_TAKEN" };
        }
        if (!resumeCandidate || player.last_seen_server_ms > resumeCandidate.lastSeenMs) {
            resumeCandidate = { sessionId, lastSeenMs: player.last_seen_server_ms };
        }
    }
    if (resumeCandidate) {
        return { kind: "resume", fromSessionId: resumeCandidate.sessionId };
    }
    return { kind: "assign" };
}
export function selectDisconnectedForCleanup(players, nowMs, graceMs) {
    const sessionIds = [];
    for (const [sessionId, player] of players) {
        if (player.connected) {
            continue;
        }
        if (nowMs - player.last_seen_server_ms >= graceMs) {
            sessionIds.push(sessionId);
        }
    }
    return sessionIds;
}
