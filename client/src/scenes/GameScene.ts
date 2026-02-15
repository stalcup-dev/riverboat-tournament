import Phaser from "phaser";
import type { Room } from "colyseus.js";

import { isDevMode } from "../config";
import { HOTSPOT_DEFS, type HotspotDef } from "../game/hotspots";
import { getTintForName } from "../game/identity";
import type { ProtocolSender } from "../network/protocol";
import { nextKeepaliveDelayMs, pingHealthz } from "../network/health";
import { TimeSyncClient, type PongPayload } from "../network/timeSync";
import type { PlayerStateSnapshot, RectSnapshot, RoomStateSnapshot } from "../types/state";
import { getPlayerEntries, parseRectSnapshot } from "../types/state";

const MOVE_SEND_INTERVAL_MS = 40;
const DEFAULT_WORLD_WIDTH = 2400;
const DEFAULT_WORLD_HEIGHT = 1600;
const BUILD_REQUEST_COOLDOWN_MS = 250;
const CAST_REQUEST_COOLDOWN_MS = 250;
const GATHER_REQUEST_COOLDOWN_MS = 150;
const TOAST_DURATION_MS = 1500;
const FALLBACK_MARINA_RECT: RectSnapshot = { x: 80, y: 440, w: 240, h: 70 };
const SHOW_TIME_SYNC_DEBUG = isDevMode();
const HUD_PADDING_PX = 16;
const DOCK_HEIGHT_PX = 96;
const HUD_TOP_LEFT_Y = HUD_PADDING_PX + DOCK_HEIGHT_PX + 12;
const DEBUG_QUERY_ENABLED =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
const VITE_DEV_FLAG = (() => {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env ?? {};
  return env.DEV === true || String(env.DEV).toLowerCase() === "true";
})();
const SHOW_HOST_DEBUG = VITE_DEV_FLAG || DEBUG_QUERY_ENABLED;
const SHOW_F_KEY_TRACE = VITE_DEV_FLAG && DEBUG_QUERY_ENABLED;
const SHOW_CATCH_DEBUG = DEBUG_QUERY_ENABLED;
const SHOW_VERBOSE_FINDER = VITE_DEV_FLAG && DEBUG_QUERY_ENABLED;
const FINDER_STRONG_RADIUS_PX = 60;
const FINDER_MED_RADIUS_PX = 120;
const FINDER_WEAK_RADIUS_PX = 200;

interface PlayerVisual {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  canoeRing: Phaser.GameObjects.Arc;
}

interface MovePayload extends Record<string, unknown> {
  dx: number;
  dy: number;
}

interface ErrorPayload {
  code?: unknown;
  message?: unknown;
  retry_after_ms?: unknown;
}

interface BiteOfferPayload {
  offer_id?: unknown;
  player_id?: unknown;
  hotspot_id?: unknown;
  issued_server_ms?: unknown;
  expires_server_ms?: unknown;
}

interface CatchResultPayload {
  offer_id?: unknown;
  player_id?: unknown;
  success?: unknown;
  fish_id?: unknown;
  weight?: unknown;
  length?: unknown;
  points_delta?: unknown;
}

type MatchPhase = "LOBBY" | "COUNTDOWN" | "MATCH" | "RESULTS";

interface MatchStatePayload {
  phase?: unknown;
  server_ms?: unknown;
  countdown_end_ms?: unknown;
  match_start_ms?: unknown;
  match_end_ms?: unknown;
  host_session_id?: unknown;
}

interface MatchResultsLeaderboardEntry {
  name?: unknown;
  score_total?: unknown;
}

interface MatchResultsAwardEntry {
  title?: unknown;
  winner_name?: unknown;
  detail?: unknown;
}

interface MatchResultsPayload {
  leaderboard?: unknown;
  awards?: unknown;
}

interface ActiveBiteOffer {
  offerId: string;
  hotspotId: string;
  issuedServerMs: number;
  expiresServerMs: number;
  fallbackOffsetMs?: number;
  didShowExpiredToast: boolean;
  sentCatchClick: boolean;
}

interface NearestHotspot {
  hotspot: HotspotDef;
  distance: number;
}

interface ZoneOverlayDef {
  id: string;
  kind: "INLAND" | "RIVER" | "MARINA" | "RESTRICTED" | "FOREST" | "WATER";
  x: number;
  y: number;
  w: number;
  h: number;
}

export class GameScene extends Phaser.Scene {
  private readonly room: Room<RoomStateSnapshot>;
  private readonly protocol: ProtocolSender;
  private readonly visuals = new Map<string, PlayerVisual>();
  private readonly localSessionId: string;
  private readonly timeSync: TimeSyncClient;
  private readonly healthzUrl: string;

  private hotspots: HotspotDef[] = [...HOTSPOT_DEFS];
  private zones: ZoneOverlayDef[] = [];
  private readonly zoneOverlays = new Map<string, Phaser.GameObjects.Rectangle>();
  private readonly zoneLabels = new Map<string, Phaser.GameObjects.Text>();
  private lastPlayerEntries: Array<[string, PlayerStateSnapshot]> = [];
  private localPlayer?: PlayerStateSnapshot;
  private marinaRect: RectSnapshot = FALLBACK_MARINA_RECT;
  private worldWidth = DEFAULT_WORLD_WIDTH;
  private worldHeight = DEFAULT_WORLD_HEIGHT;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<"w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private buildKey?: Phaser.Input.Keyboard.Key;
  private castKey?: Phaser.Input.Keyboard.Key;
  private catchKey?: Phaser.Input.Keyboard.Key;

  private localHudText?: Phaser.GameObjects.Text;
  private leaderboardText?: Phaser.GameObjects.Text;
  private buildHintText?: Phaser.GameObjects.Text;
  private castHintText?: Phaser.GameObjects.Text;
  private fishFinderText?: Phaser.GameObjects.Text;
  private buildButtonText?: Phaser.GameObjects.Text;
  private toastText?: Phaser.GameObjects.Text;
  private biteBannerText?: Phaser.GameObjects.Text;
  private biteCountdownText?: Phaser.GameObjects.Text;
  private phaseBannerText?: Phaser.GameObjects.Text;
  private phaseCountdownText?: Phaser.GameObjects.Text;
  private phaseActionText?: Phaser.GameObjects.Text;
  private phaseInfoText?: Phaser.GameObjects.Text;
  private hostDebugText?: Phaser.GameObjects.Text;
  private resultsBackdrop?: Phaser.GameObjects.Rectangle;
  private resultsPanel?: Phaser.GameObjects.Rectangle;
  private resultsTitleText?: Phaser.GameObjects.Text;
  private resultsLeaderboardText?: Phaser.GameObjects.Text;
  private resultsAwardsText?: Phaser.GameObjects.Text;
  private resultsBackButtonText?: Phaser.GameObjects.Text;
  private marinaOverlay?: Phaser.GameObjects.Rectangle;
  private marinaLabelText?: Phaser.GameObjects.Text;
  private hotspotMarker?: Phaser.GameObjects.Arc;

  private lastMoveSentAt = 0;
  private lastBuildSentAtMs = 0;
  private lastCastSentAtMs = 0;
  private lastGatherSentAtMs = 0;
  private toastExpireAtMs = 0;
  private finderInsideLastFrame = false;
  private revealedHotspot?: HotspotDef;
  private activeBiteOffer?: ActiveBiteOffer;
  private matchPhase: MatchPhase = "LOBBY";
  private countdownEndMs = 0;
  private matchStartMs = 0;
  private matchEndMs = 0;
  private hostSessionId = "";
  private hasMatchResults = false;
  private lastLocalWoodCount?: number;
  private lastBiteDebugLogAtMs = 0;
  private keepaliveTimerId: number | undefined;

  constructor(room: Room<RoomStateSnapshot>, protocol: ProtocolSender, healthzUrl: string) {
    super("GameScene");
    this.room = room;
    this.protocol = protocol;
    this.localSessionId = room.sessionId;
    this.timeSync = new TimeSyncClient(this.protocol);
    this.healthzUrl = healthzUrl;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0f172a);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);

    this.add
      .grid(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, 64, 64, 0x0f172a, 1, 0x1e293b, 0.45)
      .setDepth(-1);

    if (!this.input.keyboard) {
      throw new Error("Keyboard input plugin is required for gameplay input.");
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,A,S,D") as Record<"w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
    this.buildKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.castKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.catchKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.localHudText = this.add
      .text(12, 10, "Connecting...", {
        color: "#cbd5e1",
        fontFamily: "monospace",
        fontSize: "14px"
      })
      .setScrollFactor(0)
      .setDepth(35);

    this.leaderboardText = this.add
      .text(this.scale.width - 12, 10, "", {
        color: "#e2e8f0",
        fontFamily: "monospace",
        fontSize: "13px"
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(35);

    this.buildHintText = this.add
      .text(12, 88, "", {
        color: "#facc15",
        fontFamily: "monospace",
        fontSize: "14px"
      })
      .setScrollFactor(0)
      .setDepth(35);

    this.castHintText = this.add
      .text(12, 112, "", {
        color: "#93c5fd",
        fontFamily: "monospace",
        fontSize: "14px"
      })
      .setScrollFactor(0)
      .setDepth(35);

    this.fishFinderText = this.add
      .text(12, 136, "", {
        color: "#f0abfc",
        fontFamily: "monospace",
        fontSize: "14px"
      })
      .setScrollFactor(0)
      .setDepth(35)
      .setVisible(false);

    this.buildButtonText = this.add
      .text(12, 184, "Build Canoe [B]", {
        color: "#f8fafc",
        fontFamily: "monospace",
        fontSize: "14px",
        backgroundColor: "#1d4ed8",
        padding: { left: 8, right: 8, top: 4, bottom: 4 }
      })
      .setScrollFactor(0)
      .setDepth(40)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);

    this.toastText = this.add
      .text(this.scale.width / 2, HUD_PADDING_PX, "", {
        color: "#fecaca",
        fontFamily: "monospace",
        fontSize: "14px",
        backgroundColor: "#7f1d1d",
        padding: { left: 10, right: 10, top: 6, bottom: 6 }
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(60)
      .setVisible(false);

    this.biteBannerText = this.add
      .text(this.scale.width / 2, 24, "BITE! CLICK or SPACE!", {
        color: "#fecaca",
        fontFamily: "monospace",
        fontSize: "34px",
        backgroundColor: "#7f1d1d",
        padding: { left: 14, right: 14, top: 6, bottom: 6 }
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(40)
      .setVisible(false);

    this.biteCountdownText = this.add
      .text(this.scale.width / 2, 72, "", {
        color: "#fecdd3",
        fontFamily: "monospace",
        fontSize: "18px"
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(40)
      .setVisible(false);

    this.phaseBannerText = this.add
      .text(this.scale.width / 2, this.scale.height - 54, "Phase: LOBBY", {
        color: "#bfdbfe",
        fontFamily: "monospace",
        fontSize: "16px",
        backgroundColor: "#1e3a8a",
        padding: { left: 10, right: 10, top: 4, bottom: 4 }
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(40);

    this.phaseCountdownText = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 44, "", {
        color: "#fde68a",
        fontFamily: "monospace",
        fontSize: "48px",
        backgroundColor: "#451a03",
        padding: { left: 16, right: 16, top: 8, bottom: 8 }
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(40)
      .setVisible(false);

    this.phaseActionText = this.add
      .text(this.scale.width / 2, this.scale.height - 86, "Start Match", {
        color: "#f8fafc",
        fontFamily: "monospace",
        fontSize: "14px",
        backgroundColor: "#14532d",
        padding: { left: 10, right: 10, top: 6, bottom: 6 }
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(40)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);

    this.phaseInfoText = this.add
      .text(this.scale.width / 2, this.scale.height - 84, "", {
        color: "#cbd5e1",
        fontFamily: "monospace",
        fontSize: "14px"
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(40)
      .setVisible(false);

    this.hostDebugText = this.add
      .text(12, this.scale.height - 80, "", {
        color: "#d1d5db",
        fontFamily: "monospace",
        fontSize: "12px",
        backgroundColor: "#111827",
        padding: { left: 6, right: 6, top: 4, bottom: 4 }
      })
      .setScrollFactor(0)
      .setDepth(30)
      .setVisible(SHOW_HOST_DEBUG);

    this.resultsBackdrop = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x020617, 0.78)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(40)
      .setVisible(false)
      .setInteractive();

    this.resultsPanel = this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, Math.min(this.scale.width - 48, 620), 420, 0x0f172a, 0.96)
      .setStrokeStyle(2, 0x334155, 1)
      .setScrollFactor(0)
      .setDepth(41)
      .setVisible(false);

    this.resultsTitleText = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 184, "Match Results", {
        color: "#f8fafc",
        fontFamily: "monospace",
        fontSize: "28px"
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(42)
      .setVisible(false);

    this.resultsLeaderboardText = this.add
      .text(this.scale.width / 2 - 250, this.scale.height / 2 - 136, "", {
        color: "#e2e8f0",
        fontFamily: "monospace",
        fontSize: "16px",
        lineSpacing: 4
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(42)
      .setVisible(false);

    this.resultsAwardsText = this.add
      .text(this.scale.width / 2 + 12, this.scale.height / 2 - 136, "", {
        color: "#bfdbfe",
        fontFamily: "monospace",
        fontSize: "15px",
        lineSpacing: 6
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(42)
      .setVisible(false);

    this.resultsBackButtonText = this.add
      .text(this.scale.width / 2, this.scale.height / 2 + 156, "Back to Title", {
        color: "#f8fafc",
        fontFamily: "monospace",
        fontSize: "15px",
        backgroundColor: "#1d4ed8",
        padding: { left: 12, right: 12, top: 8, bottom: 8 }
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(42)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);

    this.buildButtonText.on("pointerdown", () => {
      this.sendBuildCanoe();
    });
    this.buildKey.on("down", () => {
      this.sendBuildCanoe();
    });
    this.catchKey.on("down", () => {
      this.trySendCatchClick();
    });
    this.input.on("pointerdown", () => {
      this.trySendCatchClick();
    });
    this.phaseActionText.on("pointerdown", () => {
      this.handlePhaseActionClick();
    });
    this.resultsBackButtonText.on("pointerdown", () => {
      window.location.reload();
    });

    this.marinaOverlay = this.add
      .rectangle(this.marinaRect.x, this.marinaRect.y, this.marinaRect.w, this.marinaRect.h, 0x38bdf8, 0.2)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x38bdf8, 0.9)
      .setDepth(1);

    this.marinaLabelText = this.add
      .text(this.marinaRect.x + this.marinaRect.w / 2, this.marinaRect.y + 6, "MARINA", {
        color: "#e0f2fe",
        fontFamily: "monospace",
        fontSize: "14px",
        backgroundColor: "#0c4a6e",
        padding: { left: 6, right: 6, top: 3, bottom: 3 }
      })
      .setOrigin(0.5, 0)
      .setDepth(2);

    this.hotspotMarker = this.add
      .circle(0, 0, 16)
      .setStrokeStyle(3, 0xf59e0b, 0.95)
      .setFillStyle(0x000000, 0)
      .setDepth(4)
      .setVisible(false);

    this.room.onStateChange((state: RoomStateSnapshot) => {
      this.updateWorldBoundsFromState(state);
      this.marinaRect = parseRectSnapshot(state.marina) ?? FALLBACK_MARINA_RECT;
      this.updateZonesFromState(state);
      this.renderZoneOverlays();
      this.updateHotspotsFromState(state);
      this.renderMarinaOverlay();
      this.syncPlayers(state);
      this.updateHudAndBuildUi();
      this.updateLeaderboard();
    });

    this.room.onMessage("ERROR", (payload: ErrorPayload) => {
      this.handleError(payload);
    });
    this.room.onMessage("PONG", (payload: PongPayload) => {
      this.timeSync.handlePong(payload);
      this.updateHudAndBuildUi();
    });
    this.room.onMessage("BITE_OFFER", (payload: BiteOfferPayload) => {
      this.handleBiteOffer(payload);
    });
    this.room.onMessage("CATCH_RESULT", (payload: CatchResultPayload) => {
      this.handleCatchResult(payload);
    });
    this.room.onMessage("MATCH_STATE", (payload: MatchStatePayload) => {
      this.handleMatchState(payload);
    });
    this.room.onMessage("MATCH_RESULTS", (payload: MatchResultsPayload) => {
      this.handleMatchResults(payload);
    });

    this.room.onLeave((code) => {
      this.showToast(`Disconnected (${code})`);
    });

    this.layoutHud();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutHud, this);
    this.timeSync.start();
    this.scheduleHealthKeepalive();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutHud, this);
      this.timeSync.stop();
      this.clearHealthKeepalive();
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutHud, this);
      this.timeSync.stop();
      this.clearHealthKeepalive();
      this.zoneOverlays.forEach((overlay) => overlay.destroy());
      this.zoneOverlays.clear();
      this.zoneLabels.forEach((label) => label.destroy());
      this.zoneLabels.clear();
    });
  }

  update(time: number): void {
    if (this.toastText?.visible && time >= this.toastExpireAtMs) {
      this.toastText.setVisible(false);
    }

    this.updatePhaseUi();
    this.updateHostDebugUi();

    if (this.isGameplayEnabled() && time - this.lastMoveSentAt >= MOVE_SEND_INTERVAL_MS) {
      const move = this.readMoveIntent();
      this.protocol.send("MOVE", move);
      this.lastMoveSentAt = time;
    }

    if (this.castKey && Phaser.Input.Keyboard.JustDown(this.castKey)) {
      const gameplayEnabled = this.isGameplayEnabled();
      this.traceFKeyPress(gameplayEnabled);
      if (gameplayEnabled) {
        if (this.isLocalPlayerInsideZone("FOREST")) {
          this.trySendGatherWood();
        } else {
          this.trySendCastStart();
        }
      } else {
        this.showToast("Match hasn't started.");
      }
    }

    if (this.isGameplayEnabled()) {
      this.updateFishFinder();
    } else {
      this.hideHotspotUi();
      this.clearBiteUi();
    }
    this.updateBiteUi();
    this.updateHudAndBuildUi();
    this.updateLeaderboard();
  }

  private syncPlayers(state: RoomStateSnapshot): void {
    const seen = new Set<string>();
    const entries = getPlayerEntries(state.players);
    this.lastPlayerEntries = entries;
    const previousLocalWood = this.lastLocalWoodCount;
    this.localPlayer = undefined;

    for (const [playerId, player] of entries) {
      seen.add(playerId);
      this.upsertPlayer(playerId, player);
      if (playerId === this.localSessionId) {
        this.localPlayer = player;
      }
    }

    for (const [playerId, visual] of this.visuals.entries()) {
      if (seen.has(playerId)) {
        continue;
      }

      if (playerId === this.localSessionId) {
        this.localPlayer = undefined;
      }
      visual.body.destroy();
      visual.label.destroy();
      visual.canoeRing.destroy();
      this.visuals.delete(playerId);
    }

    if (!this.localPlayer) {
      this.lastLocalWoodCount = undefined;
      return;
    }

    const currentWood = this.localPlayer.wood ?? 0;
    if (typeof previousLocalWood === "number" && currentWood > previousLocalWood) {
      this.showToast(`+${currentWood - previousLocalWood} wood`);
    }
    this.lastLocalWoodCount = currentWood;
  }

  private upsertPlayer(playerId: string, player: PlayerStateSnapshot): void {
    const tint = getTintForName(player.name ?? "Player");
    if (!this.visuals.has(playerId)) {
      const isLocal = playerId === this.localSessionId;
      const body = this.add.rectangle(player.x, player.y, 26, 26, tint).setOrigin(0.5).setDepth(3);
      const canoeRing = this.add
        .circle(player.x, player.y, 20)
        .setStrokeStyle(3, 0xfde68a, 0.95)
        .setFillStyle(0x000000, 0)
        .setVisible(false)
        .setDepth(2);
      const label = this.add
        .text(player.x, player.y - 22, player.name ?? "Player", {
          color: "#f8fafc",
          fontFamily: "monospace",
          fontSize: "13px"
        })
        .setOrigin(0.5, 1)
        .setDepth(3);

      this.visuals.set(playerId, { body, label, canoeRing });
      if (isLocal) {
        this.cameras.main.startFollow(body, true, 0.2, 0.2);
      }
    }

    const visual = this.visuals.get(playerId);
    if (!visual) {
      return;
    }

    visual.body.setPosition(player.x, player.y);
    visual.body.setFillStyle(tint);
    visual.label.setPosition(player.x, player.y - 22);
    visual.label.setText(player.name ?? "Player");
    visual.canoeRing.setPosition(player.x, player.y);
    visual.canoeRing.setVisible(player.boat_id === "canoe");
  }

  private readMoveIntent(): MovePayload {
    const leftPressed = this.isKeyDown(this.cursors?.left) || this.isKeyDown(this.wasd?.a);
    const rightPressed = this.isKeyDown(this.cursors?.right) || this.isKeyDown(this.wasd?.d);
    const upPressed = this.isKeyDown(this.cursors?.up) || this.isKeyDown(this.wasd?.w);
    const downPressed = this.isKeyDown(this.cursors?.down) || this.isKeyDown(this.wasd?.s);

    let dx = 0;
    let dy = 0;

    if (leftPressed) dx -= 1;
    if (rightPressed) dx += 1;
    if (upPressed) dy -= 1;
    if (downPressed) dy += 1;

    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) {
      dx /= magnitude;
      dy /= magnitude;
    }

    return {
      dx: Phaser.Math.Clamp(dx, -1, 1),
      dy: Phaser.Math.Clamp(dy, -1, 1)
    };
  }

  private updateFishFinder(): void {
    if (!this.localPlayer) {
      this.hideHotspotUi();
      return;
    }

    if (this.isLocalPlayerInsideZone("FOREST")) {
      this.revealedHotspot = undefined;
      this.finderInsideLastFrame = false;
      if (this.hotspotMarker) {
        this.hotspotMarker.setVisible(false);
      }
      if (this.fishFinderText) {
        this.fishFinderText.setText("Forest: Press F to gather wood.");
        this.fishFinderText.setVisible(true);
      }
      if (this.castHintText) {
        this.castHintText.setText("Press F to gather wood.");
      }
      return;
    }

    const nearest = this.findNearestHotspot(this.localPlayer.x, this.localPlayer.y);
    const signal = this.getFinderSignal(nearest?.distance ?? Number.POSITIVE_INFINITY);
    if (signal === "NONE" || !nearest) {
      this.finderInsideLastFrame = false;
      this.revealedHotspot = undefined;
      if (this.hotspotMarker) {
        this.hotspotMarker.setVisible(false);
      }
      if (this.fishFinderText) {
        this.fishFinderText.setText("Fish Finder: NONE");
        this.fishFinderText.setVisible(true);
      }
      if (this.castHintText) {
        this.castHintText.setText("No signal. Keep searching.");
      }
      return;
    }

    if (!this.finderInsideLastFrame) {
      this.showToast("Fish Finder!");
    }
    this.finderInsideLastFrame = true;

    this.revealedHotspot = nearest.hotspot;
    if (this.hotspotMarker) {
      this.hotspotMarker.setVisible(false);
      if (SHOW_VERBOSE_FINDER) {
        this.hotspotMarker.setPosition(nearest.hotspot.x, nearest.hotspot.y);
        this.hotspotMarker.setVisible(true);
      }
    }
    if (this.fishFinderText) {
      const debugSuffix = SHOW_VERBOSE_FINDER
        ? ` [${nearest.hotspot.id} ${Math.round(nearest.distance)}px]`
        : "";
      this.fishFinderText.setText(`Fish Finder: ${signal}${debugSuffix}`);
      this.fishFinderText.setVisible(true);
    }

    const inCastRange = nearest.distance <= nearest.hotspot.cast_radius;
    if (this.castHintText) {
      this.castHintText.setText(inCastRange ? "Press F to cast." : "Move closer to cast.");
    }
  }

  private trySendGatherWood(): void {
    if (!this.isGameplayEnabled()) {
      this.showToast("Match hasn't started.");
      return;
    }

    if (!this.localPlayer) {
      this.showToast("Player not ready.");
      return;
    }

    const nowMs = this.time.now;
    if (nowMs - this.lastGatherSentAtMs < GATHER_REQUEST_COOLDOWN_MS) {
      return;
    }

    this.protocol.send("GATHER_WOOD");
    this.lastGatherSentAtMs = nowMs;
    this.showToast("Gathering...");
  }

  private trySendCastStart(): void {
    if (!this.isGameplayEnabled()) {
      this.showToast("Match hasn't started.");
      return;
    }

    if (!this.localPlayer) {
      this.showToast("Player not ready.");
      return;
    }

    if (!this.revealedHotspot) {
      this.showToast("Not at a valid fishing spot.");
      return;
    }

    if (this.activeBiteOffer) {
      this.showToast("Resolve the current bite first.");
      return;
    }

    const nowMs = this.time.now;
    if (nowMs - this.lastCastSentAtMs < CAST_REQUEST_COOLDOWN_MS) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(
      this.localPlayer.x,
      this.localPlayer.y,
      this.revealedHotspot.x,
      this.revealedHotspot.y
    );
    if (distance > this.revealedHotspot.cast_radius) {
      this.showToast("Not at a valid fishing spot.");
      return;
    }

    console.log("CAST_START attempt", { hotspot_id: this.revealedHotspot.id, phase: this.matchPhase });
    this.protocol.send("CAST_START", { hotspot_id: this.revealedHotspot.id });
    this.lastCastSentAtMs = nowMs;
    this.showToast("Casting...");
  }

  private handleBiteOffer(payload: BiteOfferPayload): void {
    const playerId = typeof payload.player_id === "string" ? payload.player_id : "";
    if (playerId !== this.localSessionId) {
      return;
    }

    const offerId = typeof payload.offer_id === "string" ? payload.offer_id : "";
    const hotspotId = typeof payload.hotspot_id === "string" ? payload.hotspot_id : "";
    const issuedServerMs = typeof payload.issued_server_ms === "number" ? payload.issued_server_ms : 0;
    const expiresServerMs = typeof payload.expires_server_ms === "number" ? payload.expires_server_ms : 0;
    if (!offerId || !hotspotId || !Number.isFinite(issuedServerMs) || !Number.isFinite(expiresServerMs)) {
      return;
    }

    const sampleCount = this.timeSync.getSnapshot().sampleCount;
    const fallbackOffsetMs = sampleCount > 0 ? undefined : issuedServerMs - Date.now();
    const nowServerMs = this.getServerNowEstimateMsForOffer({ fallbackOffsetMs });
    const remainingMs = expiresServerMs - nowServerMs;

    if (SHOW_CATCH_DEBUG) {
      console.log("[BITE_OFFER]", {
        offer_id: offerId,
        issued_server_ms: issuedServerMs,
        expires_server_ms: expiresServerMs,
        now_server_ms: nowServerMs,
        remaining_ms: remainingMs
      });
    }

    if (remainingMs <= 0) {
      this.activeBiteOffer = undefined;
      this.showToast("Too slow!");
      return;
    }

    this.activeBiteOffer = {
      offerId,
      hotspotId,
      issuedServerMs,
      expiresServerMs,
      fallbackOffsetMs,
      didShowExpiredToast: false,
      sentCatchClick: false
    };

    this.setStatus("BITE! CLICK or SPACE!");
    this.showToast("BITE! CLICK or SPACE!");
  }

  private trySendCatchClick(): void {
    if (!this.isGameplayEnabled()) {
      return;
    }

    if (!this.activeBiteOffer || this.activeBiteOffer.sentCatchClick) {
      return;
    }

    const remainingMs = this.activeBiteOffer.expiresServerMs - this.getServerNowEstimateMsForOffer(this.activeBiteOffer);
    if (remainingMs <= 0) {
      return;
    }

    this.protocol.send("CATCH_CLICK", { offer_id: this.activeBiteOffer.offerId });
    this.activeBiteOffer.sentCatchClick = true;
    this.setStatus("Attempting catch...");
    this.showToast("Attempting catch...");
  }

  private handleCatchResult(payload: CatchResultPayload): void {
    const playerId = typeof payload.player_id === "string" ? payload.player_id : "";
    if (playerId !== this.localSessionId) {
      return;
    }

    this.clearBiteUi();

    const success = payload.success === true;
    if (!success) {
      this.showToast("No catch.");
      return;
    }

    const points = typeof payload.points_delta === "number" ? payload.points_delta : 0;
    const fishId = typeof payload.fish_id === "string" ? payload.fish_id : "fish";
    const weight = typeof payload.weight === "number" ? payload.weight : 0;
    const length = typeof payload.length === "number" ? payload.length : 0;
    const summary = `+${points} pts - ${fishId} ${weight.toFixed(1)}lb ${length.toFixed(1)}in`;
    this.showToast(summary);
    this.setStatus(summary);
  }

  private handleMatchState(payload: MatchStatePayload): void {
    console.log("MATCH_STATE", payload, "sid", this.room.sessionId);

    const phaseRaw = typeof payload.phase === "string" ? payload.phase : "";
    if (phaseRaw === "LOBBY" || phaseRaw === "COUNTDOWN" || phaseRaw === "MATCH" || phaseRaw === "RESULTS") {
      this.matchPhase = phaseRaw;
    }

    this.countdownEndMs = typeof payload.countdown_end_ms === "number" ? payload.countdown_end_ms : 0;
    this.matchStartMs = typeof payload.match_start_ms === "number" ? payload.match_start_ms : 0;
    this.matchEndMs = typeof payload.match_end_ms === "number" ? payload.match_end_ms : 0;
    this.hostSessionId = typeof payload.host_session_id === "string" ? payload.host_session_id : "";

    if (this.matchPhase !== "RESULTS") {
      this.hasMatchResults = false;
      this.setResultsOverlayVisible(false);
    }

    if (this.matchPhase === "LOBBY" || this.matchPhase === "COUNTDOWN") {
      this.setStatus("Frozen until start");
    } else if (this.matchPhase === "MATCH") {
      this.setStatus("Match live");
    } else if (this.matchPhase === "RESULTS") {
      this.setStatus("Match complete");
    }
  }

  private handleMatchResults(payload: MatchResultsPayload): void {
    if (
      !this.resultsBackdrop ||
      !this.resultsPanel ||
      !this.resultsTitleText ||
      !this.resultsLeaderboardText ||
      !this.resultsAwardsText ||
      !this.resultsBackButtonText
    ) {
      return;
    }

    const leaderboard = this.parseMatchResultsLeaderboard(payload.leaderboard);
    const awards = this.parseMatchResultsAwards(payload.awards);

    const leaderboardLines = ["Leaderboard"];
    if (leaderboard.length === 0) {
      leaderboardLines.push("No players");
    } else {
      leaderboard.forEach((entry, index) => {
        leaderboardLines.push(`${index + 1}. ${entry.name} - ${entry.score_total}`);
      });
    }

    const awardLines = ["Awards"];
    if (awards.length === 0) {
      awardLines.push("No awards");
    } else {
      awards.forEach((award) => {
        awardLines.push(`${award.title}`);
        awardLines.push(`${award.winner_name} (${award.detail})`);
      });
    }

    this.resultsLeaderboardText.setText(leaderboardLines.join("\n"));
    this.resultsAwardsText.setText(awardLines.join("\n"));
    this.setResultsOverlayVisible(true);
    this.setStatus("Results ready");
    this.hasMatchResults = true;
  }

  private updateBiteUi(): void {
    if (!this.biteBannerText || !this.biteCountdownText) {
      return;
    }

    if (!this.activeBiteOffer) {
      this.biteBannerText.setVisible(false);
      this.biteCountdownText.setVisible(false);
      return;
    }

    const nowServerMs = this.getServerNowEstimateMsForOffer(this.activeBiteOffer);
    const remainingMs = this.activeBiteOffer.expiresServerMs - nowServerMs;
    if (SHOW_CATCH_DEBUG && this.time.now - this.lastBiteDebugLogAtMs >= 250) {
      this.lastBiteDebugLogAtMs = this.time.now;
      console.log("[BITE_TIMER]", {
        offer_id: this.activeBiteOffer.offerId,
        issued_server_ms: this.activeBiteOffer.issuedServerMs,
        expires_server_ms: this.activeBiteOffer.expiresServerMs,
        now_server_ms: nowServerMs,
        remaining_ms: remainingMs
      });
    }

    if (remainingMs <= 0) {
      if (!this.activeBiteOffer.didShowExpiredToast) {
        this.activeBiteOffer.didShowExpiredToast = true;
        this.showToast("Too slow!");
      }
      this.clearBiteUi();
      return;
    }

    this.biteBannerText.setVisible(true);
    this.biteBannerText.setText("BITE! CLICK or SPACE!");
    this.biteCountdownText.setVisible(true);
    this.biteCountdownText.setText(`Catch window: ${Math.max(0, remainingMs / 1000).toFixed(2)}s`);
  }

  private updatePhaseUi(): void {
    if (!this.phaseBannerText || !this.phaseCountdownText || !this.phaseActionText || !this.phaseInfoText) {
      return;
    }

    const nowServerMs = this.timeSync.getServerNowEstimateMs();
    this.phaseBannerText.setText(`Phase: ${this.matchPhase}`);
    this.phaseActionText.setVisible(false);
    this.phaseInfoText.setVisible(false);

    if (this.matchPhase === "COUNTDOWN") {
      const remainingMs = Math.max(0, this.countdownEndMs - nowServerMs);
      const secs = Math.max(0, Math.ceil(remainingMs / 1000));
      this.phaseCountdownText.setText(`${secs}`);
      this.phaseCountdownText.setVisible(true);
      if (this.isHost()) {
        this.phaseActionText.setText("Cancel Countdown");
        this.phaseActionText.setVisible(true);
      } else {
        this.phaseInfoText.setText("Waiting for host...");
        this.phaseInfoText.setVisible(true);
      }
      return;
    }

    if (this.matchPhase === "MATCH" && this.matchEndMs > 0) {
      const remainingMs = Math.max(0, this.matchEndMs - nowServerMs);
      const minutes = Math.floor(remainingMs / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);
      this.phaseCountdownText.setText(`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
      this.phaseCountdownText.setVisible(true);
      return;
    }

    if (this.matchPhase === "LOBBY") {
      this.phaseCountdownText.setVisible(false);
      if (this.isHost()) {
        this.phaseActionText.setText("Start Match");
        this.phaseActionText.setVisible(true);
      } else {
        this.phaseInfoText.setText("Waiting for host...");
        this.phaseInfoText.setVisible(true);
      }
      return;
    }

    if (this.matchPhase === "RESULTS") {
      this.phaseCountdownText.setVisible(false);
      this.phaseInfoText.setText(this.hasMatchResults ? "Results ready" : "Waiting for results...");
      this.phaseInfoText.setVisible(true);
      return;
    }

    this.phaseCountdownText.setVisible(false);
  }

  private clearBiteUi(): void {
    this.activeBiteOffer = undefined;
    if (this.biteBannerText) {
      this.biteBannerText.setVisible(false);
    }
    if (this.biteCountdownText) {
      this.biteCountdownText.setVisible(false);
    }
  }

  private getServerNowEstimateMsForOffer(offer: { fallbackOffsetMs?: number }): number {
    const syncedEstimate = this.timeSync.getServerNowEstimateMs();
    if (offer.fallbackOffsetMs === undefined) {
      return syncedEstimate;
    }

    const snapshot = this.timeSync.getSnapshot();
    if (snapshot.sampleCount > 0) {
      return syncedEstimate;
    }

    return Date.now() + offer.fallbackOffsetMs;
  }

  private updateHudAndBuildUi(): void {
    if (!this.localHudText || !this.buildHintText || !this.buildButtonText || !this.castHintText) {
      return;
    }

    if (!this.localPlayer) {
      this.localHudText.setText("Waiting for local player...");
      this.buildHintText.setText("");
      this.castHintText.setText("");
      this.buildButtonText.setVisible(false);
      this.layoutLeftHudStack();
      return;
    }

    const player = this.localPlayer;
    const insideMarina = this.isPointInsideRect(player.x, player.y, this.marinaRect);
    const insideForest = this.isLocalPlayerInsideZone("FOREST");
    const insideWater = this.isLocalPlayerInsideZone("WATER");
    const hasCanoe = player.boat_id === "canoe";
    const hasWood = (player.wood ?? 0) >= 3;
    const score = player.score_total ?? 0;
    const timeSyncLines = this.getTimeSyncHudLines();

    this.localHudText.setText(
      `You: ${player.name}\nWood: ${player.wood ?? 0}\nBoat: ${player.boat_id ?? "none"}\nScore: ${score}\nMarina: ${
        insideMarina ? "inside" : "outside"
      }\nForest: ${insideForest ? "inside" : "outside"}\nWater: ${insideWater ? "inside" : "outside"}${timeSyncLines}`
    );

    if (!this.isGameplayEnabled()) {
      this.buildButtonText.setVisible(false);
      if (this.matchPhase === "LOBBY" || this.matchPhase === "COUNTDOWN") {
        this.buildHintText.setText("Frozen until start");
      } else if (this.matchPhase === "RESULTS") {
        this.buildHintText.setText("Match finished");
      } else {
        this.buildHintText.setText("");
      }
      this.castHintText.setText("");
      this.layoutLeftHudStack();
      return;
    }

    if (hasCanoe) {
      this.buildButtonText.setVisible(false);
      this.buildHintText.setText("Canoe built.");
      this.layoutLeftHudStack();
      return;
    }

    if (insideMarina && hasWood) {
      this.buildButtonText.setVisible(true);
      this.buildHintText.setText("Ready to build canoe.");
      this.layoutLeftHudStack();
      return;
    }

    this.buildButtonText.setVisible(false);
    if (insideMarina) {
      this.buildHintText.setText(`Need 3 wood (${player.wood ?? 0}/3).`);
    } else {
      this.buildHintText.setText("Go to Marina to build canoe.");
    }
    this.layoutLeftHudStack();
  }

  private updateLeaderboard(): void {
    if (!this.leaderboardText) {
      return;
    }

    const top = [...this.lastPlayerEntries]
      .sort((a, b) => {
        const aScore = a[1].score_total ?? 0;
        const bScore = b[1].score_total ?? 0;
        if (aScore !== bScore) {
          return bScore - aScore;
        }
        return (a[1].name ?? "").localeCompare(b[1].name ?? "");
      })
      .slice(0, 6);

    const lines = ["Leaderboard"];
    for (let index = 0; index < top.length; index += 1) {
      const [, player] = top[index] as [string, PlayerStateSnapshot];
      lines.push(`${index + 1}. ${player.name} ${player.score_total ?? 0}`);
    }
    this.leaderboardText.setText(lines.join("\n"));
  }

  private scheduleHealthKeepalive(): void {
    this.clearHealthKeepalive();
    this.keepaliveTimerId = window.setTimeout(async () => {
      this.keepaliveTimerId = undefined;
      if (this.matchPhase === "LOBBY" || this.matchPhase === "MATCH") {
        try {
          await pingHealthz(this.healthzUrl, 10_000);
        } catch {
          // Keepalive is best-effort; gameplay should continue even if ping fails.
        }
      }
      this.scheduleHealthKeepalive();
    }, nextKeepaliveDelayMs());
  }

  private clearHealthKeepalive(): void {
    if (this.keepaliveTimerId === undefined) {
      return;
    }

    window.clearTimeout(this.keepaliveTimerId);
    this.keepaliveTimerId = undefined;
  }

  private sendBuildCanoe(): void {
    if (!this.isGameplayEnabled()) {
      this.showToast("Match hasn't started.");
      return;
    }

    if (!this.localPlayer) {
      this.showToast("Player not ready.");
      return;
    }

    if (this.localPlayer.boat_id === "canoe") {
      this.showToast("Canoe already crafted.");
      return;
    }

    const nowMs = this.time.now;
    if (nowMs - this.lastBuildSentAtMs < BUILD_REQUEST_COOLDOWN_MS) {
      return;
    }

    this.protocol.send("BUILD_CANOE");
    this.lastBuildSentAtMs = nowMs;
    this.showToast("Build request sent...");
  }

  private handleError(payload: ErrorPayload): void {
    const code = typeof payload?.code === "string" ? payload.code : "ERR_UNKNOWN";
    const message = typeof payload?.message === "string" ? payload.message : "Action failed.";
    const retryAfterMs = typeof payload?.retry_after_ms === "number" ? payload.retry_after_ms : 0;

    switch (code) {
      case "NEED_WOOD":
        this.showToast("Need 3 wood to craft canoe.");
        break;
      case "NEED_MARINA":
        this.showToast("Go to the Marina to craft a canoe.");
        break;
      case "NEED_CANOE":
        this.showToast("Craft a canoe before fishing.");
        break;
      case "NEED_CANOE_FOR_WATER":
        this.showToast("Craft a canoe before entering water.");
        break;
      case "PHASE_LOCKED":
        this.showToast("Match hasn't started.");
        break;
      case "ERR_NOT_IN_MARINA":
        this.showToast("Build failed: You are not in Marina.");
        break;
      case "ERR_INSUFFICIENT_WOOD":
        this.showToast("Build failed: Need at least 3 wood.");
        break;
      case "OFFER_EXPIRED":
        this.clearBiteUi();
        this.showToast("Too slow!");
        break;
      case "LOCKED_OUT":
        this.clearBiteUi();
        this.showToast("Warden lockout!");
        break;
      case "NO_ACTIVE_CAST":
        this.showToast("No active cast.");
        break;
      case "INVALID_HOTSPOT":
        this.showToast("Not at a valid fishing spot.");
        break;
      case "HOTSPOT_DEPLETED": {
        this.clearBiteUi();
        const retrySeconds = retryAfterMs > 0 ? Math.ceil(retryAfterMs / 1000) : 0;
        const details = retrySeconds > 0 ? ` (${retrySeconds}s)` : "";
        this.showToast(`Spot depleted - try another area.${details}`);
        break;
      }
      case "NOT_IN_FOREST":
        this.showToast("Go to the forest to gather wood.");
        break;
      case "GATHER_COOLDOWN":
        this.showToast("Gather cooldown...");
        break;
      default:
        this.showToast(`${code}: ${message}`);
        break;
    }
  }

  private setStatus(text: string): void {
    void text;
  }

  private showToast(text: string): void {
    if (!this.toastText) {
      return;
    }

    this.toastText.setText(text);
    this.toastText.setVisible(true);
    this.toastExpireAtMs = this.time.now + TOAST_DURATION_MS;
  }

  private hideHotspotUi(): void {
    if (this.hotspotMarker) {
      this.hotspotMarker.setVisible(false);
    }
    if (this.fishFinderText) {
      this.fishFinderText.setVisible(false);
    }
    if (this.castHintText) {
      this.castHintText.setText("");
    }
  }

  private findNearestHotspot(x: number, y: number): NearestHotspot | undefined {
    let best: NearestHotspot | undefined;

    for (const hotspot of this.hotspots) {
      const distance = Phaser.Math.Distance.Between(x, y, hotspot.x, hotspot.y);
      if (!best || distance < best.distance) {
        best = { hotspot, distance };
      }
    }

    return best;
  }

  private getFinderSignal(distancePx: number): "NONE" | "WEAK" | "MED" | "STRONG" {
    if (!Number.isFinite(distancePx) || distancePx > FINDER_WEAK_RADIUS_PX) {
      return "NONE";
    }
    if (distancePx <= FINDER_STRONG_RADIUS_PX) {
      return "STRONG";
    }
    if (distancePx <= FINDER_MED_RADIUS_PX) {
      return "MED";
    }
    return "WEAK";
  }

  private updateHotspotsFromState(state: RoomStateSnapshot): void {
    const parsed = this.parseHotspots(state.hotspots);
    if (parsed.length > 0) {
      this.hotspots = parsed;
    }
  }

  private updateZonesFromState(state: RoomStateSnapshot): void {
    const parsed = this.parseZones(state.zones);
    if (parsed.length > 0) {
      this.zones = parsed;
    }
  }

  private updateWorldBoundsFromState(state: RoomStateSnapshot): void {
    const width = typeof state.world_width === "number" && Number.isFinite(state.world_width) ? state.world_width : undefined;
    const height =
      typeof state.world_height === "number" && Number.isFinite(state.world_height) ? state.world_height : undefined;
    if (!width || !height || width <= 0 || height <= 0) {
      return;
    }

    this.worldWidth = width;
    this.worldHeight = height;
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
  }

  private parseHotspots(raw: unknown): HotspotDef[] {
    if (!raw) {
      return [];
    }

    const rows: unknown[] = [];
    if (Array.isArray(raw)) {
      rows.push(...raw);
    } else {
      const maybeIterable = raw as { forEach?: (cb: (value: unknown) => void) => void };
      if (typeof maybeIterable.forEach === "function") {
        maybeIterable.forEach((value) => rows.push(value));
      }
    }

    return rows.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const input = entry as Record<string, unknown>;
      const id = typeof input.id === "string" ? input.id : "";
      const zoneId = typeof input.zone_id === "string" ? input.zone_id : "";
      const kind = typeof input.kind === "string" ? input.kind : "river";
      const x = typeof input.x === "number" ? input.x : Number.NaN;
      const y = typeof input.y === "number" ? input.y : Number.NaN;
      const castRadiusRaw = typeof input.cast_radius === "number" ? input.cast_radius : Number.NaN;
      const capRaw = typeof input.cap === "number" ? input.cap : Number.NaN;

      if (!id || !zoneId || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(castRadiusRaw)) {
        return [];
      }

      return [
        {
          id,
          x,
          y,
          cast_radius: castRadiusRaw,
          cap: Number.isFinite(capRaw) ? capRaw : 2,
          zone_id: zoneId,
          kind
        }
      ];
    });
  }

  private parseZones(raw: unknown): ZoneOverlayDef[] {
    if (!raw) {
      return [];
    }

    const rows: unknown[] = [];
    if (Array.isArray(raw)) {
      rows.push(...raw);
    } else {
      const maybeIterable = raw as { forEach?: (cb: (value: unknown) => void) => void };
      if (typeof maybeIterable.forEach === "function") {
        maybeIterable.forEach((value) => rows.push(value));
      }
    }

    return rows.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const value = entry as Record<string, unknown>;
      const id = typeof value.id === "string" ? value.id : "";
      const kind = value.kind;
      const rectRaw = value.rect as Record<string, unknown> | undefined;
      const x = typeof rectRaw?.x === "number" ? rectRaw.x : Number.NaN;
      const y = typeof rectRaw?.y === "number" ? rectRaw.y : Number.NaN;
      const w = typeof rectRaw?.w === "number" ? rectRaw.w : Number.NaN;
      const h = typeof rectRaw?.h === "number" ? rectRaw.h : Number.NaN;

      if (!id || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
        return [];
      }

      if (
        kind !== "INLAND" &&
        kind !== "RIVER" &&
        kind !== "MARINA" &&
        kind !== "RESTRICTED" &&
        kind !== "FOREST" &&
        kind !== "WATER"
      ) {
        return [];
      }

      return [{ id, kind, x, y, w, h }];
    });
  }

  private renderZoneOverlays(): void {
    const seen = new Set<string>();
    this.zones.forEach((zone) => {
      seen.add(zone.id);
      const style = this.getZoneStyle(zone.kind);
      let overlay = this.zoneOverlays.get(zone.id);
      if (!overlay) {
        overlay = this.add.rectangle(zone.x, zone.y, zone.w, zone.h).setOrigin(0, 0).setDepth(0);
        this.zoneOverlays.set(zone.id, overlay);
      }

      overlay
        .setPosition(zone.x, zone.y)
        .setSize(zone.w, zone.h)
        .setFillStyle(style.fillColor, style.fillAlpha)
        .setStrokeStyle(1, style.strokeColor, 0.35);

      const labelText = this.getZoneLabelText(zone.kind);
      if (!labelText) {
        const oldLabel = this.zoneLabels.get(zone.id);
        if (oldLabel) {
          oldLabel.destroy();
          this.zoneLabels.delete(zone.id);
        }
      } else {
        let label = this.zoneLabels.get(zone.id);
        if (!label) {
          label = this.add
            .text(zone.x + zone.w / 2, zone.y + 8, labelText, {
              color: "#e2e8f0",
              fontFamily: "monospace",
              fontSize: "16px",
              backgroundColor: "#0f172a",
              padding: { left: 6, right: 6, top: 3, bottom: 3 }
            })
            .setOrigin(0.5, 0)
            .setDepth(2);
          this.zoneLabels.set(zone.id, label);
        }

        label.setText(labelText);
        label.setPosition(zone.x + zone.w / 2, zone.y + 8);
      }
    });

    this.zoneOverlays.forEach((overlay, id) => {
      if (seen.has(id)) {
        return;
      }
      overlay.destroy();
      this.zoneOverlays.delete(id);
      const label = this.zoneLabels.get(id);
      if (label) {
        label.destroy();
        this.zoneLabels.delete(id);
      }
    });
  }

  private getZoneStyle(kind: ZoneOverlayDef["kind"]): { fillColor: number; fillAlpha: number; strokeColor: number } {
    switch (kind) {
      case "WATER":
        return { fillColor: 0x1d4ed8, fillAlpha: 0.24, strokeColor: 0x60a5fa };
      case "FOREST":
        return { fillColor: 0x166534, fillAlpha: 0.22, strokeColor: 0x22c55e };
      case "RIVER":
        return { fillColor: 0x0b3b66, fillAlpha: 0.22, strokeColor: 0x1d4ed8 };
      case "MARINA":
        return { fillColor: 0x38bdf8, fillAlpha: 0.16, strokeColor: 0x38bdf8 };
      case "RESTRICTED":
        return { fillColor: 0x7f1d1d, fillAlpha: 0.18, strokeColor: 0xdc2626 };
      case "INLAND":
      default:
        return { fillColor: 0x475569, fillAlpha: 0.12, strokeColor: 0x64748b };
    }
  }

  private getZoneLabelText(kind: ZoneOverlayDef["kind"]): string {
    switch (kind) {
      case "FOREST":
        return "FOREST";
      case "WATER":
        return "WATER";
      default:
        return "";
    }
  }

  private isPointInsideRect(x: number, y: number, rect: RectSnapshot): boolean {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  private isLocalPlayerInsideZone(kind: ZoneOverlayDef["kind"]): boolean {
    if (!this.localPlayer) {
      return false;
    }

    return this.zones.some((zone) => {
      if (zone.kind !== kind) {
        return false;
      }
      return this.isPointInsideRect(this.localPlayer?.x ?? 0, this.localPlayer?.y ?? 0, zone);
    });
  }

  private renderMarinaOverlay(): void {
    if (!this.marinaOverlay) {
      return;
    }
    this.marinaOverlay.setPosition(this.marinaRect.x, this.marinaRect.y);
    this.marinaOverlay.setSize(this.marinaRect.w, this.marinaRect.h);
    this.marinaLabelText?.setPosition(this.marinaRect.x + this.marinaRect.w / 2, this.marinaRect.y + 6);
  }

  private getTimeSyncHudLines(): string {
    if (!SHOW_TIME_SYNC_DEBUG) {
      return "";
    }

    const snapshot = this.timeSync.getSnapshot();
    if (snapshot.sampleCount === 0) {
      return "\nRTT: -- ms\nOffset: -- ms";
    }

    const rttText = snapshot.rttMs.toFixed(1);
    const offsetRounded = Math.round(snapshot.offsetMs);
    const offsetText = `${offsetRounded >= 0 ? "+" : ""}${offsetRounded}`;
    return `\nRTT: ${rttText} ms\nOffset: ${offsetText} ms`;
  }

  private parseMatchResultsLeaderboard(raw: unknown): Array<{ name: string; score_total: number }> {
    if (!Array.isArray(raw)) {
      return [];
    }

    const parsed: Array<{ name: string; score_total: number }> = [];
    raw.forEach((entry) => {
      const value = entry as MatchResultsLeaderboardEntry;
      const name = typeof value?.name === "string" ? value.name : "";
      const scoreTotal = typeof value?.score_total === "number" ? value.score_total : Number.NaN;
      if (!name || !Number.isFinite(scoreTotal)) {
        return;
      }
      parsed.push({ name, score_total: scoreTotal });
    });
    return parsed;
  }

  private parseMatchResultsAwards(raw: unknown): Array<{ title: string; winner_name: string; detail: string }> {
    if (!Array.isArray(raw)) {
      return [];
    }

    const parsed: Array<{ title: string; winner_name: string; detail: string }> = [];
    raw.forEach((entry) => {
      const value = entry as MatchResultsAwardEntry;
      const title = typeof value?.title === "string" ? value.title : "";
      const winnerName = typeof value?.winner_name === "string" ? value.winner_name : "";
      const detail = typeof value?.detail === "string" ? value.detail : "";
      if (!title || !winnerName) {
        return;
      }
      parsed.push({ title, winner_name: winnerName, detail });
    });
    return parsed;
  }

  private setResultsOverlayVisible(visible: boolean): void {
    this.resultsBackdrop?.setVisible(visible);
    this.resultsPanel?.setVisible(visible);
    this.resultsTitleText?.setVisible(visible);
    this.resultsLeaderboardText?.setVisible(visible);
    this.resultsAwardsText?.setVisible(visible);
    this.resultsBackButtonText?.setVisible(visible);
  }

  private layoutHud(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const p = HUD_PADDING_PX;

    this.layoutLeftHudStack();

    this.leaderboardText?.setPosition(w - p, p);
    this.toastText?.setPosition(w / 2, p);
    this.biteBannerText?.setPosition(w / 2, p + 34);
    this.biteCountdownText?.setPosition(w / 2, p + 82);

    const phaseActionY = h - p - 78;
    this.phaseActionText?.setPosition(w / 2, phaseActionY);
    this.phaseInfoText?.setPosition(w / 2, phaseActionY + 2);
    this.phaseBannerText?.setPosition(w / 2, h - p - 46);
    this.phaseCountdownText?.setPosition(w / 2, h - p - 118);

    this.hostDebugText?.setOrigin(0, 1).setPosition(p, h - p);

    this.resultsBackdrop?.setSize(w, h);
    this.resultsPanel?.setPosition(w / 2, h / 2).setSize(Math.min(w - 3 * p, 620), 420);
    this.resultsTitleText?.setPosition(w / 2, h / 2 - 184);
    this.resultsLeaderboardText?.setPosition(w / 2 - 250, h / 2 - 136);
    this.resultsAwardsText?.setPosition(w / 2 + 12, h / 2 - 136);
    this.resultsBackButtonText?.setPosition(w / 2, h / 2 + 156);
  }

  private layoutLeftHudStack(): void {
    const p = HUD_PADDING_PX;
    const y = HUD_TOP_LEFT_Y;
    if (!this.localHudText) {
      return;
    }

    this.localHudText.setPosition(p, y);
    let cursorY = y + this.localHudText.height + 8;

    if (this.buildHintText) {
      this.buildHintText.setPosition(p, cursorY);
      cursorY += this.buildHintText.height + 6;
    }

    if (this.castHintText) {
      this.castHintText.setPosition(p, cursorY);
      cursorY += this.castHintText.height + 6;
    }

    if (this.fishFinderText) {
      this.fishFinderText.setPosition(p, cursorY);
      cursorY += this.fishFinderText.height + 8;
    }

    if (this.buildButtonText) {
      this.buildButtonText.setPosition(p, cursorY);
    }
  }

  private updateHostDebugUi(): void {
    if (!SHOW_HOST_DEBUG || !this.hostDebugText) {
      return;
    }

    this.hostDebugText.setText(
      `sid: ${this.localSessionId}\nhost: ${this.hostSessionId || "-"}\nisHost: ${this.isHost()}\nphase: ${this.matchPhase}`
    );
  }

  private traceFKeyPress(enabled: boolean): void {
    if (!SHOW_F_KEY_TRACE) {
      return;
    }

    const message = `F pressed (phase=${this.matchPhase}, enabled=${enabled})`;
    console.log(message);
    this.showToast(message);
  }

  private isGameplayEnabled(): boolean {
    return this.matchPhase === "MATCH";
  }

  private isHost(): boolean {
    return Boolean(this.hostSessionId) && this.localSessionId === this.hostSessionId;
  }

  private handlePhaseActionClick(): void {
    if (!this.isHost()) {
      return;
    }

    if (this.matchPhase === "LOBBY") {
      this.protocol.send("HOST_START_MATCH");
      this.setStatus("Starting countdown...");
      return;
    }

    if (this.matchPhase === "COUNTDOWN") {
      this.protocol.send("HOST_CANCEL_COUNTDOWN");
      this.setStatus("Cancelling countdown...");
    }
  }

  private isKeyDown(key: Phaser.Input.Keyboard.Key | undefined): boolean {
    return Boolean(key?.isDown);
  }
}
