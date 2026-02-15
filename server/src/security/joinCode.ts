import { normalizeCode } from "../matchmaker/registry.js";

export function validateRoomJoinCode(options: unknown, expectedCode: string | undefined, isProduction: boolean): "CODE_INVALID" | null {
  if (!isProduction) {
    return null;
  }

  if (!expectedCode) {
    return "CODE_INVALID";
  }

  if (!options || typeof options !== "object") {
    return "CODE_INVALID";
  }

  const providedRaw = (options as { join_code?: unknown }).join_code;
  if (typeof providedRaw !== "string") {
    return "CODE_INVALID";
  }

  const provided = normalizeCode(providedRaw);
  if (!provided || provided !== expectedCode) {
    return "CODE_INVALID";
  }

  return null;
}
