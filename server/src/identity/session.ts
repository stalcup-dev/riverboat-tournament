export interface IdentityPlayerView {
  name: string;
  connected: boolean;
  last_seen_server_ms: number;
}

export type NameClaimDecision =
  | { kind: "assign" }
  | { kind: "resume"; fromSessionId: string }
  | { kind: "reject"; code: "NAME_TAKEN" };

export function decideNameClaim(
  joiningSessionId: string,
  canonicalName: string,
  players: Iterable<[string, IdentityPlayerView]>
): NameClaimDecision {
  let resumeCandidate: { sessionId: string; lastSeenMs: number } | null = null;

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

export function selectDisconnectedForCleanup(
  players: Iterable<[string, IdentityPlayerView]>,
  nowMs: number,
  graceMs: number
): string[] {
  const sessionIds: string[] = [];

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
