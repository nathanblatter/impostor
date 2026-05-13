import express, { type Request, type Response } from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuid } from "uuid";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Player } from "./Player.js";
import * as RoomManager from "./RoomManager.js";
import * as WordPool from "./WordPool.js";
import { initDb, getPool } from "./db.js";
import { MessageRateLimiter, AiThrottle, checkIpLimit, sanitizeName, sanitizeText, sanitizeRoomCode } from "./rateLimit.js";
import { logger } from "./logger.js";
import type { ClientMessage } from "../shared/messages.js";

const MAX_MESSAGE_BYTES = 4096;

// Maps room code -> KPI session id for active game sessions
const roomSessionIds = new Map<string, number>();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "4567", 10);

const app = express();
app.use(express.json());

// Static files
const clientDir = join(__dirname, "..", "client");
app.use(express.static(clientDir));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", rooms: RoomManager.getRoomCount(), uptime: Math.floor(process.uptime()) });
});

// KPI endpoint
app.get("/api/kpi", async (req: Request, res: Response) => {
  if (req.headers["x-kpi-api-key"] !== process.env.KPI_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    const [sessionsRes, modeRes, retentionRes] = await Promise.all([
      pool.query(`
        SELECT
          AVG(rounds_played) AS avg_rounds,
          AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000) AS avg_duration_ms,
          COUNT(*) FILTER (WHERE completed) AS completed_count,
          COUNT(*) AS total_count
        FROM game_sessions
        WHERE started_at > NOW() - INTERVAL '30 days'
      `),
      pool.query(`
        SELECT game_mode, COUNT(*) AS cnt
        FROM game_sessions
        WHERE started_at > NOW() - INTERVAL '30 days'
        GROUP BY game_mode
      `),
      pool.query(`
        SELECT
          COUNT(DISTINCT session_id) FILTER (
            WHERE event_type = 'player_left'
          )::float / NULLIF(COUNT(DISTINCT id), 0) AS dropout_rate
        FROM game_sessions
        WHERE started_at > NOW() - INTERVAL '30 days'
      `),
    ]);

    const s = sessionsRes.rows[0] || {};
    const modeDistribution: Record<string, number> = {};
    for (const row of modeRes.rows) {
      modeDistribution[row.game_mode] = parseInt(row.cnt);
    }
    const dropoutRate = parseFloat(retentionRes.rows[0]?.dropout_rate || 0);

    // emoji reactions per session
    const emojiRes = await pool.query(`
      SELECT AVG(emoji_count) AS avg_emoji FROM (
        SELECT session_id, COUNT(*) AS emoji_count
        FROM game_events
        WHERE event_type = 'emoji'
          AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY session_id
      ) sub
    `);

    res.json({
      project: "impostor",
      generated_at: new Date().toISOString(),
      kpis: {
        emoji_reactions_per_session: {
          value: parseFloat(emojiRes.rows[0]?.avg_emoji || 0),
          label: "Avg Emoji Reactions / Session",
          unit: "reactions"
        },
        rounds_per_session: {
          value: parseFloat(s.avg_rounds || 0),
          label: "Avg Rounds / Session",
          unit: "rounds"
        },
        avg_round_duration_ms: {
          value: parseFloat(s.avg_duration_ms || 0),
          label: "Avg Game Duration",
          unit: "ms"
        },
        player_retention_rate: {
          value: parseFloat(((1 - dropoutRate) * 100).toFixed(1)),
          label: "Player Retention Rate",
          unit: "%"
        },
        completed_games_30d: {
          value: parseInt(s.completed_count || 0),
          label: "Completed Games (30d)",
          unit: "games"
        },
        game_mode_distribution: {
          value: JSON.stringify(modeDistribution) as any,
          label: "Game Mode Distribution",
          unit: "json"
        }
      }
    });
  } catch (err) {
    console.error("KPI error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// SPA fallback
app.get("/{*splat}", (_req, res) => {
  res.sendFile(join(clientDir, "index.html"));
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket, req) => {
  let playerId: string | null = null;
  const limiter = new MessageRateLimiter();
  const aiThrottle = new AiThrottle();
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim()
    ?? req.socket.remoteAddress
    ?? "unknown";
  logger.info(`WS connect ip=${ip}`);

  ws.on("message", (data) => {
    // Size check
    const raw = data.toString();
    if (Buffer.byteLength(raw, "utf8") > MAX_MESSAGE_BYTES) {
      logger.warn(`Oversized message from ip=${ip}`);
      ws.send(JSON.stringify({ type: "ERROR", message: "Message too large" }));
      ws.terminate();
      return;
    }

    // Flood check
    if (!limiter.check()) {
      if (limiter.isAbusive()) {
        logger.warn(`Abusive flood from ip=${ip}, terminating`);
        ws.terminate();
        return;
      }
      ws.send(JSON.stringify({ type: "ERROR", message: "Slow down" }));
      return;
    }

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: "ERROR", message: "Invalid message" }));
      return;
    }

    handleMessage(ws, msg, playerId, ip, aiThrottle).then((newId) => {
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
  currentPlayerId: string | null,
  ip: string,
  aiThrottle: AiThrottle
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
      if (!checkIpLimit(ip, 10)) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Too many rooms created — try again later" }));
        return null;
      }
      const name = sanitizeName(msg.playerName);
      if (!name) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Invalid player name" }));
        return null;
      }
      const id = uuid();
      const player = new Player(id, name, ws, true);
      const room = RoomManager.createRoom(player);
      player.send({ type: "ROOM_CREATED", roomCode: room.code, playerId: id });
      room.broadcastState();
      return id;
    }

    case "JOIN_ROOM": {
      // Check for reconnection first (skip if joining as spectator)
      if (currentPlayerId && !msg.asSpectator) {
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

      if (!checkIpLimit(ip, 20)) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Too many join attempts — try again later" }));
        return null;
      }
      const joinName = sanitizeName(msg.playerName);
      const roomCode = sanitizeRoomCode(msg.roomCode);
      if (!joinName || !roomCode) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Invalid name or room code" }));
        return null;
      }
      const id = uuid();
      const player = new Player(id, joinName, ws, false, msg.asSpectator ?? false);
      const result = RoomManager.joinRoom(roomCode, player);
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
      else {
        const pool = getPool();
        if (pool) {
          pool.query(
            "INSERT INTO game_sessions (room_id, game_mode, player_count) VALUES ($1, $2, $3) RETURNING id",
            [room.code, room.settings.mode, room.players.size]
          ).then((res) => {
            const sessionId = res.rows[0]?.id;
            if (sessionId) roomSessionIds.set(room.code, sessionId);
          }).catch((e) => console.error("KPI start_game insert failed:", e));
        }
      }
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
      const word = sanitizeText(msg.word, 30);
      if (!word) { ws.send(JSON.stringify({ type: "ERROR", message: "Invalid word" })); return null; }
      const err = room.submitDescriptor(currentPlayerId, word);
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
      const trigger = sanitizeText(msg.trigger, 80);
      const action = sanitizeText(msg.action, 80);
      if (!trigger || !action) { ws.send(JSON.stringify({ type: "ERROR", message: "Invalid trigger or action" })); return null; }
      const err = room.triggerSubmitAssignment(currentPlayerId, trigger, action);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "TRIGGER_GUESS": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = msg.triggerGuess === "__REVEAL__"
        ? room.triggerSkipToReveal(currentPlayerId)
        : room.triggerGuess(currentPlayerId, msg.targetName, sanitizeText(msg.triggerGuess, 100) ?? msg.triggerGuess);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "TRIGGER_GET_SUGGESTION": {
      if (!currentPlayerId) return null;
      if (!aiThrottle.isAllowed()) {
        ws.send(JSON.stringify({ type: "ERROR", message: `Wait ${aiThrottle.cooldownSeconds()}s before requesting another suggestion` }));
        return null;
      }
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
      const answer = sanitizeText(msg.answer, 100);
      if (!answer) { ws.send(JSON.stringify({ type: "ERROR", message: "Invalid answer" })); return null; }
      const err = room.submitAnswer(currentPlayerId, answer);
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
      const sessionId = roomSessionIds.get(room.code);
      if (sessionId) {
        const pool = getPool();
        if (pool) {
          pool.query(
            "UPDATE game_sessions SET ended_at = NOW(), completed = true, rounds_played = $2 WHERE id = $1",
            [sessionId, room.roundNumber]
          ).catch((e) => console.error("KPI return_to_lobby update failed:", e));
        }
        roomSessionIds.delete(room.code);
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

    case "KICK_PLAYER": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.kickPlayer(currentPlayerId, msg.targetId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "TRANSFER_HOST": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.transferHost(currentPlayerId, msg.targetId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "SET_COLOR": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.setPlayerColor(currentPlayerId, msg.color);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "TOGGLE_PAUSE": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.togglePause(currentPlayerId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "BONUS_VOTE": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.bonusCastVote(currentPlayerId, msg.targetId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "REACT": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const player = room.players.get(currentPlayerId);
      if (!player) return null;
      const ALLOWED_EMOJIS = ["😂", "🤔", "😱", "👀", "🔥", "💀"];
      if (!ALLOWED_EMOJIS.includes(msg.emoji)) return null;
      for (const p of room.players.values()) {
        p.send({ type: "REACTION", emoji: msg.emoji, playerName: player.name, color: player.color });
      }
      const sessionId = roomSessionIds.get(room.code);
      if (sessionId) {
        const pool = getPool();
        if (pool) {
          pool.query(
            "INSERT INTO game_events (session_id, event_type, data) VALUES ($1, 'emoji', $2)",
            [sessionId, JSON.stringify({ emoji: msg.emoji, playerName: player.name })]
          ).catch((e) => console.error("KPI emoji insert failed:", e));
        }
      }
      return null;
    }

    case "SCALE_DESCRIBE": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const desc = sanitizeText(msg.description, 150);
      if (!desc) { ws.send(JSON.stringify({ type: "ERROR", message: "Invalid description" })); return null; }
      const err = room.scaleDescribe(currentPlayerId, desc);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "SCALE_ADVANCE": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.scaleAdvance(currentPlayerId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "SCALE_ORDER": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.scaleOrder(currentPlayerId, msg.correct);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "SCALE_VOTE": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.scaleVote(currentPlayerId, msg.targetId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "SCALE_NEXT": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const err = room.scaleNext(currentPlayerId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
      return null;
    }

    case "FINISH_BONUS": {
      if (!currentPlayerId) return null;
      const room = RoomManager.getRoomForPlayer(currentPlayerId);
      if (!room) return null;
      const player = room.players.get(currentPlayerId);
      if (!player?.isHost) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Only host can continue" }));
        return null;
      }
      const err = room.finishBonus(currentPlayerId);
      if (err) ws.send(JSON.stringify({ type: "ERROR", message: err }));
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
