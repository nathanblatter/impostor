import { GameRoom } from "./GameRoom.js";
import { Player } from "./Player.js";
import { ROOM_CODE_LENGTH, ROOM_CODE_CHARS, RECONNECT_TIMEOUT_MS } from "../shared/constants.js";

const rooms: Map<string, GameRoom> = new Map();
const playerRooms: Map<string, string> = new Map(); // playerId -> roomCode

function generateCode(): string {
  let code: string;
  do {
    code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

export function createRoom(player: Player): GameRoom {
  const code = generateCode();
  const room = new GameRoom(code);
  player.isHost = true;
  room.addPlayer(player);
  rooms.set(code, room);
  playerRooms.set(player.id, code);
  return room;
}

export function joinRoom(code: string, player: Player): GameRoom | string {
  const room = rooms.get(code.toUpperCase());
  if (!room) return "Room not found";
  if (player.isSpectator) {
    // Spectators can join at any time, no player limit applies
    const nameTaken = [...room.players.values()].some(
      (p) => p.name.toLowerCase() === player.name.toLowerCase()
    );
    if (nameTaken) return "That name is already taken in this room";
    room.addPlayer(player);
    playerRooms.set(player.id, code.toUpperCase());
    return room;
  }
  if (room.activePlayers.length >= room.settings.maxPlayers) return "Room is full";
  if (room.phase !== "LOBBY") return "Game already in progress — join as spectator to watch";
  const nameTaken = room.activePlayers.some(
    (p) => p.name.toLowerCase() === player.name.toLowerCase()
  );
  if (nameTaken) return "That name is already taken in this room";
  room.addPlayer(player);
  playerRooms.set(player.id, code.toUpperCase());
  return room;
}

export function getRoom(code: string): GameRoom | undefined {
  return rooms.get(code.toUpperCase());
}

export function getRoomForPlayer(playerId: string): GameRoom | undefined {
  const code = playerRooms.get(playerId);
  if (!code) return undefined;
  return rooms.get(code);
}

export function reconnectPlayer(playerId: string, ws: import("ws").WebSocket): { room: GameRoom; player: Player } | null {
  const code = playerRooms.get(playerId);
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) return null;
  const player = room.players.get(playerId);
  if (!player) return null;
  player.reconnect(ws);
  room.broadcastState();
  return { room, player };
}

export function handleDisconnect(playerId: string) {
  const code = playerRooms.get(playerId);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;
  const player = room.players.get(playerId);
  if (!player) return;

  player.disconnect();

  if (room.phase === "LOBBY") {
    // Remove from lobby immediately
    room.removePlayer(playerId);
    playerRooms.delete(playerId);

    // Reassign host if needed (only to non-spectators)
    if (player.isHost && room.activePlayers.length > 0) {
      room.activePlayers[0].isHost = true;
    }

    if (room.activePlayers.length === 0 && room.spectators.length === 0) {
      room.destroy();
      rooms.delete(code);
    } else {
      room.broadcastState();
    }
  } else {
    // In-game: keep player, allow reconnect
    room.broadcastState();

    // Clean up after timeout
    setTimeout(() => {
      if (player.disconnectedAt && Date.now() - player.disconnectedAt >= RECONNECT_TIMEOUT_MS) {
        room.removePlayer(playerId);
        playerRooms.delete(playerId);

        if (player.isHost && room.activePlayers.length > 0) {
          room.activePlayers[0].isHost = true;
        }

        if (room.activePlayers.length === 0 && room.spectators.length === 0) {
          room.destroy();
          rooms.delete(code);
        } else {
          room.broadcastState();
        }
      }
    }, RECONNECT_TIMEOUT_MS);
  }
}

export function getRoomCount(): number {
  return rooms.size;
}

export function leaveRoom(playerId: string) {
  const code = playerRooms.get(playerId);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;
  const player = room.players.get(playerId);
  if (!player) return;

  room.removePlayer(playerId);
  playerRooms.delete(playerId);

  if (player.isHost && room.activePlayers.length > 0) {
    room.activePlayers[0].isHost = true;
  }

  if (room.activePlayers.length === 0 && room.spectators.length === 0) {
    room.destroy();
    rooms.delete(code);
  } else {
    room.broadcastState();
  }
}
