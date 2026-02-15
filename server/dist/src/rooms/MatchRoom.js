import { Room, ServerError } from "colyseus";
import { randomInt } from "node:crypto";
import { beginCast, createBiteOffer } from "../fishing/castState.js";
import { loadFishingDataPack } from "../fishing/data.js";
import { getHotspotRetryAfterMs, HOTSPOT_COOLDOWN_MS_DEFAULT, markHotspotDepleted } from "../fishing/depletion.js";
import { validateCastStart, validateCatchClick } from "../fishing/guards.js";
import { resolveCatchOutcome } from "../fishing/resolver.js";
import { normalizeAllowedName } from "../identity/names.js";
import { decideNameClaim, selectDisconnectedForCleanup } from "../identity/session.js";
import { getRoomJoinCode } from "../matchmaker/roomCodes.js";
import { computeMatchResults } from "../results/awards.js";
import { validateRoomJoinCode } from "../security/joinCode.js";
import { getOrCreateBucket } from "../security/rateLimiter.js";
import { RoomState } from "../state/RoomState.js";
import { PlayerState } from "../state/PlayerState.js";
import { ZoneState } from "../state/WorldState.js";
import { applyGatherWood, chooseSpawnPoint, isInsideZoneKind, validateGatherWood, validateWaterEntry } from "../world/gameplay.js";
import { loadZones } from "../world/zones.js";
import { normalizeMoveIntent, nextDirection } from "./movement.js";
import { applyPhaseTransitions, assignHostSessionId, canControlMatchStartStop, cancelCountdown, createMatchStatePayload, phaseLockErrorForGameplay, startCountdown } from "./phases.js";
import { applyBuildCanoe, validateBuildProgress, validateCastProgress } from "./progression.js";
import { computeCatchGraceMs, parsePingClientTimestamp, shouldProcessPing } from "./timeSync.js";
const MAX_CLIENTS = 8;
const MOVE_SPEED_PER_INTENT = 6;
const SPAWN_FALLBACK_X = 620;
const SPAWN_FALLBACK_Y = 860;
const SPAWN_STEP = 32;
const DISCONNECT_GRACE_MS = 120_000;
const SIMULATION_INTERVAL_MS = 100;
const MATCH_SEED_MAX = 2_147_483_647;
const BITE_OFFER_WINDOW_MS = 1750;
const CATCH_COOLDOWN_MS = 750;
const CATCH_GRACE_MS_DEFAULT = 150;
const LAST_3MIN_MS = 3 * 60 * 1000;
const WATER_ERROR_RATE_LIMIT_MS = 500;
const HOTSPOT_COOLDOWN_MS = HOTSPOT_COOLDOWN_MS_DEFAULT;
const HEARTBEAT_INTERVAL_MS = 5_000;
const RTT_OBSERVED_MAX_MS = 2_000;
const MAX_MESSAGE_BYTES = 2048;
const MOVE_BUCKET_CAPACITY = 25;
const MOVE_BUCKET_REFILL_PER_SEC = 25;
const CAST_BUCKET_CAPACITY = 5;
const CAST_BUCKET_REFILL_PER_SEC = 5;
const CATCH_BUCKET_CAPACITY = 5;
const CATCH_BUCKET_REFILL_PER_SEC = 5;
const JOIN_BUCKET_CAPACITY = 2;
const JOIN_BUCKET_REFILL_PER_SEC = 1;
const RATE_LIMIT_KICK_THRESHOLD = 40;
export class MatchRoom extends Room {
    constructor() {
        super(...arguments);
        this.maxClients = MAX_CLIENTS;
        this.roomCreatedAtMs = Date.now();
        this.lastPingAtBySessionId = new Map();
        this.rttEstimateBySessionId = new Map();
        this.activeFishersByHotspot = new Map();
        this.fishingHotspotsById = new Map();
        this.fishCatalog = [];
        this.scoringConfig = { weight_k: 0.1, length_k: 0.01, rarity_mults: { "1": 1 } };
        this.matchSeed = 1;
        this.spawnPoint = { x: SPAWN_FALLBACK_X, y: SPAWN_FALLBACK_Y };
        this.lastWaterGateErrorAtBySessionId = new Map();
        this.speciesCaughtByPlayerId = new Map();
        this.pointsHistoryByPlayerId = new Map();
        this.depletedUntilByHotspotId = new Map();
        this.moveRateLimitBySession = new Map();
        this.castRateLimitBySession = new Map();
        this.catchRateLimitBySession = new Map();
        this.joinRateLimitBySession = new Map();
        this.rateLimitViolationsBySession = new Map();
        this.lastMatchResults = null;
        this.resultsEmittedForCurrentMatch = false;
    }
    onAuth(_client, options) {
        if (this.clients.length >= MAX_CLIENTS) {
            throw new ServerError(409, "ROOM_FULL");
        }
        const expectedJoinCode = getRoomJoinCode(this.roomId);
        const joinCodeError = validateRoomJoinCode(options, expectedJoinCode, process.env.NODE_ENV === "production");
        if (joinCodeError) {
            throw new ServerError(400, joinCodeError);
        }
        return true;
    }
    onCreate(_options) {
        this.setState(new RoomState());
        this.updateRoomStatusMetadata("WAITING");
        this.initializeWorldFromData();
        this.initializeFishingData();
        console.info(`[room:${this.roomId}] created zones=${this.state.zones.length} hotspots=${this.fishingHotspotsById.size} fish=${this.fishCatalog.length} match_seed=${this.matchSeed}`);
        this.onMessage("JOIN", (client, message) => {
            if (!this.validateInboundEnvelope(client, "JOIN", message)) {
                return;
            }
            if (!this.consumeRateLimit(client, this.joinRateLimitBySession, JOIN_BUCKET_CAPACITY, JOIN_BUCKET_REFILL_PER_SEC, "JOIN")) {
                return;
            }
            const nowMs = Date.now();
            const canonicalName = normalizeAllowedName(message?.name);
            if (!canonicalName) {
                this.rejectJoinAttempt(client, {
                    code: "NAME_INVALID",
                    message: "Name is not in the allowlist."
                });
                return;
            }
            const player = this.state.players.get(client.sessionId);
            if (!player) {
                return;
            }
            const decision = decideNameClaim(client.sessionId, canonicalName, this.state.players);
            if (decision.kind === "reject") {
                this.rejectJoinAttempt(client, {
                    code: decision.code,
                    message: "Name is already active in this room."
                });
                return;
            }
            if (decision.kind === "resume") {
                const resumePlayer = this.state.players.get(decision.fromSessionId);
                if (!resumePlayer) {
                    this.rejectJoinAttempt(client, {
                        code: "RESUME_FAILED",
                        message: "Could not resume disconnected player state."
                    });
                    return;
                }
                this.state.players.delete(client.sessionId);
                this.state.players.delete(decision.fromSessionId);
                resumePlayer.id = client.sessionId;
                resumePlayer.name = canonicalName;
                resumePlayer.connected = true;
                resumePlayer.last_seen_server_ms = nowMs;
                this.state.players.set(client.sessionId, resumePlayer);
                this.rebindPlayerRuntimeState(decision.fromSessionId, client.sessionId);
                console.info(`[room:${this.roomId}] resume name=${canonicalName} old_session_id=${decision.fromSessionId} new_session_id=${client.sessionId}`);
                return;
            }
            player.name = canonicalName;
            player.connected = true;
            player.last_seen_server_ms = nowMs;
        });
        this.onMessage("MOVE", (client, message) => {
            if (!this.validateInboundEnvelope(client, "MOVE", message)) {
                return;
            }
            if (!this.consumeRateLimit(client, this.moveRateLimitBySession, MOVE_BUCKET_CAPACITY, MOVE_BUCKET_REFILL_PER_SEC, "MOVE")) {
                return;
            }
            if ((message.dx !== undefined && (typeof message.dx !== "number" || !Number.isFinite(message.dx))) ||
                (message.dy !== undefined && (typeof message.dy !== "number" || !Number.isFinite(message.dy)))) {
                this.sendError(client, {
                    code: "ERR_PAYLOAD",
                    message: "MOVE requires numeric dx/dy."
                });
                return;
            }
            const player = this.state.players.get(client.sessionId);
            if (!player) {
                return;
            }
            const phaseLockCode = phaseLockErrorForGameplay(this.state.phase);
            if (phaseLockCode) {
                this.sendError(client, {
                    code: phaseLockCode,
                    message: "Action is blocked in current phase."
                });
                return;
            }
            player.last_seen_server_ms = Date.now();
            const intent = normalizeMoveIntent(message);
            const nextX = Math.max(0, Math.min(this.state.world_width, player.x + intent.dx * MOVE_SPEED_PER_INTENT));
            const nextY = Math.max(0, Math.min(this.state.world_height, player.y + intent.dy * MOVE_SPEED_PER_INTENT));
            const zones = Array.from(this.state.zones);
            const waterGate = validateWaterEntry({
                zones,
                nextX,
                nextY,
                boatId: player.boat_id
            });
            if (!waterGate.ok) {
                const nowMs = Date.now();
                const lastErrorAt = this.lastWaterGateErrorAtBySessionId.get(client.sessionId) ?? 0;
                if (nowMs - lastErrorAt >= WATER_ERROR_RATE_LIMIT_MS) {
                    this.sendError(client, {
                        code: waterGate.code,
                        message: "Craft a canoe before entering water."
                    });
                    this.lastWaterGateErrorAtBySessionId.set(client.sessionId, nowMs);
                }
                return;
            }
            player.x = nextX;
            player.y = nextY;
            player.dir = nextDirection(player.dir, intent);
        });
        this.onMessage("GATHER_WOOD", (client, _message) => {
            if (!this.validateInboundEnvelope(client, "GATHER_WOOD", _message)) {
                return;
            }
            const player = this.state.players.get(client.sessionId);
            if (!player) {
                return;
            }
            const phaseLockCode = phaseLockErrorForGameplay(this.state.phase);
            if (phaseLockCode) {
                this.sendError(client, {
                    code: phaseLockCode,
                    message: "Action is blocked in current phase."
                });
                return;
            }
            const nowMs = Date.now();
            const inForest = isInsideZoneKind(Array.from(this.state.zones), "FOREST", player.x, player.y);
            const gatherError = validateGatherWood({
                nowMs,
                gatherLockoutUntilMs: player.gather_lockout_until_ms,
                inForest
            });
            if (gatherError === "NOT_IN_FOREST") {
                this.sendError(client, {
                    code: "NOT_IN_FOREST",
                    message: "Gathering wood requires being inside the forest."
                });
                return;
            }
            if (gatherError === "GATHER_COOLDOWN") {
                this.sendError(client, {
                    code: "GATHER_COOLDOWN",
                    message: "Gather action is on cooldown.",
                    retry_after_ms: Math.max(0, player.gather_lockout_until_ms - nowMs)
                });
                return;
            }
            applyGatherWood(player, nowMs);
        });
        this.onMessage("BUILD_CANOE", (client, message) => {
            if (!this.validateInboundEnvelope(client, "BUILD_CANOE", message)) {
                return;
            }
            const player = this.state.players.get(client.sessionId);
            if (!player) {
                return;
            }
            const phaseLockCode = phaseLockErrorForGameplay(this.state.phase);
            if (phaseLockCode) {
                this.sendError(client, {
                    code: phaseLockCode,
                    message: "Action is blocked in current phase."
                });
                return;
            }
            player.last_seen_server_ms = Date.now();
            if (player.boat_id === "canoe") {
                return;
            }
            const buildError = validateBuildProgress(player, this.state.marina);
            if (buildError) {
                this.sendError(client, {
                    code: buildError.code,
                    message: buildError.message,
                    need: buildError.need,
                    have: buildError.have
                });
                return;
            }
            applyBuildCanoe(player);
        });
        this.onMessage("CAST_START", (client, message) => {
            if (!this.validateInboundEnvelope(client, "CAST_START", message)) {
                return;
            }
            if (!this.consumeRateLimit(client, this.castRateLimitBySession, CAST_BUCKET_CAPACITY, CAST_BUCKET_REFILL_PER_SEC, "CAST_START")) {
                return;
            }
            const player = this.state.players.get(client.sessionId);
            if (!player) {
                return;
            }
            const phaseLockCode = phaseLockErrorForGameplay(this.state.phase);
            if (phaseLockCode) {
                this.sendError(client, {
                    code: phaseLockCode,
                    message: "Action is blocked in current phase."
                });
                return;
            }
            const nowMs = Date.now();
            player.last_seen_server_ms = nowMs;
            const progressionError = validateCastProgress(player);
            if (progressionError) {
                this.sendError(client, progressionError);
                return;
            }
            const hotspotId = typeof message?.hotspot_id === "string" ? message.hotspot_id : "";
            const hotspotExists = this.fishingHotspotsById.has(hotspotId);
            const castError = validateCastStart({
                nowMs,
                fishLockoutUntilMs: player.fish_lockout_until_ms,
                hotspotExists
            });
            if (castError) {
                this.sendFishingError(client, castError);
                return;
            }
            const retryAfterMs = getHotspotRetryAfterMs(this.depletedUntilByHotspotId, hotspotId, nowMs);
            if (retryAfterMs > 0) {
                this.sendError(client, {
                    code: "HOTSPOT_DEPLETED",
                    message: "Hotspot is depleted. Try another area.",
                    retry_after_ms: retryAfterMs
                });
                return;
            }
            if (player.cast_state !== "IDLE") {
                this.sendFishingError(client, "NO_ACTIVE_CAST");
                return;
            }
            beginCast(player, hotspotId);
        });
        this.onMessage("CATCH_CLICK", (client, message) => {
            if (!this.validateInboundEnvelope(client, "CATCH_CLICK", message)) {
                return;
            }
            if (!this.consumeRateLimit(client, this.catchRateLimitBySession, CATCH_BUCKET_CAPACITY, CATCH_BUCKET_REFILL_PER_SEC, "CATCH_CLICK")) {
                return;
            }
            const player = this.state.players.get(client.sessionId);
            if (!player) {
                return;
            }
            const phaseLockCode = phaseLockErrorForGameplay(this.state.phase);
            if (phaseLockCode) {
                this.sendError(client, {
                    code: phaseLockCode,
                    message: "Action is blocked in current phase."
                });
                return;
            }
            const nowMs = Date.now();
            player.last_seen_server_ms = nowMs;
            const offerId = typeof message?.offer_id === "string" ? message.offer_id : "";
            const catchError = validateCatchClick({
                nowMs,
                fishLockoutUntilMs: player.fish_lockout_until_ms,
                castState: player.cast_state,
                activeOfferId: player.cast_offer_id,
                requestedOfferId: offerId,
                offerExpiresMs: player.cast_expires_ms,
                graceMs: this.getCatchGraceMs(client.sessionId)
            });
            if (catchError) {
                if (catchError === "OFFER_EXPIRED" && player.cast_state === "OFFERED") {
                    this.beginCastCooldown(player, nowMs, true);
                }
                this.sendFishingError(client, catchError);
                return;
            }
            const hotspotId = player.cast_hotspot_id;
            if (!hotspotId || !this.fishingHotspotsById.has(hotspotId)) {
                this.beginCastCooldown(player, nowMs, false);
                this.sendFishingError(client, "INVALID_HOTSPOT");
                return;
            }
            const outcome = resolveCatchOutcome({
                matchSeed: this.matchSeed,
                playerId: player.id,
                castSeq: player.cast_seq,
                hotspotId,
                fishCatalog: this.fishCatalog,
                scoring: this.scoringConfig
            });
            player.score_total += outcome.points_delta;
            player.stats.fish_count += 1;
            player.stats.biggest_weight = Math.max(player.stats.biggest_weight, outcome.weight);
            player.stats.biggest_length = Math.max(player.stats.biggest_length, outcome.length);
            player.stats.rarest_rarity = Math.max(player.stats.rarest_rarity, outcome.rarity_tier);
            if (outcome.weight > player.best_fish_weight) {
                player.best_fish_weight = outcome.weight;
                player.best_fish_length = outcome.length;
                player.best_fish_id = outcome.fish_id;
                player.best_fish_achieved_ms = nowMs;
            }
            else if (outcome.weight === player.best_fish_weight && outcome.length > player.best_fish_length) {
                player.best_fish_length = outcome.length;
                player.best_fish_id = outcome.fish_id;
                player.best_fish_achieved_ms = nowMs;
            }
            const speciesCountChanged = this.recordSpeciesCatch(player.id, outcome.fish_id);
            const speciesCaughtCount = this.getSpeciesCaughtCount(player.id);
            player.species_caught_count = speciesCaughtCount;
            if (speciesCountChanged) {
                player.species_count_achieved_ms = nowMs;
            }
            player.points_last_3min = this.recordPointsAndComputeLast3Min(player.id, nowMs, outcome.points_delta);
            this.broadcast("CATCH_RESULT", {
                offer_id: offerId,
                player_id: player.id,
                success: true,
                fish_id: outcome.fish_id,
                weight: outcome.weight,
                length: outcome.length,
                points_delta: outcome.points_delta
            });
            markHotspotDepleted(this.depletedUntilByHotspotId, hotspotId, nowMs, HOTSPOT_COOLDOWN_MS);
            this.beginCastCooldown(player, nowMs, false);
        });
        this.onMessage("HOST_START_MATCH", (client, _message) => {
            if (!this.validateInboundEnvelope(client, "HOST_START_MATCH", _message)) {
                return;
            }
            const nowMs = Date.now();
            if (!canControlMatchStartStop(this.state.host_session_id, client.sessionId)) {
                this.sendError(client, {
                    code: "ERR_NOT_HOST",
                    message: "Only host can start match."
                });
                return;
            }
            const started = startCountdown(this.state, nowMs);
            if (!started) {
                this.sendError(client, {
                    code: "ERR_PHASE",
                    message: "Match can only be started from lobby."
                });
                return;
            }
            this.updateRoomStatusMetadata("WAITING");
            this.emitMatchState();
        });
        this.onMessage("HOST_CANCEL_COUNTDOWN", (client, _message) => {
            if (!this.validateInboundEnvelope(client, "HOST_CANCEL_COUNTDOWN", _message)) {
                return;
            }
            if (!canControlMatchStartStop(this.state.host_session_id, client.sessionId)) {
                this.sendError(client, {
                    code: "ERR_NOT_HOST",
                    message: "Only host can cancel countdown."
                });
                return;
            }
            const cancelled = cancelCountdown(this.state);
            if (!cancelled) {
                this.sendError(client, {
                    code: "ERR_PHASE",
                    message: "Countdown is not active."
                });
                return;
            }
            this.updateRoomStatusMetadata("WAITING");
            this.emitMatchState();
        });
        this.onMessage("PING", (client, message) => {
            if (!this.validateInboundEnvelope(client, "PING", message)) {
                return;
            }
            const nowMs = Date.now();
            const lastPingAtMs = this.lastPingAtBySessionId.get(client.sessionId);
            if (!shouldProcessPing(lastPingAtMs, nowMs)) {
                return;
            }
            const t0ClientMs = parsePingClientTimestamp(message);
            if (t0ClientMs === null) {
                return;
            }
            this.lastPingAtBySessionId.set(client.sessionId, nowMs);
            const observedRttMs = nowMs - t0ClientMs;
            if (Number.isFinite(observedRttMs) && observedRttMs >= 0 && observedRttMs <= RTT_OBSERVED_MAX_MS) {
                const previousRtt = this.rttEstimateBySessionId.get(client.sessionId);
                const smoothedRtt = previousRtt === undefined ? observedRttMs : previousRtt * 0.7 + observedRttMs * 0.3;
                this.rttEstimateBySessionId.set(client.sessionId, smoothedRtt);
            }
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.last_seen_server_ms = nowMs;
            }
            client.send("PONG", {
                t0_client_ms: t0ClientMs,
                server_ms: nowMs
            });
        });
        this.clock.setInterval(() => {
            this.broadcast("SERVER_HEARTBEAT", {
                server_ms: Date.now(),
                phase: this.state.phase
            });
        }, HEARTBEAT_INTERVAL_MS);
        this.setSimulationInterval(() => {
            const nowMs = Date.now();
            this.processFishingTick(nowMs);
            this.processPhaseTick(nowMs);
            this.cleanupDisconnectedPlayers(nowMs);
        }, SIMULATION_INTERVAL_MS);
    }
    onJoin(client, _options) {
        const spawnIndex = this.clients.length - 1;
        const spawnX = Math.max(0, Math.min(this.state.world_width, this.spawnPoint.x + spawnIndex * SPAWN_STEP));
        const spawnY = this.spawnPoint.y;
        const player = new PlayerState();
        player.id = client.sessionId;
        player.x = spawnX;
        player.y = spawnY;
        player.dir = "down";
        player.wood = 0;
        player.boat_id = "none";
        player.score_total = 0;
        player.suspicion = 0;
        player.fish_lockout_until_ms = 0;
        player.cast_state = "IDLE";
        player.cast_hotspot_id = "";
        player.cast_offer_id = "";
        player.cast_expires_ms = 0;
        player.cast_seq = 0;
        player.best_fish_weight = 0;
        player.best_fish_length = 0;
        player.best_fish_id = "";
        player.best_fish_achieved_ms = 0;
        player.species_caught_count = 0;
        player.species_count_achieved_ms = 0;
        player.points_last_3min = 0;
        player.connected = true;
        player.last_seen_server_ms = Date.now();
        this.state.host_session_id = assignHostSessionId(this.state.host_session_id, client.sessionId);
        this.state.players.set(client.sessionId, player);
        this.initializePlayerRuntimeState(client.sessionId);
        console.info(`[room:${this.roomId}] join session_id=${client.sessionId} clients=${this.clients.length}`);
        this.emitMatchState();
        this.scheduleMatchStateReliabilityEmits();
        if (this.state.phase === "RESULTS" && this.lastMatchResults) {
            client.send("MATCH_RESULTS", this.lastMatchResults);
        }
    }
    onLeave(client, _consented) {
        const player = this.state.players.get(client.sessionId);
        if (!player) {
            return;
        }
        player.connected = false;
        player.last_seen_server_ms = Date.now();
        this.resetCastState(player);
        this.lastPingAtBySessionId.delete(client.sessionId);
        this.rttEstimateBySessionId.delete(client.sessionId);
        this.moveRateLimitBySession.delete(client.sessionId);
        this.castRateLimitBySession.delete(client.sessionId);
        this.catchRateLimitBySession.delete(client.sessionId);
        this.joinRateLimitBySession.delete(client.sessionId);
        this.rateLimitViolationsBySession.delete(client.sessionId);
        console.info(`[room:${this.roomId}] leave session_id=${client.sessionId} clients=${this.clients.length} grace_ms=${DISCONNECT_GRACE_MS}`);
    }
    initializeWorldFromData() {
        const loadedZones = loadZones();
        this.state.world_width = loadedZones.world.width;
        this.state.world_height = loadedZones.world.height;
        this.state.zones.clear();
        for (const zone of loadedZones.zones) {
            if (zone.shape !== "rect" || !zone.rect) {
                continue;
            }
            const nextZone = new ZoneState();
            nextZone.id = zone.id;
            nextZone.kind = zone.kind;
            nextZone.shape = zone.shape;
            nextZone.rect.x = zone.rect.x;
            nextZone.rect.y = zone.rect.y;
            nextZone.rect.w = zone.rect.w;
            nextZone.rect.h = zone.rect.h;
            this.state.zones.push(nextZone);
        }
        this.spawnPoint = chooseSpawnPoint(Array.from(this.state.zones), { x: SPAWN_FALLBACK_X, y: SPAWN_FALLBACK_Y });
        this.state.marina.x = loadedZones.marina.x;
        this.state.marina.y = loadedZones.marina.y;
        this.state.marina.w = loadedZones.marina.w;
        this.state.marina.h = loadedZones.marina.h;
    }
    initializeFishingData() {
        const pack = loadFishingDataPack();
        this.fishingHotspotsById = pack.hotspotsById;
        this.fishCatalog = pack.fish;
        this.scoringConfig = pack.scoring;
        this.matchSeed = randomInt(1, MATCH_SEED_MAX);
    }
    processFishingTick(nowMs) {
        if (this.state.phase !== "MATCH") {
            this.state.players.forEach((player) => {
                if (player.cast_state !== "IDLE") {
                    this.resetCastState(player);
                }
            });
            this.activeFishersByHotspot.clear();
            return;
        }
        this.state.players.forEach((player) => {
            if (!player.connected) {
                return;
            }
            if (player.cast_state === "CASTING") {
                this.issueBiteOffer(player, nowMs);
                return;
            }
            if (player.cast_state === "OFFERED") {
                const graceMs = this.getCatchGraceMs(player.id);
                if (nowMs > player.cast_expires_ms + graceMs) {
                    this.beginCastCooldown(player, nowMs, true);
                }
                return;
            }
            if (player.cast_state === "COOLDOWN" && nowMs >= player.cast_expires_ms) {
                this.resetCastState(player);
            }
        });
        this.recomputeActiveFishers();
    }
    processPhaseTick(nowMs) {
        if (this.state.phase === "MATCH") {
            this.state.time_remaining_ms = Math.max(0, this.state.match_end_ms - nowMs);
        }
        else if (this.state.phase === "COUNTDOWN") {
            this.state.time_remaining_ms = Math.max(0, this.state.countdown_end_ms - nowMs);
        }
        const changed = applyPhaseTransitions(this.state, nowMs);
        if (!changed) {
            return;
        }
        if (this.state.phase === "MATCH") {
            this.state.time_remaining_ms = Math.max(0, this.state.match_end_ms - nowMs);
            this.resultsEmittedForCurrentMatch = false;
            this.lastMatchResults = null;
            this.depletedUntilByHotspotId.clear();
            this.updateRoomStatusMetadata("IN_PROGRESS");
        }
        else if (this.state.phase === "RESULTS") {
            this.state.time_remaining_ms = 0;
            this.emitMatchResultsIfNeeded();
            this.updateRoomStatusMetadata("IN_PROGRESS");
        }
        else {
            this.updateRoomStatusMetadata("WAITING");
        }
        this.emitMatchState();
    }
    issueBiteOffer(player, nowMs) {
        if (!player.cast_hotspot_id || !this.fishingHotspotsById.has(player.cast_hotspot_id)) {
            this.resetCastState(player);
            return;
        }
        const offer = createBiteOffer(player, nowMs, BITE_OFFER_WINDOW_MS);
        if (!offer) {
            this.resetCastState(player);
            return;
        }
        const client = this.clients.find((candidate) => candidate.sessionId === player.id);
        if (!client) {
            return;
        }
        client.send("BITE_OFFER", offer);
    }
    beginCastCooldown(player, nowMs, keepOfferId) {
        player.cast_state = "COOLDOWN";
        player.cast_expires_ms = nowMs + CATCH_COOLDOWN_MS;
        if (!keepOfferId) {
            player.cast_offer_id = "";
        }
    }
    resetCastState(player) {
        player.cast_state = "IDLE";
        player.cast_hotspot_id = "";
        player.cast_offer_id = "";
        player.cast_expires_ms = 0;
    }
    recomputeActiveFishers() {
        this.activeFishersByHotspot.clear();
        this.state.players.forEach((player) => {
            if (!player.connected) {
                return;
            }
            if ((player.cast_state === "CASTING" || player.cast_state === "OFFERED") && player.cast_hotspot_id) {
                const previous = this.activeFishersByHotspot.get(player.cast_hotspot_id) ?? 0;
                this.activeFishersByHotspot.set(player.cast_hotspot_id, previous + 1);
            }
        });
    }
    getCatchGraceMs(sessionId) {
        const rttMs = this.rttEstimateBySessionId.get(sessionId);
        return computeCatchGraceMs(rttMs, CATCH_GRACE_MS_DEFAULT);
    }
    sendError(client, payload) {
        client.send("ERROR", payload);
    }
    sendFishingError(client, code) {
        this.sendError(client, {
            code,
            message: this.getFishingErrorMessage(code)
        });
    }
    getFishingErrorMessage(code) {
        switch (code) {
            case "INVALID_HOTSPOT":
                return "Hotspot id is invalid.";
            case "NO_ACTIVE_CAST":
                return "No active cast/offer for this action.";
            case "OFFER_EXPIRED":
                return "Catch offer expired.";
            case "LOCKED_OUT":
                return "Fishing is temporarily locked.";
            default:
                return "Fishing action failed.";
        }
    }
    rejectJoinAttempt(client, payload) {
        this.sendError(client, payload);
        this.state.players.delete(client.sessionId);
        this.lastPingAtBySessionId.delete(client.sessionId);
        client.leave(4000);
    }
    cleanupDisconnectedPlayers(nowMs) {
        const staleSessionIds = selectDisconnectedForCleanup(this.state.players, nowMs, DISCONNECT_GRACE_MS);
        if (staleSessionIds.length === 0) {
            return;
        }
        staleSessionIds.forEach((sessionId) => {
            const player = this.state.players.get(sessionId);
            if (player) {
                this.resetCastState(player);
            }
            this.state.players.delete(sessionId);
            this.speciesCaughtByPlayerId.delete(sessionId);
            this.pointsHistoryByPlayerId.delete(sessionId);
            this.rttEstimateBySessionId.delete(sessionId);
            this.moveRateLimitBySession.delete(sessionId);
            this.castRateLimitBySession.delete(sessionId);
            this.catchRateLimitBySession.delete(sessionId);
            this.joinRateLimitBySession.delete(sessionId);
            this.rateLimitViolationsBySession.delete(sessionId);
        });
        console.info(`[room:${this.roomId}] cleanup_disconnected removed=${staleSessionIds.length}`);
    }
    initializePlayerRuntimeState(sessionId) {
        if (!this.speciesCaughtByPlayerId.has(sessionId)) {
            this.speciesCaughtByPlayerId.set(sessionId, new Set());
        }
        if (!this.pointsHistoryByPlayerId.has(sessionId)) {
            this.pointsHistoryByPlayerId.set(sessionId, []);
        }
    }
    rebindPlayerRuntimeState(previousSessionId, nextSessionId) {
        const species = this.speciesCaughtByPlayerId.get(previousSessionId);
        this.speciesCaughtByPlayerId.delete(previousSessionId);
        this.speciesCaughtByPlayerId.set(nextSessionId, species ?? new Set());
        const pointsHistory = this.pointsHistoryByPlayerId.get(previousSessionId);
        this.pointsHistoryByPlayerId.delete(previousSessionId);
        this.pointsHistoryByPlayerId.set(nextSessionId, pointsHistory ?? []);
        const rtt = this.rttEstimateBySessionId.get(previousSessionId);
        this.rttEstimateBySessionId.delete(previousSessionId);
        if (rtt !== undefined) {
            this.rttEstimateBySessionId.set(nextSessionId, rtt);
        }
    }
    recordSpeciesCatch(playerId, fishId) {
        const species = this.speciesCaughtByPlayerId.get(playerId) ?? new Set();
        const countBefore = species.size;
        species.add(fishId);
        this.speciesCaughtByPlayerId.set(playerId, species);
        return species.size > countBefore;
    }
    getSpeciesCaughtCount(playerId) {
        return this.speciesCaughtByPlayerId.get(playerId)?.size ?? 0;
    }
    recordPointsAndComputeLast3Min(playerId, nowMs, pointsDelta) {
        const thresholdMs = nowMs - LAST_3MIN_MS;
        const events = this.pointsHistoryByPlayerId.get(playerId) ?? [];
        events.push({ atMs: nowMs, points: pointsDelta });
        const trimmed = events.filter((event) => event.atMs >= thresholdMs);
        this.pointsHistoryByPlayerId.set(playerId, trimmed);
        return trimmed.reduce((sum, event) => sum + event.points, 0);
    }
    validateInboundEnvelope(client, eventName, payload) {
        const payloadBytes = this.estimatePayloadBytes(payload);
        if (payloadBytes > MAX_MESSAGE_BYTES) {
            this.sendError(client, {
                code: "ERR_PAYLOAD_TOO_LARGE",
                message: "Message payload is too large."
            });
            this.registerRateViolation(client, `${eventName}:payload_too_large`);
            return false;
        }
        if (!payload || typeof payload !== "object") {
            this.sendError(client, {
                code: "ERR_PAYLOAD",
                message: "Message payload is invalid."
            });
            this.registerRateViolation(client, `${eventName}:invalid_payload`);
            return false;
        }
        const envelope = payload;
        if (envelope.v !== "0.1.0" || typeof envelope.client_seq !== "number" || !Number.isFinite(envelope.client_seq)) {
            this.sendError(client, {
                code: "ERR_PAYLOAD",
                message: "Invalid protocol envelope."
            });
            this.registerRateViolation(client, `${eventName}:invalid_envelope`);
            return false;
        }
        return true;
    }
    estimatePayloadBytes(payload) {
        try {
            return Buffer.byteLength(JSON.stringify(payload ?? null), "utf-8");
        }
        catch {
            return MAX_MESSAGE_BYTES + 1;
        }
    }
    consumeRateLimit(client, buckets, capacity, refillPerSecond, eventName) {
        const nowMs = Date.now();
        const bucket = getOrCreateBucket(buckets, client.sessionId, capacity, refillPerSecond, nowMs);
        if (bucket.allow(nowMs, 1)) {
            return true;
        }
        this.registerRateViolation(client, `${eventName}:rate_limited`);
        return false;
    }
    registerRateViolation(client, reason) {
        const nextCount = (this.rateLimitViolationsBySession.get(client.sessionId) ?? 0) + 1;
        this.rateLimitViolationsBySession.set(client.sessionId, nextCount);
        if (nextCount % 10 === 0) {
            console.warn(`[room:${this.roomId}] rate_violation session_id=${client.sessionId} count=${nextCount} reason=${reason}`);
        }
        if (nextCount < RATE_LIMIT_KICK_THRESHOLD) {
            return;
        }
        console.warn(`[room:${this.roomId}] kick session_id=${client.sessionId} reason=rate_limit_abuse count=${nextCount}`);
        this.sendError(client, {
            code: "RATE_LIMITED",
            message: "Too many messages."
        });
        client.leave(4008);
    }
    emitMatchResultsIfNeeded() {
        if (this.resultsEmittedForCurrentMatch) {
            return;
        }
        const resultPlayers = [];
        this.state.players.forEach((player) => {
            resultPlayers.push({
                name: player.name,
                score_total: player.score_total,
                best_fish_weight: player.best_fish_weight,
                best_fish_length: player.best_fish_length,
                best_fish_id: player.best_fish_id,
                best_fish_achieved_ms: player.best_fish_achieved_ms,
                species_caught_count: player.species_caught_count,
                species_count_achieved_ms: player.species_count_achieved_ms
            });
        });
        this.lastMatchResults = computeMatchResults(resultPlayers, this.state.match_end_ms);
        this.resultsEmittedForCurrentMatch = true;
        this.broadcast("MATCH_RESULTS", this.lastMatchResults);
    }
    emitMatchState(targetClient) {
        const payload = createMatchStatePayload(this.state, Date.now());
        console.log("[MATCH_STATE]", {
            phase: payload.phase,
            host_session_id: payload.host_session_id,
            clients: this.clients.length
        });
        if (targetClient) {
            targetClient.send("MATCH_STATE", payload);
            return;
        }
        this.broadcast("MATCH_STATE", payload);
    }
    scheduleMatchStateReliabilityEmits() {
        this.clock.setTimeout(() => {
            this.emitMatchState();
        }, 250);
        this.clock.setTimeout(() => {
            this.emitMatchState();
        }, 1000);
    }
    updateRoomStatusMetadata(status) {
        this.setMetadata({
            status,
            createdAtMs: this.roomCreatedAtMs,
            name: `Match ${this.roomId.slice(0, 6)}`
        });
    }
}
