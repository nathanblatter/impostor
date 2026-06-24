import * as AiPlayer from "./AiPlayer.js";
import { Player } from "./Player.js";
import type {
  CardType,
  CodenamesAssignMode,
  CodenamesClue,
  CodenamesState,
  CodenamesSubPhase,
  CodenamesTeamMember,
} from "../shared/types.js";

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class CodenamesGame {
  private players: Map<string, Player>;
  private broadcastFn: () => void;
  private adultMode: boolean;

  private words: string[] = Array(25).fill("");
  private types: CardType[] = [];
  private revealed: boolean[] = Array(25).fill(false);
  private loadingWords = true;

  private teams = new Map<string, "red" | "blue">();
  private spymasters: { red: string | null; blue: string | null } = { red: null, blue: null };

  private startingTeam: "red" | "blue";
  private currentTurn: "red" | "blue";
  private subPhase: CodenamesSubPhase = "CLUE";
  private clue: CodenamesClue | null = null;
  private winner: "red" | "blue" | null = null;

  // AI hint suggestion, keyed by the spymaster it was generated for
  private aiHint: { for: string; word: string; count: number } | null = null;

  constructor(
    playerMap: Map<string, Player>,
    broadcastFn: () => void,
    adultMode: boolean,
    assignMode: CodenamesAssignMode,
    presetTeams?: Map<string, "red" | "blue">,
    presetSpymasters?: { red: string | null; blue: string | null }
  ) {
    this.players = playerMap;
    this.broadcastFn = broadcastFn;
    this.adultMode = adultMode;

    const playerIds = [...playerMap.keys()];
    this.assignTeams(playerIds, assignMode, presetTeams, presetSpymasters);

    // Board types: starting team gets 9, the other 8, plus 7 neutral and 1 assassin.
    this.startingTeam = Math.random() < 0.5 ? "red" : "blue";
    this.currentTurn = this.startingTeam;
    const startCount = 9;
    const otherCount = 8;
    const startType: CardType = this.startingTeam;
    const otherType: CardType = this.startingTeam === "red" ? "blue" : "red";
    this.types = shuffle([
      ...Array<CardType>(startCount).fill(startType),
      ...Array<CardType>(otherCount).fill(otherType),
      ...Array<CardType>(7).fill("neutral"),
      "assassin" as CardType,
    ]);

    this.generateBoard();
  }

  private assignTeams(
    playerIds: string[],
    assignMode: CodenamesAssignMode,
    presetTeams?: Map<string, "red" | "blue">,
    presetSpymasters?: { red: string | null; blue: string | null }
  ) {
    if (assignMode === "HOST" && presetTeams && presetSpymasters) {
      for (const id of playerIds) {
        this.teams.set(id, presetTeams.get(id) ?? "red");
      }
      // Validate spymasters belong to a team; otherwise fall back to first member.
      for (const team of ["red", "blue"] as const) {
        const sm = presetSpymasters[team];
        if (sm && this.teams.get(sm) === team) {
          this.spymasters[team] = sm;
        } else {
          this.spymasters[team] = playerIds.find((id) => this.teams.get(id) === team) ?? null;
        }
      }
      return;
    }

    // RANDOM: split as evenly as possible, first of each team is the spymaster.
    const shuffled = shuffle(playerIds);
    const half = Math.ceil(shuffled.length / 2);
    const red = shuffled.slice(0, half);
    const blue = shuffled.slice(half);
    for (const id of red) this.teams.set(id, "red");
    for (const id of blue) this.teams.set(id, "blue");
    this.spymasters.red = red[0] ?? null;
    this.spymasters.blue = blue[0] ?? null;
  }

  private async generateBoard() {
    try {
      this.words = await AiPlayer.generateCodenamesWords(this.adultMode);
    } catch (err) {
      console.error("Codenames word generation failed:", err);
    }
    this.loadingWords = false;
    this.broadcastFn();
  }

  // ── Helpers ──

  private isSpymasterOf(playerId: string, team: "red" | "blue"): boolean {
    return this.spymasters[team] === playerId;
  }

  private remaining(team: "red" | "blue"): number {
    return this.types.filter((t, i) => t === team && !this.revealed[i]).length;
  }

  private endTurn() {
    this.currentTurn = this.currentTurn === "red" ? "blue" : "red";
    this.clue = null;
    this.aiHint = null;
    this.subPhase = "CLUE";
  }

  private declareWinner(team: "red" | "blue") {
    this.winner = team;
    this.subPhase = "GAME_OVER";
  }

  // ── Actions ──

  giveClue(playerId: string, word: string, count: number): string | null {
    if (this.subPhase === "GAME_OVER") return "Game is over";
    if (this.subPhase !== "CLUE") return "A clue has already been given this turn";
    if (!this.isSpymasterOf(playerId, this.currentTurn)) return "Only the active team's spymaster can give a clue";
    const clean = word.trim();
    if (!clean || /\s/.test(clean)) return "The clue must be a single word";
    if (this.words.some((w) => w.toLowerCase() === clean.toLowerCase())) {
      return "The clue can't be a word on the board";
    }
    const n = Math.max(1, Math.floor(count));
    this.clue = { word: clean, count: n, guessesUsed: 0 };
    this.aiHint = null;
    this.subPhase = "GUESS";
    this.broadcastFn();
    return null;
  }

  guess(playerId: string, index: number): string | null {
    if (this.subPhase !== "GUESS") return "Wait for the spymaster's clue";
    const team = this.teams.get(playerId);
    if (!team || team !== this.currentTurn) return "It's not your team's turn";
    if (this.isSpymasterOf(playerId, team)) return "The spymaster can't guess";
    if (typeof index !== "number" || index < 0 || index >= 25) return "Invalid card";
    if (this.revealed[index]) return "That card is already revealed";

    this.revealed[index] = true;
    const type = this.types[index];

    if (type === "assassin") {
      // The guessing team touched the assassin and loses immediately.
      this.declareWinner(this.currentTurn === "red" ? "blue" : "red");
      this.broadcastFn();
      return null;
    }

    if (type === this.currentTurn) {
      // Correct guess.
      if (this.clue) this.clue.guessesUsed++;
      if (this.remaining(this.currentTurn) === 0) {
        this.declareWinner(this.currentTurn);
        this.broadcastFn();
        return null;
      }
      // A clue of N allows up to N+1 guesses.
      if (this.clue && this.clue.guessesUsed > this.clue.count) {
        this.endTurn();
      }
      this.broadcastFn();
      return null;
    }

    // Neutral or the opponent's card — turn ends.
    const opponent: "red" | "blue" = this.currentTurn === "red" ? "blue" : "red";
    if (type === opponent && this.remaining(opponent) === 0) {
      this.declareWinner(opponent);
      this.broadcastFn();
      return null;
    }
    this.endTurn();
    this.broadcastFn();
    return null;
  }

  endTurnAction(playerId: string): string | null {
    if (this.subPhase !== "GUESS") return "You can only end the turn while guessing";
    const team = this.teams.get(playerId);
    if (!team || team !== this.currentTurn) return "It's not your team's turn";
    if (this.isSpymasterOf(playerId, team)) return "The spymaster can't end the guessing turn";
    this.endTurn();
    this.broadcastFn();
    return null;
  }

  async requestAiHint(playerId: string): Promise<string | null> {
    if (this.subPhase !== "CLUE") return "You can only get a hint before giving a clue";
    if (!this.isSpymasterOf(playerId, this.currentTurn)) return "Only the active spymaster can request a hint";
    if (this.loadingWords) return "Board is still loading";

    const team = this.currentTurn;
    const opponent: "red" | "blue" = team === "red" ? "blue" : "red";
    const myWords = this.types.map((t, i) => (t === team && !this.revealed[i] ? this.words[i] : null)).filter(Boolean) as string[];
    const oppWords = this.types.map((t, i) => (t === opponent && !this.revealed[i] ? this.words[i] : null)).filter(Boolean) as string[];
    const neutralWords = this.types.map((t, i) => (t === "neutral" && !this.revealed[i] ? this.words[i] : null)).filter(Boolean) as string[];
    const assassinIdx = this.types.findIndex((t, i) => t === "assassin" && !this.revealed[i]);
    const assassinWord = assassinIdx >= 0 ? this.words[assassinIdx] : undefined;

    try {
      const hint = await AiPlayer.generateCodenamesHint(team, myWords, oppWords, neutralWords, assassinWord);
      // Only keep the hint if the spymaster is still up (state may have changed during the await).
      if (this.subPhase === "CLUE" && this.isSpymasterOf(playerId, this.currentTurn)) {
        this.aiHint = { for: playerId, word: hint.word, count: hint.count };
        this.broadcastFn();
      }
    } catch (err) {
      console.error("Codenames AI hint failed:", err);
      return "Couldn't reach the AI spymaster — try again";
    }
    return null;
  }

  // ── Lifecycle ──

  isGameOver(): boolean {
    return this.subPhase === "GAME_OVER";
  }

  getFinalScoreAwards(): Record<string, number> {
    const awards: Record<string, number> = {};
    if (!this.winner) return awards;
    for (const [id, team] of this.teams) {
      awards[id] = team === this.winner ? 1 : 0;
    }
    return awards;
  }

  getTimerEndsAt(): number {
    return 0; // Codenames is turn-based and untimed.
  }

  destroy() {
    // No timers to clear.
  }

  // ── State ──

  private buildTeam(team: "red" | "blue"): CodenamesTeamMember[] {
    const members: CodenamesTeamMember[] = [];
    for (const [id, t] of this.teams) {
      if (t !== team) continue;
      const p = this.players.get(id);
      members.push({
        id,
        name: p?.name ?? "Unknown",
        color: p?.color ?? "#6b7280",
        isSpymaster: this.spymasters[team] === id,
        isConnected: p?.isConnected ?? false,
      });
    }
    // Spymaster first.
    members.sort((a, b) => Number(b.isSpymaster) - Number(a.isSpymaster));
    return members;
  }

  getStateForPlayer(playerId: string, isSpectator: boolean): CodenamesState {
    const myTeam = this.teams.get(playerId) ?? null;
    const isSpymaster = myTeam !== null && this.isSpymasterOf(playerId, myTeam);
    const canSeeAll = isSpymaster || isSpectator || this.winner !== null;

    const cardTypes: (CardType | null)[] = this.types.map((t, i) =>
      this.revealed[i] || canSeeAll ? t : null
    );

    const aiHint =
      this.aiHint && this.aiHint.for === playerId
        ? { word: this.aiHint.word, count: this.aiHint.count }
        : null;

    return {
      subPhase: this.subPhase,
      words: this.words,
      cardTypes,
      revealed: this.revealed,
      currentTurn: this.currentTurn,
      startingTeam: this.startingTeam,
      clue: this.clue ? { ...this.clue } : null,
      myTeam,
      isSpymaster,
      redRemaining: this.remaining("red"),
      blueRemaining: this.remaining("blue"),
      redTotal: this.types.filter((t) => t === "red").length,
      blueTotal: this.types.filter((t) => t === "blue").length,
      redTeam: this.buildTeam("red"),
      blueTeam: this.buildTeam("blue"),
      winner: this.winner,
      loadingWords: this.loadingWords,
      aiHint,
    };
  }
}
