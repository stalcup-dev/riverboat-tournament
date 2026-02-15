import { matchMaker } from "colyseus";
import { normalizeCode } from "../matchmaker/registry.js";
import { setRoomJoinCode } from "../matchmaker/roomCodes.js";
import { isOriginAllowed } from "../security/origin.js";
import { isInviteGateSatisfied } from "../security/invite.js";
import { getOrCreateBucket } from "../security/rateLimiter.js";
const MAX_PLAYERS = 8;
const MAX_BODY_BYTES = 64 * 1024;
const JOIN_IP_BUCKET_CAPACITY = 15;
const JOIN_IP_BUCKET_REFILL_PER_SEC = 1.5;
const CREATE_IP_BUCKET_CAPACITY = 8;
const CREATE_IP_BUCKET_REFILL_PER_SEC = 0.5;
const ipJoinBuckets = new Map();
const ipCreateBuckets = new Map();
export async function tryHandleMatchmaker(req, res, config, registry) {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/match/create") {
        await handleCreate(req, res, config, registry);
        return true;
    }
    if (path === "/match/join") {
        await handleJoin(req, res, config, registry);
        return true;
    }
    if (path === "/lobby/list") {
        await handleLobbyList(req, res, config);
        return true;
    }
    return false;
}
async function handleCreate(req, res, config, registry) {
    if (req.method === "OPTIONS") {
        applyCorsHeaders(res, config.corsOrigin);
        res.statusCode = 204;
        res.end();
        return;
    }
    if (req.method !== "POST") {
        sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED" } }, config.corsOrigin);
        return;
    }
    if (!validateOrigin(req, res, config)) {
        return;
    }
    if (!validateInviteKey(req, res, config)) {
        return;
    }
    if (!allowIpRequest(req, ipCreateBuckets, CREATE_IP_BUCKET_CAPACITY, CREATE_IP_BUCKET_REFILL_PER_SEC)) {
        sendJson(res, 429, { error: { code: "RATE_LIMITED" } }, config.corsOrigin);
        return;
    }
    if (shouldEnforceMatchmakerSecret(config.nodeEnv, config.matchmakerSecret)) {
        const provided = readHeader(req.headers["x-matchmaker-secret"]);
        if (!provided || provided !== config.matchmakerSecret) {
            console.warn("[matchmaker] create result=denied reason=secret_mismatch");
            sendJson(res, 401, { error: { code: "UNAUTHORIZED" } }, config.corsOrigin);
            return;
        }
    }
    try {
        const created = await matchMaker.createRoom("match", {});
        const roomId = typeof created.roomId === "string" ? created.roomId : "";
        if (!roomId) {
            throw new Error("createRoom returned empty roomId");
        }
        const entry = registry.create(roomId);
        setRoomJoinCode(roomId, entry.code, entry.createdAtMs);
        console.info(`[matchmaker] create code=${entry.code} room_id=${roomId} result=ok`);
        sendJson(res, 200, { code: entry.code, roomId }, config.corsOrigin);
    }
    catch (error) {
        console.error(`[matchmaker] create result=error message=${formatError(error)}`);
        sendJson(res, 500, { error: { code: "INTERNAL_ERROR" } }, config.corsOrigin);
    }
}
async function handleJoin(req, res, config, registry) {
    if (req.method === "OPTIONS") {
        applyCorsHeaders(res, config.corsOrigin);
        res.statusCode = 204;
        res.end();
        return;
    }
    if (req.method !== "POST") {
        sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED" } }, config.corsOrigin);
        return;
    }
    if (!validateOrigin(req, res, config)) {
        return;
    }
    if (!validateInviteKey(req, res, config)) {
        return;
    }
    if (!allowIpRequest(req, ipJoinBuckets, JOIN_IP_BUCKET_CAPACITY, JOIN_IP_BUCKET_REFILL_PER_SEC)) {
        sendJson(res, 429, { error: { code: "RATE_LIMITED" } }, config.corsOrigin);
        return;
    }
    let body;
    try {
        body = await readJsonBody(req);
    }
    catch (error) {
        console.info(`[matchmaker] join code=(invalid) result=code_invalid reason=${formatError(error)}`);
        sendJson(res, 400, { error: { code: "CODE_INVALID" } }, config.corsOrigin);
        return;
    }
    const code = normalizeCode(typeof body?.code === "string" ? body.code : undefined);
    if (!code) {
        console.info("[matchmaker] join code=(invalid) result=code_invalid");
        sendJson(res, 400, { error: { code: "CODE_INVALID" } }, config.corsOrigin);
        return;
    }
    const lookup = registry.lookup(code);
    if (lookup.status === "expired") {
        console.info(`[matchmaker] join code=${code} result=code_expired`);
        sendJson(res, 410, { error: { code: "CODE_EXPIRED" } }, config.corsOrigin);
        return;
    }
    if (lookup.status !== "ok" || !lookup.entry) {
        console.info(`[matchmaker] join code=${code} result=code_invalid`);
        sendJson(res, 400, { error: { code: "CODE_INVALID" } }, config.corsOrigin);
        return;
    }
    const entry = lookup.entry;
    const rooms = await matchMaker.query({ roomId: entry.roomId });
    const room = rooms[0];
    if (!room) {
        registry.delete(code);
        console.info(`[matchmaker] join code=${code} room_id=${entry.roomId} result=code_invalid_missing_room`);
        sendJson(res, 400, { error: { code: "CODE_INVALID" } }, config.corsOrigin);
        return;
    }
    const clients = typeof room.clients === "number" ? room.clients : 0;
    const roomMaxClients = typeof room.maxClients === "number" ? room.maxClients : MAX_PLAYERS;
    if (clients >= MAX_PLAYERS || clients >= roomMaxClients) {
        console.info(`[matchmaker] join code=${code} room_id=${entry.roomId} result=room_full clients=${clients}`);
        sendJson(res, 409, { error: { code: "ROOM_FULL" } }, config.corsOrigin);
        return;
    }
    console.info(`[matchmaker] join code=${code} room_id=${entry.roomId} result=ok clients=${clients}`);
    sendJson(res, 200, { roomId: entry.roomId }, config.corsOrigin);
}
async function handleLobbyList(req, res, config) {
    if (req.method === "OPTIONS") {
        applyCorsHeaders(res, config.corsOrigin);
        res.statusCode = 204;
        res.end();
        return;
    }
    if (req.method !== "GET") {
        sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED" } }, config.corsOrigin);
        return;
    }
    if (!validateOrigin(req, res, config)) {
        return;
    }
    if (!validateInviteKey(req, res, config)) {
        return;
    }
    const allMatches = (await matchMaker.query({ name: "match" }));
    const nowMs = Date.now();
    const waiting = allMatches
        .map((row) => {
        const roomId = typeof row.roomId === "string" ? row.roomId : "";
        const players = typeof row.clients === "number" ? row.clients : 0;
        const maxPlayers = typeof row.maxClients === "number" ? row.maxClients : MAX_PLAYERS;
        const metadata = (row.metadata ?? {});
        const status = typeof metadata.status === "string" ? metadata.status : "WAITING";
        const createdAtMs = typeof metadata.createdAtMs === "number" ? metadata.createdAtMs : nowMs;
        const name = typeof metadata.name === "string" && metadata.name.length > 0 ? metadata.name : `Match ${roomId.slice(0, 6)}`;
        return {
            roomId,
            name,
            players,
            maxPlayers,
            age_ms: Math.max(0, nowMs - createdAtMs),
            status
        };
    })
        .filter((row) => row.roomId && row.status === "WAITING")
        .sort((a, b) => a.age_ms - b.age_ms);
    sendJson(res, 200, { rooms: waiting }, config.corsOrigin);
}
async function readJsonBody(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        const asBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += asBuffer.length;
        if (total > MAX_BODY_BYTES) {
            throw new Error("Request body too large");
        }
        chunks.push(asBuffer);
    }
    if (chunks.length === 0) {
        return {};
    }
    const raw = Buffer.concat(chunks).toString("utf-8");
    if (raw.trim().length === 0) {
        return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
        return {};
    }
    return parsed;
}
function sendJson(res, status, payload, corsOrigin) {
    applyCorsHeaders(res, corsOrigin);
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
}
function applyCorsHeaders(res, corsOrigin) {
    if (!corsOrigin) {
        return;
    }
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Matchmaker-Secret, X-Invite-Key");
}
function readHeader(value) {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
}
function getRequestIp(req) {
    const forwarded = readHeader(req.headers["x-forwarded-for"]);
    if (forwarded) {
        const first = forwarded.split(",")[0]?.trim();
        if (first) {
            return first;
        }
    }
    return req.socket.remoteAddress ?? "unknown";
}
function allowIpRequest(req, buckets, capacity, refillPerSecond) {
    const nowMs = Date.now();
    const ip = getRequestIp(req);
    const bucket = getOrCreateBucket(buckets, ip, capacity, refillPerSecond, nowMs);
    return bucket.allow(nowMs, 1);
}
function validateOrigin(req, res, config) {
    const requestOrigin = readHeader(req.headers.origin);
    if (!requestOrigin) {
        return true;
    }
    const allowed = isOriginAllowed({
        allowAny: config.corsAllowAny,
        allowedOrigins: config.corsAllowedOrigins
    }, requestOrigin);
    if (!allowed) {
        sendJson(res, 403, { error: { code: "ORIGIN_FORBIDDEN" } }, config.corsOrigin);
        return false;
    }
    return true;
}
function validateInviteKey(req, res, config) {
    const providedInviteKey = readHeader(req.headers["x-invite-key"]);
    const allowed = isInviteGateSatisfied(config.nodeEnv, config.inviteKey, providedInviteKey);
    if (!allowed) {
        sendJson(res, 403, { error: { code: "INVITE_REQUIRED" } }, config.corsOrigin);
        return false;
    }
    return true;
}
function formatError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
function shouldEnforceMatchmakerSecret(nodeEnv, configuredSecret) {
    if (nodeEnv !== "production") {
        return false;
    }
    const secret = configuredSecret.trim();
    if (!secret || secret === "replace-me") {
        return false;
    }
    return true;
}
