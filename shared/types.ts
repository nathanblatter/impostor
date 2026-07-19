import type {
  SHPlayer,
  SHGamePhase,
  SHPolicyTrack,
  SHGameResult,
  SHGameLogEntry,
  SHChatMessage,
  SecretRole,
  PartyMembership,
  PolicyType,
  ExecutivePower,
  Government,
} from "./secretHitler.js";

export type GameMode = "SPYFALL" | "IMPOSTOR" | "ODD_ONE_OUT" | "HOT_TAKE" | "MAFIA" | "FINGER_POINT" | "TOUCHY_SUBJECTS" | "TRIGGER" | "SCALE" | "CODENAMES" | "SECRET_HITLER";
export type GamePhase = "LOBBY" | "PLAYING" | "VOTING" | "SPY_GUESS" | "RESULTS" | "BONUS";

export type CodenamesAssignMode = "RANDOM" | "HOST";

export interface PublicPlayer {
  id: string;
  name: string;
  color: string;
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
  bonusStarsEnabled: boolean;
  codenamesAssignMode: CodenamesAssignMode;
  codenamesAdultMode: boolean;
  secretHitlerAiCount: number;
  secretHitlerTtsNarration: boolean;
}

export interface SpectatorReveal {
  spyId: string | null;
  impostorIds: string[];
  fakerId: string | null;
  oddPlayerId: string | null;
  mafiaRoles: { playerId: string; playerName: string; role: string }[];
}

export interface BonusVoteState {
  categoryIndex: number;
  categories: string[];
  currentCategory: string;
  votes: Record<string, string>; // voterId -> targetId
  hasVoted: boolean;
  timerEndsAt: number;
  revealPhase: boolean;
  winner: { id: string; name: string } | null;
  bonusPoints: Record<string, number>;
  done: boolean;
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
  timerPaused: boolean;
  bonusVote: BonusVoteState | null;
  // Codenames lobby team assignment (only populated for CODENAMES mode in LOBBY)
  codenamesSetup: CodenamesSetup | null;
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
  hotTakeOptions: string[] | null;
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
  // Scale
  scale: ScaleState | null;
  // Codenames
  codenames: CodenamesState | null;
  // Secret Hitler
  secretHitler: SecretHitlerState | null;
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

export type ScaleSubPhase = "DESCRIBING" | "DISCUSSING" | "REVEAL" | "DONE";

export interface ScaleDescription {
  playerId: string;
  playerName: string;
  description: string;
  number?: number; // only shown in REVEAL/DONE
  hasVoted: boolean;
}

export interface ScaleState {
  subPhase: ScaleSubPhase;
  scenario: string;
  scenarioRound: number;
  totalRounds: number;
  myNumber: number;
  hasDescribed: boolean;
  submittedCount: number;
  totalCount: number;
  descriptions: ScaleDescription[] | null; // null during DESCRIBING
  orderCorrect: boolean | null;
  myVote: string | null;
  bestDescriptorId: string | null;
  scores: Record<string, number>;
  timerEndsAt: number;
}

// ── Codenames ──

export type CardType = "red" | "blue" | "neutral" | "assassin";
export type CodenamesSubPhase = "CLUE" | "GUESS" | "GAME_OVER";

export interface CodenamesClue {
  word: string;
  count: number;       // how many cards the clue points to
  guessesUsed: number; // guesses the active team has made on this clue
}

export interface CodenamesTeamMember {
  id: string;
  name: string;
  color: string;
  isSpymaster: boolean;
  isConnected: boolean;
}

export interface CodenamesSetup {
  // Lobby-time team assignment (HOST mode). teams maps playerId -> team.
  teams: Record<string, "red" | "blue">;
  spymasters: { red: string | null; blue: string | null };
}

export interface CodenamesState {
  subPhase: CodenamesSubPhase;
  words: string[];                  // 25 words
  // cardTypes[i] is the real type for revealed cards (everyone) and for ALL cards
  // if the viewer is a spymaster or spectator; otherwise null (hidden).
  cardTypes: (CardType | null)[];
  revealed: boolean[];
  currentTurn: "red" | "blue";
  startingTeam: "red" | "blue";
  clue: CodenamesClue | null;
  // Viewer-specific
  myTeam: "red" | "blue" | null;    // null for spectators
  isSpymaster: boolean;
  // Scoreboard
  redRemaining: number;
  blueRemaining: number;
  redTotal: number;
  blueTotal: number;
  redTeam: CodenamesTeamMember[];
  blueTeam: CodenamesTeamMember[];
  winner: "red" | "blue" | null;
  loadingWords: boolean;            // true while AI is generating the board
  // Spymaster AI hint suggestion (only sent to the active spymaster after request)
  aiHint: { word: string; count: number } | null;
}

// ── Secret Hitler ──
// Per-player wire state: engine public state plus the viewer's private fields,
// merged server-side (spectators and ghosts get the private fields as null).

export interface SecretHitlerState {
  subPhase: SHGamePhase;
  players: SHPlayer[]; // engine seats: humans + AI ghosts (ids ai_*)
  policyTrack: SHPolicyTrack;
  drawPileCount: number;
  discardPileCount: number;
  electionTracker: number;
  currentPresidentId: string | null;
  nominatedChancellorId: string | null;
  lastElectedGovernment: Government | null;
  votes: Record<string, boolean> | null; // revealed only after resolution
  votedCount: number;
  voteResult: "passed" | "failed" | null;
  vetoRequested: boolean;
  vetoUnlocked: boolean;
  pendingExecutivePower: ExecutivePower | null;
  result: SHGameResult | null;
  awaitingDiscussion: boolean;
  readyVotes: string[];
  gameLog: SHGameLogEntry[];
  chatLog: SHChatMessage[];
  // Viewer-specific (null for spectators)
  myRole: SecretRole | null;
  myParty: PartyMembership | null;
  knownFascists: string[];
  knownHitlerId: string | null;
  myHasVoted: boolean;
  hasAckedRole: boolean;
  policyChoices: PolicyType[] | null; // 3 for president, 2 for chancellor
  policyPeek: PolicyType[] | null;
  investigationResult: { targetId: string; targetName: string; party: PartyMembership } | null;
  investigationHistory: { targetName: string; party: PartyMembership; round: number }[] | null;
  // Game-over reveal
  allRoles: { id: string; name: string; role: SecretRole }[] | null;
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
  hotTakeOptions?: string[];
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
  bonusStarsEnabled: true,
  codenamesAssignMode: "RANDOM" as const,
  codenamesAdultMode: true,
  secretHitlerAiCount: 0,
  secretHitlerTtsNarration: false,
};
