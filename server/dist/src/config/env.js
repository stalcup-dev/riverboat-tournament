import { parseOriginPolicy } from "../security/origin.js";
const DEFAULT_PORT = 2567;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_VERSION = "0.1.0";
const DEFAULT_MATCHMAKER_SECRET = "replace-me";
const DEFAULT_INVITE_KEY = "";
function parsePort(raw) {
    const parsed = Number.parseInt(raw ?? "", 10);
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }
    return DEFAULT_PORT;
}
export function loadRuntimeConfig() {
    const port = parsePort(process.env.PORT);
    const host = (process.env.HOST?.trim() || DEFAULT_HOST).trim();
    const nodeEnv = process.env.NODE_ENV ?? "development";
    const originPolicy = parseOriginPolicy(process.env.CORS_ORIGIN, nodeEnv);
    const corsOrigin = originPolicy.allowAny ? "*" : originPolicy.allowedOrigins[0] ?? "";
    const isDev = nodeEnv !== "production";
    const defaultPublicWsUrl = isDev ? `ws://localhost:${port}` : "";
    return {
        port,
        host,
        nodeEnv,
        corsOrigin,
        corsAllowedOrigins: originPolicy.allowedOrigins,
        corsAllowAny: originPolicy.allowAny,
        publicWsUrl: process.env.PUBLIC_WS_URL?.trim() || defaultPublicWsUrl,
        matchmakerSecret: process.env.MATCHMAKER_SECRET?.trim() || DEFAULT_MATCHMAKER_SECRET,
        inviteKey: process.env.INVITE_KEY?.trim() || DEFAULT_INVITE_KEY,
        version: DEFAULT_VERSION
    };
}
