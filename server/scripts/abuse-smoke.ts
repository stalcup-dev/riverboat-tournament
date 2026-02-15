import { Client } from "colyseus.js";

const PROTOCOL_VERSION = "0.1.0";
const JOIN_NAMES = ["Chrone", "Simpin"] as const;

interface CreateMatchResponse {
  code: string;
  roomId: string;
}

interface JoinResponse {
  roomId: string;
}

function toWsEndpoint(baseHttp: string): string {
  if (baseHttp.startsWith("https://")) {
    return `wss://${baseHttp.slice("https://".length)}`;
  }
  if (baseHttp.startsWith("http://")) {
    return `ws://${baseHttp.slice("http://".length)}`;
  }
  if (baseHttp.startsWith("ws://") || baseHttp.startsWith("wss://")) {
    return baseHttp;
  }

  throw new Error("Base URL must start with http://, https://, ws:// or wss://");
}

async function createMatch(baseHttp: string): Promise<CreateMatchResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (process.env.MATCHMAKER_SECRET) {
    headers["X-Matchmaker-Secret"] = process.env.MATCHMAKER_SECRET;
  }

  const response = await fetch(`${baseHttp}/match/create`, {
    method: "POST",
    headers
  });
  const json = (await response.json()) as Partial<CreateMatchResponse>;
  if (!response.ok || !json.code || !json.roomId) {
    throw new Error(`create failed status=${response.status} body=${JSON.stringify(json)}`);
  }
  return { code: json.code, roomId: json.roomId };
}

async function joinMatch(baseHttp: string, code: string): Promise<JoinResponse> {
  const response = await fetch(`${baseHttp}/match/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  const json = (await response.json()) as Partial<JoinResponse>;
  if (!response.ok || !json.roomId) {
    throw new Error(`join failed status=${response.status} body=${JSON.stringify(json)}`);
  }
  return { roomId: json.roomId };
}

async function main(): Promise<void> {
  const baseHttp = process.argv[2] ?? "http://localhost:2567";
  const wsEndpoint = toWsEndpoint(baseHttp);
  console.log(`[abuse] target=${baseHttp}`);

  const created = await createMatch(baseHttp);
  console.log(`[abuse] created code=${created.code} roomId=${created.roomId}`);
  const joined = await joinMatch(baseHttp, created.code);
  console.log(`[abuse] joined roomId=${joined.roomId}`);

  const clientA = new Client(wsEndpoint);
  const clientB = new Client(wsEndpoint);
  const roomA = await clientA.joinById(created.roomId, { join_code: created.code });
  const roomB = await clientB.joinById(created.roomId, { join_code: created.code });

  let seqA = 0;
  let seqB = 0;
  const sendA = (type: string, payload: Record<string, unknown>) => {
    seqA += 1;
    roomA.send(type, { v: PROTOCOL_VERSION, client_seq: seqA, ...payload });
  };
  const sendB = (type: string, payload: Record<string, unknown>) => {
    seqB += 1;
    roomB.send(type, { v: PROTOCOL_VERSION, client_seq: seqB, ...payload });
  };

  sendA("JOIN", { name: JOIN_NAMES[0], join_code: created.code });
  sendB("JOIN", { name: JOIN_NAMES[1], join_code: created.code });

  const spamTimers: Array<ReturnType<typeof setInterval>> = [];

  // JOIN spam (HTTP)
  spamTimers.push(
    setInterval(() => {
      void fetch(`${baseHttp}/match/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: created.code })
      }).catch(() => {
        // best-effort spam
      });
    }, 25)
  );

  // MOVE spam (200/s each)
  spamTimers.push(
    setInterval(() => {
      sendA("MOVE", { dx: 1, dy: 0 });
      sendB("MOVE", { dx: -1, dy: 0.2 });
    }, 5)
  );

  // CAST + CATCH spam
  spamTimers.push(
    setInterval(() => {
      sendA("CAST_START", { hotspot_id: "hs_river_01" });
      sendA("CATCH_CLICK", { offer_id: `offer_${Math.random().toString(16).slice(2)}` });
      sendB("CAST_START", { hotspot_id: "hs_river_01" });
      sendB("CATCH_CLICK", { offer_id: `offer_${Math.random().toString(16).slice(2)}` });
    }, 100)
  );

  await new Promise<void>((resolve) => setTimeout(resolve, 10_000));

  spamTimers.forEach((timer) => clearInterval(timer));
  await roomA.leave();
  await roomB.leave();
  console.log("[abuse] completed 10s spam run");
}

void main().catch((error) => {
  console.error(`[abuse] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
