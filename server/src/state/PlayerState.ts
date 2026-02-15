import { Schema, type } from "@colyseus/schema";

export class PlayerStatsState extends Schema {
  @type("number") fish_count = 0;
  @type("number") biggest_weight = 0;
  @type("number") biggest_length = 0;
  @type("number") rarest_rarity = 0;
  @type("number") wood_collected = 0;
}

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "Player";
  @type("boolean") connected = true;
  @type("number") last_seen_server_ms = 0;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") dir: "up" | "down" | "left" | "right" = "down";
  @type("number") wood = 0;
  @type("string") boat_id: "none" | "canoe" = "none";
  @type("string") rod_id = "";
  @type("string") line_id = "";
  @type("string") bait_id = "";
  @type("number") score_total = 0;
  @type("number") suspicion = 0;
  @type("number") fish_lockout_until_ms = 0;
  @type("number") gather_lockout_until_ms = 0;
  @type("string") cast_state: "IDLE" | "CASTING" | "OFFERED" | "COOLDOWN" = "IDLE";
  @type("string") cast_hotspot_id = "";
  @type("string") cast_offer_id = "";
  @type("number") cast_expires_ms = 0;
  @type("number") cast_seq = 0;
  @type("number") best_fish_weight = 0;
  @type("number") best_fish_length = 0;
  @type("string") best_fish_id = "";
  @type("number") best_fish_achieved_ms = 0;
  @type("number") species_caught_count = 0;
  @type("number") species_count_achieved_ms = 0;
  @type("number") points_last_3min = 0;
  @type(PlayerStatsState) stats = new PlayerStatsState();
}
