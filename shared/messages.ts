import type { GameSettings, GameState } from "./types.js";

// Client -> Server
export type ClientMessage =
  | { type: "CREATE_ROOM"; playerName: string }
  | { type: "JOIN_ROOM"; roomCode: string; playerName: string; asSpectator?: boolean }
  | { type: "START_GAME" }
  | { type: "UPDATE_SETTINGS"; settings: Partial<GameSettings> }
  | { type: "CALL_VOTE" }
  | { type: "CAST_VOTE"; targetId: string }
  | { type: "NEXT_ROUND" }
  | { type: "RETURN_TO_LOBBY" }
  | { type: "LEAVE_ROOM" }
  | { type: "PING" }
  | { type: "SPY_GUESS"; locationGuess: string }
  | { type: "SUBMIT_DESCRIPTOR"; word: string }
  | { type: "SUBMIT_ANSWER"; answer: string }
  | { type: "SUBMIT_PICK"; pick: string }
  | { type: "READY_TO_VOTE" }
  | { type: "MAFIA_ACTION"; targetId: string }
  | { type: "FINGER_POINT_PICK"; targetId: string }
  | { type: "TOUCHY_VOTE"; targetId: string }
  | { type: "TOUCHY_GUESS"; targetId: string }
  | { type: "TRIGGER_SUBMIT_ASSIGNMENT"; trigger: string; action: string }
  | { type: "TRIGGER_GUESS"; targetName: string; triggerGuess: string }
  | { type: "TRIGGER_GET_SUGGESTION" }
  | { type: "RECONNECT"; playerId: string };

// Server -> Client
export type ServerMessage =
  | { type: "ROOM_CREATED"; roomCode: string; playerId: string }
  | { type: "ROOM_JOINED"; roomCode: string; playerId: string }
  | { type: "GAME_STATE"; state: GameState }
  | { type: "NARRATION"; audioBase64: string }
  | { type: "ERROR"; message: string }
  | { type: "PONG" };
