var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import { PlayerState } from "./PlayerState.js";
import { RectState, WoodNodeState, ZoneState } from "./WorldState.js";
export class RoomState extends Schema {
    constructor() {
        super(...arguments);
        this.phase = "LOBBY";
        this.world_width = 2400;
        this.world_height = 1600;
        this.time_remaining_ms = 15 * 60 * 1000;
        this.match_start_ms = 0;
        this.match_end_ms = 0;
        this.countdown_end_ms = 0;
        this.host_session_id = "";
        this.players = new MapSchema();
        this.zones = new ArraySchema();
        this.marina = new RectState();
        this.wood_nodes = new MapSchema();
    }
}
__decorate([
    type("string")
], RoomState.prototype, "phase", void 0);
__decorate([
    type("number")
], RoomState.prototype, "world_width", void 0);
__decorate([
    type("number")
], RoomState.prototype, "world_height", void 0);
__decorate([
    type("number")
], RoomState.prototype, "time_remaining_ms", void 0);
__decorate([
    type("number")
], RoomState.prototype, "match_start_ms", void 0);
__decorate([
    type("number")
], RoomState.prototype, "match_end_ms", void 0);
__decorate([
    type("number")
], RoomState.prototype, "countdown_end_ms", void 0);
__decorate([
    type("string")
], RoomState.prototype, "host_session_id", void 0);
__decorate([
    type({ map: PlayerState })
], RoomState.prototype, "players", void 0);
__decorate([
    type([ZoneState])
], RoomState.prototype, "zones", void 0);
__decorate([
    type(RectState)
], RoomState.prototype, "marina", void 0);
__decorate([
    type({ map: WoodNodeState })
], RoomState.prototype, "wood_nodes", void 0);
