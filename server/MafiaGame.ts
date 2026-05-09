import Anthropic from "@anthropic-ai/sdk";
import { generateSpeech } from "./tts.js";
import { Player } from "./Player.js";
import type { MafiaRole, MafiaPhase, MafiaState } from "../shared/types.js";

interface MafiaPlayer {
  id: string;
  name: string;
  role: MafiaRole;
  alive: boolean;
}

export class MafiaGame {
  private players: MafiaPlayer[] = [];
  private phase: MafiaPhase = "NIGHT";
  private dayNumber: number = 0;
  private setting: string = "";

  // Night actions
  private mafiaTarget: string | null = null;
  private mafiaVotes: Map<string, string> = new Map();
  private doctorTarget: string | null = null;
  private detectiveTarget: string | null = null;
  private investigationResults: Map<string, string> = new Map();

  // Day
  private readyToVote: Set<string> = new Set();
  private votes: Map<string, string> = new Map();
  private narrationText: string | null = null;
  private winner: "TOWN" | "MAFIA" | null = null;

  // AI mode
  private aiMode: boolean = false;
  private aiControlledId: string | null = null;
  private aiDirectives: string[] = [];

  // Callbacks
  private broadcastState: () => void;
  private broadcastNarration: (audioBase64: string) => void;
  private onGameOver: () => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerEndsAt: number = 0;

  constructor(
    playerMap: Map<string, Player>,
    broadcastState: () => void,
    broadcastNarration: (audioBase64: string) => void,
    onGameOver: () => void,
    aiMode: boolean = false
  ) {
    this.broadcastState = broadcastState;
    this.broadcastNarration = broadcastNarration;
    this.onGameOver = onGameOver;

    const ids = [...playerMap.keys()];
    const shuffled = [...ids].sort(() => Math.random() - 0.5);

    const count = ids.length;
    const mafiaCount = count >= 9 ? 3 : count >= 6 ? 2 : 1;

    const roles: MafiaRole[] = [];
    for (let i = 0; i < mafiaCount; i++) roles.push("MAFIA");
    roles.push("DOCTOR");
    roles.push("DETECTIVE");
    while (roles.length < count) roles.push("CIVILIAN");

    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    this.players = shuffled.map((id, i) => ({
      id,
      name: playerMap.get(id)!.name,
      role: roles[i],
      alive: true,
    }));

    const settings = [
      "a small fishing village on a stormy coast",
      "a luxury cruise ship in the middle of the ocean",
      "a remote space station orbiting Mars",
      "a medieval castle during a royal feast",
      "a 1920s speakeasy in Chicago",
      "a haunted mansion on Halloween night",
      "a snowed-in ski lodge in the mountains",
      "a Hollywood movie set in the 1950s",
      "a Wild West frontier town",
      "a submarine deep beneath the Arctic ice",
    ];
    this.setting = settings[Math.floor(Math.random() * settings.length)];

    // AI mode: pick a random civilian
    this.aiMode = aiMode;
    if (aiMode) {
      const civilians = this.players.filter((p) => p.role === "CIVILIAN");
      if (civilians.length > 0) {
        this.aiControlledId = civilians[Math.floor(Math.random() * civilians.length)].id;
      }
    }

    this.startNight();
  }

  private get alivePlayers() {
    return this.players.filter((p) => p.alive);
  }

  private get aliveMafia() {
    return this.alivePlayers.filter((p) => p.role === "MAFIA");
  }

  private get aliveTown() {
    return this.alivePlayers.filter((p) => p.role !== "MAFIA");
  }

  // ── Narrate helper: generate text, show it, fire TTS, wait for audio ──

  private async narrate(
    prompt: string,
    nextAction: () => void
  ) {
    this.phase = "NARRATION";
    this.narrationText = null;
    this.broadcastState();

    // Generate text
    const text = await this.callClaude(prompt);
    this.narrationText = text;
    this.broadcastState();

    // Fire TTS immediately — don't await before showing text
    const audioPromise = generateSpeech(text);

    // Estimate audio duration: ~150 words/min for TTS, minimum 3s
    const wordCount = text.split(/\s+/).length;
    const estimatedMs = Math.max(3000, (wordCount / 150) * 60 * 1000 + 1500);

    const audio = await audioPromise;
    if (audio) {
      this.broadcastNarration(audio);
    }

    // Wait for estimated playback, then proceed
    setTimeout(() => {
      if (this.phase === "NARRATION") {
        nextAction();
      }
    }, audio ? estimatedMs : 2000);
  }

  // ── Night Phase ──

  private startNight() {
    this.dayNumber++;
    this.phase = "NIGHT";
    this.mafiaTarget = null;
    this.mafiaVotes.clear();
    this.doctorTarget = null;
    this.detectiveTarget = null;
    this.investigationResults.clear();
    this.readyToVote.clear();
    this.votes.clear();
    this.narrationText = null;

    this.startTimer(60, () => this.resolveNight());
    this.broadcastState();
  }

  submitNightAction(playerId: string, targetId: string): string | null {
    if (this.phase !== "NIGHT") return "Not night phase";
    const player = this.players.find((p) => p.id === playerId);
    if (!player || !player.alive) return "Invalid player";
    const target = this.players.find((p) => p.id === targetId);
    if (!target || !target.alive) return "Invalid target";

    switch (player.role) {
      case "MAFIA":
        if (targetId === playerId) return "Can't target yourself";
        this.mafiaVotes.set(playerId, targetId);
        if (this.aliveMafia.every((m) => this.mafiaVotes.has(m.id))) {
          this.checkNightComplete();
        }
        break;
      case "DOCTOR":
        this.doctorTarget = targetId;
        this.checkNightComplete();
        break;
      case "DETECTIVE":
        if (targetId === playerId) return "Can't investigate yourself";
        this.detectiveTarget = targetId;
        this.checkNightComplete();
        break;
      case "CIVILIAN":
        return "Civilians can't act at night";
    }

    this.broadcastState();
    return null;
  }

  private checkNightComplete() {
    const mafiaReady = this.aliveMafia.every((m) => this.mafiaVotes.has(m.id));
    const doctorAlive = this.alivePlayers.some((p) => p.role === "DOCTOR");
    const doctorReady = !doctorAlive || this.doctorTarget !== null;
    const detectiveAlive = this.alivePlayers.some((p) => p.role === "DETECTIVE");
    const detectiveReady = !detectiveAlive || this.detectiveTarget !== null;

    if (mafiaReady && doctorReady && detectiveReady) {
      this.clearTimer();
      this.resolveNight();
    }
  }

  private async resolveNight() {
    // Determine mafia target
    const voteCounts: Record<string, number> = {};
    for (const targetId of this.mafiaVotes.values()) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }
    let maxVotes = 0;
    let candidates: string[] = [];
    for (const [id, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) { maxVotes = count; candidates = [id]; }
      else if (count === maxVotes) { candidates.push(id); }
    }
    this.mafiaTarget = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : null;

    if (!this.mafiaTarget && this.aliveTown.length > 0) {
      const town = this.aliveTown;
      this.mafiaTarget = town[Math.floor(Math.random() * town.length)].id;
    }

    // Resolve detective
    if (this.detectiveTarget) {
      const target = this.players.find((p) => p.id === this.detectiveTarget);
      const detective = this.alivePlayers.find((p) => p.role === "DETECTIVE");
      if (target && detective) {
        this.investigationResults.set(
          detective.id,
          target.role === "MAFIA" ? "MAFIA" : "NOT MAFIA"
        );
      }
    }

    // Resolve kill
    const saved = this.mafiaTarget === this.doctorTarget;
    const killedPlayer = !saved && this.mafiaTarget
      ? this.players.find((p) => p.id === this.mafiaTarget)
      : null;

    if (killedPlayer) {
      killedPlayer.alive = false;
    }

    // Build narration prompt
    const prompt = saved
      ? `Night ${this.dayNumber} in ${this.setting}. The mafia attempted to kill ${this.players.find(p => p.id === this.mafiaTarget)?.name}, but the doctor saved them! Write a dramatic 2-3 sentence narration about the town waking up to find everyone alive, hinting that something sinister was averted.`
      : killedPlayer
      ? `Night ${this.dayNumber} in ${this.setting}. ${killedPlayer.name} (secretly a ${killedPlayer.role.toLowerCase()}) was murdered by the mafia in the night. Write a dramatic 2-3 sentence narration about the town discovering the body. Be creative with how they died — make it fit the setting. Don't reveal their role.`
      : `Night ${this.dayNumber} in ${this.setting}. Nothing happened — no one was killed. Write a brief, eerie 1-2 sentence narration about a suspiciously quiet night.`;

    await this.narrate(prompt, () => {
      if (!this.checkWinCondition()) {
        this.startDay();
      }
    });
  }

  // ── Day Phase ──

  private startDay() {
    this.phase = "DAY";
    this.readyToVote.clear();
    this.votes.clear();
    this.aiDirectives = [];
    this.startTimer(300, () => this.startDayVote());
    this.broadcastState();

    // Generate fresh AI directives for this day
    if (this.aiControlledId && this.players.find((p) => p.id === this.aiControlledId)?.alive) {
      this.generateDayDirectives();
    }
  }

  private async generateDayDirectives() {
    const aliveNames = this.alivePlayers.map((p) => p.name);
    try {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `You are generating secret directives for a Mafia party game. The setting is ${this.setting}. It's Day ${this.dayNumber}.

The alive players are: ${aliveNames.join(", ")}

Generate exactly 3 conversation directives that this INNOCENT civilian must follow during the day discussion. These should:
- Make the player seem suspicious even though they're innocent
- Be specific to this round — reference the setting, other players by name, or the current situation
- Force the player to say things that could be misinterpreted as mafia behavior
- Be fun and create chaos in the discussion
- Be short — one sentence each

Examples:
- "Insist that you saw ${aliveNames[0]} sneaking around last night"
- "Get defensive whenever someone asks you a direct question"
- "Suggest the group should skip the vote today — no one needs to die"
- "Accidentally let slip a detail about the crime scene that wasn't public"
- "Aggressively push to vote out the person to your left, no matter what"

Return ONLY a JSON array of 3 strings, no other text.`,
          },
        ],
      });
      const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        this.aiDirectives = JSON.parse(match[0]).slice(0, 3);
      }
    } catch (err) {
      console.error("Mafia AI directive generation failed:", err);
      this.aiDirectives = [
        "Accuse whoever speaks first of being suspicious",
        "Claim you heard strange noises last night but refuse to elaborate",
        "Suggest voting for someone, then immediately change your mind",
      ];
    }
    if (this.phase === "DAY") this.broadcastState();
  }

  readyToVoteAction(playerId: string): string | null {
    if (this.phase !== "DAY") return "Not day phase";
    const player = this.players.find((p) => p.id === playerId);
    if (!player?.alive) return "Dead players can't vote";
    if (this.readyToVote.has(playerId)) return "Already ready";

    this.readyToVote.add(playerId);

    if (this.alivePlayers.every((p) => this.readyToVote.has(p.id))) {
      this.clearTimer();
      this.startDayVote();
    } else {
      this.broadcastState();
    }
    return null;
  }

  private startDayVote() {
    this.phase = "DAY_VOTE";
    this.votes.clear();
    this.startTimer(60, () => this.resolveDayVote());
    this.broadcastState();
  }

  castVote(playerId: string, targetId: string): string | null {
    if (this.phase !== "DAY_VOTE") return "Not voting phase";
    const player = this.players.find((p) => p.id === playerId);
    if (!player?.alive) return "Dead players can't vote";
    if (this.votes.has(playerId)) return "Already voted";
    const target = this.players.find((p) => p.id === targetId);
    if (!target?.alive) return "Invalid target";

    this.votes.set(playerId, targetId);

    if (this.alivePlayers.every((p) => this.votes.has(p.id))) {
      this.clearTimer();
      this.resolveDayVote();
    } else {
      this.broadcastState();
    }
    return null;
  }

  private async resolveDayVote() {
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

    const eliminated = !isTie && eliminatedId
      ? this.players.find((p) => p.id === eliminatedId)
      : null;

    if (eliminated) {
      eliminated.alive = false;
    }

    const prompt = (isTie || !eliminated)
      ? `Day ${this.dayNumber} in ${this.setting}. The town voted but couldn't reach a consensus — no one was eliminated. Write a tense 1-2 sentence narration about the failed vote and the uneasy return to nightfall.`
      : `Day ${this.dayNumber} in ${this.setting}. The town voted to eliminate ${eliminated.name}, who was secretly a ${eliminated.role.toLowerCase()}. Write a dramatic 2-3 sentence narration about their elimination. Reveal their role dramatically. ${eliminated.role === "MAFIA" ? "The town celebrates catching a mafia member!" : "The town realizes they made a terrible mistake..."}`;

    await this.narrate(prompt, () => {
      if (!this.checkWinCondition()) {
        this.startNight();
      }
    });
  }

  // ── Win Condition ──

  private checkWinCondition(): boolean {
    if (this.aliveMafia.length === 0) {
      this.winner = "TOWN";
      this.phase = "GAME_OVER";
      this.clearTimer();
      this.broadcastState();
      this.generateGameOverNarration();
      return true;
    }
    if (this.aliveMafia.length >= this.aliveTown.length) {
      this.winner = "MAFIA";
      this.phase = "GAME_OVER";
      this.clearTimer();
      this.broadcastState();
      this.generateGameOverNarration();
      return true;
    }
    return false;
  }

  private async generateGameOverNarration() {
    const winnerText = this.winner === "TOWN" ? "the town" : "the mafia";
    const prompt = `The game is over. ${winnerText} has won! The setting was ${this.setting}.

Dead players: ${this.players.filter(p => !p.alive).map(p => `${p.name} (${p.role})`).join(", ")}
Surviving players: ${this.alivePlayers.map(p => `${p.name} (${p.role})`).join(", ")}

Write a dramatic 2-3 sentence ending narration revealing the outcome. Be theatrical and fun.`;

    await this.narrate(prompt, () => {
      this.phase = "GAME_OVER";
      this.broadcastState();
    });
  }

  // ── AI ──

  private async callClaude(prompt: string): Promise<string> {
    try {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: `You are a dramatic game narrator for a Mafia party game. Keep narrations short (2-3 sentences max), theatrical, and fun. Use present tense. Don't use emoji. Be creative but concise.\n\n${prompt}`,
          },
        ],
      });
      return response.content[0].type === "text"
        ? response.content[0].text.trim()
        : "The story continues...";
    } catch (err) {
      console.error("Narration generation failed:", err);
      return "Night falls over the town... the story continues.";
    }
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

  getTimerEndsAt(): number {
    return this.timerEndsAt;
  }

  // ── State ──

  getStateForPlayer(playerId: string): MafiaState {
    const me = this.players.find((p) => p.id === playerId);
    const myRole = me?.role ?? "CIVILIAN";
    const isMafia = myRole === "MAFIA";

    return {
      phase: this.phase,
      dayNumber: this.dayNumber,
      myRole,
      fellowMafia: isMafia
        ? this.aliveMafia.filter((p) => p.id !== playerId).map((p) => p.name)
        : [],
      alivePlayers: this.alivePlayers.map((p) => p.id),
      deadPlayers: this.players
        .filter((p) => !p.alive)
        .map((p) => ({ id: p.id, name: p.name, role: p.role })),
      narrationText: this.narrationText,
      hasActed:
        this.phase === "NIGHT"
          ? myRole === "MAFIA"
            ? this.mafiaVotes.has(playerId)
            : myRole === "DOCTOR"
            ? this.doctorTarget !== null
            : myRole === "DETECTIVE"
            ? this.detectiveTarget !== null
            : true
          : this.phase === "DAY"
          ? this.readyToVote.has(playerId)
          : this.phase === "DAY_VOTE"
          ? this.votes.has(playerId)
          : false,
      investigationResult:
        myRole === "DETECTIVE"
          ? this.investigationResults.get(playerId) ?? null
          : null,
      readyCount: this.readyToVote.size,
      totalAlive: this.alivePlayers.length,
      aiDirectives: playerId === this.aiControlledId ? this.aiDirectives : [],
      winner: this.winner,
      allRoles:
        this.phase === "GAME_OVER"
          ? this.players.map((p) => ({ id: p.id, name: p.name, role: p.role }))
          : null,
    };
  }

  getVotes(): Map<string, string> {
    return this.votes;
  }

  isGameOver(): boolean {
    return this.phase === "GAME_OVER";
  }

  destroy() {
    this.clearTimer();
  }
}
