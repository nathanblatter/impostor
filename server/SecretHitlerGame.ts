import { Player } from "./Player.js";
import { SecretHitlerEngine } from "./secretHitler/Engine.js";
import { AiService } from "./secretHitler/AiService.js";
import { buildNarrationText, buildGameOverNarration } from "./secretHitler/Narration.js";
import { generateSpeech } from "./tts.js";
import type { AIPersonality } from "./secretHitler/Personalities.js";
import type { SecretHitlerState } from "../shared/types.js";
import type { PartyMembership } from "../shared/secretHitler.js";

// How long the vote-reveal screen stays up before the game advances.
const ELECTION_RESULT_DISPLAY_MS = 6000;

export class SecretHitlerGame {
  private players: Map<string, Player>;
  private broadcastFn: () => void;
  private engine: SecretHitlerEngine;
  private aiService: AiService | null = null;
  private destroyed = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  // Role-reveal acknowledgement gate
  private roleAckSet = new Set<string>();

  // Pending investigation result, shown to the investigating president until acknowledged
  private pendingInvestigation: { presidentId: string; targetId: string; targetName: string; party: PartyMembership } | null = null;

  // TTS narration (optional): sends base64 mp3 to everyone in the room
  private sendNarration: ((audioBase64: string) => void) | null;
  private narratedLogCount = 0;
  private narratedGameOver = false;

  constructor(
    playerMap: Map<string, Player>,
    broadcastFn: () => void,
    personalities: AIPersonality[],
    sendNarration?: (audioBase64: string) => void
  ) {
    this.players = playerMap;
    this.sendNarration = sendNarration ?? null;
    // Narrate any new public events as a side effect of every state broadcast.
    this.broadcastFn = () => {
      broadcastFn();
      this.narrateNewEvents();
    };

    const humans = [...playerMap.values()];
    const host = humans.find((p) => p.isHost) ?? humans[0];

    this.engine = new SecretHitlerEngine(host.id, this.uniqueName(host.name, []));
    const usedNames = [this.engine.getState().players[0]?.name ?? host.name];
    for (const p of humans) {
      if (p.id === host.id) continue;
      const name = this.uniqueName(p.name, usedNames);
      usedNames.push(name);
      this.engine.addPlayer(p.id, name);
    }

    for (const p of personalities) {
      const name = this.uniqueName(p.name, usedNames);
      usedNames.push(name);
      this.engine.addAIPlayer(p.id, name);
      this.roleAckSet.add(p.id); // ghosts don't tap "ready"
    }

    if (personalities.length > 0) {
      this.aiService = new AiService(
        this.engine,
        this.broadcastFn,
        () => this.resolveVotesIfComplete(),
        personalities,
        (text, voice) => this.speak(text, voice)
      );
      this.engine.setAIEventCallback((e) => this.aiService?.handleEvent(e));
    }

    this.engine.startGame(host.id); // → role-reveal
    this.aiService?.handleEvent({ type: "role-reveal" }); // schedule AI intro chats
  }

  /** Text-to-speech a line to the whole room (no-op when narration is disabled). */
  private speak(text: string, voice: string = "onyx") {
    if (!this.sendNarration || this.destroyed || !text) return;
    void generateSpeech(text, voice).then((audio) => {
      if (audio && !this.destroyed && this.sendNarration) this.sendNarration(audio);
    });
  }

  /** Narrate public log entries and the game-over line as they appear. */
  private narrateNewEvents() {
    if (!this.sendNarration || this.destroyed) return;
    const s = this.engine.getState();
    while (this.narratedLogCount < s.gameLog.length) {
      const entry = s.gameLog[this.narratedLogCount++];
      const text = buildNarrationText(entry);
      if (text) this.speak(text);
    }
    if (s.result && !this.narratedGameOver) {
      this.narratedGameOver = true;
      const text = buildGameOverNarration(s.result);
      if (text) this.speak(text);
    }
  }

  /** Engine names must be unique; impostor allows duplicates, so suffix clashes. */
  private uniqueName(raw: string, used: string[]): string {
    const base = raw.trim().slice(0, 18) || "Player";
    let name = base;
    let n = 2;
    while (used.some((u) => u.toLowerCase() === name.toLowerCase())) {
      name = `${base} ${n++}`;
    }
    return name;
  }

  private schedule(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.add(t);
  }

  /** Run an engine mutation, translating thrown rule errors into the string|null contract. */
  private act(fn: () => void): string | null {
    if (this.destroyed) return "Game is over";
    try {
      fn();
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid action";
    }
    this.broadcastFn();
    return null;
  }

  // ── Actions (called from GameRoom wrappers) ──

  ready(playerId: string): string | null {
    if (this.destroyed) return "Game is over";
    const state = this.engine.getState();

    if (state.phase === "role-reveal") {
      if (!this.engine.hasPlayer(playerId)) return "Not in this game";
      this.roleAckSet.add(playerId);
      const allAcked = state.players.every((p) => p.status !== "alive" || this.roleAckSet.has(p.id));
      if (allAcked) {
        this.engine.acknowledgeRoles(); // → first election
      }
      this.broadcastFn();
      return null;
    }

    if (state.awaitingDiscussion) {
      return this.act(() => this.engine.castReadyVote(playerId));
    }

    return "Nothing to be ready for";
  }

  nominate(presidentId: string, targetId: string): string | null {
    return this.act(() => this.engine.nominateChancellor(presidentId, targetId));
  }

  vote(playerId: string, ja: boolean): string | null {
    if (this.destroyed) return "Game is over";
    let allVoted = false;
    try {
      allVoted = this.engine.castVote(playerId, ja).allVoted;
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid action";
    }
    this.broadcastFn();
    if (allVoted) this.resolveVotesIfComplete();
    return null;
  }

  /** Resolve the election once every living player has voted, show the result, then advance. */
  private resolveVotesIfComplete() {
    if (this.destroyed) return;
    if (this.engine.getState().phase !== "election-vote") return;
    this.engine.resolveVote();
    this.broadcastFn();
    this.schedule(() => {
      this.engine.advanceAfterVote();
      this.broadcastFn();
    }, ELECTION_RESULT_DISPLAY_MS);
  }

  discard(presidentId: string, index: number): string | null {
    return this.act(() => this.engine.presidentDiscard(presidentId, index));
  }

  enact(chancellorId: string, index: number): string | null {
    return this.act(() => this.engine.chancellorEnact(chancellorId, index));
  }

  vetoRequest(chancellorId: string): string | null {
    return this.act(() => this.engine.requestVeto(chancellorId));
  }

  vetoResponse(presidentId: string, approve: boolean): string | null {
    return this.act(() => this.engine.respondToVeto(presidentId, approve));
  }

  executive(presidentId: string, targetId?: string): string | null {
    if (this.destroyed) return "Game is over";
    const state = this.engine.getState();
    if (state.phase !== "executive-action") return "No executive action pending";
    const power = state.pendingExecutivePower;

    switch (power) {
      case "policy-peek":
        return this.act(() => this.engine.acknowledgePolicyPeek(presidentId));
      case "investigate-loyalty": {
        if (this.pendingInvestigation && this.pendingInvestigation.presidentId === presidentId) {
          this.pendingInvestigation = null;
          return this.act(() => this.engine.acknowledgeInvestigation(presidentId));
        }
        if (!targetId) return "Pick a player to investigate";
        if (this.destroyed) return "Game is over";
        try {
          const party = this.engine.investigateLoyalty(presidentId, targetId);
          const targetName = this.engine.getState().players.find((p) => p.id === targetId)?.name ?? "Unknown";
          this.pendingInvestigation = { presidentId, targetId, targetName, party };
        } catch (err) {
          return err instanceof Error ? err.message : "Invalid action";
        }
        this.broadcastFn();
        return null;
      }
      case "special-election":
        if (!targetId) return "Pick the next president";
        return this.act(() => this.engine.callSpecialElection(presidentId, targetId));
      case "execution":
        if (!targetId) return "Pick a player to execute";
        return this.act(() => this.engine.executePlayer(presidentId, targetId));
      default:
        return "No executive action pending";
    }
  }

  chat(playerId: string, text: string): string | null {
    if (this.destroyed) return "Game is over";
    if (!this.engine.hasPlayer(playerId)) return "Spectators can't chat";
    const msg = this.engine.addChatMessage(playerId, text);
    this.broadcastFn();
    if (!this.engine.isAIPlayer(playerId)) {
      this.aiService?.checkForMentionsAndReply(msg.playerName, text);
    }
    return null;
  }

  setConnected(playerId: string, connected: boolean) {
    if (this.destroyed) return;
    if (this.engine.hasPlayer(playerId)) {
      this.engine.setConnected(playerId, connected);
    }
  }

  // ── Lifecycle (impostor mode contract) ──

  isGameOver(): boolean {
    return this.engine.getState().phase === "game-over";
  }

  getFinalScoreAwards(): Record<string, number> {
    const awards: Record<string, number> = {};
    const result = this.engine.getState().result;
    if (!result) return awards;
    const winnersParty: PartyMembership = result.winner === "liberals" ? "liberal" : "fascist";
    const roles = this.engine.getAllRoles();
    for (const [id, info] of Object.entries(roles)) {
      if (!this.players.has(id)) continue; // ghosts don't score
      const party: PartyMembership = info.role === "liberal" ? "liberal" : "fascist";
      awards[id] = party === winnersParty ? 1 : 0;
    }
    return awards;
  }

  getTimerEndsAt(): number {
    return 0; // Untimed.
  }

  destroy() {
    this.destroyed = true;
    this.aiService?.destroy();
    this.aiService = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  // ── State ──

  hasVoted(playerId: string): boolean {
    return this.engine.hasVotedInElection(playerId);
  }

  getStateForPlayer(playerId: string, isSpectator: boolean): SecretHitlerState {
    // Keep engine connection flags in sync with the live sockets.
    for (const p of this.engine.getState().players) {
      if (!p.isAI && this.players.has(p.id)) {
        const connected = this.players.get(p.id)!.isConnected;
        if (p.isConnected !== connected) this.engine.setConnected(p.id, connected);
      }
    }

    const s = this.engine.getState();
    const isSeated = !isSpectator && this.engine.hasPlayer(playerId);
    const over = s.phase === "game-over";

    const base: SecretHitlerState = {
      subPhase: s.phase,
      players: s.players,
      policyTrack: s.policyTrack,
      drawPileCount: s.drawPileCount,
      discardPileCount: s.discardPileCount,
      electionTracker: s.electionTracker,
      currentPresidentId: s.currentPresidentId,
      nominatedChancellorId: s.nominatedChancellorId,
      lastElectedGovernment: s.lastElectedGovernment,
      votes: s.phase === "election-vote" ? null : s.votes,
      votedCount: s.votedCount,
      voteResult: s.voteResult,
      vetoRequested: s.vetoRequested,
      vetoUnlocked: s.policyTrack.fascist >= 5,
      pendingExecutivePower: s.pendingExecutivePower,
      result: s.result,
      awaitingDiscussion: s.awaitingDiscussion,
      readyVotes: s.readyVotes,
      gameLog: s.gameLog,
      chatLog: s.chatLog,
      myRole: null,
      myParty: null,
      knownFascists: [],
      knownHitlerId: null,
      myHasVoted: false,
      hasAckedRole: false,
      policyChoices: null,
      policyPeek: null,
      investigationResult: null,
      investigationHistory: null,
      allRoles: over
        ? Object.entries(this.engine.getAllRoles()).map(([id, r]) => ({ id, name: r.name, role: r.role }))
        : null,
    };

    if (!isSeated) return base;

    const priv = this.engine.getPrivateState(playerId);
    base.myRole = priv.role;
    base.myParty = priv.partyMembership;
    base.knownFascists = priv.knownFascists;
    base.knownHitlerId = priv.knownHitlerId;
    base.myHasVoted = this.engine.hasVotedInElection(playerId);
    base.hasAckedRole = s.phase !== "role-reveal" || this.roleAckSet.has(playerId);
    base.policyChoices = priv.policyChoices ?? null;
    base.policyPeek = priv.policyPeek ?? null;
    base.investigationHistory = priv.investigationHistory ?? null;
    if (this.pendingInvestigation && this.pendingInvestigation.presidentId === playerId) {
      const { targetId, targetName, party } = this.pendingInvestigation;
      base.investigationResult = { targetId, targetName, party };
    }
    return base;
  }

  getEngine(): SecretHitlerEngine {
    return this.engine;
  }
}
