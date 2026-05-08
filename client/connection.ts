import type { ClientMessage, ServerMessage } from "../shared/messages.js";
import { PING_INTERVAL_MS } from "../shared/constants.js";

type MessageHandler = (msg: ServerMessage) => void;

let ws: WebSocket | null = null;
let handler: MessageHandler = () => {};
let pingInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let savedPlayerId: string | null = null;
let savedRoomCode: string | null = null;

export function onMessage(h: MessageHandler) {
  handler = h;
}

export function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    console.log("Connected");
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => send({ type: "PING" }), PING_INTERVAL_MS);

    // Attempt reconnect if we had a session
    if (savedPlayerId && savedRoomCode) {
      send({ type: "JOIN_ROOM", roomCode: savedRoomCode, playerName: "" });
    }
  };

  ws.onmessage = (e) => {
    const msg: ServerMessage = JSON.parse(e.data);

    // Save session info for reconnection
    if (msg.type === "ROOM_CREATED" || msg.type === "ROOM_JOINED") {
      savedPlayerId = msg.playerId;
      savedRoomCode = msg.roomCode;
      sessionStorage.setItem("playerId", msg.playerId);
      sessionStorage.setItem("roomCode", msg.roomCode);
    }

    handler(msg);
  };

  ws.onclose = () => {
    console.log("Disconnected, reconnecting...");
    if (pingInterval) clearInterval(pingInterval);
    reconnectTimeout = setTimeout(connect, 2000);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function send(msg: ClientMessage) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function getPlayerId(): string | null {
  return savedPlayerId || sessionStorage.getItem("playerId");
}

export function clearSession() {
  savedPlayerId = null;
  savedRoomCode = null;
  sessionStorage.removeItem("playerId");
  sessionStorage.removeItem("roomCode");
}
