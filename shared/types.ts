export type GameMode = "SPYFALL" | "IMPOSTOR";
export type GamePhase = "LOBBY" | "PLAYING" | "VOTING" | "SPY_GUESS" | "RESULTS";

export interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
  hasVoted: boolean;
  descriptor: string | null;
}

export interface GameSettings {
  mode: GameMode;
  roundDurationSec: number;
  voteDurationSec: number;
  spyGuessDurationSec: number;
  maxPlayers: number;
  descriptorRounds: number;
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  mode: GameMode;
  players: PublicPlayer[];
  settings: GameSettings;
  round: RoundState | null;
}

export interface RoundState {
  roundNumber: number;
  // Spyfall
  location: string | null;
  isSpy: boolean;
  allLocations: string[];
  // Impostor
  secretWord: string | null;
  category: string;
  isImpostor: boolean;
  fellowImpostorNames: string[];
  currentTurnPlayerId: string | null;
  descriptorHistory: DescriptorEntry[];
  currentDescriptorRound: number;
  // Shared
  timerEndsAt: number;
  results: RoundResults | null;
}

export interface DescriptorEntry {
  playerId: string;
  playerName: string;
  word: string;
  round: number;
}

export interface RoundResults {
  spyWon: boolean;
  reason: string;
  votes: Record<string, string>;
  scores: Record<string, number>;
  spyId?: string;
  location?: string;
  impostorIds?: string[];
  secretWord?: string;
  category?: string;
}

export const DEFAULT_SETTINGS: GameSettings = {
  mode: "IMPOSTOR",
  roundDurationSec: 360,
  voteDurationSec: 30,
  spyGuessDurationSec: 20,
  maxPlayers: 10,
  descriptorRounds: 2,
};
