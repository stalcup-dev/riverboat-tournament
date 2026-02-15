import type { IncomingMessage, ServerResponse } from "node:http";

import type { RuntimeConfig } from "../config/env.js";
import { isOriginAllowed } from "../security/origin.js";

function applyCors(req: IncomingMessage, res: ServerResponse, config: RuntimeConfig): void {
  const requestOrigin = readHeader(req.headers.origin);
  if (!requestOrigin) {
    return;
  }

  if (!isOriginAllowed({ allowAny: config.corsAllowAny, allowedOrigins: config.corsAllowedOrigins }, requestOrigin)) {
    return;
  }

  if (config.corsAllowAny) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  if (!value) {
    return;
  }

  return value;
}

export function tryHandleHealthz(req: IncomingMessage, res: ServerResponse, config: RuntimeConfig): boolean {
  const urlPath = (req.url ?? "/").split("?")[0];
  if (urlPath !== "/healthz") {
    return false;
  }

  applyCors(req, res, config);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
    return true;
  }

  const payload = JSON.stringify({
    ok: true,
    version: config.version
  });

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "HEAD") {
    res.end();
  } else {
    res.end(payload);
  }

  return true;
}
