export const COUNTDOWN_DURATION_MS = 15_000;
export const MATCH_DURATION_MS = 15 * 60 * 1000;
export function assignHostSessionId(currentHostSessionId, joiningSessionId) {
    if (!currentHostSessionId) {
        return joiningSessionId;
    }
    return currentHostSessionId;
}
export function canControlMatchStartStop(hostSessionId, actorSessionId) {
    return Boolean(hostSessionId) && hostSessionId === actorSessionId;
}
export function startCountdown(state, nowMs) {
    if (state.phase !== "LOBBY") {
        return false;
    }
    state.phase = "COUNTDOWN";
    state.countdown_end_ms = nowMs + COUNTDOWN_DURATION_MS;
    state.match_start_ms = 0;
    state.match_end_ms = 0;
    return true;
}
export function cancelCountdown(state) {
    if (state.phase !== "COUNTDOWN") {
        return false;
    }
    state.phase = "LOBBY";
    state.countdown_end_ms = 0;
    state.match_start_ms = 0;
    state.match_end_ms = 0;
    return true;
}
export function applyPhaseTransitions(state, nowMs) {
    if (state.phase === "COUNTDOWN" && state.countdown_end_ms > 0 && nowMs >= state.countdown_end_ms) {
        state.phase = "MATCH";
        state.match_start_ms = nowMs;
        state.match_end_ms = nowMs + MATCH_DURATION_MS;
        state.countdown_end_ms = 0;
        return true;
    }
    if (state.phase === "MATCH" && state.match_end_ms > 0 && nowMs >= state.match_end_ms) {
        state.phase = "RESULTS";
        return true;
    }
    return false;
}
export function phaseLockErrorForGameplay(phase) {
    if (phase !== "MATCH") {
        return "PHASE_LOCKED";
    }
    return null;
}
export function createMatchStatePayload(state, serverMs) {
    return {
        phase: state.phase,
        server_ms: serverMs,
        countdown_end_ms: state.countdown_end_ms,
        match_start_ms: state.match_start_ms,
        match_end_ms: state.match_end_ms,
        host_session_id: state.host_session_id
    };
}
