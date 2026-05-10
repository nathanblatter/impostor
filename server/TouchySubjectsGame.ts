import * as AiPlayer from "./AiPlayer.js";
import { Player } from "./Player.js";
import type { TouchySubjectsState, TouchySubjectsPhase } from "../shared/types.js";

export class TouchySubjectsGame {
  private playerIds: string[];
  private playerNames: Map<string, string>;
  private subPhase: TouchySubjectsPhase = "VOTING";
  private questionRound: number = 0;
  private totalRounds: number = 6;
  private question: string = "";
  private previousQuestions: string[] = [];

  private votes: Map<string, string> = new Map(); // voterId -> targetId
  private guesses: Map<string, string> = new Map(); // guesserId -> guessedId
  private scores: Map<string, number> = new Map();
  private history: { question: string; majorityName: string }[] = [];

  // Reveal cache
  private majorityPlayerIds: string[] = [];
  private majorityPlayerId: string | null = null;
  private majorityPlayerName: string | null = null;
  private correctGuessers: Set<string> = new Set();

  private broadcastState: () => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerEndsAt: number = 0;

  constructor(
    playerMap: Map<string, Player>,
    broadcastState: () => void,
    totalRounds: number = 6
  ) {
    this.broadcastState = broadcastState;
    this.totalRounds = totalRounds >= 3 ? totalRounds : 6;
    this.playerIds = [...playerMap.keys()];
    this.playerNames = new Map([...playerMap.entries()].map(([id, p]) => [id, p.name]));

    for (const id of this.playerIds) {
      this.scores.set(id, 0);
    }

    this.startRound();
  }

  // ── Round Flow ──

  private async startRound() {
    this.questionRound++;
    this.subPhase = "VOTING";
    this.votes.clear();
    this.guesses.clear();
    this.majorityPlayerId = null;
    this.majorityPlayerName = null;
    this.correctGuessers.clear();
    this.question = "Loading question...";

    this.startTimer(30, () => this.onVoteTimerEnd());
    this.broadcastState();

    // Generate question
    try {
      this.question = await AiPlayer.generateTouchyQuestion(this.previousQuestions);
    } catch (err) {
      console.error("Touchy question generation failed:", err);
      this.question = "Who is the most likely to start drama?";
    }
    this.previousQuestions.push(this.question);
    if (this.subPhase === "VOTING") this.broadcastState();
  }

  // ── Voting Phase ──

  submitVote(playerId: string, targetId: string): string | null {
    if (this.subPhase !== "VOTING") return "Not in voting phase";
    if (this.votes.has(playerId)) return "Already voted";
    if (!this.playerIds.includes(targetId)) return "Invalid target";

    this.votes.set(playerId, targetId);

    if (this.playerIds.every((id) => this.votes.has(id))) {
      this.clearTimer();
      this.startGuessing();
    } else {
      this.broadcastState();
    }
    return null;
  }

  private onVoteTimerEnd() {
    // Auto-vote for missing players (random)
    for (const id of this.playerIds) {
      if (!this.votes.has(id)) {
        const targets = this.playerIds.filter((t) => t !== id);
        this.votes.set(id, targets[Math.floor(Math.random() * targets.length)]);
      }
    }
    this.startGuessing();
  }

  // ── Guessing Phase ──

  private startGuessing() {
    this.subPhase = "GUESSING";
    this.startTimer(20, () => this.onGuessTimerEnd());
    this.broadcastState();
  }

  submitGuess(playerId: string, targetId: string): string | null {
    if (this.subPhase !== "GUESSING") return "Not in guessing phase";
    if (this.guesses.has(playerId)) return "Already guessed";
    if (!this.playerIds.includes(targetId)) return "Invalid target";

    this.guesses.set(playerId, targetId);

    if (this.playerIds.every((id) => this.guesses.has(id))) {
      this.clearTimer();
      this.reveal();
    } else {
      this.broadcastState();
    }
    return null;
  }

  private onGuessTimerEnd() {
    // Auto-guess for missing players (random)
    for (const id of this.playerIds) {
      if (!this.guesses.has(id)) {
        this.guesses.set(id, this.playerIds[Math.floor(Math.random() * this.playerIds.length)]);
      }
    }
    this.reveal();
  }

  // ── Reveal Phase ──

  private reveal() {
    this.subPhase = "REVEAL";

    // Count votes
    const voteCounts: Record<string, number> = {};
    for (const id of this.playerIds) voteCounts[id] = 0;
    for (const targetId of this.votes.values()) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }

    // Find plurality (accept ties)
    let maxVotes = 0;
    this.majorityPlayerIds = [];
    for (const [id, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        this.majorityPlayerIds = [id];
      } else if (count === maxVotes && count > 0) {
        this.majorityPlayerIds.push(id);
      }
    }
    // Display the first tied player as the "majority" but accept any tied player as correct
    this.majorityPlayerId = this.majorityPlayerIds[0] || null;
    this.majorityPlayerName = this.majorityPlayerIds.length > 1
      ? this.majorityPlayerIds.map((id) => this.playerNames.get(id) || "?").join(" / ")
      : this.majorityPlayerId ? this.playerNames.get(this.majorityPlayerId) || "?" : null;

    // Score guesses — any tied player counts as correct
    this.correctGuessers.clear();
    for (const [guesserId, guessedId] of this.guesses) {
      if (this.majorityPlayerIds.includes(guessedId)) {
        this.correctGuessers.add(guesserId);
        this.scores.set(guesserId, (this.scores.get(guesserId) || 0) + 1);
      }
    }

    // Save to history
    this.history.push({
      question: this.question,
      majorityName: this.majorityPlayerName || "?",
    });

    this.startTimer(10, () => this.nextRoundOrEnd());
    this.broadcastState();
  }

  private nextRoundOrEnd() {
    if (this.questionRound >= this.totalRounds) {
      this.subPhase = "GAME_OVER";
      this.clearTimer();
      this.broadcastState();
    } else {
      this.startRound();
    }
  }

  // ── Timer ──

  private startTimer(seconds: number, callback: () => void) {
    this.clearTimer();
    this.timerEndsAt = Date.now() + seconds * 1000;
    this.timer = setTimeout(callback, seconds * 1000);
  }

  private clearTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  getTimerEndsAt(): number { return this.timerEndsAt; }

  // ── State ──

  getStateForPlayer(playerId: string): TouchySubjectsState {
    let voteResults: { playerId: string; playerName: string; count: number }[] | null = null;
    if (this.subPhase === "REVEAL" || this.subPhase === "GAME_OVER") {
      const counts: Record<string, number> = {};
      for (const id of this.playerIds) counts[id] = 0;
      for (const targetId of this.votes.values()) {
        counts[targetId] = (counts[targetId] || 0) + 1;
      }
      voteResults = this.playerIds
        .map((id) => ({
          playerId: id,
          playerName: this.playerNames.get(id) || "?",
          count: counts[id] || 0,
        }))
        .sort((a, b) => b.count - a.count);
    }

    return {
      subPhase: this.subPhase,
      questionRound: this.questionRound,
      totalRounds: this.totalRounds,
      question: this.question,
      hasVoted: this.subPhase === "VOTING"
        ? this.votes.has(playerId)
        : this.subPhase === "GUESSING"
        ? this.guesses.has(playerId)
        : false,
      hasGuessed: this.guesses.has(playerId),
      voteResults,
      majorityPlayerId: this.subPhase === "REVEAL" || this.subPhase === "GAME_OVER"
        ? this.majorityPlayerId : null,
      majorityPlayerName: this.subPhase === "REVEAL" || this.subPhase === "GAME_OVER"
        ? this.majorityPlayerName : null,
      myGuessCorrect: this.subPhase === "REVEAL" || this.subPhase === "GAME_OVER"
        ? this.correctGuessers.has(playerId) : null,
      scores: Object.fromEntries(this.scores),
      history: this.subPhase === "GAME_OVER" ? this.history : [],
    };
  }

  isGameOver(): boolean { return this.subPhase === "GAME_OVER"; }
  destroy() { this.clearTimer(); }
}
