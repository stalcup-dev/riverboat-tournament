const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;
export const DEFAULT_MATCH_CODE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_GENERATION_ATTEMPTS = 256;
const CODE_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
export class MatchCodeRegistry {
    constructor(ttlMs = DEFAULT_MATCH_CODE_TTL_MS) {
        this.entries = new Map();
        this.ttlMs = ttlMs;
    }
    get size() {
        return this.entries.size;
    }
    create(roomId, nowMs = Date.now()) {
        this.cleanupExpired(nowMs);
        for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
            const code = generateCode();
            if (this.entries.has(code)) {
                continue;
            }
            this.entries.set(code, { roomId, createdAtMs: nowMs });
            return { code, roomId, createdAtMs: nowMs };
        }
        throw new Error("Unable to generate unique match code.");
    }
    resolve(rawCode, nowMs = Date.now()) {
        const result = this.lookup(rawCode, nowMs);
        if (result.status !== "ok" || !result.entry) {
            return undefined;
        }
        return result.entry;
    }
    lookup(rawCode, nowMs = Date.now()) {
        const code = normalizeCode(rawCode);
        if (!code) {
            return { status: "invalid" };
        }
        const found = this.entries.get(code);
        if (!found) {
            return { status: "invalid" };
        }
        if (isExpired(found.createdAtMs, nowMs, this.ttlMs)) {
            this.entries.delete(code);
            return { status: "expired" };
        }
        return {
            status: "ok",
            entry: {
                code,
                roomId: found.roomId,
                createdAtMs: found.createdAtMs
            }
        };
    }
    delete(rawCode) {
        const code = normalizeCode(rawCode);
        if (!code) {
            return;
        }
        this.entries.delete(code);
    }
    cleanupExpired(nowMs = Date.now()) {
        let removed = 0;
        for (const [code, entry] of this.entries.entries()) {
            if (!isExpired(entry.createdAtMs, nowMs, this.ttlMs)) {
                continue;
            }
            this.entries.delete(code);
            removed += 1;
        }
        return removed;
    }
}
export function normalizeCode(rawCode) {
    if (!rawCode) {
        return undefined;
    }
    const normalized = rawCode.trim().toUpperCase();
    return CODE_REGEX.test(normalized) ? normalized : undefined;
}
export function generateCode(random = Math.random) {
    let code = "";
    for (let index = 0; index < CODE_LENGTH; index += 1) {
        const charIndex = Math.floor(random() * CODE_ALPHABET.length);
        code += CODE_ALPHABET[charIndex];
    }
    return code;
}
function isExpired(createdAtMs, nowMs, ttlMs) {
    return nowMs - createdAtMs >= ttlMs;
}
