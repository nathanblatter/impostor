import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "../shared/messages.js";
import type { GameState } from "../shared/types.js";
import { enqueueAudio } from "./useAudio.js";

interface SocketState {
  gameState: GameState | null;
  playerId: string | null;
  roomCode: string | null;
  error: string | null;
  connected: boolean;
}

export function useSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<SocketState>({
    gameState: null,
    playerId: sessionStorage.getItem("playerId"),
    roomCode: sessionStorage.getItem("roomCode"),
    error: null,
    connected: false,
  });

  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((s) => ({ ...s, connected: true }));

      // Attempt reconnect if we have a saved session
      const savedPlayerId = sessionStorage.getItem("playerId");
      if (savedPlayerId) {
        ws.send(JSON.stringify({ type: "RECONNECT", playerId: savedPlayerId }));
      }

      // Ping keepalive
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "PING" }));
        }
      }, 15000);
      ws.addEventListener("close", () => clearInterval(ping));
    };

    ws.onmessage = (e) => {
      const msg: ServerMessage = JSON.parse(e.data);

      switch (msg.type) {
        case "ROOM_CREATED":
        case "ROOM_JOINED":
          setState((s) => ({
            ...s,
            playerId: msg.playerId,
            roomCode: msg.roomCode,
            error: null,
          }));
          sessionStorage.setItem("playerId", msg.playerId);
          sessionStorage.setItem("roomCode", msg.roomCode);
          break;
        case "GAME_STATE":
          setState((s) => ({ ...s, gameState: msg.state, error: null }));
          break;
        case "ERROR":
          setState((s) => ({ ...s, error: msg.message }));
          if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
          errorTimerRef.current = setTimeout(() => {
            setState((s) => ({ ...s, error: null }));
          }, 4000);
          break;
        case "NARRATION":
          enqueueAudio(msg.audioBase64);
          break;
        case "PONG":
          break;
      }
    };

    ws.onclose = () => {
      setState((s) => ({ ...s, connected: false }));
      setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const clearSession = useCallback(() => {
    setState((s) => ({
      ...s,
      gameState: null,
      playerId: null,
      roomCode: null,
    }));
    sessionStorage.removeItem("playerId");
    sessionStorage.removeItem("roomCode");
  }, []);

  return { ...state, send, clearSession };
}
