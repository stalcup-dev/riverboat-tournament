import type { Room } from "colyseus.js";

import { PROTOCOL_VERSION } from "../config";
import type { RoomStateSnapshot } from "../types/state";

type OutboundPayload = Record<string, unknown>;

export class ProtocolSender {
  private clientSeq = 0;
  private readonly room: Room<RoomStateSnapshot>;

  constructor(room: Room<RoomStateSnapshot>) {
    this.room = room;
  }

  send(type: string, payload?: OutboundPayload): void {
    this.clientSeq += 1;
    this.room.send(type, {
      v: PROTOCOL_VERSION,
      client_seq: this.clientSeq,
      ...(payload ?? {})
    });
  }
}
