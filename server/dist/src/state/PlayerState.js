var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Schema, type } from "@colyseus/schema";
export class PlayerStatsState extends Schema {
    constructor() {
        super(...arguments);
        this.fish_count = 0;
        this.biggest_weight = 0;
        this.biggest_length = 0;
        this.rarest_rarity = 0;
        this.wood_collected = 0;
    }
}
__decorate([
    type("number")
], PlayerStatsState.prototype, "fish_count", void 0);
__decorate([
    type("number")
], PlayerStatsState.prototype, "biggest_weight", void 0);
__decorate([
    type("number")
], PlayerStatsState.prototype, "biggest_length", void 0);
__decorate([
    type("number")
], PlayerStatsState.prototype, "rarest_rarity", void 0);
__decorate([
    type("number")
], PlayerStatsState.prototype, "wood_collected", void 0);
export class PlayerState extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.name = "Player";
        this.connected = true;
        this.last_seen_server_ms = 0;
        this.x = 0;
        this.y = 0;
        this.dir = "down";
        this.wood = 0;
        this.boat_id = "none";
        this.rod_id = "";
        this.line_id = "";
        this.bait_id = "";
        this.score_total = 0;
        this.suspicion = 0;
        this.fish_lockout_until_ms = 0;
        this.gather_lockout_until_ms = 0;
        this.cast_state = "IDLE";
        this.cast_hotspot_id = "";
        this.cast_offer_id = "";
        this.cast_expires_ms = 0;
        this.cast_seq = 0;
        this.best_fish_weight = 0;
        this.best_fish_length = 0;
        this.best_fish_id = "";
        this.best_fish_achieved_ms = 0;
        this.species_caught_count = 0;
        this.species_count_achieved_ms = 0;
        this.points_last_3min = 0;
        this.stats = new PlayerStatsState();
    }
}
__decorate([
    type("string")
], PlayerState.prototype, "id", void 0);
__decorate([
    type("string")
], PlayerState.prototype, "name", void 0);
__decorate([
    type("boolean")
], PlayerState.prototype, "connected", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "last_seen_server_ms", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "x", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "y", void 0);
__decorate([
    type("string")
], PlayerState.prototype, "dir", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "wood", void 0);
__decorate([
    type("string")
], PlayerState.prototype, "boat_id", void 0);
__decorate([
    type("string")
], PlayerState.prototype, "rod_id", void 0);
__decorate([
    type("string")
], PlayerState.prototype, "line_id", void 0);
__decorate([
    type("string")
], PlayerState.prototype, "bait_id", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "score_total", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "suspicion", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "fish_lockout_until_ms", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "gather_lockout_until_ms", void 0);
__decorate([
    type("string")
], PlayerState.prototype, "cast_state", void 0);
__decorate([
    type("string")
], PlayerState.prototype, "cast_hotspot_id", void 0);
__decorate([
    type("string")
], PlayerState.prototype, "cast_offer_id", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "cast_expires_ms", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "cast_seq", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "best_fish_weight", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "best_fish_length", void 0);
__decorate([
    type("string")
], PlayerState.prototype, "best_fish_id", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "best_fish_achieved_ms", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "species_caught_count", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "species_count_achieved_ms", void 0);
__decorate([
    type("number")
], PlayerState.prototype, "points_last_3min", void 0);
__decorate([
    type(PlayerStatsState)
], PlayerState.prototype, "stats", void 0);
