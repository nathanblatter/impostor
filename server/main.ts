import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuid } from "uuid";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Player } from "./Player.js";
import * as RoomManager from "./RoomManager.js";
import * as WordPool from "./WordPool.js";
import { initDb } from "./db.js";
import type { ClientMessage } from "../shared/messages.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "4567", 10);

const app = express();
app.use(express.json());

// Static files
const clientDir = join(__dirname, "..", "client");
app.use(express.static(clientDir));

// SPA fallback
app.get("/{*splat}", (_req, res) => {
  res.sendFile(join(clientDir, "index.html"));
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Track ws -> playerId for reconnection
const wsPlayerMap = new WeakMap<WebSocket, string>();

wss.on("connection", (ws: WebSocket) => {
  let playerId: string | null = null;

  ws.on("message", (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: "ERROR", message: "Invalid message" }));
      return;
    }

    handleMessage(ws, msg, playerId).then((newId) => {
      if (newId) playerId = newId;
    });
  });

  ws.on("close", () => {
    if (playerId) {
      RoomManager.handleDisconnect(playerId);
    }
  });
});

async function handleMessage(
  ws: WebSocket,
  msg: ClientMessage,
  currentPlayerId: string | null
): Promise<string | null> {
  switch (msg.type) {
    case "PING": {
      ws.send(JSON.stringify({ type: "PONG" }));
      return null;
    }

    case "RECONNECT": {
      const result = RoomManager.reconnectPlayer(msg.playerId, ws);
      if (result) {
        result.player.send({
          type: "ROOM_JOINED",
          roomCode: result.room.code,
          playerId: msg.playerId,
        });
        result.room.broadcastState();
        return msg.playerId;
      }
      // Player not found — silently fail, client will show home screen
      return null;
    }

    case "CREATE_ROOM": {
      const id = uuid();
      const player = new Player(id, msg.playerName, ws, true);
      const room = RoomManager.createRoom(player);
      player.send({ type: "ROOM_CREATED", roomCode: room.code, playerId: id });
      room.broadcastState();
      return id;
    }

    case "JOIN_ROOM": {
      // Check for reconnection first
      if (currentPlayerId) {
        const result = RoomManager.reconnectPlayer(currentPlayerId, ws);
        if (result) {
          result.player.send({
            type: "ROOM_JOINED",
            roomCode: result.room.code,
            playerId: currentPlayerId,
          });
          result.room.broadcastState();
          return currentPlayerId;
        }
      }

      const id = uuid();
      const player = new Player(id, msg.playerName, ws);
      const result = RoomManager.joinRoom(msg.roomCode, player);
      if (typeof result === "string") {
        ws.send(JSON.stringify({ type: "ERROR", message: result }));
        return null;
      }
      player.send({ type: "ROOM_JOINED", roomCode: result.code, playerId: id });
      result.broadcastState();
      return id;
    }

    case "START_GAME": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const player = room.players.get(currentPlayerId);
      if (!player?.isHost) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Only host can start" }));
        return null;
      }
      const err = room.startGame();
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "UPDATE_SETTINGS": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const player = room.players.get(currentPlayerId);
      if (!player?.isHost) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Only host can change settings" }));
        return null;
      }
      const err = room.updateSettings(msg.settings);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "SUBMIT_DESCRIPTOR": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.submitDescriptor(currentPlayerId, msg.word);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "SPY_GUESS": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.spyGuess(currentPlayerId, msg.locationGuess);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "CALL_VOTE": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.callVote(currentPlayerId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "CAST_VOTE": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.settings.mode === "MAFIA"
        ? room.mafiaCastVote(currentPlayerId, msg.targetId)
        : room.settings.mode === "FINGER_POINT"
        ? room.fingerPointVote(currentPlayerId, msg.targetId)
        : room.castVote(currentPlayerId, msg.targetId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "READY_TO_VOTE": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      // Route to mafia game if in mafia mode
      const err = room.settings.mode === "MAFIA"
        ? room.mafiaReadyToVote(currentPlayerId)
        : room.settings.mode === "FINGER_POINT"
        ? room.fingerPointReady(currentPlayerId)
        : room.settings.mode === "TRIGGER"
        ? room.triggerStartGuessing(currentPlayerId)
        : room.readyToVoteAction(currentPlayerId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "TOUCHY_VOTE": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.touchyVote(currentPlayerId, msg.targetId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "TOUCHY_GUESS": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.touchyGuess(currentPlayerId, msg.targetId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "TRIGGER_SUBMIT_ASSIGNMENT": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.triggerSubmitAssignment(currentPlayerId, msg.trigger, msg.action);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "TRIGGER_GUESS": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = msg.triggerGuess === "__REVEAL__"
        ? room.triggerSkipToReveal(currentPlayerId)
        : room.triggerGuess(currentPlayerId, msg.targetName, msg.triggerGuess);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "TRIGGER_GET_SUGGESTION": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = await room.triggerGetSuggestion(currentPlayerId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "FINGER_POINT_PICK": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.fingerPointPick(currentPlayerId, msg.targetId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "MAFIA_ACTION": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.mafiaAction(currentPlayerId, msg.targetId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "SUBMIT_ANSWER": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.submitAnswer(currentPlayerId, msg.answer);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "SUBMIT_PICK": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.submitPick(currentPlayerId, msg.pick);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "NEXT_ROUND": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const player = room.players.get(currentPlayerId);
      if (!player?.isHost) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Only host can start next round" }));
        return null;
      }
      const err = room.nextRound();
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "RETURN_TO_LOBBY": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const player = room.players.get(currentPlayerId);
      if (!player?.isHost) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Only host can return to lobby" }));
        return null;
      }
      const err = room.returnToLobby();
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "LEAVE_ROOM": {
      if (!currentPlayerId) return null;
      RoomManager.leaveRoom(currentPlayerId);
      return null;
    }

    default:
      ws.send(JSON.stringify({ type: "ERROR", message: "Unknown message type" }));
      return null;
  }
}

// Initialize and start
async function main() {
  await initDb();
  await WordPool.init();
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
