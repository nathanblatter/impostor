import { Player } from "./Player.js";
import * as WordPool from "./WordPool.js";
import * as AiPlayer from "./AiPlayer.js";
import { MafiaGame } from "./MafiaGame.js";
import { FingerPointGame } from "./FingerPointGame.js";
import { TouchySubjectsGame } from "./TouchySubjectsGame.js";
import { TriggerGame } from "./TriggerGame.js";
import { ScaleGame } from "./ScaleGame.js";
import { CodenamesGame } from "./CodenamesGame.js";
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
  CodenamesSetup,
} from "../shared/types.js";
import { DEFAULT_SETTINGS } from "../shared/types.js";
import { MIN_PLAYERS, PLAYER_COLORS } from "../shared/constants.js";

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
  private timerCallback: (() => void) | null = null;
  timerPaused: boolean = false;
  private timerPausedSecondsLeft: number = 0;
  private resultReason: string = "";

  // Bonus stars phase
  private bonusCategoryIndex: number = 0;
  private readonly bonusCategories: string[] = ["Most Valuable Player", "Best Bluffer", "Funniest Moment"];
  private bonusVotes: Map<string, string> = new Map();
  private bonusPoints: Map<string, number> = new Map();
  private bonusRevealPhase: boolean = false;
  private bonusWinner: { id: string; name: string } | null = null;
  private bonusDone: boolean = false;

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
  private hotTakeOptions: string[] = [];
  private fakerId: string | null = null;
  private hotTakePicks: Map<string, string> = new Map();
  private hotTakeDiscussing: boolean = false;

  // Mafia
  private mafiaGame: MafiaGame | null = null;

  // Finger Point
  private fingerPointGame: FingerPointGame | null = null;

  // Touchy Subjects
  private touchyGame: TouchySubjectsGame | null = null;

  // Trigger
  private triggerGame: TriggerGame | null = null;

  // Scale
  private scaleGame: ScaleGame | null = null;

  // Codenames
  private codenamesGame: CodenamesGame | null = null;
  // Lobby-time team assignment for CODENAMES HOST mode
  private codenamesTeams: Map<string, "red" | "blue"> = new Map();
  private codenamesSpymasters: { red: string | null; blue: string | null } = { red: null, blue: null };

  constructor(code: string) {
    this.code = code;
  }

  addPlayer(player: Player): void {
    // Auto-assign first available color
    const usedColors = new Set([...this.players.values()].map((p) => p.color));
    player.color = PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? "#6b7280";
    this.players.set(player.id, player);
    if (!player.isSpectator && !this.scores.has(player.id)) this.scores.set(player.id, 0);
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.scores.delete(playerId);
    this.clearCodenamesAssignment(playerId);
  }

  private clearCodenamesAssignment(playerId: string): void {
    this.codenamesTeams.delete(playerId);
    if (this.codenamesSpymasters.red === playerId) this.codenamesSpymasters.red = null;
    if (this.codenamesSpymasters.blue === playerId) this.codenamesSpymasters.blue = null;
  }

  get activePlayers(): Player[] {
    return [...this.players.values()].filter((p) => !p.isSpectator);
  }

  get spectators(): Player[] {
    return [...this.players.values()].filter((p) => p.isSpectator);
  }

  get connectedPlayers(): Player[] {
    return this.activePlayers.filter((p) => p.isConnected);
  }

  // ── Start Game ──

  startGame(): string | null {
    if (this.phase !== "LOBBY") return "Game already in progress";
    if (this.activePlayers.length < MIN_PLAYERS)
      return `Need at least ${MIN_PLAYERS} players`;
    if (this.settings.mode === "CODENAMES" && this.settings.codenamesAssignMode === "HOST") {
      const err = this.validateCodenamesAssignment();
      if (err) return err;
    }
    this.startRound();
    return null;
  }

  private validateCodenamesAssignment(): string | null {
    const active = this.activePlayers.map((p) => p.id);
    const unassigned = active.filter((id) => !this.codenamesTeams.has(id));
    if (unassigned.length > 0) return "Assign every player to a team first";
    const red = active.filter((id) => this.codenamesTeams.get(id) === "red");
    const blue = active.filter((id) => this.codenamesTeams.get(id) === "blue");
    if (red.length < 2 || blue.length < 2) return "Each team needs at least 2 players";
    if (!this.codenamesSpymasters.red || this.codenamesTeams.get(this.codenamesSpymasters.red) !== "red")
      return "Pick a spymaster for the red team";
    if (!this.codenamesSpymasters.blue || this.codenamesTeams.get(this.codenamesSpymasters.blue) !== "blue")
      return "Pick a spymaster for the blue team";
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
      case "FINGER_POINT":
        this.initFingerPoint();
        break;
      case "TOUCHY_SUBJECTS":
        this.initTouchySubjects();
        break;
      case "TRIGGER":
        this.initTrigger();
        break;
      case "SCALE":
        this.initScale();
        break;
      case "CODENAMES":
        this.initCodenames();
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
    this.hotTakeOptions = [];
    this.fakerId = null;
    this.hotTakePicks.clear();
    this.hotTakeDiscussing = false;
    if (this.mafiaGame) {
      this.mafiaGame.destroy();
      this.mafiaGame = null;
    }
    if (this.fingerPointGame) {
      this.fingerPointGame.destroy();
      this.fingerPointGame = null;
    }
    if (this.touchyGame) {
      this.touchyGame.destroy();
      this.touchyGame = null;
    }
    if (this.triggerGame) {
      this.triggerGame.destroy();
      this.triggerGame = null;
    }
    if (this.scaleGame) {
      this.scaleGame.destroy();
      this.scaleGame = null;
    }
    if (this.codenamesGame) {
      this.codenamesGame.destroy();
      this.codenamesGame = null;
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
    this.hotTakeOptions = ["...", "...", "..."];

    this.startTimer(60, () => this.onHotTakePickTimerEnd());
    this.broadcastState();

    this.generateHotTakeQuestion();
  }

  private get activePlayerMap(): Map<string, Player> {
    return new Map([...this.players.entries()].filter(([, p]) => !p.isSpectator));
  }

  private initMafia() {
    this.mafiaGame = new MafiaGame(
      this.activePlayerMap,
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
      },
      this.settings.aiMode
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

  private initFingerPoint() {
    this.fingerPointGame = new FingerPointGame(
      this.activePlayerMap,
      () => this.broadcastState(),
      this.settings.aiMode
    );
    this.broadcastState();
  }

  fingerPointPick(playerId: string, targetId: string): string | null {
    if (!this.fingerPointGame) return "No finger point game";
    return this.fingerPointGame.submitPick(playerId, targetId);
  }

  fingerPointReady(playerId: string): string | null {
    if (!this.fingerPointGame) return "No finger point game";
    return this.fingerPointGame.readyAction(playerId);
  }

  fingerPointVote(playerId: string, targetId: string): string | null {
    if (!this.fingerPointGame) return "No finger point game";
    return this.fingerPointGame.castVote(playerId, targetId);
  }

  private initTouchySubjects() {
    this.touchyGame = new TouchySubjectsGame(
      this.activePlayerMap,
      () => this.broadcastState(),
      this.settings.descriptorRounds
    );
    this.broadcastState();
  }

  touchyVote(playerId: string, targetId: string): string | null {
    if (!this.touchyGame) return "No touchy subjects game";
    return this.touchyGame.submitVote(playerId, targetId);
  }

  touchyGuess(playerId: string, targetId: string): string | null {
    if (!this.touchyGame) return "No touchy subjects game";
    return this.touchyGame.submitGuess(playerId, targetId);
  }

  private initTrigger() {
    this.triggerGame = new TriggerGame(
      this.activePlayerMap,
      () => this.broadcastState(),
      this.settings.triggerAssignMode,
      this.settings.triggerTimerEnabled
    );
    this.broadcastState();
  }

  triggerSubmitAssignment(playerId: string, trigger: string, action: string): string | null {
    if (!this.triggerGame) return "No trigger game";
    return this.triggerGame.submitAssignment(playerId, trigger, action);
  }

  async triggerGetSuggestion(playerId: string): Promise<string | null> {
    if (!this.triggerGame) return "No trigger game";
    return this.triggerGame.requestAiSuggestion(playerId);
  }

  triggerStartGuessing(playerId: string): string | null {
    if (!this.triggerGame) return "No trigger game";
    return this.triggerGame.startGuessing();
  }

  triggerGuess(playerId: string, targetName: string, triggerGuess: string): string | null {
    if (!this.triggerGame) return "No trigger game";
    return this.triggerGame.submitGuess(playerId, targetName, triggerGuess);
  }

  triggerSkipToReveal(playerId: string): string | null {
    if (!this.triggerGame) return "No trigger game";
    return this.triggerGame.skipToReveal(playerId);
  }

  // ── Scale ──

  private initScale() {
    this.scaleGame = new ScaleGame(
      this.activePlayerMap,
      () => this.broadcastState(),
      this.settings.descriptorRounds
    );
    this.broadcastState();
  }

  scaleDescribe(playerId: string, description: string): string | null {
    if (!this.scaleGame) return "No scale game";
    return this.scaleGame.submitDescription(playerId, description);
  }

  scaleAdvance(hostId: string): string | null {
    const host = this.players.get(hostId);
    if (!host?.isHost) return "Only host can advance";
    if (!this.scaleGame) return "No scale game";
    return this.scaleGame.advance();
  }

  scaleOrder(hostId: string, correct: boolean): string | null {
    const host = this.players.get(hostId);
    if (!host?.isHost) return "Only host can mark order";
    if (!this.scaleGame) return "No scale game";
    return this.scaleGame.setOrderResult(correct);
  }

  scaleVote(voterId: string, targetId: string): string | null {
    if (!this.scaleGame) return "No scale game";
    return this.scaleGame.castVote(voterId, targetId);
  }

  scaleNext(hostId: string): string | null {
    const host = this.players.get(hostId);
    if (!host?.isHost) return "Only host can advance";
    if (!this.scaleGame) return "No scale game";
    if (this.scaleGame.isGameOver()) {
      this.awardSubGameScores();
      return this.returnToLobby();
    }
    return this.scaleGame.nextScenario();
  }

  // ── Codenames ──

  private initCodenames() {
    const useHost = this.settings.codenamesAssignMode === "HOST";
    this.codenamesGame = new CodenamesGame(
      this.activePlayerMap,
      () => this.broadcastState(),
      this.settings.codenamesAdultMode,
      this.settings.codenamesAssignMode,
      useHost ? new Map(this.codenamesTeams) : undefined,
      useHost ? { ...this.codenamesSpymasters } : undefined
    );
    this.broadcastState();
  }

  codenamesGiveClue(playerId: string, word: string, count: number): string | null {
    if (!this.codenamesGame) return "No codenames game";
    return this.codenamesGame.giveClue(playerId, word, count);
  }

  codenamesGuess(playerId: string, index: number): string | null {
    if (!this.codenamesGame) return "No codenames game";
    return this.codenamesGame.guess(playerId, index);
  }

  codenamesEndTurn(playerId: string): string | null {
    if (!this.codenamesGame) return "No codenames game";
    return this.codenamesGame.endTurnAction(playerId);
  }

  async codenamesAiHint(playerId: string): Promise<string | null> {
    if (!this.codenamesGame) return "No codenames game";
    return this.codenamesGame.requestAiHint(playerId);
  }

  // Lobby-time team assignment (HOST mode)
  setCodenamesTeam(hostId: string, targetId: string, team: "red" | "blue"): string | null {
    const host = this.players.get(hostId);
    if (!host?.isHost) return "Only the host can assign teams";
    if (this.phase !== "LOBBY") return "Can only assign teams in the lobby";
    const target = this.players.get(targetId);
    if (!target || target.isSpectator) return "Player not found";
    this.codenamesTeams.set(targetId, team);
    // If they were the other team's spymaster, clear that.
    const other = team === "red" ? "blue" : "red";
    if (this.codenamesSpymasters[other] === targetId) this.codenamesSpymasters[other] = null;
    this.broadcastState();
    return null;
  }

  setCodenamesSpymaster(hostId: string, targetId: string): string | null {
    const host = this.players.get(hostId);
    if (!host?.isHost) return "Only the host can assign spymasters";
    if (this.phase !== "LOBBY") return "Can only assign spymasters in the lobby";
    const team = this.codenamesTeams.get(targetId);
    if (!team) return "Assign this player to a team first";
    this.codenamesSpymasters[team] = targetId;
    this.broadcastState();
    return null;
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
      const { question, fakerQuestion, options } = await AiPlayer.generateHotTake();
      this.hotTakeQuestion = question;
      this.hotTakeFakerQuestion = fakerQuestion;
      this.hotTakeOptions = options;
    } catch (err) {
      console.error("Hot Take generation failed:", err);
      this.hotTakeQuestion = "Which is most important in a partner?";
      this.hotTakeFakerQuestion = "Which is most important in a boss?";
      this.hotTakeOptions = ["Honesty", "Loyalty", "Ambition"];
    }
    if (this.phase === "PLAYING") this.broadcastState();

    // Generate AI worst pick + bad-take arguments
    if (this.aiControlledId && this.phase === "PLAYING") {
      try {
        const { pickLetter, arguments: args } = await AiPlayer.generateHotTakeWorstPickAndArguments(
          this.hotTakeQuestion, this.hotTakeOptions
        );
        this.aiSuggestedWords.set("hotpick", pickLetter);
        this.aiDirectives = args;
      } catch (err) {
        console.error("AI pick+argument generation failed:", err);
        const fallbackIdx = Math.floor(Math.random() * this.hotTakeOptions.length);
        this.aiSuggestedWords.set("hotpick", String.fromCharCode(65 + fallbackIdx));
        this.aiDirectives = [
          "Objectively the correct answer, I don't make the rules",
          "Anyone who disagrees simply hasn't lived enough life",
          "I will die on this hill and I'm at peace with that",
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
    const validPicks = this.hotTakeOptions.map((_, i) => String.fromCharCode(65 + i));
    if (!validPicks.includes(pick)) return "Invalid pick";

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
        const idx = Math.floor(Math.random() * this.hotTakeOptions.length);
        this.hotTakePicks.set(p.id, String.fromCharCode(65 + idx));
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
    if (this.players.get(playerId)?.isSpectator) return "Spectators cannot vote";
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

    // Standard scoring: town wins = 1pt each, special role wins = 2pts
    switch (this.settings.mode) {
      case "SPYFALL":
        if (!specialWon) {
          for (const p of this.activePlayers) {
            if (p.id !== this.spyId) scoreChanges[p.id] = 1;
          }
        } else {
          if (this.spyId) scoreChanges[this.spyId] = 2;
        }
        break;
      case "IMPOSTOR":
        if (!specialWon) {
          for (const p of this.activePlayers) {
            if (!this.impostorIds.includes(p.id)) scoreChanges[p.id] = 1;
          }
        } else {
          for (const id of this.impostorIds) scoreChanges[id] = 2;
        }
        break;
      case "ODD_ONE_OUT":
        if (!specialWon) {
          for (const p of this.activePlayers) {
            if (p.id !== this.oddPlayerId) scoreChanges[p.id] = 1;
          }
        } else {
          if (this.oddPlayerId) scoreChanges[this.oddPlayerId] = 2;
        }
        break;
      case "HOT_TAKE":
        if (!specialWon) {
          for (const p of this.activePlayers) {
            if (p.id !== this.fakerId) scoreChanges[p.id] = 1;
          }
        } else {
          if (this.fakerId) scoreChanges[this.fakerId] = 2;
        }
        break;
    }

    for (const [pid, delta] of Object.entries(scoreChanges)) {
      this.scores.set(pid, (this.scores.get(pid) || 0) + delta);
    }

    this.broadcastState();
  }

  // ── Next Round / Settings ──

  private awardSubGameScores() {
    const awards =
      this.mafiaGame?.isGameOver() ? this.mafiaGame.getFinalScoreAwards() :
      this.fingerPointGame?.isGameOver() ? this.fingerPointGame.getFinalScoreAwards() :
      this.touchyGame?.isGameOver() ? this.touchyGame.getFinalScoreAwards() :
      this.triggerGame?.isGameOver() ? this.triggerGame.getFinalScoreAwards() :
      this.scaleGame?.isGameOver() ? this.scaleGame.getFinalScoreAwards() :
      this.codenamesGame?.isGameOver() ? this.codenamesGame.getFinalScoreAwards() :
      null;
    if (!awards) return;
    for (const [pid, delta] of Object.entries(awards)) {
      if (delta > 0) this.scores.set(pid, (this.scores.get(pid) || 0) + delta);
    }
  }

  nextRound(): string | null {
    const mafiaOver = this.settings.mode === "MAFIA" && this.mafiaGame?.isGameOver();
    const fpOver = this.settings.mode === "FINGER_POINT" && this.fingerPointGame?.isGameOver();
    const tsOver = this.settings.mode === "TOUCHY_SUBJECTS" && this.touchyGame?.isGameOver();
    const tgOver = this.settings.mode === "TRIGGER" && this.triggerGame?.isGameOver();
    const cnOver = this.settings.mode === "CODENAMES" && this.codenamesGame?.isGameOver();
    if (this.phase !== "RESULTS" && !mafiaOver && !fpOver && !tsOver && !tgOver && !cnOver) return "Not in results phase";
    // SCALE uses its own next-round flow via scaleNext()
    this.awardSubGameScores();
    this.startRound();
    return null;
  }

  kickPlayer(hostId: string, targetId: string): string | null {
    const host = this.players.get(hostId);
    if (!host?.isHost) return "Only host can kick players";
    if (hostId === targetId) return "Cannot kick yourself";
    const target = this.players.get(targetId);
    if (!target) return "Player not found";
    target.send({ type: "KICKED" });
    this.players.delete(targetId);
    this.scores.delete(targetId);
    this.clearCodenamesAssignment(targetId);
    this.broadcastState();
    return null;
  }

  transferHost(hostId: string, targetId: string): string | null {
    const host = this.players.get(hostId);
    if (!host?.isHost) return "Only host can transfer host";
    const target = this.players.get(targetId);
    if (!target || target.isSpectator) return "Target player not found";
    if (targetId === hostId) return "Already host";
    host.isHost = false;
    target.isHost = true;
    this.broadcastState();
    return null;
  }

  setPlayerColor(playerId: string, color: string): string | null {
    const player = this.players.get(playerId);
    if (!player) return "Player not found";
    const taken = [...this.players.values()].some((p) => p.id !== playerId && p.color === color);
    if (taken) return "Color already taken by another player";
    player.color = color;
    this.broadcastState();
    return null;
  }

  togglePause(hostId: string): string | null {
    const host = this.players.get(hostId);
    if (!host?.isHost) return "Only host can pause";
    if (!this.timerCallback) return "No active timer to pause";

    if (!this.timerPaused) {
      this.timerPausedSecondsLeft = Math.max(1, Math.ceil((this.timerEndsAt - Date.now()) / 1000));
      this.timerPaused = true;
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      this.timerEndsAt = Date.now() + 86400 * 1000;
    } else {
      this.timerPaused = false;
      this.timerEndsAt = Date.now() + this.timerPausedSecondsLeft * 1000;
      this.timer = setTimeout(this.timerCallback, this.timerPausedSecondsLeft * 1000);
    }
    this.broadcastState();
    return null;
  }

  // ── Bonus Stars Phase ──

  private startBonusPhase(): void {
    this.phase = "BONUS";
    this.bonusCategoryIndex = 0;
    this.bonusVotes.clear();
    this.bonusPoints.clear();
    this.bonusRevealPhase = false;
    this.bonusWinner = null;
    this.bonusDone = false;
    this.startTimer(25, () => this.revealBonusCategory());
    this.broadcastState();
  }

  bonusCastVote(voterId: string, targetId: string): string | null {
    if (this.phase !== "BONUS") return "Not in bonus phase";
    if (this.bonusRevealPhase || this.bonusDone) return "Voting is closed";
    if (voterId === targetId) return "Cannot vote for yourself";
    if (this.bonusVotes.has(voterId)) return "Already voted";
    const target = this.players.get(targetId);
    if (!target || target.isSpectator) return "Invalid target";
    this.bonusVotes.set(voterId, targetId);
    const connected = this.activePlayers.filter((p) => p.isConnected);
    if (connected.every((p) => this.bonusVotes.has(p.id))) {
      this.clearTimer();
      this.revealBonusCategory();
    } else {
      this.broadcastState();
    }
    return null;
  }

  private revealBonusCategory(): void {
    // Tally votes
    const tally = new Map<string, number>();
    for (const targetId of this.bonusVotes.values()) {
      tally.set(targetId, (tally.get(targetId) ?? 0) + 1);
    }
    let maxVotes = 0;
    let winnerId: string | null = null;
    let tied = false;
    for (const [id, count] of tally) {
      if (count > maxVotes) { maxVotes = count; winnerId = id; tied = false; }
      else if (count === maxVotes) { tied = true; }
    }
    if (winnerId && !tied) {
      const winner = this.players.get(winnerId);
      if (winner) {
        this.bonusWinner = { id: winnerId, name: winner.name };
        this.bonusPoints.set(winnerId, (this.bonusPoints.get(winnerId) ?? 0) + 1);
        this.scores.set(winnerId, (this.scores.get(winnerId) ?? 0) + 1);
      }
    } else {
      this.bonusWinner = null;
    }
    this.bonusRevealPhase = true;
    this.broadcastState();

    setTimeout(() => {
      this.bonusCategoryIndex++;
      this.bonusVotes.clear();
      this.bonusRevealPhase = false;
      this.bonusWinner = null;
      if (this.bonusCategoryIndex >= this.bonusCategories.length) {
        this.bonusDone = true;
        this.clearTimer();
        this.broadcastState();
      } else {
        this.startTimer(25, () => this.revealBonusCategory());
        this.broadcastState();
      }
    }, 3500);
  }

  finishBonus(hostId: string): string | null {
    const host = this.players.get(hostId);
    if (!host?.isHost) return "Only host can continue";
    if (this.phase !== "BONUS") return "Not in bonus phase";
    this.clearTimer();
    this.scores.clear();
    for (const p of this.activePlayers) this.scores.set(p.id, 0);
    this.phase = "LOBBY";
    this.broadcastState();
    return null;
  }

  returnToLobby(): string | null {
    const mafiaOver = this.settings.mode === "MAFIA" && this.mafiaGame?.isGameOver();
    const fpOver = this.settings.mode === "FINGER_POINT" && this.fingerPointGame?.isGameOver();
    const tsOver = this.settings.mode === "TOUCHY_SUBJECTS" && this.touchyGame?.isGameOver();
    const tgOver = this.settings.mode === "TRIGGER" && this.triggerGame?.isGameOver();
    const scOver = this.settings.mode === "SCALE" && this.scaleGame?.isGameOver();
    const cnOver = this.settings.mode === "CODENAMES" && this.codenamesGame?.isGameOver();
    if (this.phase !== "RESULTS" && this.phase !== "LOBBY" && !mafiaOver && !fpOver && !tsOver && !tgOver && !scOver && !cnOver) return "Cannot return to lobby now";
    this.awardSubGameScores();
    const hasScores = [...this.scores.values()].some((s) => s > 0);
    if (hasScores && this.settings.bonusStarsEnabled) {
      this.startBonusPhase();
    } else {
      this.phase = "LOBBY";
      this.clearTimer();
      this.broadcastState();
    }
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
    this.timerCallback = callback;
    this.timerPaused = false;
    this.timerEndsAt = Date.now() + seconds * 1000;
    this.timer = setTimeout(callback, seconds * 1000);
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timerCallback = null;
    this.timerPaused = false;
  }

  // ── State Broadcasting ──

  broadcastState() {
    for (const player of this.players.values()) {
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

    const viewerIsSpectator = this.players.get(playerId)?.isSpectator ?? false;

    const players: PublicPlayer[] = [...this.players.values()].map((p) => {
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
        if (this.settings.mode === "FINGER_POINT" && this.fingerPointGame) {
          const fpState = this.fingerPointGame.getStateForPlayer(p.id);
          hasVoted = fpState.hasPicked;
        }
        if (this.settings.mode === "TOUCHY_SUBJECTS" && this.touchyGame) {
          hasVoted = this.touchyGame.getStateForPlayer(p.id).hasVoted;
        }
        if (this.settings.mode === "TRIGGER" && this.triggerGame) {
          const ts = this.triggerGame.getStateForPlayer(p.id);
          hasVoted = ts.subPhase === "ASSIGNING" ? ts.hasSubmittedAssignment : false;
        }
      }
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        isHost: p.isHost,
        isConnected: p.isConnected,
        isSpectator: p.isSpectator,
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
          hotTakeOptions: this.hotTakeOptions.length ? this.hotTakeOptions : undefined,
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
        hotTakeOptions: this.settings.mode === "HOT_TAKE" ? this.hotTakeOptions : null,
        hotTakeIsFaker: isFaker,
        hotTakeHasPicked: this.hotTakePicks.has(playerId),
        hotTakePicks,
        hotTakeDiscussing: this.hotTakeDiscussing,
        // Mafia
        mafia: this.mafiaGame ? this.mafiaGame.getStateForPlayer(playerId) : null,
        // Finger Point
        fingerPoint: this.fingerPointGame ? this.fingerPointGame.getStateForPlayer(playerId) : null,
        // Touchy Subjects
        touchySubjects: this.touchyGame ? this.touchyGame.getStateForPlayer(playerId) : null,
        // Trigger
        trigger: this.triggerGame ? this.triggerGame.getStateForPlayer(playerId) : null,
        // Scale
        scale: this.scaleGame ? this.scaleGame.getStateForPlayer(playerId) : null,
        // Codenames
        codenames: this.codenamesGame ? this.codenamesGame.getStateForPlayer(playerId, viewerIsSpectator) : null,
        // Shared
        timerEndsAt: this.mafiaGame
          ? this.mafiaGame.getTimerEndsAt()
          : this.fingerPointGame
          ? this.fingerPointGame.getTimerEndsAt()
          : this.touchyGame
          ? this.touchyGame.getTimerEndsAt()
          : this.triggerGame
          ? this.triggerGame.getTimerEndsAt()
          : this.scaleGame
          ? this.scaleGame.getTimerEndsAt()
          : this.codenamesGame
          ? this.codenamesGame.getTimerEndsAt()
          : this.timerEndsAt,
        results,
      };
    }

    const spectatorReveal = viewerIsSpectator && inGame ? {
      spyId: this.spyId,
      impostorIds: this.impostorIds,
      fakerId: this.fakerId,
      oddPlayerId: this.oddPlayerId,
      mafiaRoles: this.mafiaGame
        ? this.activePlayers.map((p) => ({
            playerId: p.id,
            playerName: p.name,
            role: this.mafiaGame!.getRoleForPlayer(p.id) ?? "UNKNOWN",
          }))
        : [],
    } : null;

    const bonusVote = this.phase === "BONUS" ? {
      categoryIndex: this.bonusCategoryIndex,
      categories: this.bonusCategories,
      currentCategory: this.bonusCategories[this.bonusCategoryIndex] ?? "",
      votes: Object.fromEntries(this.bonusVotes),
      hasVoted: this.bonusVotes.has(playerId),
      timerEndsAt: this.timerEndsAt,
      revealPhase: this.bonusRevealPhase,
      winner: this.bonusWinner,
      bonusPoints: Object.fromEntries(this.bonusPoints),
      done: this.bonusDone,
    } : null;

    return {
      roomCode: this.code,
      phase: this.phase,
      mode: this.settings.mode,
      players,
      settings: this.settings,
      round,
      isSpectator: viewerIsSpectator,
      spectatorReveal,
      sessionScores: Object.fromEntries(this.scores),
      timerPaused: this.timerPaused,
      bonusVote,
      codenamesSetup: this.settings.mode === "CODENAMES" ? this.getCodenamesSetup() : null,
    };
  }

  private getCodenamesSetup(): CodenamesSetup {
    const teams: Record<string, "red" | "blue"> = {};
    for (const p of this.activePlayers) {
      const t = this.codenamesTeams.get(p.id);
      if (t) teams[p.id] = t;
    }
    return { teams, spymasters: { ...this.codenamesSpymasters } };
  }

  destroy() {
    this.clearTimer();
    WordPool.clearRoomTracking(this.code);
  }
}
