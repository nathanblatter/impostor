import type { WebSocket } from "ws";
import type { ServerMessage } from "../shared/messages.js";

export class Player {
  id: string;
  name: string;
  color: string = "";
  isHost: boolean;
  isSpectator: boolean;
  ws: WebSocket | null;
  disconnectedAt: number | null = null;

  constructor(id: string, name: string, ws: WebSocket, isHost: boolean = false, isSpectator: boolean = false) {
    this.id = id;
    this.name = name;
    this.ws = ws;
    this.isHost = isHost;
    this.isSpectator = isSpectator;
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === 1;
  }

  send(msg: ServerMessage) {
    if (this.isConnected) {
      this.ws!.send(JSON.stringify(msg));
    }
  }

  disconnect() {
    this.ws = null;
    this.disconnectedAt = Date.now();
  }

  reconnect(ws: WebSocket) {
    this.ws = ws;
    this.disconnectedAt = null;
  }
}
