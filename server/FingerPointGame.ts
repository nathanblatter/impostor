import * as AiPlayer from "./AiPlayer.js";
import { Player } from "./Player.js";
import type { FingerPointState, FingerPointSubPhase, FingerPointRoundHistory, PickEntry } from "../shared/types.js";

export class FingerPointGame {
  private playerIds: string[];
  private playerNames: Map<string, string>;
  private fakerId: string;
  private subPhase: FingerPointSubPhase = "PICKING";
  private promptRound: number = 0;
  private totalRounds: number = 6;

  private normalPrompt: string = "";
  private fakerPrompt: string = "";
  private picks: Map<string, string> = new Map();
  private history: FingerPointRoundHistory[] = [];
  private eliminated: Set<string> = new Set();
  private readyToVote: Set<string> = new Set();
  private votes: Map<string, string> = new Map();
  private winner: "TOWN" | "FAKER" | null = null;

  // AI hard mode
  private aiControlledId: string | null = null;
  private aiPickTarget: string | null = null;

  private broadcastState: () => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerEndsAt: number = 0;

  constructor(
    playerMap: Map<string, Player>,
    broadcastState: () => void,
    aiMode: boolean = false
  ) {
    this.broadcastState = broadcastState;
    this.playerIds = [...playerMap.keys()];
    this.playerNames = new Map([...playerMap.entries()].map(([id, p]) => [id, p.name]));

    // Pick faker
    this.fakerId = this.playerIds[Math.floor(Math.random() * this.playerIds.length)];

    // AI mode: pick a random non-faker
    if (aiMode) {
      const eligible = this.playerIds.filter((id) => id !== this.fakerId);
      if (eligible.length > 0) {
        this.aiControlledId = eligible[Math.floor(Math.random() * eligible.length)];
      }
    }

    this.startPromptRound();
  }

  private get activePlayers() {
    return this.playerIds.filter((id) => !this.eliminated.has(id));
  }

  // ── Prompt Round ──

  private async startPromptRound() {
    this.promptRound++;
    this.subPhase = "PICKING";
    this.picks.clear();
    this.aiPickTarget = null;
    this.normalPrompt = "Loading prompt...";
    this.fakerPrompt = "Loading prompt...";

    this.startTimer(30, () => this.onPickTimerEnd());
    this.broadcastState();

    // Generate prompts (pass previous prompts to avoid repeats)
    const previousPrompts = this.history.map((h) => h.normalPrompt);
    try {
      const { normalPrompt, fakerPrompt } = await AiPlayer.generateFingerPointPrompts(previousPrompts);
      this.normalPrompt = normalPrompt;
      this.fakerPrompt = fakerPrompt;
    } catch (err) {
      console.error("Finger point prompt generation failed:", err);
      this.normalPrompt = "Point at who would survive longest in a horror movie";
      this.fakerPrompt = "Point at who would be the killer in a horror movie";
    }

    // AI hard mode: pick a random target for the AI player
    if (this.aiControlledId && this.activePlayers.includes(this.aiControlledId)) {
      const targets = this.activePlayers.filter((id) => id !== this.aiControlledId);
      this.aiPickTarget = targets[Math.floor(Math.random() * targets.length)];
    }

    if (this.subPhase === "PICKING") this.broadcastState();
  }

  submitPick(playerId: string, targetId: string): string | null {
    if (this.subPhase !== "PICKING") return "Not in picking phase";
    if (this.eliminated.has(playerId)) return "You've been eliminated";
    if (this.picks.has(playerId)) return "Already picked";
    if (!this.activePlayers.includes(targetId)) return "Invalid target";
    if (targetId === playerId) return "Can't point at yourself";

    // AI mode enforcement
    if (playerId === this.aiControlledId && this.aiPickTarget) {
      if (targetId !== this.aiPickTarget) {
        return "You must point at the AI's chosen target";
      }
    }

    this.picks.set(playerId, targetId);

    if (this.activePlayers.every((id) => this.picks.has(id))) {
      this.clearTimer();
      this.startDiscussion();
    } else {
      this.broadcastState();
    }
    return null;
  }

  private onPickTimerEnd() {
    // Auto-pick random for missing players
    for (const id of this.activePlayers) {
      if (!this.picks.has(id)) {
        const targets = this.activePlayers.filter((t) => t !== id);
        this.picks.set(id, targets[Math.floor(Math.random() * targets.length)]);
      }
    }
    this.startDiscussion();
  }

  private startDiscussion() {
    this.subPhase = "DISCUSSION";
    this.readyToVote.clear();

    // Save to history
    const picks: PickEntry[] = this.activePlayers
      .filter((id) => this.picks.has(id))
      .map((id) => ({
        playerId: id,
        playerName: this.playerNames.get(id) || "?",
        pick: this.playerNames.get(this.picks.get(id)!) || "?",
      }));

    this.history.push({
      round: this.promptRound,
      normalPrompt: this.normalPrompt,
      fakerPrompt: this.fakerPrompt,
      picks,
    });

    // Every 2 rounds → vote. Otherwise → next prompt after discussion
    const isVoteRound = this.promptRound % 2 === 0;

    this.startTimer(isVoteRound ? 120 : 45, () => {
      if (isVoteRound) {
        this.startVote();
      } else {
        this.startPromptRound();
      }
    });
    this.broadcastState();
  }

  readyAction(playerId: string): string | null {
    if (this.subPhase !== "DISCUSSION") return "Not in discussion";
    if (this.eliminated.has(playerId)) return "Eliminated";
    if (this.readyToVote.has(playerId)) return "Already ready";

    this.readyToVote.add(playerId);

    if (this.activePlayers.every((id) => this.readyToVote.has(id))) {
      this.clearTimer();
      const isVoteRound = this.promptRound % 2 === 0;
      if (isVoteRound) {
        this.startVote();
      } else {
        this.startPromptRound();
      }
    } else {
      this.broadcastState();
    }
    return null;
  }

  // ── Vote ──

  private startVote() {
    this.subPhase = "VOTING";
    this.votes.clear();
    this.startTimer(45, () => this.resolveVote());
    this.broadcastState();
  }

  castVote(playerId: string, targetId: string): string | null {
    if (this.subPhase !== "VOTING") return "Not voting";
    if (this.eliminated.has(playerId)) return "Eliminated";
    if (this.votes.has(playerId)) return "Already voted";
    if (!this.activePlayers.includes(targetId)) return "Invalid target";

    this.votes.set(playerId, targetId);

    if (this.activePlayers.every((id) => this.votes.has(id))) {
      this.clearTimer();
      this.resolveVote();
    } else {
      this.broadcastState();
    }
    return null;
  }

  private resolveVote() {
    const voteCounts: Record<string, number> = {};
    for (const targetId of this.votes.values()) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }

    let maxVotes = 0;
    let eliminatedId: string | null = null;
    let isTie = false;
    for (const [id, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) { maxVotes = count; eliminatedId = id; isTie = false; }
      else if (count === maxVotes) { isTie = true; }
    }

    if (!isTie && eliminatedId) {
      this.eliminated.add(eliminatedId);

      if (eliminatedId === this.fakerId) {
        this.winner = "TOWN";
        this.subPhase = "GAME_OVER";
        this.clearTimer();
        this.broadcastState();
        return;
      }
    }

    // Check if faker survived all rounds
    if (this.promptRound >= this.totalRounds) {
      this.winner = "FAKER";
      this.subPhase = "GAME_OVER";
      this.clearTimer();
      this.broadcastState();
      return;
    }

    // Continue to next prompt round
    this.startPromptRound();
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

  getStateForPlayer(playerId: string): FingerPointState {
    const isFaker = playerId === this.fakerId;
    const isAi = playerId === this.aiControlledId;

    let picks: PickEntry[] | null = null;
    if (this.subPhase !== "PICKING") {
      const lastHistory = this.history[this.history.length - 1];
      if (lastHistory) picks = lastHistory.picks;
    }

    return {
      subPhase: this.subPhase,
      promptRound: this.promptRound,
      totalRounds: this.totalRounds,
      prompt: isFaker ? this.fakerPrompt : this.normalPrompt,
      isFaker,
      hasPicked: this.subPhase === "PICKING"
        ? this.picks.has(playerId)
        : this.subPhase === "DISCUSSION"
        ? this.readyToVote.has(playerId)
        : this.subPhase === "VOTING"
        ? this.votes.has(playerId)
        : false,
      picks,
      history: this.subPhase === "GAME_OVER" ? this.history : [],
      eliminated: [...this.eliminated],
      winner: this.winner,
    };
  }

  getAiPickTarget(playerId: string): string | null {
    if (playerId !== this.aiControlledId) return null;
    return this.aiPickTarget;
  }

  isGameOver(): boolean { return this.subPhase === "GAME_OVER"; }

  destroy() { this.clearTimer(); }
}
