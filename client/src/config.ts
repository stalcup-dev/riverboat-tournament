export const PROTOCOL_VERSION = "0.1.0" as const;
export const DEFAULT_SERVER_PORT = 2567;

const DEV_DEFAULT_SERVER_URL = `http://localhost:${DEFAULT_SERVER_PORT}`;

export interface EndpointResolutionInput {
  envServerUrl?: string;
  isDev: boolean;
  search: string;
  devOverrideUrl?: string;
  allowDevOverride?: boolean;
}

function hasText(value: string | undefined): value is string {
  return Boolean(value && value.trim().length > 0);
}

/**
 * Production requires secure websocket endpoints:
 * - wss://... (already websocket)
 * - https://... (converted to wss://...)
 * Dev allows ws://localhost:2567 and http://localhost:2567.
 */
export function normalizeToWebSocketUrl(rawUrl: string, isDev: boolean): string {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    throw new Error("Server URL cannot be empty.");
  }

  const targetsRender = isRenderDomainUrl(trimmed);

  if (trimmed.startsWith("wss://")) {
    return trimmed;
  }

  if (trimmed.startsWith("https://")) {
    if (targetsRender) {
      throw new Error("Render deployment requires VITE_SERVER_URL to use wss://<service>.onrender.com.");
    }
    return `wss://${trimmed.slice("https://".length)}`;
  }

  if (trimmed.startsWith("ws://")) {
    if (targetsRender) {
      throw new Error("Render deployment requires secure WebSocket URL (wss://...).");
    }
    if (!isDev) {
      throw new Error("Production requires https:// or wss:// for VITE_SERVER_URL.");
    }
    return trimmed;
  }

  if (trimmed.startsWith("http://")) {
    if (targetsRender) {
      throw new Error("Render deployment requires VITE_SERVER_URL to use wss://<service>.onrender.com.");
    }
    if (!isDev) {
      throw new Error("Production requires https:// or wss:// for VITE_SERVER_URL.");
    }
    return `ws://${trimmed.slice("http://".length)}`;
  }

  throw new Error("Server URL must include scheme (http://, https://, ws://, or wss://).");
}

export function webSocketToHttpBaseUrl(webSocketUrl: string): string {
  if (webSocketUrl.startsWith("wss://")) {
    return `https://${webSocketUrl.slice("wss://".length)}`;
  }

  if (webSocketUrl.startsWith("ws://")) {
    return `http://${webSocketUrl.slice("ws://".length)}`;
  }

  throw new Error("WebSocket endpoint must start with ws:// or wss://.");
}

export function shouldEnableDevOverride(isDev: boolean, search: string): boolean {
  if (!isDev) {
    return false;
  }

  const query = new URLSearchParams(search);
  return query.get("dev") === "1";
}

export function resolveWebSocketEndpoint(input: EndpointResolutionInput): string {
  const allowDevOverride = shouldEnableDevOverride(input.allowDevOverride ?? input.isDev, input.search);
  const maybeOverride = allowDevOverride ? input.devOverrideUrl : undefined;
  const baseUrl = hasText(maybeOverride)
    ? maybeOverride.trim()
    : hasText(input.envServerUrl)
      ? input.envServerUrl.trim()
      : input.isDev
        ? DEV_DEFAULT_SERVER_URL
        : undefined;

  if (!baseUrl) {
    throw new Error("Missing VITE_SERVER_URL in production.");
  }

  return normalizeToWebSocketUrl(baseUrl, input.isDev);
}

export function sanitizeName(rawName: string): string {
  const trimmed = rawName.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 24) : "Player";
}

export function isDevMode(): boolean {
  return readViteDevFlag();
}

export function isDevHostOverrideEnabled(): boolean {
  return shouldEnableDevOverride(readStrictViteDevFlag(), window.location.search);
}

export function getDefaultServerUrlForUi(): string {
  const envUrl = readViteServerUrl();
  if (hasText(envUrl)) {
    return envUrl.trim();
  }

  return DEV_DEFAULT_SERVER_URL;
}

export function resolveCurrentWebSocketEndpoint(devOverrideUrl?: string): string {
  return resolveWebSocketEndpoint({
    envServerUrl: readViteServerUrl(),
    isDev: readViteDevFlag(),
    allowDevOverride: readStrictViteDevFlag(),
    search: window.location.search,
    devOverrideUrl
  });
}

export function getMatchmakerInviteKey(): string | undefined {
  const env = readViteEnv();
  const value = env.VITE_INVITE_KEY;
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  return value.trim();
}

export function getMatchmakerSecret(): string | undefined {
  const env = readViteEnv();
  const value = env.VITE_MATCHMAKER_SECRET;
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  return value.trim();
}

function readViteServerUrl(): string | undefined {
  const env = readViteEnv();
  const value = env.VITE_SERVER_URL;
  return typeof value === "string" ? value : undefined;
}

function readViteDevFlag(): boolean {
  const env = readViteEnv();
  const devValue = env.DEV;
  const isViteDev = devValue === true || devValue === "true";
  const isLocalhost = typeof window !== "undefined" && window.location.hostname === "localhost";
  return isViteDev || isLocalhost;
}

function readStrictViteDevFlag(): boolean {
  const env = readViteEnv();
  const devValue = env.DEV;
  return devValue === true || devValue === "true";
}

function readViteEnv(): Record<string, unknown> {
  const meta = import.meta as ImportMeta & { env?: Record<string, unknown> };
  return meta.env ?? {};
}

function isRenderDomainUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.endsWith(".onrender.com");
  } catch {
    return false;
  }
}
