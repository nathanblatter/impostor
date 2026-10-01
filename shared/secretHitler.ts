// Secret Hitler engine types + constants, ported from the standalone secreth app.
// Names colliding with impostor's shared/types.ts (GameState, GamePhase, Player) are SH-prefixed.

// ── Roles & Teams ──

export type SecretRole = "liberal" | "fascist" | "hitler";
export type PartyMembership = "liberal" | "fascist";

export interface RoleInfo {
  secretRole: SecretRole;
  partyMembership: PartyMembership;
}

// ── Players ──

export type SHPlayerStatus = "alive" | "dead";

export interface SHPlayer {
  id: string;
  name: string;
  status: SHPlayerStatus;
  isConnected: boolean;
  isAI?: boolean;
}

// What a given player is allowed to see about others
export interface SHPlayerView extends SHPlayer {
  // Only populated for the viewing player themselves, or if game over
  role?: SecretRole;
  partyMembership?: PartyMembership;
}

// ── Policies ──

export type PolicyType = "liberal" | "fascist";

export interface PolicyTile {
  id: string;
  type: PolicyType;
}

// ── Game Phases ──

export type SHGamePhase =
  | "lobby"
  | "role-reveal"
  | "election-nominate"
  | "election-vote"
  | "election-result"
  | "legislative-president"
  | "legislative-chancellor"
  | "executive-action"
  | "game-over";

export type ExecutivePower =
  | "policy-peek"
  | "investigate-loyalty"
  | "special-election"
  | "execution";

// ── Government ──

export interface Government {
  presidentId: string;
  chancellorId: string;
}

// ── Win Condition ──

export type WinCondition =
  | "liberals-policies"
  | "liberals-hitler-killed"
  | "fascists-policies"
  | "fascists-hitler-elected";

export interface SHGameResult {
  winner: "liberals" | "fascists";
  condition: WinCondition;
}

// ── Chat ──

export interface SHChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
  isAI: boolean;
}

// ── Game Log ──

export type SHGameLogEntryType =
  | "election-passed"
  | "election-failed"
  | "policy-enacted"
  | "chaos-policy"
  | "execution"
  | "investigation"
  | "special-election"
  | "veto-approved";

export interface SHGameLogEntry {
  type: SHGameLogEntryType;
  round: number;
  presidentName: string;
  chancellorName?: string;
  /** Only the final enacted policy — no secret info */
  policy?: PolicyType;
  /** Name of the targeted player (execution, investigation, special election) */
  targetName?: string;
  /** Vote tally */
  votesYes?: number;
  votesNo?: number;
  /** Per-player votes: playerName → true (ja) / false (nein) */
  playerVotes?: Record<string, boolean>;
}

// ── Core Game State ──

export interface SHPolicyTrack {
  liberal: number; // 0–5
  fascist: number; // 0–6
}

export interface SHGameState {
  phase: SHGamePhase;
  players: SHPlayer[];

  // Policy state
  policyTrack: SHPolicyTrack;
  drawPileCount: number;
  discardPileCount: number;

  // Election state
  electionTracker: number; // 0–3; hits 3 = chaos policy
  currentPresidentId: string | null;
  nominatedChancellorId: string | null;
  lastElectedGovernment: Government | null;
  lastNominatedGovernment: Government | null;

  // Votes (keys = playerId, hidden until reveal)
  votes: Record<string, boolean> | null;
  votedCount: number; // how many have voted (no reveal of who/what)
  voteResult: "passed" | "failed" | null;

  // Legislative
  vetoRequested: boolean;
  pendingExecutivePower: ExecutivePower | null;

  // Game over
  result: SHGameResult | null;

  // Discussion gate (shown at start of each election-nominate)
  awaitingDiscussion: boolean;
  readyVotes: string[]; // player IDs who voted ready

  // Action log (public, no secret info)
  gameLog: SHGameLogEntry[];

  // Chat log
  chatLog: SHChatMessage[];
}

// ── Player-Specific State (merged into that player's SecretHitlerState) ──

export interface SHPrivateState {
  playerId: string;
  role: SecretRole;
  partyMembership: PartyMembership;
  // Fascists see fellow fascists; Hitler sees fascists in 5-6p games
  knownFascists: string[]; // player IDs
  knownHitlerId: string | null;
  // During legislative phase
  policyChoices?: PolicyType[]; // 3 for president, 2 for chancellor
  // After investigate power used
  investigationResult?: { targetId: string; party: PartyMembership };
  // History of all investigations this player has performed (for private game log)
  investigationHistory?: { targetName: string; party: PartyMembership; round: number }[];
  // After policy peek
  policyPeek?: PolicyType[];
}

// ── Constants ──

export const SH_MIN_PLAYERS = 5;
export const SH_MAX_PLAYERS = 10;

export const POLICY_COUNTS = {
  liberal: 6,
  fascist: 11,
} as const;

export const WIN_CONDITIONS = {
  liberal: { policies: 5 },
  fascist: { policies: 6, hitlerElectedAfter: 3 },
} as const;

export const ELECTION_TRACKER_LIMIT = 3;

// Role distribution by player count
// [liberals, fascists (non-Hitler), + always 1 Hitler]
export const ROLE_DISTRIBUTION: Record<number, { liberals: number; fascists: number }> = {
  5: { liberals: 3, fascists: 1 },
  6: { liberals: 4, fascists: 1 },
  7: { liberals: 4, fascists: 2 },
  8: { liberals: 5, fascists: 2 },
  9: { liberals: 5, fascists: 3 },
  10: { liberals: 6, fascists: 3 },
};

// Fascist board powers by player count and policy slot (1-indexed)
// null means no power granted
export type FascistBoardPowers = Array<null | "policy-peek" | "investigate-loyalty" | "special-election" | "execution">;

export const FASCIST_BOARD_POWERS: Record<"5-6" | "7-8" | "9-10", FascistBoardPowers> = {
  "5-6": [null, null, "policy-peek", "execution", "execution", null],
  "7-8": [null, "investigate-loyalty", "special-election", "execution", "execution", null],
  "9-10": ["investigate-loyalty", "investigate-loyalty", "special-election", "execution", "execution", null],
};

export function getFascistBoardKey(playerCount: number): "5-6" | "7-8" | "9-10" {
  if (playerCount <= 6) return "5-6";
  if (playerCount <= 8) return "7-8";
  return "9-10";
}

export function getPowerForFascistPolicy(playerCount: number, fascistPoliciesEnacted: number): FascistBoardPowers[number] {
  const key = getFascistBoardKey(playerCount);
  const powers = FASCIST_BOARD_POWERS[key];
  // fascistPoliciesEnacted is 1-based when this is called (the policy was just enacted)
  return powers[fascistPoliciesEnacted - 1] ?? null;
}

// ── Helpers ──

export function shShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function shGenerateId(): string {
  return Math.random().toString(36).slice(2, 10);
}
