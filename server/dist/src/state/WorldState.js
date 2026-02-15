var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Schema, type } from "@colyseus/schema";
export class RectState extends Schema {
    constructor() {
        super(...arguments);
        this.x = 0;
        this.y = 0;
        this.w = 0;
        this.h = 0;
    }
}
__decorate([
    type("number")
], RectState.prototype, "x", void 0);
__decorate([
    type("number")
], RectState.prototype, "y", void 0);
__decorate([
    type("number")
], RectState.prototype, "w", void 0);
__decorate([
    type("number")
], RectState.prototype, "h", void 0);
export class ZoneState extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.kind = "INLAND";
        this.shape = "rect";
        this.rect = new RectState();
    }
}
__decorate([
    type("string")
], ZoneState.prototype, "id", void 0);
__decorate([
    type("string")
], ZoneState.prototype, "kind", void 0);
__decorate([
    type("string")
], ZoneState.prototype, "shape", void 0);
__decorate([
    type(RectState)
], ZoneState.prototype, "rect", void 0);
export class WoodNodeState extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.x = 0;
        this.y = 0;
        this.available = true;
        this.respawn_at_ms = 0;
    }
}
__decorate([
    type("string")
], WoodNodeState.prototype, "id", void 0);
__decorate([
    type("number")
], WoodNodeState.prototype, "x", void 0);
__decorate([
    type("number")
], WoodNodeState.prototype, "y", void 0);
__decorate([
    type("boolean")
], WoodNodeState.prototype, "available", void 0);
__decorate([
    type("number")
], WoodNodeState.prototype, "respawn_at_ms", void 0);
