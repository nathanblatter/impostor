import * as AiPlayer from "./AiPlayer.js";
import { Player } from "./Player.js";
import type { TriggerState, TriggerSubPhase, TriggerAssignMode, TriggerAssignment } from "../shared/types.js";

function guessMatchesTrigger(trigger: string, guess: string): boolean {
  const normalize = (s: string) => s.toLowerCase().trim();
  const t = normalize(trigger);
  const g = normalize(guess);
  if (!g) return false;
  if (t.includes(g) || g.includes(t)) return true;
  const stopWords = new Set(["the", "a", "an", "when", "their", "your", "they", "you", "is", "to", "at", "in", "of", "and", "or"]);
  const tWords = t.split(/\s+/).filter((w) => !stopWords.has(w) && w.length > 2);
  const gWords = g.split(/\s+/).filter((w) => !stopWords.has(w) && w.length > 2);
  return gWords.some((gw) => tWords.some((tw) => tw.includes(gw) || gw.includes(tw)));
}

export class TriggerGame {
  private playerIds: string[];
  private playerNames: Map<string, string>;
  private guesserId: string;
  private guesserName: string;
  private assignMode: TriggerAssignMode;
  private timerEnabled: boolean;

  private subPhase: TriggerSubPhase = "ASSIGNING";

  // targetName → assignment
  private assignments: Map<string, TriggerAssignment> = new Map();
  // assignerId → targetId (who they're writing a trigger FOR)
  private assignTargets: Map<string, string> = new Map();
  private submittedAssignments: Set<string> = new Set();
  private aiSuggestions: Map<string, { trigger: string; action: string }> = new Map();

  private guessesRemaining: number = 3;
  private guessHistory: { targetName: string; triggerGuess: string; correct: boolean }[] = [];

  private broadcastState: () => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerEndsAt: number = 0;

  constructor(
    playerMap: Map<string, Player>,
    broadcastState: () => void,
    assignMode: TriggerAssignMode,
    timerEnabled: boolean
  ) {
    this.broadcastState = broadcastState;
    this.assignMode = assignMode;
    this.timerEnabled = timerEnabled;

    this.playerIds = [...playerMap.keys()];
    this.playerNames = new Map([...playerMap.entries()].map(([id, p]) => [id, p.name]));

    // Pick random guesser
    const idx = Math.floor(Math.random() * this.playerIds.length);
    this.guesserId = this.playerIds[idx];
    this.guesserName = this.playerNames.get(this.guesserId) || "?";

    // Circular assignment among non-guessers: A assigns trigger FOR B, B FOR C, etc.
    const nonGuessers = this.playerIds.filter((id) => id !== this.guesserId);
    const shuffled = [...nonGuessers].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      this.assignTargets.set(shuffled[i], shuffled[(i + 1) % shuffled.length]);
    }

    if (assignMode === "AI") {
      this.generateAiAssignments();
    } else {
      this.broadcastState();
    }
  }

  private async generateAiAssignments() {
    const nonGuesserNames = this.playerIds
      .filter((id) => id !== this.guesserId)
      .map((id) => this.playerNames.get(id) || "?");

    try {
      const result = await AiPlayer.generateTriggerAssignments(nonGuesserNames, this.guesserName);
      for (const a of result) {
        this.assignments.set(a.targetName, a);
      }
    } catch (err) {
      console.error("Trigger AI assignment failed:", err);
      // Fallback assignments
      const fallbackTriggers = ["laughs", "checks their phone", "says 'like'", "touches their face", "stands up"];
      const fallbackActions = ["clap once", "snap fingers", "say 'interesting'", "clear their throat", "tap the table"];
      let fi = 0;
      for (const id of this.playerIds) {
        if (id === this.guesserId) continue;
        const name = this.playerNames.get(id) || "?";
        this.assignments.set(name, {
          targetName: name,
          trigger: fallbackTriggers[fi % fallbackTriggers.length],
          action: fallbackActions[fi % fallbackActions.length],
        });
        fi++;
      }
    }
    this.startPlaying();
  }

  // ── ASSIGNING phase (PLAYERS mode) ──

  submitAssignment(assignerId: string, trigger: string, action: string): string | null {
    if (this.subPhase !== "ASSIGNING") return "Not in assigning phase";
    if (this.assignMode !== "PLAYERS") return "Not in player-assign mode";
    if (assignerId === this.guesserId) return "Guesser cannot assign";
    if (this.submittedAssignments.has(assignerId)) return "Already submitted";

    const targetId = this.assignTargets.get(assignerId);
    if (!targetId) return "No assignment target";
    const targetName = this.playerNames.get(targetId) || "?";

    this.assignments.set(targetName, { targetName, trigger: trigger.trim(), action: action.trim() });
    this.submittedAssignments.add(assignerId);

    const nonGuessers = this.playerIds.filter((id) => id !== this.guesserId);
    if (nonGuessers.every((id) => this.submittedAssignments.has(id))) {
      this.startPlaying();
    } else {
      this.broadcastState();
    }
    return null;
  }

  async requestAiSuggestion(assignerId: string): Promise<string | null> {
    if (this.subPhase !== "ASSIGNING") return "Not in assigning phase";
    const targetId = this.assignTargets.get(assignerId);
    if (!targetId) return "No target";
    const targetName = this.playerNames.get(targetId) || "?";

    try {
      const suggestion = await AiPlayer.generateTriggerSuggestion(targetName, this.guesserName);
      this.aiSuggestions.set(assignerId, suggestion);
      this.broadcastState();
      return null;
    } catch {
      return "Failed to generate suggestion";
    }
  }

  // ── PLAYING phase ──

  private startPlaying() {
    this.subPhase = "PLAYING";
    if (this.timerEnabled) {
      this.startTimer(300, () => this.startGuessing()); // 5 min
    } else {
      this.timerEndsAt = 0;
    }
    this.broadcastState();
  }

  startGuessing(): string | null {
    if (this.subPhase !== "PLAYING") return "Not in playing phase";
    this.clearTimer();
    this.subPhase = "GUESSING";
    this.broadcastState();
    return null;
  }

  // ── GUESSING phase ──

  submitGuess(playerId: string, targetName: string, triggerGuess: string): string | null {
    if (this.subPhase !== "GUESSING") return "Not in guessing phase";
    if (playerId !== this.guesserId) return "Only guesser can guess";
    if (this.guessesRemaining <= 0) return "No guesses remaining";

    const assignment = this.assignments.get(targetName);
    const correct = assignment
      ? guessMatchesTrigger(assignment.trigger, triggerGuess)
      : false;

    this.guessHistory.push({ targetName, triggerGuess, correct });
    this.guessesRemaining--;

    if (this.guessesRemaining <= 0) {
      this.reveal();
    } else {
      this.broadcastState();
    }
    return null;
  }

  skipToReveal(playerId: string): string | null {
    if (this.subPhase !== "GUESSING") return "Not in guessing phase";
    if (playerId !== this.guesserId) return "Only guesser can reveal";
    this.reveal();
    return null;
  }

  // ── REVEAL ──

  private reveal() {
    this.subPhase = "REVEAL";
    this.clearTimer();
    this.broadcastState();
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

  getStateForPlayer(playerId: string): TriggerState {
    const isGuesser = playerId === this.guesserId;
    const targetId = this.assignTargets.get(playerId);
    const targetName = targetId ? (this.playerNames.get(targetId) || "?") : null;

    // Show the player their own assignment (the trigger others wrote for them) during PLAYING/GUESSING/REVEAL
    const myName = this.playerNames.get(playerId) || "?";
    const myAssignment =
      !isGuesser && (this.subPhase === "PLAYING" || this.subPhase === "GUESSING" || this.subPhase === "REVEAL")
        ? this.assignments.get(myName) || null
        : null;

    return {
      subPhase: this.subPhase,
      assignMode: this.assignMode,
      isGuesser,
      guesserName: this.guesserName,
      myAssignment,
      assignTarget: !isGuesser && this.subPhase === "ASSIGNING" ? targetName : null,
      hasSubmittedAssignment: this.submittedAssignments.has(playerId),
      aiSuggestion: this.aiSuggestions.get(playerId) || null,
      guessesRemaining: this.guessesRemaining,
      guessHistory: isGuesser ? this.guessHistory : [],
      allAssignments: this.subPhase === "REVEAL" ? [...this.assignments.values()] : null,
      guesserScore: this.guessHistory.filter((g) => g.correct).length,
    };
  }

  isGameOver(): boolean { return this.subPhase === "REVEAL"; }

  getFinalScoreAwards(): Record<string, number> {
    const awards: Record<string, number> = {};
    // Guesser: +1 per correct guess
    const correct = this.guessHistory.filter((g) => g.correct).length;
    if (correct > 0) awards[this.guesserId] = correct;
    // Non-guessers: +1 if their trigger wasn't found
    const guessedNames = new Set(this.guessHistory.filter((g) => g.correct).map((g) => g.targetName));
    for (const [id, name] of this.playerNames) {
      if (id === this.guesserId) continue;
      if (!guessedNames.has(name)) awards[id] = (awards[id] || 0) + 1;
    }
    return awards;
  }

  destroy() { this.clearTimer(); }
}
