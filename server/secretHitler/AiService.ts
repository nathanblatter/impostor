// Claude-powered Secret Hitler AI players, ported from secreth's aiPlayerService.
// Transport rewrite: instead of Socket.IO emits, every state change funnels
// through a single broadcast() callback (impostor re-sends full personalized
// state to everyone). Decision prompts and the system prompt are kept intact.
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../logger.js";
import { SecretHitlerEngine, AIActionEvent } from "./Engine.js";
import type { AIPersonality } from "./Personalities.js";
import { shShuffle as shuffle } from "../../shared/secretHitler.js";

/** Extract a JSON object from Claude's response, tolerating prose or fences. */
function extractJSON(text: string): any {
  const stripped = text.replace(/```(?:json)?\n?/g, "").replace(/\n?```/g, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON object in response");
  return JSON.parse(stripped.slice(start, end + 1));
}

const MODEL = "claude-sonnet-4-6";

export class AiService {
  private client: Anthropic | null;
  private personalitiesMap: Map<string, AIPersonality>;
  private destroyed = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private engine: SecretHitlerEngine,
    private broadcast: () => void,
    private resolveVotes: () => void,
    personalities: AIPersonality[],
    private narrate?: (text: string, voice: string) => void
  ) {
    this.client = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
    this.personalitiesMap = new Map(personalities.map((p) => [p.id, p]));
  }

  destroy() {
    this.destroyed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private schedule(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.add(t);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => this.schedule(resolve, ms));
  }

  handleEvent(event: AIActionEvent): void {
    if (this.destroyed) return;
    switch (event.type) {
      case "nominate":
        this.schedule(() => this.doNominate(event.presidentId), 3000 + Math.random() * 3000);
        break;
      case "vote":
        event.playerIds.forEach((id, i) => {
          this.schedule(() => this.doVote(id), 2000 + Math.random() * 3000 + i * 2000);
        });
        break;
      case "president-discard":
        this.schedule(() => this.doPresidentDiscard(event.presidentId), 4000 + Math.random() * 4000);
        break;
      case "chancellor-enact":
        this.schedule(() => this.doChancellorEnact(event.chancellorId), 3000 + Math.random() * 3000);
        break;
      case "veto-response":
        this.schedule(() => this.doVetoResponse(event.presidentId), 3000 + Math.random() * 4000);
        break;
      case "executive-action":
        this.schedule(() => this.doExecutiveAction(event.presidentId, event.power), 5000 + Math.random() * 5000);
        break;
      case "role-reveal": {
        // Staggered in-character introductions once the game is underway
        [...this.personalitiesMap.keys()].forEach((id, i) => {
          this.schedule(() => this.doIntroChat(id), 10000 + i * 5000);
        });
        break;
      }
      case "policy-enacted":
      case "election-result":
      case "execution":
        this.scheduleProactiveChat(event);
        break;
      case "discussion":
        this.scheduleDiscussionChat();
        break;
    }
  }

  checkForMentionsAndReply(humanName: string, text: string): void {
    if (this.destroyed) return;
    for (const [aiId, personality] of this.personalitiesMap) {
      if (text.toLowerCase().includes(personality.name.toLowerCase())) {
        this.schedule(() => this.doMentionReply(aiId, humanName, text), 2000 + Math.random() * 2000);
      }
    }
  }

  // ─── Decision Handlers ─────────────────────────────────────────────────────

  private async doNominate(presidentId: string): Promise<void> {
    if (this.isGameOver()) return;
    const state = this.engine.getState();
    if (state.phase !== "election-nominate") return;
    if (state.awaitingDiscussion) return;
    if (state.currentPresidentId !== presidentId) return;

    const eligiblePlayers = state.players.filter((p) => {
      if (p.status === "dead") return false;
      if (p.id === presidentId) return false;
      const last = state.lastElectedGovernment;
      if (!last) return true;
      const aliveCount = state.players.filter((p2) => p2.status === "alive").length;
      if (aliveCount > 5) {
        return p.id !== last.presidentId && p.id !== last.chancellorId;
      }
      return p.id !== last.chancellorId;
    });
    if (eligiblePlayers.length === 0) return;

    try {
      if (!this.client) throw new Error("no api key");
      const systemPrompt = this.buildSystemPrompt(presidentId);
      const eligibleNames = eligiblePlayers.map((p) => `${p.name} (id: ${p.id})`).join(", ");

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 256,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `You are President this round. Choose a Chancellor to nominate.

Eligible players: ${eligibleNames}

Consider: Who do you trust based on their voting history and past governments? Who has passed fascist policies before? Who would your team benefit from electing?

Respond with JSON only: {"chancellorId": "<id>", "reasoning": "<1-2 sentence strategic reason>"}`,
        }],
      });

      const content = response.content[0];
      if (!this.destroyed && content.type === "text") {
        const parsed = extractJSON(content.text);
        if (eligiblePlayers.find((p) => p.id === parsed.chancellorId)) {
          this.engine.nominateChancellor(presidentId, parsed.chancellorId);
          this.broadcast();
          return;
        }
      }
    } catch (err) {
      logger.warn(`SH AI doNominate error: ${err instanceof Error ? err.message : err}`);
    }

    // Fallback: random eligible player
    if (this.destroyed || this.isGameOver()) return;
    const target = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
    try {
      this.engine.nominateChancellor(presidentId, target.id);
      this.broadcast();
    } catch (err) {
      logger.warn(`SH AI doNominate fallback error: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async doVote(playerId: string): Promise<void> {
    if (this.isGameOver()) return;
    const state = this.engine.getState();
    if (state.phase !== "election-vote") return;

    let vote = true;
    try {
      if (!this.client) throw new Error("no api key");
      const systemPrompt = this.buildSystemPrompt(playerId);
      const presName = state.players.find((p) => p.id === state.currentPresidentId)?.name ?? "?";
      const chanName = state.players.find((p) => p.id === state.nominatedChancellorId)?.name ?? "?";

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 128,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Vote on this proposed government: President ${presName} + Chancellor ${chanName}.

Think about: Have either of them been in governments that enacted fascist policies? How did they vote in past elections? Is electing them now dangerous given the current fascist policy count (${state.policyTrack.fascist}/6)?

Ja = vote to elect them. Nein = reject.

Respond with JSON only: {"vote": true, "reasoning": "<1 sentence>"}`,
        }],
      });

      const content = response.content[0];
      if (content.type === "text") {
        vote = !!extractJSON(content.text).vote;
      }
    } catch {
      // Fallback: liberal = ja, fascist = strategic-ish
      try {
        vote = this.engine.getPrivateState(playerId).partyMembership === "liberal";
      } catch { /* keep default */ }
    }

    if (this.destroyed || this.isGameOver()) return;
    try {
      const { allVoted } = this.engine.castVote(playerId, vote);
      this.broadcast();
      if (allVoted) this.resolveVotes();
    } catch (err) {
      logger.warn(`SH AI doVote cast error: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async doPresidentDiscard(presidentId: string): Promise<void> {
    if (this.isGameOver()) return;
    const state = this.engine.getState();
    if (state.phase !== "legislative-president") return;
    if (state.currentPresidentId !== presidentId) return;

    const choices = this.engine.getPrivateState(presidentId).policyChoices ?? [];
    if (choices.length === 0) return;

    let discardIndex = 0;
    try {
      if (!this.client) throw new Error("no api key");
      const systemPrompt = this.buildSystemPrompt(presidentId);
      const choiceStr = choices.map((c, i) => `${i}: ${c}`).join(", ");

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 128,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `You are President. You drew 3 policy cards and must secretly DISCARD one, then pass 2 to the Chancellor.

Your cards: [${choiceStr}]

Choose which index to discard. Remember: the Chancellor will see the 2 remaining cards and choose one to enact. You cannot tell the Chancellor what you discarded.

Respond with JSON only: {"discardIndex": 0, "reasoning": "<1 sentence>"}`,
        }],
      });

      const content = response.content[0];
      if (content.type === "text") {
        const idx = Number(extractJSON(content.text).discardIndex);
        if (idx >= 0 && idx < choices.length) discardIndex = idx;
      }
    } catch {
      const party = this.engine.getPrivateState(presidentId).partyMembership;
      discardIndex = choices.findIndex((c) => (party === "liberal" ? c === "fascist" : c === "liberal"));
      if (discardIndex === -1) discardIndex = 0;
    }

    if (this.destroyed || this.isGameOver()) return;
    try {
      this.engine.presidentDiscard(presidentId, discardIndex);
      this.broadcast();
    } catch (err) {
      logger.warn(`SH AI doPresidentDiscard error: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async doChancellorEnact(chancellorId: string): Promise<void> {
    if (this.isGameOver()) return;
    const state = this.engine.getState();
    if (state.phase !== "legislative-chancellor") return;
    if (state.vetoRequested) return;

    const choices = this.engine.getPrivateState(chancellorId).policyChoices ?? [];
    if (choices.length === 0) return;

    // Veto consideration (unlocked at 5 fascist policies)
    if (state.policyTrack.fascist >= 5 && Math.random() > 0.3) {
      const allLiberal = choices.every((c) => c === "liberal");
      const allFascist = choices.every((c) => c === "fascist");
      const party = this.engine.getPrivateState(chancellorId).partyMembership;
      const shouldVeto = (allLiberal && party === "fascist") || (allFascist && party === "liberal");
      if (shouldVeto) {
        try {
          this.engine.requestVeto(chancellorId);
          this.broadcast();
          return;
        } catch { /* veto unavailable, continue to enact */ }
      }
    }

    let enactIndex = 0;
    try {
      if (!this.client) throw new Error("no api key");
      const systemPrompt = this.buildSystemPrompt(chancellorId);
      const choiceStr = choices.map((c, i) => `${i}: ${c}`).join(", ");

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 128,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `You are Chancellor. The President passed you 2 cards. You must ENACT one and the other is discarded.

Your cards: [${choiceStr}]

The enacted policy is public. Consider: what benefits your party? What can you justify claiming to others?

Respond with JSON only: {"enactIndex": 0, "reasoning": "<1 sentence>"}`,
        }],
      });

      const content = response.content[0];
      if (content.type === "text") {
        const idx = Number(extractJSON(content.text).enactIndex);
        if (idx >= 0 && idx < choices.length) enactIndex = idx;
      }
    } catch {
      const party = this.engine.getPrivateState(chancellorId).partyMembership;
      enactIndex = choices.findIndex((c) => (party === "liberal" ? c === "liberal" : c === "fascist"));
      if (enactIndex === -1) enactIndex = 0;
    }

    if (this.destroyed || this.isGameOver()) return;
    try {
      this.engine.chancellorEnact(chancellorId, enactIndex);
      this.broadcast();
    } catch (err) {
      logger.warn(`SH AI doChancellorEnact error: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async doVetoResponse(presidentId: string): Promise<void> {
    if (this.isGameOver()) return;
    const state = this.engine.getState();
    if (!state.vetoRequested) return;

    let approve = false;
    try {
      if (!this.client) throw new Error("no api key");
      const systemPrompt = this.buildSystemPrompt(presidentId);

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 128,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `The Chancellor has requested a VETO — they want to discard all policies and advance the election tracker instead.

Current election tracker: ${state.electionTracker}/3${state.electionTracker === 2 ? " ⚠ Approving veto will trigger a CHAOS POLICY from the deck!" : ""}.
Policies so far: ${state.policyTrack.liberal} Liberal / ${state.policyTrack.fascist} Fascist.

Consider:
- If LIBERAL and you trust the Chancellor: approve if you believe their cards were truly bad. But at tracker 2, a chaos policy is dangerous.
- If FASCIST: approve if it helps your team (avoids liberal enactment). Reject if you want to force a fascist policy through.
- A rejected veto forces the Chancellor to enact one of their cards.

Respond with JSON only: {"approve": true, "reasoning": "<1 sentence>"}`,
        }],
      });

      const content = response.content[0];
      if (content.type === "text") {
        approve = !!extractJSON(content.text).approve;
      }
    } catch {
      try {
        approve = this.engine.getPrivateState(presidentId).partyMembership === "liberal";
      } catch { /* keep default */ }
    }

    if (this.destroyed || this.isGameOver()) return;
    try {
      const { vetoed } = this.engine.respondToVeto(presidentId, approve);
      this.broadcast();
      if (!vetoed) {
        // Rejected veto: an AI chancellor must now enact
        const chanId = this.engine.getState().nominatedChancellorId;
        if (chanId && this.engine.isAIPlayer(chanId)) {
          this.schedule(() => this.doChancellorEnact(chanId), 3000 + Math.random() * 3000);
        }
      }
    } catch (err) {
      logger.warn(`SH AI doVetoResponse error: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async doExecutiveAction(presidentId: string, power: string): Promise<void> {
    if (this.isGameOver()) return;
    const state = this.engine.getState();
    if (state.phase !== "executive-action") return;
    if (state.currentPresidentId !== presidentId) return;

    const alivePlayers = state.players.filter((p) => p.status === "alive" && p.id !== presidentId);

    switch (power) {
      case "policy-peek": {
        await this.sleep(3000 + Math.random() * 2000);
        if (this.destroyed || this.isGameOver()) return;
        try {
          this.engine.acknowledgePolicyPeek(presidentId);
          this.broadcast();
        } catch (err) {
          logger.warn(`SH AI policy-peek error: ${err instanceof Error ? err.message : err}`);
        }
        break;
      }

      case "investigate-loyalty": {
        if (alivePlayers.length === 0) return;
        let targetId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
        try {
          if (!this.client) throw new Error("no api key");
          const systemPrompt = this.buildSystemPrompt(presidentId);
          const names = alivePlayers.map((p) => `${p.name} (id: ${p.id})`).join(", ");
          const response = await this.client.messages.create({
            model: MODEL,
            max_tokens: 128,
            system: systemPrompt,
            messages: [{ role: "user", content: `EXECUTIVE POWER: Investigate a player's party loyalty (you learn if they're Liberal or Fascist).

Options: ${names}

Who is most suspicious based on their voting history and past policy enactments? Who would it be most valuable to confirm?

Respond with JSON only: {"targetId": "<id>", "reasoning": "<1 sentence>"}` }],
          });
          const c = response.content[0];
          if (c.type === "text") {
            const p = extractJSON(c.text);
            if (alivePlayers.find((e) => e.id === p.targetId)) targetId = p.targetId;
          }
        } catch { /* use random */ }

        if (this.destroyed || this.isGameOver()) return;
        try {
          this.engine.investigateLoyalty(presidentId, targetId);
          this.broadcast();
          await this.sleep(3000 + Math.random() * 2000);
          if (this.destroyed || this.isGameOver()) return;
          this.engine.acknowledgeInvestigation(presidentId);
          this.broadcast();
        } catch (err) {
          logger.warn(`SH AI investigate error: ${err instanceof Error ? err.message : err}`);
          // Target may have been investigated before — retry once with another
          try {
            const other = alivePlayers.find((p) => p.id !== targetId);
            if (other) {
              this.engine.investigateLoyalty(presidentId, other.id);
              this.broadcast();
              await this.sleep(2000);
              if (this.destroyed || this.isGameOver()) return;
              this.engine.acknowledgeInvestigation(presidentId);
              this.broadcast();
            }
          } catch { /* give up; humans can see the stall in logs */ }
        }
        break;
      }

      case "special-election": {
        if (alivePlayers.length === 0) return;
        let targetId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
        try {
          if (!this.client) throw new Error("no api key");
          const systemPrompt = this.buildSystemPrompt(presidentId);
          const names = alivePlayers.map((p) => `${p.name} (id: ${p.id})`).join(", ");
          const response = await this.client.messages.create({
            model: MODEL,
            max_tokens: 128,
            system: systemPrompt,
            messages: [{ role: "user", content: `EXECUTIVE POWER: Special Election — you choose who becomes the next President, skipping the normal rotation.

Options: ${names}

This is a powerful disruption tool. Consider:
- If you are FASCIST: choose a fellow fascist or someone you can trust to nominate a fascist chancellor. Avoid picking suspicious players who might expose your team.
- If you are LIBERAL: choose the most trusted liberal player who you believe can nominate a good chancellor. Avoid players who have been in governments that enacted fascist policies.
- Think about who is next in the normal rotation — is skipping them good or bad for your side?

Respond with JSON only: {"targetId": "<id>", "reasoning": "<1 sentence strategic reason>"}` }],
          });
          const c = response.content[0];
          if (c.type === "text") {
            const p = extractJSON(c.text);
            if (alivePlayers.find((e) => e.id === p.targetId)) targetId = p.targetId;
          }
        } catch { /* use random */ }

        if (this.destroyed || this.isGameOver()) return;
        try {
          this.engine.callSpecialElection(presidentId, targetId);
          this.broadcast();
        } catch (err) {
          logger.warn(`SH AI special-election error: ${err instanceof Error ? err.message : err}`);
        }
        break;
      }

      case "execution": {
        if (alivePlayers.length === 0) return;
        let targetId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
        try {
          if (!this.client) throw new Error("no api key");
          const systemPrompt = this.buildSystemPrompt(presidentId);
          const names = alivePlayers.map((p) => `${p.name} (id: ${p.id})`).join(", ");
          const response = await this.client.messages.create({
            model: MODEL,
            max_tokens: 128,
            system: systemPrompt,
            messages: [{ role: "user", content: `EXECUTIVE POWER: Execution — you permanently kill one player. This is a critical decision.

Options: ${names}

Current fascist policies: ${state.policyTrack.fascist}/6. Liberals win immediately if Hitler is executed.

Consider:
- If you are LIBERAL: who is most likely Hitler or a key fascist? Target the most dangerous fascist — someone who has enacted fascist policies, consistently voted to elect suspicious governments, or been investigated as fascist. ${state.policyTrack.fascist >= 3 ? "The game is late — Hitler could win as Chancellor!" : "Identify the most suspicious player."}
- If you are FASCIST: eliminate a key liberal who is building evidence, investigating your team, or likely to figure out who Hitler is. Do NOT execute fellow fascists. Avoid executing players who would be too obviously liberal (don't make yourself look suspicious).
- Look at voting history: fascists vote Ja together. Look at who enacted fascist policies.

Respond with JSON only: {"targetId": "<id>", "reasoning": "<1 sentence strategic reason>"}` }],
          });
          const c = response.content[0];
          if (c.type === "text") {
            const p = extractJSON(c.text);
            if (alivePlayers.find((e) => e.id === p.targetId)) targetId = p.targetId;
          }
        } catch { /* use random */ }

        if (this.destroyed || this.isGameOver()) return;
        try {
          this.engine.executePlayer(presidentId, targetId);
          this.broadcast();
        } catch (err) {
          logger.warn(`SH AI execution error: ${err instanceof Error ? err.message : err}`);
        }
        break;
      }
    }
  }

  // ─── Chat ──────────────────────────────────────────────────────────────────

  private async doIntroChat(aiId: string): Promise<void> {
    if (this.isGameOver()) return;
    const personality = this.personalitiesMap.get(aiId);
    if (!personality || !this.client) return;

    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 80,
        system: this.buildSystemPrompt(aiId),
        messages: [{
          role: "user",
          content: "The roles have just been revealed. Write a brief in-character introduction (1-2 sentences). Do not reveal your role. Plain text only.",
        }],
      });
      const content = response.content[0];
      if (content.type === "text") this.emitChat(aiId, content.text.trim(), personality);
    } catch (err) {
      logger.warn(`SH AI intro chat error: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async doProactiveChat(aiId: string, trigger: AIActionEvent): Promise<void> {
    if (this.isGameOver()) return;
    const state = this.engine.getState();
    const personality = this.personalitiesMap.get(aiId);
    if (!personality || !this.client) return;
    const player = state.players.find((p) => p.id === aiId);
    if (!player || player.status === "dead") return;

    const otherNames = state.players.filter((p) => p.status === "alive" && p.id !== aiId).map((p) => `@${p.name}`).join(", ");
    let prompt = "";
    switch (trigger.type) {
      case "election-result":
        prompt = `The election just ${trigger.passed ? "PASSED" : "FAILED"}. Government: ${trigger.presidentName} (President) + ${trigger.chancellorName} (Chancellor).
React in character. You SHOULD @mention one of the involved players or someone suspicious by name (other alive players: ${otherNames}). E.g. "@${trigger.presidentName} I don't trust this..." or "@${trigger.chancellorName} explain yourself." 1-2 sentences. Plain text only.`;
        break;
      case "policy-enacted":
        prompt = `A ${trigger.policyType.toUpperCase()} policy was just enacted. Policy track: ${state.policyTrack.liberal} liberal / ${state.policyTrack.fascist} fascist.
React in character — express your reaction and @mention one specific player to direct your comment at (available: ${otherNames}). ${trigger.policyType === "fascist" ? "Question why this happened." : "Celebrate or note the progress."} 1-2 sentences. Plain text only.`;
        break;
      case "execution":
        prompt = `${trigger.targetName} has just been executed by the President. React in character — express shock, satisfaction, or suspicion. Consider @mentioning another player to direct your reaction at (available: ${otherNames}). 1-2 sentences. Plain text only.`;
        break;
      default:
        return;
    }

    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 80,
        system: this.buildSystemPrompt(aiId),
        messages: [{ role: "user", content: prompt }],
      });
      const content = response.content[0];
      if (content.type === "text") this.emitChat(aiId, content.text.trim(), personality);
    } catch (err) {
      logger.warn(`SH AI proactive chat error: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async doMentionReply(aiId: string, humanName: string, text: string): Promise<void> {
    if (this.isGameOver()) return;
    const state = this.engine.getState();
    const personality = this.personalitiesMap.get(aiId);
    if (!personality || !this.client) return;
    const player = state.players.find((p) => p.id === aiId);
    if (!player || player.status === "dead") return;

    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 100,
        system: this.buildSystemPrompt(aiId),
        messages: [{
          role: "user",
          content: `${humanName} just said: "${text}"

They mentioned your name. Reply directly to what they said, in character. Be specific — address their actual point, accusation, or question. 1-2 sentences. Plain text only.`,
        }],
      });
      const content = response.content[0];
      if (content.type === "text") this.emitChat(aiId, content.text.trim(), personality);
    } catch (err) {
      logger.warn(`SH AI mention reply error: ${err instanceof Error ? err.message : err}`);
    }
  }

  private scheduleProactiveChat(trigger: AIActionEvent): void {
    if (this.isGameOver()) return;
    const state = this.engine.getState();
    const aliveAIs = [...this.personalitiesMap.keys()].filter((id) => {
      const p = state.players.find((pp) => pp.id === id);
      return p?.status === "alive";
    });
    if (aliveAIs.length === 0) return;

    const count = Math.min(aliveAIs.length, Math.random() < 0.5 ? 1 : 2);
    const chosen = shuffle([...aliveAIs]).slice(0, count);
    chosen.forEach((aiId, i) => {
      this.schedule(() => this.doProactiveChat(aiId, trigger), 4000 + i * (3000 + Math.random() * 2000));
    });
  }

  private scheduleDiscussionChat(): void {
    if (this.isGameOver()) return;
    const state = this.engine.getState();
    const aliveAIs = [...this.personalitiesMap.keys()].filter((id) => {
      const p = state.players.find((pp) => pp.id === id);
      return p?.status === "alive";
    });
    if (aliveAIs.length === 0) return;

    const shuffled = shuffle([...aliveAIs]);
    const chatters = shuffled.slice(0, Math.min(shuffled.length, 3));

    chatters.forEach((aiId, i) => {
      this.schedule(() => this.doDiscussionChat(aiId), 3000 + i * 4000);
    });

    aliveAIs.forEach((aiId) => {
      const chatDelay = chatters.includes(aiId) ? chatters.indexOf(aiId) * 4000 : 0;
      const readyDelay = chatDelay + 6000 + Math.random() * 8000;
      this.schedule(() => this.doVoteReady(aiId), 3000 + readyDelay);
    });
  }

  private async doDiscussionChat(aiId: string): Promise<void> {
    if (this.isGameOver()) return;
    const state = this.engine.getState();
    if (!state.awaitingDiscussion) return;
    const personality = this.personalitiesMap.get(aiId);
    if (!personality || !this.client) return;
    const player = state.players.find((p) => p.id === aiId);
    if (!player || player.status === "dead") return;

    const otherNames = state.players.filter((p) => p.status === "alive" && p.id !== aiId).map((p) => `@${p.name}`).join(", ");
    const lastLog = state.gameLog[state.gameLog.length - 1];
    const lastEvent = lastLog
      ? `The last game event was: ${lastLog.type} (Round ${lastLog.round})`
      : "The game is just starting.";

    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 100,
        system: this.buildSystemPrompt(aiId),
        messages: [{
          role: "user",
          content: `DISCUSSION PHASE — players are talking before the next election.
${lastEvent}
Other players: ${otherNames}

Make a comment in character. You SHOULD @mention at least one other player by name (e.g. "@Ernst why did you vote that way?"). Be direct and strategic — accuse, defend, ask questions, or build alliances. Use @Name format. 1-2 sentences. Plain text only.`,
        }],
      });
      const content = response.content[0];
      if (content.type === "text") this.emitChat(aiId, content.text.trim(), personality);
    } catch (err) {
      logger.warn(`SH AI discussion chat error: ${err instanceof Error ? err.message : err}`);
    }
  }

  private doVoteReady(aiId: string): void {
    if (this.isGameOver()) return;
    const state = this.engine.getState();
    if (!state.awaitingDiscussion) return;
    const player = state.players.find((p) => p.id === aiId);
    if (!player || player.status === "dead") return;

    try {
      this.engine.castReadyVote(aiId);
      this.broadcast();
    } catch { /* already voted or discussion ended */ }
  }

  private emitChat(aiId: string, text: string, personality: AIPersonality): void {
    if (this.destroyed || !text) return;
    this.engine.addChatMessage(aiId, text);
    this.broadcast();
    this.narrate?.(text, personality.voice);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private isGameOver(): boolean {
    if (this.destroyed) return true;
    const state = this.engine.getState();
    return state.result !== null || state.phase === "lobby" || state.phase === "game-over";
  }

  private buildSystemPrompt(aiId: string): string {
    const personality = this.personalitiesMap.get(aiId)!;
    const state = this.engine.getState();
    const privateState = this.engine.getPrivateState(aiId);

    const playerName = (id: string | null) => (id ? state.players.find((p) => p.id === id)?.name ?? "?" : "none");

    let roleSection = `YOUR ROLE: ${privateState.role.toUpperCase()} (${privateState.partyMembership} party).`;
    if (privateState.partyMembership === "fascist") {
      const fellowNames = privateState.knownFascists.map((id) => playerName(id)).join(", ");
      if (fellowNames) roleSection += `\nFellow fascists (only you know this): ${fellowNames}.`;
      if (privateState.knownHitlerId) roleSection += `\nHitler (only you know this): ${playerName(privateState.knownHitlerId)}.`;
    }

    const strategy = privateState.partyMembership === "liberal"
      ? `LIBERAL STRATEGY: Your goal is 5 liberal policies OR executing Hitler.
- Vote Nein on governments involving players who have enacted fascist policies before.
- A fascist president/chancellor always chooses the fascist card when given a choice. If someone claims "I had no liberal cards," consider whether that's plausible.
- Watch for voting patterns: fascists often vote Ja on governments involving other fascists.
- Use investigations to gather evidence. Be open about results to build coalition.
- If election tracker reaches 2, consider whether to pass a bad government vs. risk a chaos policy.`
      : `FASCIST STRATEGY: Your goal is 6 fascist policies OR getting Hitler elected Chancellor after 3+ fascist policies.
- Appear liberal. Claim you "had no choice" when enacting fascist policies ("only fascist cards in hand").
- Coordinate subtly with your team (${privateState.knownFascists.map((id) => playerName(id)).join(", ")}) — vote to elect each other but don't make it obvious.
- If Hitler is Chancellor-eligible (after 3 fascist policies), nominate them.
- When safe to do so, nominate fascist players as chancellor.
- Keep the election tracker high by occasionally voting Nein on good governments.`;

    const alivePlayers = state.players.filter((p) => p.status === "alive").map((p) => p.name).join(", ");
    const deadPlayers = state.players.filter((p) => p.status === "dead").map((p) => p.name);
    const lastGov = state.lastElectedGovernment
      ? `${playerName(state.lastElectedGovernment.presidentId)} (P) + ${playerName(state.lastElectedGovernment.chancellorId)} (C) — term-limited`
      : "none";
    const round = state.gameLog.filter((e) =>
      e.type === "election-passed" || e.type === "election-failed" || e.type === "chaos-policy"
    ).length + 1;

    const historyLines: string[] = [];
    for (const entry of state.gameLog) {
      const voteStr = entry.playerVotes
        ? " [" + Object.entries(entry.playerVotes).map(([n, v]) => `${n}:${v ? "Ja" : "Nein"}`).join(" ") + "]"
        : "";
      switch (entry.type) {
        case "election-passed":
          historyLines.push(`R${entry.round} ELECTED: ${entry.presidentName}+${entry.chancellorName} (${entry.votesYes}–${entry.votesNo})${voteStr}`);
          break;
        case "election-failed":
          historyLines.push(`R${entry.round} REJECTED: ${entry.presidentName}+${entry.chancellorName} (${entry.votesYes}–${entry.votesNo})${voteStr}`);
          break;
        case "policy-enacted":
          historyLines.push(`R${entry.round} POLICY: ${entry.policy!.toUpperCase()} enacted by ${entry.presidentName}+${entry.chancellorName}`);
          break;
        case "chaos-policy":
          historyLines.push(`R${entry.round} CHAOS: ${entry.policy!.toUpperCase()} policy auto-enacted from deck (3 failed elections)`);
          break;
        case "execution":
          historyLines.push(`R${entry.round} EXECUTED: ${entry.targetName} by President ${entry.presidentName}`);
          break;
        case "investigation":
          historyLines.push(`R${entry.round} INVESTIGATED: ${entry.presidentName} investigated ${entry.targetName}`);
          break;
        case "special-election":
          historyLines.push(`R${entry.round} SPECIAL ELECTION: ${entry.targetName} chosen by ${entry.presidentName}`);
          break;
        case "veto-approved":
          historyLines.push(`R${entry.round} VETO: ${entry.presidentName}+${entry.chancellorName} discarded all policies`);
          break;
      }
    }

    const invLines = (privateState.investigationHistory ?? []).map(
      (i) => `You investigated ${i.targetName} (R${i.round}): they are ${i.party.toUpperCase()}`
    );

    const recentChat = state.chatLog.slice(-12).map((m) => `${m.playerName}: ${m.text}`).join("\n");

    return `You are ${personality.name} in a live game of Secret Hitler.
Personality: ${personality.traits}. Speech style: ${personality.chatStyle}.

${roleSection}

${strategy}

CURRENT BOARD (Round ${round}):
- Policies enacted: ${state.policyTrack.liberal} Liberal / ${state.policyTrack.fascist} Fascist (need 5L or 6F to win)
- Alive: ${alivePlayers}${deadPlayers.length > 0 ? `  |  Dead: ${deadPlayers.join(", ")}` : ""}
- President: ${playerName(state.currentPresidentId)}  |  Chancellor: ${playerName(state.nominatedChancellorId) || "not yet nominated"}
- Election tracker: ${state.electionTracker}/3${state.electionTracker === 2 ? " ⚠ ONE MORE FAILURE = CHAOS POLICY" : ""}
- Last elected government (term-limited): ${lastGov}

GAME HISTORY:
${historyLines.length > 0 ? historyLines.join("\n") : "No rounds completed yet."}
${invLines.length > 0 ? "\nYOUR INVESTIGATION RESULTS (private):\n" + invLines.join("\n") : ""}
${recentChat ? "\nRECENT CHAT:\n" + recentChat : ""}`;
  }
}
