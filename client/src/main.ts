import Phaser from "phaser";

import {
  getDefaultServerUrlForUi,
  getMatchmakerInviteKey,
  getMatchmakerSecret,
  isDevHostOverrideEnabled,
  resolveCurrentWebSocketEndpoint
} from "./config";
import { JoinRejectedError, connectToMatch } from "./network/colyseus";
import { getHealthzUrlFromWebSocketEndpoint, wakeServer } from "./network/health";
import { MatchmakerError, createMatch, joinMatchByCode } from "./network/matchmaker";
import { GameScene } from "./scenes/GameScene";
import "./styles.css";
import { JoinView } from "./ui/JoinView";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app root element");
}

const defaultServerUrl = getDefaultServerUrlForUi();
const joinView = new JoinView({
  defaultServerUrl,
  allowHostOverride: isDevHostOverrideEnabled()
});
joinView.mount(app);

let game: Phaser.Game | undefined;
let currentSession: ActiveSession | undefined;
let reconnectTimer: number | undefined;
let reconnectAttempt = 0;
let currentConnectionToken = 0;

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 20_000;
const RECONNECT_MAX_ATTEMPTS = 8;

interface ActiveSession {
  roomId: string;
  joinCode?: string;
  name: string;
  endpoint: string;
  keepCodeVisible?: boolean;
}

async function startGame(options: {
  roomId: string;
  joinCode?: string;
  name: string;
  endpoint: string;
  keepCodeVisible?: boolean;
}): Promise<void> {
  cancelReconnect();
  if (game) {
    game.destroy(true);
    game = undefined;
  }

  const { room, endpoint, protocol } = await connectToMatch({
    roomId: options.roomId,
    joinCode: options.joinCode,
    name: options.name,
    endpointOverride: options.endpoint
  });
  const shortRoomId = room.roomId.slice(0, 8);
  joinView.setStatus(`Connected · ${shortRoomId}`);
  if (options.keepCodeVisible) {
    joinView.showCodeDock();
  } else {
    joinView.hide();
  }

  const healthzUrl = getHealthzUrlFromWebSocketEndpoint(endpoint);
  const scene = new GameScene(room, protocol, healthzUrl);
  game = new Phaser.Game({
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: app,
    scene: [scene],
    pixelArt: false
  });

  const onResize = () => {
    game?.scale.resize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener("resize", onResize);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    window.removeEventListener("resize", onResize);
  });

  currentSession = {
    roomId: options.roomId,
    joinCode: options.joinCode,
    name: options.name,
    endpoint: options.endpoint,
    keepCodeVisible: options.keepCodeVisible
  };
  const connectionToken = ++currentConnectionToken;
  room.onLeave(() => {
    if (connectionToken !== currentConnectionToken) {
      return;
    }
    if (!currentSession) {
      return;
    }
    scheduleReconnect(currentSession);
  });
}

async function startGameWithNameRetry(options: {
  roomId: string;
  joinCode?: string;
  initialName: string;
  endpoint: string;
  keepCodeVisible?: boolean;
}): Promise<string | null> {
  let activeName = options.initialName;
  const attemptedNames = new Set<string>();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    attemptedNames.add(activeName);
    try {
      await startGame({
        roomId: options.roomId,
        joinCode: options.joinCode,
        name: activeName,
        endpoint: options.endpoint,
        keepCodeVisible: options.keepCodeVisible
      });
      return activeName;
    } catch (error) {
      if (!(error instanceof JoinRejectedError) || error.code !== "NAME_TAKEN") {
        throw error;
      }

      if (attempt === 0) {
        const nextName = joinView.rollDifferentName(attemptedNames);
        if (nextName) {
          activeName = nextName;
          joinView.showToast(`Name taken. Retrying as ${nextName}...`, "info");
          continue;
        }
      }

      const message = "Name taken - pick again.";
      joinView.showToast(message, "error");
      joinView.setStatus(message);
      return null;
    }
  }

  return null;
}

function formatMatchmakerError(error: unknown): string {
  if (error instanceof MatchmakerError) {
    if (error.code === "CODE_INVALID") {
      return "Invalid code";
    }
    if (error.code === "CODE_EXPIRED") {
      return "Code expired";
    }
    if (error.code === "ROOM_FULL") {
      return "Room full";
    }
  }

  return error instanceof Error ? error.message : "Connection failed.";
}

function mapStatusFromMatchmakerCode(code: string): number | null {
  switch (code) {
    case "CODE_INVALID":
      return 400;
    case "ROOM_FULL":
      return 409;
    case "UNAUTHORIZED":
      return 401;
    case "METHOD_NOT_ALLOWED":
      return 405;
    case "INTERNAL_ERROR":
      return 500;
    default:
      return null;
  }
}

function formatCreateMatchFailure(error: unknown): string {
  if (error instanceof MatchmakerError) {
    const status = mapStatusFromMatchmakerCode(error.code);
    const statusText = status === null ? "unknown" : String(status);
    return `Failed to create match (status ${statusText}, code ${error.code})`;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return `Failed to create match (status unknown): ${message}`;
}

async function wakeServerForConnect(endpoint: string): Promise<void> {
  const healthzUrl = getHealthzUrlFromWebSocketEndpoint(endpoint);
  await wakeServer(healthzUrl, {
    maxAttempts: 8,
    retryDelayMs: 2500,
    requestTimeoutMs: 10_000,
    onAttempt: (attempt) => {
      joinView.setStatus(`Waking server... (attempt ${attempt})`);
    }
  });
}

function cancelReconnect(): void {
  if (reconnectTimer !== undefined) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  reconnectAttempt = 0;
}

function scheduleReconnect(session: ActiveSession): void {
  if (reconnectTimer !== undefined) {
    return;
  }

  const attemptReconnect = () => {
    const delayMs = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempt));
    joinView.setStatus(`Disconnected. Reconnecting in ${Math.ceil(delayMs / 1000)}s...`);
    reconnectTimer = window.setTimeout(async () => {
      reconnectTimer = undefined;
      if (!currentSession) {
        return;
      }

      try {
        await wakeServerForConnect(session.endpoint);
        const connectedName = await startGameWithNameRetry({
          roomId: session.roomId,
          joinCode: session.joinCode,
          initialName: session.name,
          endpoint: session.endpoint,
          keepCodeVisible: session.keepCodeVisible
        });

        if (connectedName) {
          session.name = connectedName;
          currentSession = session;
          cancelReconnect();
          joinView.setStatus("Reconnected.");
          return;
        }
      } catch (error) {
        console.warn("Reconnect attempt failed:", error);
      }

      reconnectAttempt += 1;
      if (reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
        joinView.showToast("Reconnect failed. Reload and join again.", "error");
        joinView.setStatus("Reconnect failed. Reload and join again.");
        cancelReconnect();
        return;
      }

      attemptReconnect();
    }, delayMs);
  };

  attemptReconnect();
}

joinView.onWakeServer(async ({ serverUrlOverride }) => {
  const endpoint = resolveCurrentWebSocketEndpoint(serverUrlOverride);
  await wakeServerForConnect(endpoint);
});

joinView.onCreateMatch(async ({ serverUrlOverride, name }) => {
  const endpoint = resolveCurrentWebSocketEndpoint(serverUrlOverride);
  try {
    await wakeServerForConnect(endpoint);
    const created = await createMatch(endpoint, {
      inviteKey: getMatchmakerInviteKey(),
      secret: getMatchmakerSecret()
    });
    joinView.setCode(created.code);
    joinView.showToast(`Created match: ${created.code}`, "info");
    await joinView.copyCurrentCode();
    const connectedName = await startGameWithNameRetry({
      roomId: created.roomId,
      joinCode: created.code,
      initialName: name,
      endpoint,
      keepCodeVisible: true
    });
    if (!connectedName) {
      return;
    }
  } catch (error) {
    const message = formatCreateMatchFailure(error);
    joinView.showToast(message, "error");
    joinView.setStatus(message);
  }
});

joinView.onJoinMatch(async ({ serverUrlOverride, name, code }) => {
  const endpoint = resolveCurrentWebSocketEndpoint(serverUrlOverride);
  try {
    await wakeServerForConnect(endpoint);
    const joined = await joinMatchByCode(endpoint, code, {
      inviteKey: getMatchmakerInviteKey(),
      secret: getMatchmakerSecret()
    });
    const connectedName = await startGameWithNameRetry({
      roomId: joined.roomId,
      joinCode: code,
      initialName: name,
      endpoint,
      keepCodeVisible: false
    });
    if (!connectedName) {
      return;
    }
  } catch (error) {
    const message = formatMatchmakerError(error);
    joinView.showToast(message, "error");
    joinView.setStatus(message);
  }
});
