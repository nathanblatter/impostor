export type GameMode = "SPYFALL" | "IMPOSTOR" | "ODD_ONE_OUT" | "HOT_TAKE" | "MAFIA" | "FINGER_POINT" | "TOUCHY_SUBJECTS" | "TRIGGER";
export type GamePhase = "LOBBY" | "PLAYING" | "VOTING" | "SPY_GUESS" | "RESULTS";

export interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
  isSpectator: boolean;
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
  aiMode: boolean;
  triggerAssignMode: TriggerAssignMode;
  triggerTimerEnabled: boolean;
}

export interface SpectatorReveal {
  spyId: string | null;
  impostorIds: string[];
  fakerId: string | null;
  oddPlayerId: string | null;
  mafiaRoles: { playerId: string; playerName: string; role: string }[];
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  mode: GameMode;
  players: PublicPlayer[];
  settings: GameSettings;
  round: RoundState | null;
  isSpectator: boolean;
  spectatorReveal: SpectatorReveal | null;
  sessionScores: Record<string, number>;
}

export interface RoundState {
  roundNumber: number;
  // Spyfall
  location: string | null;
  role: string | null;
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
  // AI mode
  isAiControlled: boolean;
  aiSuggestedWord: string | null;
  aiDirectives: string[];
  // Odd One Out
  oddPrompt: string | null;
  oddHasAnswered: boolean;
  oddAnswers: AnswerEntry[] | null;
  oddDiscussing: boolean;
  // Hot Take
  hotTakeQuestion: string | null;
  hotTakeOptionA: string | null;
  hotTakeOptionB: string | null;
  hotTakeIsFaker: boolean;
  hotTakeHasPicked: boolean;
  hotTakePicks: PickEntry[] | null;
  hotTakeDiscussing: boolean;
  // Mafia
  mafia: MafiaState | null;
  // Finger Point
  fingerPoint: FingerPointState | null;
  // Touchy Subjects
  touchySubjects: TouchySubjectsState | null;
  // Trigger
  trigger: TriggerState | null;
  // Shared
  timerEndsAt: number;
  results: RoundResults | null;
}

export type MafiaRole = "MAFIA" | "DOCTOR" | "DETECTIVE" | "CIVILIAN";
export type MafiaPhase = "NIGHT" | "NARRATION" | "DAY" | "DAY_VOTE" | "GAME_OVER";

export interface MafiaState {
  phase: MafiaPhase;
  dayNumber: number;
  myRole: MafiaRole;
  fellowMafia: string[];
  alivePlayers: string[];
  deadPlayers: { id: string; name: string; role: MafiaRole }[];
  narrationText: string | null;
  // Night action state
  hasActed: boolean;
  investigationResult: string | null;
  // Day
  readyCount: number;
  totalAlive: number;
  // AI directives
  aiDirectives: string[];
  // Game over
  winner: "TOWN" | "MAFIA" | null;
  allRoles: { id: string; name: string; role: MafiaRole }[] | null;
}

export type FingerPointSubPhase = "PICKING" | "DISCUSSION" | "VOTING" | "GAME_OVER";

export interface FingerPointState {
  subPhase: FingerPointSubPhase;
  promptRound: number;
  totalRounds: number;
  prompt: string | null;
  isFaker: boolean;
  hasPicked: boolean;
  picks: PickEntry[] | null;
  history: FingerPointRoundHistory[];
  eliminated: string[];
  winner: "TOWN" | "FAKER" | null;
}

export interface FingerPointRoundHistory {
  round: number;
  normalPrompt: string;
  fakerPrompt: string;
  picks: PickEntry[];
}

export type TouchySubjectsPhase = "VOTING" | "GUESSING" | "REVEAL" | "GAME_OVER";

export interface TouchySubjectsState {
  subPhase: TouchySubjectsPhase;
  questionRound: number;
  totalRounds: number;
  question: string | null;
  hasVoted: boolean;
  hasGuessed: boolean;
  // Reveal data (shown during REVEAL)
  voteResults: { playerId: string; playerName: string; count: number }[] | null;
  majorityPlayerId: string | null;
  majorityPlayerName: string | null;
  myGuessCorrect: boolean | null;
  // Scores
  scores: Record<string, number>;
  // Game over
  history: { question: string; majorityName: string }[];
}

export type TriggerSubPhase = "ASSIGNING" | "PLAYING" | "GUESSING" | "REVEAL";
export type TriggerAssignMode = "AI" | "PLAYERS";

export interface TriggerAssignment {
  targetName: string;
  trigger: string;
  action: string;
}

export interface TriggerState {
  subPhase: TriggerSubPhase;
  assignMode: TriggerAssignMode;
  isGuesser: boolean;
  guesserName: string;
  // For triggered players
  myAssignment: TriggerAssignment | null;
  // For player-assign mode
  assignTarget: string | null; // name of player you're assigning a trigger to
  hasSubmittedAssignment: boolean;
  aiSuggestion: { trigger: string; action: string } | null;
  // Guessing
  guessesRemaining: number;
  guessHistory: { targetName: string; triggerGuess: string; correct: boolean }[];
  // Reveal
  allAssignments: TriggerAssignment[] | null;
  guesserScore: number;
}

export interface DescriptorEntry {
  playerId: string;
  playerName: string;
  word: string;
  round: number;
}

export interface AnswerEntry {
  playerId: string;
  playerName: string;
  answer: string;
}

export interface PickEntry {
  playerId: string;
  playerName: string;
  pick: string;
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
  aiControlledId?: string;
  oddPlayerId?: string;
  normalPrompt?: string;
  oddPlayerPrompt?: string;
  fakerId?: string;
  hotTakeQuestion?: string;
  hotTakeFakerQuestion?: string;
  hotTakeOptionA?: string;
  hotTakeOptionB?: string;
}

export const DEFAULT_SETTINGS: GameSettings = {
  mode: "IMPOSTOR",
  roundDurationSec: 360,
  voteDurationSec: 30,
  spyGuessDurationSec: 20,
  maxPlayers: 10,
  descriptorRounds: 2,
  aiMode: false,
  triggerAssignMode: "AI" as const,
  triggerTimerEnabled: true,
};
