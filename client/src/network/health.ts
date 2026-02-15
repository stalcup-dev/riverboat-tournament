import { webSocketToHttpBaseUrl } from "../config";

const KEEPALIVE_MIN_INTERVAL_MS = 10 * 60 * 1000;
const KEEPALIVE_MAX_INTERVAL_MS = 12 * 60 * 1000;
const DEFAULT_HEALTHZ_TIMEOUT_MS = 10_000;

export interface WakeServerOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
  requestTimeoutMs?: number;
  onAttempt?: (attempt: number) => void;
}

export function getHealthzUrlFromWebSocketEndpoint(webSocketEndpoint: string): string {
  const baseUrl = webSocketToHttpBaseUrl(webSocketEndpoint).replace(/\/+$/, "");
  return `${baseUrl}/healthz`;
}

export function nextKeepaliveDelayMs(): number {
  return KEEPALIVE_MIN_INTERVAL_MS + Math.floor(Math.random() * (KEEPALIVE_MAX_INTERVAL_MS - KEEPALIVE_MIN_INTERVAL_MS + 1));
}

export async function pingHealthz(healthzUrl: string, requestTimeoutMs = DEFAULT_HEALTHZ_TIMEOUT_MS): Promise<boolean> {
  const response = await fetchWithTimeout(healthzUrl, requestTimeoutMs);
  return response.ok;
}

export async function wakeServer(healthzUrl: string, options: WakeServerOptions = {}): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 12;
  const retryDelayMs = options.retryDelayMs ?? 3000;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_HEALTHZ_TIMEOUT_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    options.onAttempt?.(attempt);
    try {
      const ok = await pingHealthz(healthzUrl, requestTimeoutMs);
      if (ok) {
        return;
      }
    } catch {
      // Wake attempts intentionally retry through transient wake/cold-start errors.
    }

    if (attempt < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }

  throw new Error("Server wake timed out.");
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutHandle);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
