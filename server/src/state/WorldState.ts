import { Schema, type } from "@colyseus/schema";

export class RectState extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") w = 0;
  @type("number") h = 0;
}

export class ZoneState extends Schema {
  @type("string") id = "";
  @type("string") kind: "INLAND" | "RIVER" | "MARINA" | "RESTRICTED" | "FOREST" | "WATER" = "INLAND";
  @type("string") shape: "rect" | "poly" = "rect";
  @type(RectState) rect = new RectState();
}

export class WoodNodeState extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("boolean") available = true;
  @type("number") respawn_at_ms = 0;
}
