import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

import { PlayerState } from "./PlayerState.js";
import { RectState, WoodNodeState, ZoneState } from "./WorldState.js";

export class RoomState extends Schema {
  @type("string") phase: "LOBBY" | "COUNTDOWN" | "MATCH" | "RESULTS" = "LOBBY";
  @type("number") world_width = 2400;
  @type("number") world_height = 1600;
  @type("number") time_remaining_ms = 15 * 60 * 1000;
  @type("number") match_start_ms = 0;
  @type("number") match_end_ms = 0;
  @type("number") countdown_end_ms = 0;
  @type("string") host_session_id = "";
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([ZoneState]) zones = new ArraySchema<ZoneState>();
  @type(RectState) marina = new RectState();
  @type({ map: WoodNodeState }) wood_nodes = new MapSchema<WoodNodeState>();
}
