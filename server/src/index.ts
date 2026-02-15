import { createServer } from "node:http";

import { Server } from "colyseus";

import { loadRuntimeConfig } from "./config/env.js";
import { tryHandleHealthz } from "./http/healthz.js";
import { tryHandleMatchmaker } from "./http/matchmaker.js";
import { cleanupExpiredRoomJoinCodes } from "./matchmaker/roomCodes.js";
import { DEFAULT_MATCH_CODE_TTL_MS, MatchCodeRegistry } from "./matchmaker/registry.js";
import { MatchRoom } from "./rooms/MatchRoom.js";
import { isOriginAllowed } from "./security/origin.js";

const config = loadRuntimeConfig();
const codeRegistry = new MatchCodeRegistry();

const httpServer = createServer();
httpServer.on("request", (req, res) => {
  void (async () => {
    if (tryHandleHealthz(req, res, config)) {
      return;
    }

    const handled = await tryHandleMatchmaker(req, res, config, codeRegistry);
    if (handled) {
      return;
    }
  })().catch((error) => {
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR" } }));
    }

    console.error(`[http] route handling error: ${error instanceof Error ? error.message : String(error)}`);
  });
});

httpServer.on("upgrade", (req, socket) => {
  const requestOriginHeader = req.headers.origin;
  const requestOrigin = Array.isArray(requestOriginHeader) ? requestOriginHeader[0] : requestOriginHeader;
  const allowed = isOriginAllowed(
    {
      allowAny: config.corsAllowAny,
      allowedOrigins: config.corsAllowedOrigins
    },
    requestOrigin
  );
  if (allowed) {
    return;
  }

  socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
  socket.destroy();
});

const gameServer = new Server({
  server: httpServer
});

gameServer.define("match", MatchRoom);
void gameServer.listen(config.port, config.host).catch((error) => {
  console.error(`[server] failed to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

setInterval(() => {
  const removed = codeRegistry.cleanupExpired(Date.now());
  const removedRoomCodes = cleanupExpiredRoomJoinCodes(DEFAULT_MATCH_CODE_TTL_MS, Date.now());
  if (removed > 0) {
    console.info(`[matchmaker] cleanup removed=${removed}`);
  }
  if (removedRoomCodes > 0) {
    console.info(`[matchmaker] room_code_cleanup removed=${removedRoomCodes}`);
  }
}, 10 * 60 * 1000).unref();

console.info(
  `[server] starting host=${config.host} port=${config.port} env=${config.nodeEnv} public_ws_url=${
    config.publicWsUrl || "(unset)"
  } cors_origin=${config.corsOrigin || "(none)"}`
);
