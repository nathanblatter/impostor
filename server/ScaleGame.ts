import * as AiPlayer from "./AiPlayer.js";
import { Player } from "./Player.js";
import type { ScaleState, ScaleSubPhase } from "../shared/types.js";

export class ScaleGame {
  private playerIds: string[];
  private playerNames: Map<string, string>;
  private subPhase: ScaleSubPhase = "DESCRIBING";
  private scenarioRound: number = 0;
  private totalRounds: number;
  private scenario: string = "";
  private previousScenarios: string[] = [];

  private numbers: Map<string, number> = new Map();
  private descriptions: Map<string, string> = new Map();

  // REVEAL phase
  private orderCorrect: boolean | null = null;
  private votes: Map<string, string> = new Map(); // voterId -> targetId
  private bestDescriptorId: string | null = null;
  private voteTimer: ReturnType<typeof setTimeout> | null = null;
  private voteTimerEndsAt: number = 0;

  private scores: Map<string, number> = new Map();

  private describeTimer: ReturnType<typeof setTimeout> | null = null;
  private describeTimerEndsAt: number = 0;

  private broadcastFn: () => void;

  constructor(playerMap: Map<string, Player>, broadcastFn: () => void, totalRounds: number = 3) {
    this.broadcastFn = broadcastFn;
    this.totalRounds = Math.max(1, totalRounds);
    this.playerIds = [...playerMap.keys()];
    this.playerNames = new Map([...playerMap.entries()].map(([id, p]) => [id, p.name]));
    for (const id of this.playerIds) {
      this.scores.set(id, 0);
    }
    this.startRound();
  }

  // ── Round Flow ──

  private async startRound() {
    this.scenarioRound++;
    this.subPhase = "DESCRIBING";
    this.descriptions.clear();
    this.votes.clear();
    this.orderCorrect = null;
    this.bestDescriptorId = null;
    this.scenario = "Loading scenario...";
    this.assignNumbers();
    this.startDescribeTimer(75);
    this.broadcastFn();

    try {
      const scenario = await AiPlayer.generateScaleScenario(this.previousScenarios);
      this.scenario = scenario;
      this.previousScenarios.push(scenario);
    } catch {
      this.scenario = this.fallbackScenario();
    }
    this.broadcastFn();
  }

  private assignNumbers() {
    const n = this.playerIds.length;
    // Distribute evenly: segment i covers (i*100/n, (i+1)*100/n]
    const picked = Array.from({ length: n }, (_, i) => {
      const lo = Math.round(i * 100 / n) + 1;
      const hi = Math.round((i + 1) * 100 / n);
      return Math.floor(Math.random() * (hi - lo + 1)) + lo;
    });
    picked.sort(() => Math.random() - 0.5);
    this.numbers.clear();
    this.playerIds.forEach((id, i) => this.numbers.set(id, picked[i]));
  }

  private fallbackScenario(): string {
    const pool = [
      "Going on a first date",
      "Planning a heist",
      "Running for president",
      "Getting away with something at work",
      "Accidentally going viral online",
      "Surviving a breakup",
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private startDescribeTimer(seconds: number) {
    if (this.describeTimer) clearTimeout(this.describeTimer);
    this.describeTimerEndsAt = Date.now() + seconds * 1000;
    this.describeTimer = setTimeout(() => this.onDescribeTimerEnd(), seconds * 1000);
  }

  private clearDescribeTimer() {
    if (this.describeTimer) { clearTimeout(this.describeTimer); this.describeTimer = null; }
    this.describeTimerEndsAt = 0;
  }

  private onDescribeTimerEnd() {
    if (this.subPhase !== "DESCRIBING") return;
    for (const id of this.playerIds) {
      if (!this.descriptions.has(id)) this.descriptions.set(id, "...");
    }
    this.goToDiscussing();
  }

  // ── Actions ──

  submitDescription(playerId: string, description: string): string | null {
    if (this.subPhase !== "DESCRIBING") return "Not in describing phase";
    if (this.descriptions.has(playerId)) return "Already submitted";
    this.descriptions.set(playerId, description.trim().slice(0, 150));
    if (this.playerIds.every(id => this.descriptions.has(id))) {
      this.clearDescribeTimer();
      this.goToDiscussing();
    } else {
      this.broadcastFn();
    }
    return null;
  }

  private goToDiscussing() {
    this.subPhase = "DISCUSSING";
    this.broadcastFn();
  }

  advance(): string | null {
    if (this.subPhase !== "DISCUSSING") return "Not in discussion phase";
    this.subPhase = "REVEAL";
    this.startVoteTimer(25);
    this.broadcastFn();
    return null;
  }

  private startVoteTimer(seconds: number) {
    if (this.voteTimer) clearTimeout(this.voteTimer);
    this.voteTimerEndsAt = Date.now() + seconds * 1000;
    this.voteTimer = setTimeout(() => this.tallyVotes(), seconds * 1000);
  }

  private clearVoteTimer() {
    if (this.voteTimer) { clearTimeout(this.voteTimer); this.voteTimer = null; }
    this.voteTimerEndsAt = 0;
  }

  setOrderResult(correct: boolean): string | null {
    if (this.subPhase !== "REVEAL") return "Not in reveal phase";
    if (this.orderCorrect !== null) return "Order already decided";
    this.orderCorrect = correct;
    if (correct) {
      for (const id of this.playerIds) {
        this.scores.set(id, (this.scores.get(id) ?? 0) + 1);
      }
    }
    this.checkRevealDone();
    return null;
  }

  castVote(voterId: string, targetId: string): string | null {
    if (this.subPhase !== "REVEAL") return "Not in reveal phase";
    if (voterId === targetId) return "Can't vote for yourself";
    if (!this.playerIds.includes(targetId)) return "Invalid target";
    if (this.votes.has(voterId)) return "Already voted";
    this.votes.set(voterId, targetId);
    this.checkRevealDone();
    return null;
  }

  private checkRevealDone() {
    const allVoted = this.playerIds.every(id => this.votes.has(id));
    const orderDecided = this.orderCorrect !== null;
    if (allVoted && orderDecided) {
      this.clearVoteTimer();
      this.tallyVotes();
    } else {
      this.broadcastFn();
    }
  }

  private tallyVotes() {
    this.clearVoteTimer();
    const counts: Record<string, number> = {};
    for (const targetId of this.votes.values()) {
      counts[targetId] = (counts[targetId] ?? 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      this.bestDescriptorId = sorted[0][0];
      this.scores.set(this.bestDescriptorId, (this.scores.get(this.bestDescriptorId) ?? 0) + 1);
    }
    this.subPhase = "DONE";
    this.broadcastFn();
  }

  nextScenario(): string | null {
    if (this.subPhase !== "DONE") return "Round not finished yet";
    if (this.isGameOver()) return "Game over — return to lobby";
    this.startRound();
    return null;
  }

  isGameOver(): boolean {
    return this.scenarioRound >= this.totalRounds && this.subPhase === "DONE";
  }

  getFinalScoreAwards(): Record<string, number> {
    return Object.fromEntries(this.scores);
  }

  getTimerEndsAt(): number {
    if (this.subPhase === "DESCRIBING") return this.describeTimerEndsAt;
    if (this.subPhase === "REVEAL") return this.voteTimerEndsAt;
    return 0;
  }

  destroy() {
    this.clearDescribeTimer();
    this.clearVoteTimer();
  }

  getStateForPlayer(playerId: string): ScaleState {
    const showNumbers = this.subPhase === "REVEAL" || this.subPhase === "DONE";

    let descriptions = null;
    if (this.subPhase !== "DESCRIBING") {
      const entries = this.playerIds.map(id => ({
        playerId: id,
        playerName: this.playerNames.get(id) ?? id,
        description: this.descriptions.get(id) ?? "...",
        number: showNumbers ? this.numbers.get(id) : undefined,
        hasVoted: this.votes.has(id),
      }));
      if (showNumbers) {
        entries.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      }
      descriptions = entries;
    }

    return {
      subPhase: this.subPhase,
      scenario: this.scenario,
      scenarioRound: this.scenarioRound,
      totalRounds: this.totalRounds,
      myNumber: this.numbers.get(playerId) ?? 0,
      hasDescribed: this.descriptions.has(playerId),
      submittedCount: this.descriptions.size,
      totalCount: this.playerIds.length,
      descriptions,
      orderCorrect: this.orderCorrect,
      myVote: this.votes.get(playerId) ?? null,
      bestDescriptorId: this.bestDescriptorId,
      scores: Object.fromEntries(this.scores),
      timerEndsAt: this.getTimerEndsAt(),
    };
  }
}
