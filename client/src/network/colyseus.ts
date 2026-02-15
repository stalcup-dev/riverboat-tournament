import { Client, Room } from "colyseus.js";

import { resolveCurrentWebSocketEndpoint, sanitizeName } from "../config";
import { getPlayerEntries, type RoomStateSnapshot } from "../types/state";
import { ProtocolSender } from "./protocol";

export interface ConnectOptions {
  roomId: string;
  joinCode?: string;
  serverUrlOverride?: string;
  endpointOverride?: string;
  name: string;
}

export interface MatchConnection {
  client: Client;
  room: Room<RoomStateSnapshot>;
  endpoint: string;
  protocol: ProtocolSender;
}

interface ServerErrorPayload {
  code?: unknown;
  message?: unknown;
}

const IDENTITY_REJECT_CODES = new Set(["NAME_TAKEN", "NAME_INVALID", "RESUME_FAILED"]);
const JOIN_HANDSHAKE_TIMEOUT_MS = 1200;

export class JoinRejectedError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function connectToMatch(options: ConnectOptions): Promise<MatchConnection> {
  const endpoint = options.endpointOverride ?? resolveCurrentWebSocketEndpoint(options.serverUrlOverride);
  const client = new Client(endpoint);
  const room = await client.joinById<RoomStateSnapshot>(options.roomId, {
    join_code: options.joinCode
  });
  const protocol = new ProtocolSender(room);
  const attemptedName = sanitizeName(options.name);

  await validateJoinIdentity(room, protocol, attemptedName);

  return {
    client,
    room,
    endpoint,
    protocol
  };
}

async function validateJoinIdentity(room: Room<RoomStateSnapshot>, protocol: ProtocolSender, attemptedName: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const onStateChange = (state: RoomStateSnapshot) => {
      const localPlayer = getPlayerEntries(state.players).find(([id]) => id === room.sessionId)?.[1];
      if (!localPlayer) {
        return;
      }

      if (localPlayer.name === attemptedName || localPlayer.name !== "Player") {
        finishResolve();
      }
    };

    const onLeave = (code: number, reason?: string) => {
      finishReject(
        new JoinRejectedError("JOIN_FAILED", reason ? `Disconnected during join (${code}): ${reason}` : `Disconnected during join (${code}).`)
      );
    };

    const unsubscribeError = room.onMessage("ERROR", (payload: ServerErrorPayload) => {
      const code = typeof payload?.code === "string" ? payload.code : "";
      if (!IDENTITY_REJECT_CODES.has(code)) {
        return;
      }

      const message = typeof payload?.message === "string" ? payload.message : "Join rejected by server.";
      finishReject(new JoinRejectedError(code, message));
    });

    room.onStateChange(onStateChange);
    room.onLeave(onLeave);

    const timeoutHandle = window.setTimeout(() => {
      finishResolve();
    }, JOIN_HANDSHAKE_TIMEOUT_MS);

    protocol.send("JOIN", {
      name: attemptedName
    });

    function cleanup(): void {
      window.clearTimeout(timeoutHandle);
      room.onStateChange.remove(onStateChange);
      room.onLeave.remove(onLeave);
      if (typeof unsubscribeError === "function") {
        unsubscribeError();
      }
    }

    function finishResolve(): void {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve();
    }

    function finishReject(error: JoinRejectedError): void {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      void room.leave(true).catch(() => {
        // Best-effort cleanup for rejected handshake.
      });
      reject(error);
    }
  });
}
