import { normalizeCode } from "../matchmaker/registry.js";
export function validateRoomJoinCode(options, expectedCode, isProduction) {
    if (!isProduction) {
        return null;
    }
    if (!expectedCode) {
        return "CODE_INVALID";
    }
    if (!options || typeof options !== "object") {
        return "CODE_INVALID";
    }
    const providedRaw = options.join_code;
    if (typeof providedRaw !== "string") {
        return "CODE_INVALID";
    }
    const provided = normalizeCode(providedRaw);
    if (!provided || provided !== expectedCode) {
        return "CODE_INVALID";
    }
    return null;
}
