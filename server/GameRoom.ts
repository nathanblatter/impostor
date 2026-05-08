import { Player } from "./Player.js";
import * as WordPool from "./WordPool.js";
import * as AiPlayer from "./AiPlayer.js";
import type {
  GamePhase,
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
  private playerRoles: Map<string, string> = new Map();
  private spyId: string | null = null;
  private impostorIds: string[] = [];
  private votes: Map<string, string> = new Map();
  private descriptorHistory: DescriptorEntry[] = [];
  private currentTurnIndex: number = 0;
  private currentDescriptorRound: number = 1;
  private turnOrder: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerEndsAt: number = 0;
  private resultReason: string = "";

  // AI mode
  private aiControlledId: string | null = null;
  private aiSuggestedWords: Map<string, string> = new Map(); // key: `round:playerId` -> word
  private aiDirectives: string[] = [];
  private aiGenerating: boolean = false;

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
    this.playerRoles.clear();
    this.aiSuggestedWords.clear();
    this.aiDirectives = [];
    this.aiControlledId = null;

    const playerIds = this.activePlayers.map((p) => p.id);

    if (this.settings.mode === "SPYFALL") {
      this.spyId = playerIds[Math.floor(Math.random() * playerIds.length)];
      this.impostorIds = [];
      const loc = WordPool.getLocation(this.code);
      this.location = loc.location;
      this.allLocations = loc.allLocations;
      const shuffledRoles = [...loc.roles].sort(() => Math.random() - 0.5);
      let roleIdx = 0;
      for (const pid of playerIds) {
        if (pid === this.spyId) continue;
        this.playerRoles.set(pid, shuffledRoles[roleIdx % shuffledRoles.length]);
        roleIdx++;
      }
      this.secretWord = null;
      this.category = "";

      // AI mode for Spyfall: pick a non-spy player
      if (this.settings.aiMode) {
        const eligible = playerIds.filter((id) => id !== this.spyId);
        if (eligible.length > 0) {
          this.aiControlledId = eligible[Math.floor(Math.random() * eligible.length)];
          this.generateSpyfallDirectives();
        }
      }
    } else {
      // Impostor mode
      this.spyId = null;
      this.location = null;
      this.allLocations = [];
      const w = WordPool.getWord(this.code);
      this.secretWord = w.word;
      this.category = w.category;
      const count = playerIds.length >= 7 ? 2 : 1;
      const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
      this.impostorIds = shuffled.slice(0, count);
      this.turnOrder = [...playerIds].sort(() => Math.random() - 0.5);

      // AI mode: pick one random non-impostor player
      if (this.settings.aiMode) {
        const eligible = playerIds.filter((id) => !this.impostorIds.includes(id));
        if (eligible.length > 0) {
          this.aiControlledId = eligible[Math.floor(Math.random() * eligible.length)];
        }
      }
    }

    this.startTimer(this.settings.roundDurationSec, () => this.onPlayingTimerEnd());
    this.broadcastState();

    // Pre-generate AI word for the first turn if needed
    if (this.settings.mode === "IMPOSTOR" && this.aiControlledId) {
      this.maybeGenerateAiWord();
    }
  }

  private async maybeGenerateAiWord() {
    if (!this.aiControlledId || this.phase !== "PLAYING") return;
    const currentPlayerId = this.turnOrder[this.currentTurnIndex];
    if (currentPlayerId !== this.aiControlledId) return;

    const key = `${this.currentDescriptorRound}:${this.aiControlledId}`;
    if (this.aiSuggestedWords.has(key)) return;
    if (this.aiGenerating) return;

    this.aiGenerating = true;
    try {
      const previousWords = this.descriptorHistory.map((d) => d.word);
      const word = await AiPlayer.generateDescriptor(
        this.secretWord!,
        this.category,
        previousWords
      );
      this.aiSuggestedWords.set(key, word);
      // Re-broadcast so the AI player sees the suggested word
      if (this.phase === "PLAYING") {
        this.broadcastState();
      }
    } catch (err) {
      console.error("AI word generation failed, using fallback:", err);
      this.aiSuggestedWords.set(key, "interesting");
      if (this.phase === "PLAYING") {
        this.broadcastState();
      }
    } finally {
      this.aiGenerating = false;
    }
  }

  private async generateSpyfallDirectives() {
    if (!this.aiControlledId || !this.location) return;
    const role = this.playerRoles.get(this.aiControlledId) || "Visitor";
    try {
      this.aiDirectives = await AiPlayer.generateDirectives(this.location, role);
      if (this.phase === "PLAYING") {
        this.broadcastState();
      }
    } catch (err) {
      console.error("AI directive generation failed, using fallback:", err);
      this.aiDirectives = [
        "Mention something about the weather outside",
        "Ask someone if they come here often",
        "Complain about something being too expensive",
      ];
      if (this.phase === "PLAYING") {
        this.broadcastState();
      }
    }
  }

  // ── Descriptors (Impostor) ──

  submitDescriptor(playerId: string, word: string): string | null {
    if (this.phase !== "PLAYING") return "Not in playing phase";
    if (this.settings.mode !== "IMPOSTOR") return "Not in impostor mode";
    if (this.turnOrder[this.currentTurnIndex] !== playerId)
      return "Not your turn";
    if (!word || word.includes(" ")) return "Must be a single word";

    // AI-controlled player must submit the AI's word
    if (playerId === this.aiControlledId) {
      const key = `${this.currentDescriptorRound}:${playerId}`;
      const aiWord = this.aiSuggestedWords.get(key);
      if (aiWord && word.toLowerCase() !== aiWord.toLowerCase()) {
        return "You must submit the AI's suggested word";
      }
    }

    const player = this.players.get(playerId)!;
    this.descriptorHistory.push({
      playerId,
      playerName: player.name,
      word: word.trim(),
      round: this.currentDescriptorRound,
    });

    this.currentTurnIndex++;

    if (this.currentTurnIndex >= this.turnOrder.length) {
      this.currentTurnIndex = 0;
      this.currentDescriptorRound++;

      if (this.currentDescriptorRound > this.settings.descriptorRounds) {
        this.startVoting();
        return null;
      }
    }

    this.broadcastState();

    // Generate AI word for next turn if needed
    this.maybeGenerateAiWord();

    return null;
  }

  // ── Spy Guess (Spyfall) ──

  spyGuess(playerId: string, locationGuess: string): string | null {
    if (this.settings.mode !== "SPYFALL") return "Not in Spyfall mode";
    if (playerId !== this.spyId) return "You're not the spy";

    if (this.phase === "PLAYING") {
      this.clearTimer();
      const correct =
        locationGuess.toLowerCase() === this.location!.toLowerCase();
      this.resolveRound(
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
    const voteCounts: Record<string, number> = {};
    for (const targetId of this.votes.values()) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }

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
      if (isTie || votedOutId === null) {
        this.phase = "SPY_GUESS";
        this.clearTimer();
        this.startTimer(this.settings.spyGuessDurationSec, () => {
          this.resolveRound("Spy ran out of time to guess!", false);
        });
        this.broadcastState();
        return;
      }

      if (votedOutId === this.spyId) {
        this.resolveRound("The spy was caught!", false);
      } else {
        this.phase = "SPY_GUESS";
        this.clearTimer();
        this.startTimer(this.settings.spyGuessDurationSec, () => {
          this.resolveRound("Spy ran out of time to guess!", false);
        });
        this.broadcastState();
      }
    } else {
      if (isTie || votedOutId === null) {
        this.resolveRound("Vote was a tie — impostor(s) win!", true);
        return;
      }

      const caughtImpostor = this.impostorIds.includes(votedOutId);
      if (caughtImpostor) {
        this.resolveRound("An impostor was caught!", false);
      } else {
        this.resolveRound("Wrong person voted out — impostor(s) win!", true);
      }
    }
  }

  private resolveRound(reason: string, spyOrImpostorWon: boolean) {
    this.phase = "RESULTS";
    this.resultReason = reason;
    this.clearTimer();

    const scoreChanges: Record<string, number> = {};
    for (const p of this.activePlayers) {
      scoreChanges[p.id] = 0;
    }

    if (this.settings.mode === "SPYFALL") {
      if (!spyOrImpostorWon) {
        for (const p of this.activePlayers) {
          if (p.id !== this.spyId) scoreChanges[p.id] = 2;
        }
      } else {
        if (this.spyId) scoreChanges[this.spyId] = 4;
      }
    } else {
      if (!spyOrImpostorWon) {
        for (const p of this.activePlayers) {
          if (!this.impostorIds.includes(p.id)) scoreChanges[p.id] = 2;
        }
      } else {
        for (const id of this.impostorIds) {
          scoreChanges[id] = 3;
        }
      }
    }

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
    const isAiControlled = playerId === this.aiControlledId;
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
      if (this.phase === "RESULTS") {
        for (const [voter, target] of this.votes) {
          votes[voter] = target;
        }
      }

      let results: RoundResults | null = null;
      if (this.phase === "RESULTS") {
        const totalScores: Record<string, number> = {};
        for (const p of this.activePlayers) {
          totalScores[p.id] = this.scores.get(p.id) || 0;
        }
        results = {
          spyWon:
            this.settings.mode === "SPYFALL"
              ? this.spyId !== null &&
                [...this.votes.values()].filter((v) => v === this.spyId).length <
                  Math.ceil(this.connectedPlayers.length / 2)
              : !this.impostorIds.some(
                  (id) =>
                    [...this.votes.values()].filter((v) => v === id).length >=
                    Math.ceil(this.connectedPlayers.length / 2)
                ),
          reason: this.resultReason || "Round over",
          votes,
          scores: totalScores,
          spyId: this.spyId ?? undefined,
          location: this.location ?? undefined,
          impostorIds:
            this.impostorIds.length > 0 ? this.impostorIds : undefined,
          secretWord: this.secretWord ?? undefined,
          category: this.category || undefined,
          aiControlledId: this.aiControlledId ?? undefined,
        };
      }

      // Get AI suggested word for this player if applicable
      let aiSuggestedWord: string | null = null;
      if (isAiControlled && this.phase === "PLAYING") {
        const key = `${this.currentDescriptorRound}:${playerId}`;
        aiSuggestedWord = this.aiSuggestedWords.get(key) ?? null;
      }

      round = {
        roundNumber: this.roundNumber,
        location:
          this.settings.mode === "SPYFALL"
            ? isSpy && this.phase !== "RESULTS"
              ? null
              : this.location
            : null,
        role:
          this.settings.mode === "SPYFALL" && !isSpy
            ? this.playerRoles.get(playerId) ?? null
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
        isAiControlled,
        aiSuggestedWord,
        aiDirectives: isAiControlled ? this.aiDirectives : [],
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

  destroy() {
    this.clearTimer();
    WordPool.clearRoomTracking(this.code);
  }
}
