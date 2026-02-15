import { webSocketToHttpBaseUrl } from "../config";

export interface CreateMatchResponse {
  code: string;
  roomId: string;
}

export interface JoinMatchResponse {
  roomId: string;
}

interface ErrorPayload {
  error?: {
    code?: unknown;
  };
}

export class MatchmakerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

interface MatchmakerRequestOptions {
  inviteKey?: string;
  secret?: string;
}

export async function createMatch(webSocketEndpoint: string, options: MatchmakerRequestOptions = {}): Promise<CreateMatchResponse> {
  const baseUrl = webSocketToHttpBaseUrl(webSocketEndpoint);
  const headers = buildHeaders(options);
  const response = await fetch(`${baseUrl}/match/create`, {
    method: "POST",
    headers
  });
  const json = (await safeJson(response)) as Partial<CreateMatchResponse> & ErrorPayload;

  if (!response.ok) {
    throw fromErrorPayload(json, "Failed to create match.");
  }

  const code = typeof json.code === "string" ? json.code : "";
  const roomId = typeof json.roomId === "string" ? json.roomId : "";
  if (!code || !roomId) {
    throw new MatchmakerError("MATCHMAKER_BAD_RESPONSE", "Invalid create response payload.");
  }

  return { code, roomId };
}

export async function joinMatchByCode(
  webSocketEndpoint: string,
  codeInput: string,
  options: MatchmakerRequestOptions = {}
): Promise<JoinMatchResponse> {
  const code = codeInput.trim().toUpperCase();
  const baseUrl = webSocketToHttpBaseUrl(webSocketEndpoint);
  const headers = buildHeaders(options, true);
  const response = await fetch(`${baseUrl}/match/join`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code })
  });
  const json = (await safeJson(response)) as Partial<JoinMatchResponse> & ErrorPayload;

  if (!response.ok) {
    throw fromErrorPayload(json, "Failed to join match.");
  }

  const roomId = typeof json.roomId === "string" ? json.roomId : "";
  if (!roomId) {
    throw new MatchmakerError("MATCHMAKER_BAD_RESPONSE", "Invalid join response payload.");
  }

  return { roomId };
}

function buildHeaders(options: MatchmakerRequestOptions, includeContentType = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }
  if (options.inviteKey) {
    headers["X-Invite-Key"] = options.inviteKey;
  }
  if (options.secret) {
    headers["X-Matchmaker-Secret"] = options.secret;
  }
  return headers;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function fromErrorPayload(payload: ErrorPayload, fallback: string): MatchmakerError {
  const code = typeof payload.error?.code === "string" ? payload.error.code : "MATCHMAKER_ERROR";
  return new MatchmakerError(code, fallback);
}
