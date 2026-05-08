import { v4 as uuid } from "uuid";
import { Player } from "./Player.js";
import * as WordPool from "./WordPool.js";
import type {
  GamePhase,
  GameMode,
  GameSettings,
  GameState,
  RoundState,
  PublicPlayer,
  DescriptorEntry,
  RoundResults,
} from "../shared/types.js";
import { DEFAULT_SETTINGS } from "../shared/types.js";
import { MIN_PLAYERS } from "../shared/constants.js";

export class GameRoom {
  code: string;
  players: Map<string, Player> = new Map();
  phase: GamePhase = "LOBBY";
  settings: GameSettings = { ...DEFAULT_SETTINGS };
  roundNumber: number = 0;
  scores: Map<string, number> = new Map();

  // Round state
  private secretWord: string | null = null;
  private category: string = "";
  private location: string | null = null;
  private allLocations: string[] = [];
  private spyId: string | null = null;
  private impostorIds: string[] = [];
  private votes: Map<string, string> = new Map();
  private descriptorHistory: DescriptorEntry[] = [];
  private currentTurnIndex: number = 0;
  private currentDescriptorRound: number = 1;
  private turnOrder: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerEndsAt: number = 0;

  constructor(code: string) {
    this.code = code;
  }

  addPlayer(player: Player): void {
    this.players.set(player.id, player);
    if (!this.scores.has(player.id)) this.scores.set(player.id, 0);
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.scores.delete(playerId);
  }

  get activePlayers(): Player[] {
    return [...this.players.values()];
  }

  get connectedPlayers(): Player[] {
    return this.activePlayers.filter((p) => p.isConnected);
  }

  // ── Start Game ──

  startGame(): string | null {
    if (this.phase !== "LOBBY") return "Game already in progress";
    if (this.activePlayers.length < MIN_PLAYERS)
      return `Need at least ${MIN_PLAYERS} players`;
    this.startRound();
    return null;
  }

  private startRound() {
    this.roundNumber++;
    this.phase = "PLAYING";
    this.votes.clear();
    this.descriptorHistory = [];
    this.currentDescriptorRound = 1;
    this.currentTurnIndex = 0;

    const playerIds = this.activePlayers.map((p) => p.id);

    if (this.settings.mode === "SPYFALL") {
      // Pick spy
      this.spyId = playerIds[Math.floor(Math.random() * playerIds.length)];
      this.impostorIds = [];
      // Pick location
      const loc = WordPool.getLocation(this.code);
      this.location = loc.location;
      this.allLocations = loc.allLocations;
      this.secretWord = null;
      this.category = "";
    } else {
      // Impostor mode
      this.spyId = null;
      this.location = null;
      this.allLocations = [];
      // Pick word
      const w = WordPool.getWord(this.code);
      this.secretWord = w.word;
      this.category = w.category;
      // Pick impostor(s)
      const count = playerIds.length >= 7 ? 2 : 1;
      const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
      this.impostorIds = shuffled.slice(0, count);
      // Turn order (shuffled)
      this.turnOrder = [...playerIds].sort(() => Math.random() - 0.5);
    }

    const duration =
      this.settings.mode === "SPYFALL"
        ? this.settings.roundDurationSec
        : this.settings.roundDurationSec;
    this.startTimer(duration, () => this.onPlayingTimerEnd());
    this.broadcastState();
  }

  // ── Descriptors (Impostor) ──

  submitDescriptor(playerId: string, word: string): string | null {
    if (this.phase !== "PLAYING") return "Not in playing phase";
    if (this.settings.mode !== "IMPOSTOR") return "Not in impostor mode";
    if (this.turnOrder[this.currentTurnIndex] !== playerId)
      return "Not your turn";
    if (!word || word.includes(" ")) return "Must be a single word";

    const player = this.players.get(playerId)!;
    this.descriptorHistory.push({
      playerId,
      playerName: player.name,
      word: word.trim(),
      round: this.currentDescriptorRound,
    });

    this.currentTurnIndex++;

    // Check if all players have gone this round
    if (this.currentTurnIndex >= this.turnOrder.length) {
      this.currentTurnIndex = 0;
      this.currentDescriptorRound++;

      // Auto-vote after configured rounds
      if (this.currentDescriptorRound > this.settings.descriptorRounds) {
        this.startVoting();
        return null;
      }
    }

    this.broadcastState();
    return null;
  }

  // ── Spy Guess (Spyfall) ──

  spyGuess(playerId: string, locationGuess: string): string | null {
    if (this.settings.mode !== "SPYFALL") return "Not in Spyfall mode";
    if (playerId !== this.spyId) return "You're not the spy";

    if (this.phase === "PLAYING") {
      // Spy guesses during discussion
      this.clearTimer();
      const correct =
        locationGuess.toLowerCase() === this.location!.toLowerCase();
      this.resolveRound(
        correct,
        correct ? "Spy guessed the location!" : "Spy guessed wrong!",
        correct
      );
      return null;
    }

    if (this.phase === "SPY_GUESS") {
      this.clearTimer();
      const correct =
        locationGuess.toLowerCase() === this.location!.toLowerCase();
      this.resolveRound(
        correct,
        correct
          ? "Spy guessed the location correctly!"
          : "Spy guessed the wrong location!",
        correct
      );
      return null;
    }

    return "Cannot guess now";
  }

  // ── Voting ──

  callVote(playerId: string): string | null {
    if (this.phase !== "PLAYING") return "Not in playing phase";

    if (this.settings.mode === "IMPOSTOR") {
      // Only allow vote after at least one full round of descriptors
      if (this.currentDescriptorRound <= 1 && this.currentTurnIndex < this.turnOrder.length) {
        return "Complete at least one descriptor round first";
      }
    }

    this.startVoting();
    return null;
  }

  private startVoting() {
    this.phase = "VOTING";
    this.votes.clear();
    this.clearTimer();
    this.startTimer(this.settings.voteDurationSec, () =>
      this.onVotingTimerEnd()
    );
    this.broadcastState();
  }

  castVote(playerId: string, targetId: string): string | null {
    if (this.phase !== "VOTING") return "Not in voting phase";
    if (!this.players.has(targetId)) return "Invalid target";
    if (this.votes.has(playerId)) return "Already voted";

    this.votes.set(playerId, targetId);

    // Check if all connected players voted
    const allVoted = this.connectedPlayers.every((p) =>
      this.votes.has(p.id)
    );
    if (allVoted) {
      this.clearTimer();
      this.resolveVotes();
    } else {
      this.broadcastState();
    }
    return null;
  }

  private onPlayingTimerEnd() {
    if (this.phase === "PLAYING") {
      this.startVoting();
    }
  }

  private onVotingTimerEnd() {
    this.resolveVotes();
  }

  private resolveVotes() {
    // Count votes
    const voteCounts: Record<string, number> = {};
    for (const targetId of this.votes.values()) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }

    // Find player with most votes
    let maxVotes = 0;
    let votedOutId: string | null = null;
    let isTie = false;
    for (const [pid, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        votedOutId = pid;
        isTie = false;
      } else if (count === maxVotes) {
        isTie = true;
      }
    }

    if (this.settings.mode === "SPYFALL") {
      // Ties favor the spy
      if (isTie || votedOutId === null) {
        // Spy not voted out — give spy a chance to guess
        this.phase = "SPY_GUESS";
        this.clearTimer();
        this.startTimer(this.settings.spyGuessDurationSec, () => {
          // Time ran out — spy loses
          this.resolveRound(false, "Spy ran out of time to guess!", false);
        });
        this.broadcastState();
        return;
      }

      if (votedOutId === this.spyId) {
        // Spy caught
        this.resolveRound(false, "The spy was caught!", false);
      } else {
        // Wrong person — spy gets to guess
        this.phase = "SPY_GUESS";
        this.clearTimer();
        this.startTimer(this.settings.spyGuessDurationSec, () => {
          this.resolveRound(false, "Spy ran out of time to guess!", false);
        });
        this.broadcastState();
      }
    } else {
      // Impostor mode — ties favor impostor
      if (isTie || votedOutId === null) {
        this.resolveRound(
          true,
          "Vote was a tie — impostor(s) win!",
          true
        );
        return;
      }

      const caughtImpostor = this.impostorIds.includes(votedOutId);
      if (caughtImpostor) {
        this.resolveRound(
          false,
          "An impostor was caught!",
          false
        );
      } else {
        this.resolveRound(
          true,
          "Wrong person voted out — impostor(s) win!",
          true
        );
      }
    }
  }

  private resolveRound(
    _unused: boolean,
    reason: string,
    spyOrImpostorWon: boolean
  ) {
    this.phase = "RESULTS";
    this.resultReason = reason;
    this.clearTimer();

    // Calculate scores
    const scoreChanges: Record<string, number> = {};
    for (const p of this.activePlayers) {
      scoreChanges[p.id] = 0;
    }

    if (this.settings.mode === "SPYFALL") {
      if (!spyOrImpostorWon) {
        // Others win
        for (const p of this.activePlayers) {
          if (p.id !== this.spyId) {
            scoreChanges[p.id] = 2;
          }
        }
      } else {
        // Spy wins
        if (this.spyId) scoreChanges[this.spyId] = 4;
      }
    } else {
      if (!spyOrImpostorWon) {
        // Others win
        for (const p of this.activePlayers) {
          if (!this.impostorIds.includes(p.id)) {
            scoreChanges[p.id] = 2;
          }
        }
      } else {
        // Impostors win
        for (const id of this.impostorIds) {
          scoreChanges[id] = 3;
        }
      }
    }

    // Apply scores
    for (const [pid, delta] of Object.entries(scoreChanges)) {
      this.scores.set(pid, (this.scores.get(pid) || 0) + delta);
    }

    this.broadcastState();
  }

  // ── Next Round / Return to Lobby ──

  nextRound(): string | null {
    if (this.phase !== "RESULTS") return "Not in results phase";
    this.startRound();
    return null;
  }

  returnToLobby(): string | null {
    if (this.phase !== "RESULTS" && this.phase !== "LOBBY") return "Cannot return to lobby now";
    this.phase = "LOBBY";
    this.clearTimer();
    this.broadcastState();
    return null;
  }

  updateSettings(changes: Partial<GameSettings>): string | null {
    if (this.phase !== "LOBBY") return "Can only change settings in lobby";
    Object.assign(this.settings, changes);
    this.broadcastState();
    return null;
  }

  // ── Timer ──

  private startTimer(seconds: number, callback: () => void) {
    this.clearTimer();
    this.timerEndsAt = Date.now() + seconds * 1000;
    this.timer = setTimeout(callback, seconds * 1000);
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // ── State Broadcasting ──

  broadcastState() {
    for (const player of this.activePlayers) {
      player.send({
        type: "GAME_STATE",
        state: this.getStateForPlayer(player.id),
      });
    }
  }

  private getStateForPlayer(playerId: string): GameState {
    const isSpy = playerId === this.spyId;
    const isImpostor = this.impostorIds.includes(playerId);
    const inGame = this.phase !== "LOBBY";

    const players: PublicPlayer[] = this.activePlayers.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isConnected: p.isConnected,
      hasVoted: this.votes.has(p.id),
      descriptor:
        this.descriptorHistory.find((d) => d.playerId === p.id)?.word ?? null,
    }));

    let round: RoundState | null = null;
    if (inGame) {
      const votes: Record<string, string> = {};
      // Only show votes in results
      if (this.phase === "RESULTS") {
        for (const [voter, target] of this.votes) {
          votes[voter] = target;
        }
      }

      let results: RoundResults | null = null;
      if (this.phase === "RESULTS") {
        const scoreChanges: Record<string, number> = {};
        for (const p of this.activePlayers) {
          scoreChanges[p.id] = this.scores.get(p.id) || 0;
        }
        results = {
          spyWon:
            this.settings.mode === "SPYFALL"
              ? this.spyId !== null &&
                [...this.votes.values()].filter((v) => v === this.spyId)
                  .length <
                  Math.ceil(this.connectedPlayers.length / 2)
              : !this.impostorIds.some(
                  (id) =>
                    [...this.votes.values()].filter((v) => v === id).length >=
                    Math.ceil(this.connectedPlayers.length / 2)
                ),
          reason: this.getResultReason(),
          votes,
          scores: scoreChanges,
          spyId: this.spyId ?? undefined,
          location: this.location ?? undefined,
          impostorIds:
            this.impostorIds.length > 0 ? this.impostorIds : undefined,
          secretWord: this.secretWord ?? undefined,
          category: this.category || undefined,
        };
      }

      round = {
        roundNumber: this.roundNumber,
        location:
          this.settings.mode === "SPYFALL"
            ? isSpy && this.phase !== "RESULTS"
              ? null
              : this.location
            : null,
        isSpy,
        allLocations:
          this.settings.mode === "SPYFALL" ? this.allLocations : [],
        secretWord:
          this.settings.mode === "IMPOSTOR"
            ? isImpostor && this.phase !== "RESULTS"
              ? null
              : this.secretWord
            : null,
        category: this.category,
        isImpostor,
        fellowImpostorNames:
          isImpostor
            ? this.impostorIds
                .filter((id) => id !== playerId)
                .map((id) => this.players.get(id)?.name ?? "Unknown")
            : [],
        currentTurnPlayerId:
          this.settings.mode === "IMPOSTOR" && this.phase === "PLAYING"
            ? this.turnOrder[this.currentTurnIndex] ?? null
            : null,
        descriptorHistory: this.descriptorHistory,
        currentDescriptorRound: this.currentDescriptorRound,
        timerEndsAt: this.timerEndsAt,
        results,
      };
    }

    return {
      roomCode: this.code,
      phase: this.phase,
      mode: this.settings.mode,
      players,
      settings: this.settings,
      round,
    };
  }

  private resultReason: string = "";
  private getResultReason(): string {
    return this.resultReason || "Round over";
  }

  destroy() {
    this.clearTimer();
    WordPool.clearRoomTracking(this.code);
  }
}
