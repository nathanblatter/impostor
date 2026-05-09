import { Player } from "./Player.js";
import * as WordPool from "./WordPool.js";
import * as AiPlayer from "./AiPlayer.js";
import { MafiaGame } from "./MafiaGame.js";
import type {
  GamePhase,
  GameSettings,
  GameState,
  RoundState,
  PublicPlayer,
  DescriptorEntry,
  RoundResults,
  AnswerEntry,
  PickEntry,
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

  // Shared round state
  private votes: Map<string, string> = new Map();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerEndsAt: number = 0;
  private resultReason: string = "";

  // Spyfall
  private location: string | null = null;
  private allLocations: string[] = [];
  private playerRoles: Map<string, string> = new Map();
  private spyId: string | null = null;

  // Impostor
  private secretWord: string | null = null;
  private category: string = "";
  private impostorIds: string[] = [];
  private descriptorHistory: DescriptorEntry[] = [];
  private currentTurnIndex: number = 0;
  private currentDescriptorRound: number = 1;
  private turnOrder: string[] = [];

  // AI mode
  private aiControlledId: string | null = null;
  private aiSuggestedWords: Map<string, string> = new Map();
  private aiDirectives: string[] = [];
  private aiGenerating: boolean = false;

  // Odd One Out
  private normalPrompt: string = "";
  private oddPrompt: string = "";
  private oddPlayerId: string | null = null;
  private oddAnswers: Map<string, string> = new Map();
  private oddDiscussing: boolean = false;
  private readyToVote: Set<string> = new Set();

  // Hot Take
  private hotTakeQuestion: string = "";
  private hotTakeFakerQuestion: string = "";
  private hotTakeOptionA: string = "";
  private hotTakeOptionB: string = "";
  private fakerId: string | null = null;
  private hotTakePicks: Map<string, string> = new Map();
  private hotTakeDiscussing: boolean = false;

  // Mafia
  private mafiaGame: MafiaGame | null = null;

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
    this.resetModeState();

    const playerIds = this.activePlayers.map((p) => p.id);

    switch (this.settings.mode) {
      case "SPYFALL":
        this.initSpyfall(playerIds);
        break;
      case "IMPOSTOR":
        this.initImpostor(playerIds);
        break;
      case "ODD_ONE_OUT":
        this.initOddOneOut(playerIds);
        break;
      case "HOT_TAKE":
        this.initHotTake(playerIds);
        break;
      case "MAFIA":
        this.initMafia();
        break;
    }
  }

  private resetModeState() {
    this.descriptorHistory = [];
    this.currentDescriptorRound = 1;
    this.currentTurnIndex = 0;
    this.playerRoles.clear();
    this.aiSuggestedWords.clear();
    this.aiDirectives = [];
    this.aiControlledId = null;
    this.spyId = null;
    this.impostorIds = [];
    this.location = null;
    this.allLocations = [];
    this.secretWord = null;
    this.category = "";
    this.normalPrompt = "";
    this.oddPrompt = "";
    this.oddPlayerId = null;
    this.oddAnswers.clear();
    this.oddDiscussing = false;
    this.readyToVote.clear();
    this.hotTakeQuestion = "";
    this.hotTakeFakerQuestion = "";
    this.hotTakeOptionA = "";
    this.hotTakeOptionB = "";
    this.fakerId = null;
    this.hotTakePicks.clear();
    this.hotTakeDiscussing = false;
    if (this.mafiaGame) {
      this.mafiaGame.destroy();
      this.mafiaGame = null;
    }
  }

  // ── Mode Initialization ──

  private initSpyfall(playerIds: string[]) {
    this.spyId = playerIds[Math.floor(Math.random() * playerIds.length)];
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

    if (this.settings.aiMode) {
      const eligible = playerIds.filter((id) => id !== this.spyId);
      if (eligible.length > 0) {
        this.aiControlledId = eligible[Math.floor(Math.random() * eligible.length)];
        this.generateSpyfallDirectives();
      }
    }

    this.startTimer(this.settings.roundDurationSec, () => this.onPlayingTimerEnd());
    this.broadcastState();
  }

  private initImpostor(playerIds: string[]) {
    const w = WordPool.getWord(this.code);
    this.secretWord = w.word;
    this.category = w.category;
    const count = playerIds.length >= 7 ? 2 : 1;
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
    this.impostorIds = shuffled.slice(0, count);
    this.turnOrder = [...playerIds].sort(() => Math.random() - 0.5);

    if (this.settings.aiMode) {
      const eligible = playerIds.filter((id) => !this.impostorIds.includes(id));
      if (eligible.length > 0) {
        this.aiControlledId = eligible[Math.floor(Math.random() * eligible.length)];
      }
    }

    this.startTimer(this.settings.roundDurationSec, () => this.onPlayingTimerEnd());
    this.broadcastState();

    if (this.aiControlledId) {
      this.maybeGenerateAiWord();
    }
  }

  private initOddOneOut(playerIds: string[]) {
    this.oddPlayerId = playerIds[Math.floor(Math.random() * playerIds.length)];

    if (this.settings.aiMode) {
      const eligible = playerIds.slice();
      if (eligible.length > 0) {
        this.aiControlledId = eligible[Math.floor(Math.random() * eligible.length)];
      }
    }

    // Start with placeholder, generate async
    this.normalPrompt = "Loading question...";
    this.oddPrompt = "Loading question...";

    this.startTimer(120, () => this.onOddOneOutTimerEnd());
    this.broadcastState();

    this.generateOddOneOutPrompts();
  }

  private initHotTake(playerIds: string[]) {
    this.fakerId = playerIds[Math.floor(Math.random() * playerIds.length)];

    if (this.settings.aiMode) {
      const eligible = playerIds.filter((id) => id !== this.fakerId);
      if (eligible.length > 0) {
        this.aiControlledId = eligible[Math.floor(Math.random() * eligible.length)];
      }
    }

    this.hotTakeQuestion = "Loading question...";
    this.hotTakeOptionA = "...";
    this.hotTakeOptionB = "...";

    this.startTimer(60, () => this.onHotTakePickTimerEnd());
    this.broadcastState();

    this.generateHotTakeQuestion();
  }

  private initMafia() {
    this.mafiaGame = new MafiaGame(
      this.players,
      () => this.broadcastState(),
      (audioBase64: string) => {
        for (const player of this.activePlayers) {
          player.send({ type: "NARRATION", audioBase64 });
        }
      },
      () => {
        // Game over — transition to results
        this.phase = "RESULTS";
        this.resultReason = this.mafiaGame?.isGameOver()
          ? "The game is over!"
          : "Game ended";
        this.broadcastState();
      }
    );
    this.broadcastState();
  }

  // Mafia action delegates
  mafiaAction(playerId: string, targetId: string): string | null {
    if (!this.mafiaGame) return "No mafia game";
    return this.mafiaGame.submitNightAction(playerId, targetId);
  }

  mafiaReadyToVote(playerId: string): string | null {
    if (!this.mafiaGame) return "No mafia game";
    return this.mafiaGame.readyToVoteAction(playerId);
  }

  mafiaCastVote(playerId: string, targetId: string): string | null {
    if (!this.mafiaGame) return "No mafia game";
    return this.mafiaGame.castVote(playerId, targetId);
  }

  // ── AI Generation ──

  private async generateSpyfallDirectives() {
    if (!this.aiControlledId || !this.location) return;
    const role = this.playerRoles.get(this.aiControlledId) || "Visitor";
    try {
      this.aiDirectives = await AiPlayer.generateDirectives(this.location, role);
    } catch (err) {
      console.error("AI directive generation failed:", err);
      this.aiDirectives = [
        "Mention something about the weather outside",
        "Ask someone if they come here often",
        "Complain about something being too expensive",
      ];
    }
    if (this.phase === "PLAYING") this.broadcastState();
  }

  private async maybeGenerateAiWord() {
    if (!this.aiControlledId || this.phase !== "PLAYING") return;
    const currentPlayerId = this.turnOrder[this.currentTurnIndex];
    if (currentPlayerId !== this.aiControlledId) return;

    const key = `${this.currentDescriptorRound}:${this.aiControlledId}`;
    if (this.aiSuggestedWords.has(key) || this.aiGenerating) return;

    this.aiGenerating = true;
    try {
      const previousWords = this.descriptorHistory.map((d) => d.word);
      const word = await AiPlayer.generateDescriptor(this.secretWord!, this.category, previousWords);
      this.aiSuggestedWords.set(key, word);
    } catch (err) {
      console.error("AI word generation failed:", err);
      this.aiSuggestedWords.set(key, "interesting");
    } finally {
      this.aiGenerating = false;
    }
    if (this.phase === "PLAYING") this.broadcastState();
  }

  private async generateOddOneOutPrompts() {
    try {
      const { normalPrompt, oddPrompt } = await AiPlayer.generateOddOneOutPrompts();
      this.normalPrompt = normalPrompt;
      this.oddPrompt = oddPrompt;
    } catch (err) {
      console.error("Odd One Out prompt generation failed:", err);
      this.normalPrompt = "What's the best pizza topping?";
      this.oddPrompt = "What's the worst pizza topping?";
    }
    if (this.phase === "PLAYING") this.broadcastState();

    // Generate AI answer if AI mode is on
    if (this.aiControlledId && this.phase === "PLAYING") {
      const aiPrompt = this.aiControlledId === this.oddPlayerId
        ? this.oddPrompt : this.normalPrompt;
      try {
        const answer = await AiPlayer.generateOddOneOutAnswer(aiPrompt);
        this.aiSuggestedWords.set("oddanswer", answer);
      } catch (err) {
        console.error("AI answer generation failed:", err);
        this.aiSuggestedWords.set("oddanswer", "I plead the fifth");
      }
      if (this.phase === "PLAYING") this.broadcastState();
    }
  }

  private async generateHotTakeQuestion() {
    try {
      const { question, fakerQuestion, optionA, optionB } = await AiPlayer.generateHotTake();
      this.hotTakeQuestion = question;
      this.hotTakeFakerQuestion = fakerQuestion;
      this.hotTakeOptionA = optionA;
      this.hotTakeOptionB = optionB;
    } catch (err) {
      console.error("Hot Take generation failed:", err);
      this.hotTakeQuestion = "Which is more important in a partner?";
      this.hotTakeFakerQuestion = "Which is more important in a boss?";
      this.hotTakeOptionA = "Honesty";
      this.hotTakeOptionB = "Loyalty";
    }
    if (this.phase === "PLAYING") this.broadcastState();

    // Generate AI pick + arguments
    if (this.aiControlledId && this.phase === "PLAYING") {
      const aiPick = Math.random() > 0.5 ? "A" : "B";
      const chosenOption = aiPick === "A" ? this.hotTakeOptionA : this.hotTakeOptionB;
      this.aiSuggestedWords.set("hotpick", aiPick);
      try {
        this.aiDirectives = await AiPlayer.generateHotTakeArguments(
          this.hotTakeQuestion, chosenOption
        );
      } catch (err) {
        console.error("AI argument generation failed:", err);
        this.aiDirectives = [
          "I've thought about this a lot and it's clearly the right choice",
          "Anyone who picks the other option hasn't really considered it",
          "My gut says this and my gut is never wrong",
        ];
      }
      if (this.phase === "PLAYING") this.broadcastState();
    }
  }

  // ── Impostor Descriptors ──

  submitDescriptor(playerId: string, word: string): string | null {
    if (this.phase !== "PLAYING") return "Not in playing phase";
    if (this.settings.mode !== "IMPOSTOR") return "Not in impostor mode";
    if (this.turnOrder[this.currentTurnIndex] !== playerId) return "Not your turn";
    if (!word || word.includes(" ")) return "Must be a single word";

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
    this.maybeGenerateAiWord();
    return null;
  }

  // ── Odd One Out Answers ──

  submitAnswer(playerId: string, answer: string): string | null {
    if (this.phase !== "PLAYING") return "Not in playing phase";
    if (this.settings.mode !== "ODD_ONE_OUT") return "Not in Odd One Out mode";
    if (this.oddAnswers.has(playerId)) return "Already submitted";
    if (!answer.trim()) return "Answer cannot be empty";

    // AI-controlled player must submit the AI's answer
    if (playerId === this.aiControlledId) {
      const aiAnswer = this.aiSuggestedWords.get("oddanswer");
      if (aiAnswer && answer.trim() !== aiAnswer) {
        return "You must submit the AI's suggested answer";
      }
    }

    this.oddAnswers.set(playerId, answer.trim());

    // Check if all connected players answered → discussion
    if (this.connectedPlayers.every((p) => this.oddAnswers.has(p.id))) {
      this.clearTimer();
      this.startOddOneOutDiscussion();
    } else {
      this.broadcastState();
    }
    return null;
  }

  private onOddOneOutTimerEnd() {
    if (this.phase !== "PLAYING" || this.settings.mode !== "ODD_ONE_OUT") return;

    if (!this.oddDiscussing) {
      // Answer phase ended — fill missing, start discussion
      for (const p of this.connectedPlayers) {
        if (!this.oddAnswers.has(p.id)) {
          this.oddAnswers.set(p.id, "(no answer)");
        }
      }
      this.startOddOneOutDiscussion();
    } else {
      // Discussion phase ended → voting
      this.startVoting();
    }
  }

  private startOddOneOutDiscussion() {
    this.oddDiscussing = true;
    this.readyToVote.clear();
    this.startTimer(150, () => this.onOddOneOutTimerEnd()); // 2.5 min
    this.broadcastState();
  }

  readyToVoteAction(playerId: string): string | null {
    if (this.phase !== "PLAYING") return "Not in playing phase";

    const isOddDiscussion = this.settings.mode === "ODD_ONE_OUT" && this.oddDiscussing;
    const isSpyfall = this.settings.mode === "SPYFALL";

    if (!isOddDiscussion && !isSpyfall) return "Not applicable for this mode";
    if (this.readyToVote.has(playerId)) return "Already ready";

    this.readyToVote.add(playerId);

    if (this.connectedPlayers.every((p) => this.readyToVote.has(p.id))) {
      this.clearTimer();
      this.startVoting();
    } else {
      this.broadcastState();
    }
    return null;
  }

  // ── Hot Take Picks ──

  submitPick(playerId: string, pick: string): string | null {
    if (this.phase !== "PLAYING") return "Not in playing phase";
    if (this.settings.mode !== "HOT_TAKE") return "Not in Hot Take mode";
    if (this.hotTakeDiscussing) return "Picking is over";
    if (this.hotTakePicks.has(playerId)) return "Already picked";
    if (pick !== "A" && pick !== "B") return "Invalid pick";

    // AI-controlled player must submit the AI's pick
    if (playerId === this.aiControlledId) {
      const aiPick = this.aiSuggestedWords.get("hotpick");
      if (aiPick && pick !== aiPick) {
        return "You must submit the AI's chosen option";
      }
    }

    this.hotTakePicks.set(playerId, pick);

    if (this.connectedPlayers.every((p) => this.hotTakePicks.has(p.id))) {
      this.clearTimer();
      this.startHotTakeDiscussion();
    } else {
      this.broadcastState();
    }
    return null;
  }

  private onHotTakePickTimerEnd() {
    if (this.phase !== "PLAYING" || this.settings.mode !== "HOT_TAKE") return;
    // Auto-pick for missing players
    for (const p of this.connectedPlayers) {
      if (!this.hotTakePicks.has(p.id)) {
        this.hotTakePicks.set(p.id, Math.random() > 0.5 ? "A" : "B");
      }
    }
    this.startHotTakeDiscussion();
  }

  private startHotTakeDiscussion() {
    this.hotTakeDiscussing = true;
    this.startTimer(this.settings.roundDurationSec, () => this.startVoting());
    this.broadcastState();
  }

  // ── Spyfall Spy Guess ──

  spyGuess(playerId: string, locationGuess: string): string | null {
    if (this.settings.mode !== "SPYFALL") return "Not in Spyfall mode";
    if (playerId !== this.spyId) return "You're not the spy";

    if (this.phase === "PLAYING" || this.phase === "SPY_GUESS") {
      this.clearTimer();
      const correct = locationGuess.toLowerCase() === this.location!.toLowerCase();
      const msg = this.phase === "PLAYING"
        ? correct ? "Spy guessed the location!" : "Spy guessed wrong!"
        : correct ? "Spy guessed the location correctly!" : "Spy guessed the wrong location!";
      this.resolveRound(msg, correct);
      return null;
    }

    return "Cannot guess now";
  }

  // ── Voting ──

  callVote(playerId: string): string | null {
    if (this.phase !== "PLAYING") return "Not in playing phase";
    if (this.settings.mode === "SPYFALL") return "Use Ready to Vote instead";

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
    this.readyToVote.clear();
    this.clearTimer();
    const voteSec = this.settings.mode === "ODD_ONE_OUT" ? 60 : this.settings.voteDurationSec;
    this.startTimer(voteSec, () => this.onVotingTimerEnd());
    this.broadcastState();
  }

  castVote(playerId: string, targetId: string): string | null {
    if (this.phase !== "VOTING") return "Not in voting phase";
    if (!this.players.has(targetId)) return "Invalid target";
    if (this.votes.has(playerId)) return "Already voted";

    this.votes.set(playerId, targetId);

    if (this.connectedPlayers.every((p) => this.votes.has(p.id))) {
      this.clearTimer();
      this.resolveVotes();
    } else {
      this.broadcastState();
    }
    return null;
  }

  private onPlayingTimerEnd() {
    if (this.phase === "PLAYING") this.startVoting();
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

    switch (this.settings.mode) {
      case "SPYFALL":
        this.resolveSpyfallVotes(votedOutId, isTie);
        break;
      case "IMPOSTOR":
        this.resolveImpostorVotes(votedOutId, isTie);
        break;
      case "ODD_ONE_OUT":
        this.resolveOddOneOutVotes(votedOutId, isTie);
        break;
      case "HOT_TAKE":
        this.resolveHotTakeVotes(votedOutId, isTie);
        break;
    }
  }

  private resolveSpyfallVotes(votedOutId: string | null, isTie: boolean) {
    if (isTie || votedOutId === null || votedOutId !== this.spyId) {
      this.phase = "SPY_GUESS";
      this.clearTimer();
      this.startTimer(this.settings.spyGuessDurationSec, () => {
        this.resolveRound("Spy ran out of time to guess!", false);
      });
      this.broadcastState();
    } else {
      this.resolveRound("The spy was caught!", false);
    }
  }

  private resolveImpostorVotes(votedOutId: string | null, isTie: boolean) {
    if (isTie || votedOutId === null) {
      this.resolveRound("Vote was a tie — impostor(s) win!", true);
    } else if (this.impostorIds.includes(votedOutId)) {
      this.resolveRound("An impostor was caught!", false);
    } else {
      this.resolveRound("Wrong person voted out — impostor(s) win!", true);
    }
  }

  private resolveOddOneOutVotes(votedOutId: string | null, isTie: boolean) {
    if (isTie || votedOutId === null) {
      this.resolveRound("Vote was a tie — the odd one out survives!", true);
    } else if (votedOutId === this.oddPlayerId) {
      this.resolveRound("The odd one out was found!", false);
    } else {
      this.resolveRound("Wrong person — the odd one out got away!", true);
    }
  }

  private resolveHotTakeVotes(votedOutId: string | null, isTie: boolean) {
    if (isTie || votedOutId === null) {
      this.resolveRound("Vote was a tie — the faker survives!", true);
    } else if (votedOutId === this.fakerId) {
      this.resolveRound("The faker was caught!", false);
    } else {
      this.resolveRound("Wrong person — the faker got away!", true);
    }
  }

  private resolveRound(reason: string, specialWon: boolean) {
    this.phase = "RESULTS";
    this.resultReason = reason;
    this.clearTimer();

    const scoreChanges: Record<string, number> = {};
    for (const p of this.activePlayers) scoreChanges[p.id] = 0;

    switch (this.settings.mode) {
      case "SPYFALL":
        if (!specialWon) {
          for (const p of this.activePlayers) {
            if (p.id !== this.spyId) scoreChanges[p.id] = 2;
          }
        } else {
          if (this.spyId) scoreChanges[this.spyId] = 4;
        }
        break;
      case "IMPOSTOR":
        if (!specialWon) {
          for (const p of this.activePlayers) {
            if (!this.impostorIds.includes(p.id)) scoreChanges[p.id] = 2;
          }
        } else {
          for (const id of this.impostorIds) scoreChanges[id] = 3;
        }
        break;
      case "ODD_ONE_OUT":
        if (!specialWon) {
          for (const p of this.activePlayers) {
            if (p.id !== this.oddPlayerId) scoreChanges[p.id] = 2;
          }
        } else {
          if (this.oddPlayerId) scoreChanges[this.oddPlayerId] = 3;
        }
        break;
      case "HOT_TAKE":
        if (!specialWon) {
          for (const p of this.activePlayers) {
            if (p.id !== this.fakerId) scoreChanges[p.id] = 2;
          }
        } else {
          if (this.fakerId) scoreChanges[this.fakerId] = 3;
        }
        break;
    }

    for (const [pid, delta] of Object.entries(scoreChanges)) {
      this.scores.set(pid, (this.scores.get(pid) || 0) + delta);
    }

    this.broadcastState();
  }

  // ── Next Round / Settings ──

  nextRound(): string | null {
    const mafiaOver = this.settings.mode === "MAFIA" && this.mafiaGame?.isGameOver();
    if (this.phase !== "RESULTS" && !mafiaOver) return "Not in results phase";
    this.startRound();
    return null;
  }

  returnToLobby(): string | null {
    const mafiaOver = this.settings.mode === "MAFIA" && this.mafiaGame?.isGameOver();
    if (this.phase !== "RESULTS" && this.phase !== "LOBBY" && !mafiaOver) return "Cannot return to lobby now";
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
    const isOdd = playerId === this.oddPlayerId;
    const isFaker = playerId === this.fakerId;
    const inGame = this.phase !== "LOBBY";

    const players: PublicPlayer[] = this.activePlayers.map((p) => {
      let hasVoted = this.votes.has(p.id);
      // During PLAYING, show submission/ready status
      if (this.phase === "PLAYING") {
        if (this.settings.mode === "SPYFALL") hasVoted = this.readyToVote.has(p.id);
        if (this.settings.mode === "ODD_ONE_OUT") {
          hasVoted = this.oddDiscussing
            ? this.readyToVote.has(p.id)
            : this.oddAnswers.has(p.id);
        }
        if (this.settings.mode === "HOT_TAKE") hasVoted = this.hotTakePicks.has(p.id);
      }
      return {
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isConnected: p.isConnected,
        hasVoted,
        descriptor:
          this.descriptorHistory.find((d) => d.playerId === p.id)?.word ?? null,
      };
    });

    let round: RoundState | null = null;
    if (inGame) {
      const votes: Record<string, string> = {};
      if (this.phase === "RESULTS") {
        for (const [voter, target] of this.votes) votes[voter] = target;
      }

      let results: RoundResults | null = null;
      if (this.phase === "RESULTS") {
        const totalScores: Record<string, number> = {};
        for (const p of this.activePlayers) totalScores[p.id] = this.scores.get(p.id) || 0;

        results = {
          spyWon: false,
          reason: this.resultReason || "Round over",
          votes,
          scores: totalScores,
          spyId: this.spyId ?? undefined,
          location: this.location ?? undefined,
          impostorIds: this.impostorIds.length > 0 ? this.impostorIds : undefined,
          secretWord: this.secretWord ?? undefined,
          category: this.category || undefined,
          aiControlledId: this.aiControlledId ?? undefined,
          oddPlayerId: this.oddPlayerId ?? undefined,
          normalPrompt: this.normalPrompt || undefined,
          oddPlayerPrompt: this.oddPrompt || undefined,
          fakerId: this.fakerId ?? undefined,
          hotTakeQuestion: this.hotTakeQuestion || undefined,
          hotTakeFakerQuestion: this.hotTakeFakerQuestion || undefined,
          hotTakeOptionA: this.hotTakeOptionA || undefined,
          hotTakeOptionB: this.hotTakeOptionB || undefined,
        };
      }

      // AI suggested word
      let aiSuggestedWord: string | null = null;
      if (isAiControlled && this.phase === "PLAYING") {
        if (this.settings.mode === "IMPOSTOR") {
          const key = `${this.currentDescriptorRound}:${playerId}`;
          aiSuggestedWord = this.aiSuggestedWords.get(key) ?? null;
        } else if (this.settings.mode === "ODD_ONE_OUT") {
          aiSuggestedWord = this.aiSuggestedWords.get("oddanswer") ?? null;
        } else if (this.settings.mode === "HOT_TAKE") {
          aiSuggestedWord = this.aiSuggestedWords.get("hotpick") ?? null;
        }
      }

      // Odd One Out answers (shown after all submit or in voting/results)
      let oddAnswers: AnswerEntry[] | null = null;
      const allAnswered = this.settings.mode === "ODD_ONE_OUT" &&
        this.connectedPlayers.every((p) => this.oddAnswers.has(p.id));
      if (this.settings.mode === "ODD_ONE_OUT" && (allAnswered || this.phase !== "PLAYING")) {
        oddAnswers = this.activePlayers
          .filter((p) => this.oddAnswers.has(p.id))
          .map((p) => ({
            playerId: p.id,
            playerName: p.name,
            answer: this.oddAnswers.get(p.id)!,
          }));
      }

      // Hot Take picks (shown when discussing or voting/results)
      let hotTakePicks: PickEntry[] | null = null;
      if (this.settings.mode === "HOT_TAKE" && (this.hotTakeDiscussing || this.phase !== "PLAYING")) {
        hotTakePicks = this.activePlayers
          .filter((p) => this.hotTakePicks.has(p.id))
          .map((p) => ({
            playerId: p.id,
            playerName: p.name,
            pick: this.hotTakePicks.get(p.id)!,
          }));
      }

      round = {
        roundNumber: this.roundNumber,
        // Spyfall
        location: this.settings.mode === "SPYFALL"
          ? isSpy && this.phase !== "RESULTS" ? null : this.location
          : null,
        role: this.settings.mode === "SPYFALL" && !isSpy
          ? this.playerRoles.get(playerId) ?? null : null,
        isSpy,
        allLocations: this.settings.mode === "SPYFALL" ? this.allLocations : [],
        // Impostor
        secretWord: this.settings.mode === "IMPOSTOR"
          ? isImpostor && this.phase !== "RESULTS" ? null : this.secretWord
          : null,
        category: this.category,
        isImpostor,
        fellowImpostorNames: isImpostor
          ? this.impostorIds.filter((id) => id !== playerId)
              .map((id) => this.players.get(id)?.name ?? "Unknown")
          : [],
        currentTurnPlayerId: this.settings.mode === "IMPOSTOR" && this.phase === "PLAYING"
          ? this.turnOrder[this.currentTurnIndex] ?? null : null,
        descriptorHistory: this.descriptorHistory,
        currentDescriptorRound: this.currentDescriptorRound,
        // AI
        isAiControlled,
        aiSuggestedWord,
        aiDirectives: isAiControlled ? this.aiDirectives : [],
        // Odd One Out
        oddPrompt: this.settings.mode === "ODD_ONE_OUT"
          ? (isOdd ? this.oddPrompt : this.normalPrompt) : null,
        oddHasAnswered: this.oddAnswers.has(playerId),
        oddAnswers,
        oddDiscussing: this.oddDiscussing,
        // Hot Take
        hotTakeQuestion: this.settings.mode === "HOT_TAKE"
          ? (isFaker && this.phase !== "RESULTS" ? this.hotTakeFakerQuestion : this.hotTakeQuestion)
          : null,
        hotTakeOptionA: this.settings.mode === "HOT_TAKE" ? this.hotTakeOptionA : null,
        hotTakeOptionB: this.settings.mode === "HOT_TAKE" ? this.hotTakeOptionB : null,
        hotTakeIsFaker: isFaker,
        hotTakeHasPicked: this.hotTakePicks.has(playerId),
        hotTakePicks,
        hotTakeDiscussing: this.hotTakeDiscussing,
        // Mafia
        mafia: this.mafiaGame ? this.mafiaGame.getStateForPlayer(playerId) : null,
        // Shared
        timerEndsAt: this.mafiaGame
          ? this.mafiaGame.getTimerEndsAt()
          : this.timerEndsAt,
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
