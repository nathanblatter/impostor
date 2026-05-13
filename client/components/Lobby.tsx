import React, { useState } from "react";
import { Copy, LogOut, Users, Settings, Check, Cpu, Grid, HelpCircle, Award, X, UserX, Shield } from "react-feather";
import { QRCodeSVG } from "qrcode.react";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState, GameMode } from "../../shared/types.js";
import { PLAYER_COLORS } from "../../shared/constants.js";

interface Props {
  state: GameState;
  playerId: string;
  send: (msg: ClientMessage) => void;
  clearSession: () => void;
}

export default function Lobby({ state, playerId, send, clearSession }: Props) {
  const me = state.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const canStart = state.players.filter((p) => !p.isSpectator).length >= 4;
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [rulesMode, setRulesMode] = useState<GameMode | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const joinUrl = `${window.location.origin}/?join=${state.roomCode}`;

  const copyCode = () => {
    navigator.clipboard.writeText(state.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const roundMin = Math.round(state.settings.roundDurationSec / 60);

  return (
    <div className="flex flex-col gap-8 pt-8 animate-fade-in">
      {/* Room Code */}
      <div className="text-center">
        <p className="text-sm text-gray-500 tracking-widest uppercase font-semibold mb-3">Room Code</p>
        <button
          onClick={copyCode}
          className="group flex items-center justify-center gap-3 mx-auto cursor-pointer"
        >
          <span className="text-5xl font-extrabold tracking-[0.3em] text-indigo-600">
            {state.roomCode}
          </span>
          {copied
            ? <Check size={20} className="text-emerald-500 mt-1" />
            : <Copy size={20} className="text-gray-400 group-hover:text-indigo-500 transition-colors mt-1" />
          }
        </button>
        <p className="text-sm text-gray-400 mt-2">{copied ? "Copied!" : "Tap to copy"}</p>

        <button
          onClick={() => setShowQr((v) => !v)}
          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200
                     text-sm font-semibold text-gray-500 hover:border-indigo-300 hover:text-indigo-600
                     transition-colors cursor-pointer"
        >
          <Grid size={15} />
          {showQr ? "Hide QR" : "Show QR"}
        </button>

        {showQr && (
          <div className="mt-4 flex flex-col items-center gap-3 animate-pop-in">
            <div className="bg-white p-4 rounded-2xl border-2 border-gray-100 shadow-sm inline-block">
              <QRCodeSVG value={joinUrl} size={180} level="M" />
            </div>
            <p className="text-xs text-gray-400 tracking-wide">Scan to join this room</p>
          </div>
        )}
      </div>

      {/* Mode Toggle */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 animate-slide-up stagger-1">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={16} className="text-gray-400" />
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase">Game Mode</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["IMPOSTOR", "SPYFALL", "ODD_ONE_OUT", "HOT_TAKE", "MAFIA", "FINGER_POINT", "TOUCHY_SUBJECTS", "TRIGGER"] as const).map((mode) => {
            const labels: Record<string, string> = {
              IMPOSTOR: "IMPOSTOR",
              SPYFALL: "SPYFALL",
              ODD_ONE_OUT: "ODD ONE OUT",
              HOT_TAKE: "HOT TAKE",
              MAFIA: "MAFIA",
              FINGER_POINT: "FAKIN' IT",
              TOUCHY_SUBJECTS: "TOUCHY",
              TRIGGER: "TRIGGER",
            };
            return (
              <button
                key={mode}
                onClick={() => isHost && send({ type: "UPDATE_SETTINGS", settings: { mode } })}
                className={`py-3 rounded-xl font-bold tracking-wider transition-all text-sm
                  ${state.settings.mode === mode
                    ? "bg-indigo-600 text-white shadow-md"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  } ${!isHost ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              >
                {labels[mode]}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setRulesMode(state.settings.mode)}
          className="mt-3 flex items-center gap-1.5 text-xs text-indigo-500 font-semibold tracking-wider
                     hover:text-indigo-700 transition-colors cursor-pointer"
        >
          <HelpCircle size={13} />
          HOW TO PLAY {state.settings.mode.replace(/_/g, " ")}
        </button>

        {isHost && (
          <div className="mt-5 flex flex-col gap-4">
            {state.settings.mode !== "ODD_ONE_OUT" && state.settings.mode !== "TOUCHY_SUBJECTS" && state.settings.mode !== "TRIGGER" && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 tracking-wide">Round time</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const v = Math.max(1, roundMin - 1);
                      send({ type: "UPDATE_SETTINGS", settings: { roundDurationSec: v * 60 } });
                    }}
                    className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-lg font-bold text-gray-600
                               hover:bg-gray-200 transition-colors cursor-pointer text-lg"
                  >
                    -
                  </button>
                  <span className="w-16 text-center font-bold text-base text-gray-800">{roundMin} min</span>
                  <button
                    onClick={() => {
                      const v = Math.min(10, roundMin + 1);
                      send({ type: "UPDATE_SETTINGS", settings: { roundDurationSec: v * 60 } });
                    }}
                    className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-lg font-bold text-gray-600
                               hover:bg-gray-200 transition-colors cursor-pointer text-lg"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
            {state.settings.mode !== "TOUCHY_SUBJECTS" && state.settings.mode !== "TRIGGER" && (
            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-sm text-gray-500 tracking-wide">AI Hard Mode</span>
                  <span className="text-xs text-gray-400 mt-0.5">
                    {state.settings.mode === "IMPOSTOR"
                      ? "One player gets AI-chosen words"
                      : state.settings.mode === "ODD_ONE_OUT"
                      ? "One player gets AI-chosen answer"
                      : state.settings.mode === "HOT_TAKE"
                      ? "One player gets AI-chosen pick + arguments"
                      : "One player gets secret directives"}
                  </span>
                </div>
                <button
                  onClick={() => send({ type: "UPDATE_SETTINGS", settings: { aiMode: !state.settings.aiMode } })}
                  className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 cursor-pointer
                    ${state.settings.aiMode ? "bg-indigo-600" : "bg-gray-300"}`}
                >
                  <div
                    className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform flex items-center justify-center
                      ${state.settings.aiMode ? "translate-x-5.5" : "translate-x-0.5"}`}
                  >
                    {state.settings.aiMode && <Cpu size={12} className="text-indigo-600" />}
                  </div>
                </button>
              </div>
            )}
            {(state.settings.mode === "IMPOSTOR" || state.settings.mode === "TOUCHY_SUBJECTS") && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 tracking-wide">
                  {state.settings.mode === "TOUCHY_SUBJECTS" ? "Questions" : "Descriptor rounds"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const min = state.settings.mode === "TOUCHY_SUBJECTS" ? 3 : 1;
                      const v = Math.max(min, state.settings.descriptorRounds - 1);
                      send({ type: "UPDATE_SETTINGS", settings: { descriptorRounds: v } });
                    }}
                    className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-lg font-bold text-gray-600
                               hover:bg-gray-200 transition-colors cursor-pointer text-lg"
                  >
                    -
                  </button>
                  <span className="w-16 text-center font-bold text-base text-gray-800">
                    {state.settings.descriptorRounds}
                  </span>
                  <button
                    onClick={() => {
                      const max = state.settings.mode === "TOUCHY_SUBJECTS" ? 12 : 5;
                      const v = Math.min(max, state.settings.descriptorRounds + 1);
                      send({ type: "UPDATE_SETTINGS", settings: { descriptorRounds: v } });
                    }}
                    className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-lg font-bold text-gray-600
                               hover:bg-gray-200 transition-colors cursor-pointer text-lg"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
            {state.settings.mode === "TRIGGER" && (
              <>
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-500 tracking-wide">Assign Mode</span>
                    <span className="text-xs text-gray-400 mt-0.5">
                      {state.settings.triggerAssignMode === "AI" ? "AI generates all triggers" : "Players write each other's triggers"}
                    </span>
                  </div>
                  <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                    {(["AI", "PLAYERS"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => send({ type: "UPDATE_SETTINGS", settings: { triggerAssignMode: m } })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-all cursor-pointer
                          ${state.settings.triggerAssignMode === m ? "bg-indigo-600 text-white shadow" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-500 tracking-wide">5-min Timer</span>
                    <span className="text-xs text-gray-400 mt-0.5">Auto-move to guessing after 5 minutes</span>
                  </div>
                  <button
                    onClick={() => send({ type: "UPDATE_SETTINGS", settings: { triggerTimerEnabled: !state.settings.triggerTimerEnabled } })}
                    className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 cursor-pointer
                      ${state.settings.triggerTimerEnabled ? "bg-indigo-600" : "bg-gray-300"}`}
                  >
                    <div
                      className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform
                        ${state.settings.triggerTimerEnabled ? "translate-x-5.5" : "translate-x-0.5"}`}
                    />
                  </button>
                </div>
              </>
            )}

            {/* Bonus Stars toggle — always visible to host */}
            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
              <div className="flex flex-col">
                <span className="text-sm text-gray-500 tracking-wide">Bonus Stars</span>
                <span className="text-xs text-gray-400 mt-0.5">Mario Party awards after returning to lobby</span>
              </div>
              <button
                onClick={() => send({ type: "UPDATE_SETTINGS", settings: { bonusStarsEnabled: !state.settings.bonusStarsEnabled } })}
                className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 cursor-pointer
                  ${state.settings.bonusStarsEnabled ? "bg-indigo-600" : "bg-gray-300"}`}
              >
                <div
                  className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform
                    ${state.settings.bonusStarsEnabled ? "translate-x-5.5" : "translate-x-0.5"}`}
                />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Players */}
      <div className="animate-slide-up stagger-2">
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-gray-400" />
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase">
            Players ({state.players.filter((p) => !p.isSpectator).length})
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {state.players.filter((p) => !p.isSpectator).map((p, i) => {
            const isMe = p.id === playerId;
            const takenColors = new Set(state.players.map((x) => x.color));
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200
                           ${!p.isConnected ? "opacity-40" : ""} animate-slide-up`}
                style={{ animationDelay: `${0.05 * i}s` }}
              >
                {/* Color dot — tap yours to open picker */}
                {isMe ? (
                  <button
                    onClick={() => setColorPickerOpen(true)}
                    className="w-5 h-5 rounded-full flex-shrink-0 cursor-pointer ring-2 ring-white ring-offset-1 active:scale-90 transition-transform"
                    style={{ backgroundColor: p.color }}
                    title="Change your color"
                  />
                ) : (
                  <span
                    className="w-5 h-5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                )}

                <span className="flex-1 font-semibold text-base text-gray-800 tracking-wide">
                  {p.name}
                  {isMe && <span className="ml-2 text-xs text-indigo-500 font-bold">YOU</span>}
                </span>

                {p.isHost && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-bold tracking-wider">
                    HOST
                  </span>
                )}

                {/* Host controls on other players */}
                {isHost && !isMe && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => send({ type: "TRANSFER_HOST", targetId: p.id })}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50
                                 transition-colors cursor-pointer"
                      title="Make host"
                    >
                      <Shield size={14} />
                    </button>
                    <button
                      onClick={() => send({ type: "KICK_PLAYER", targetId: p.id })}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50
                                 transition-colors cursor-pointer"
                      title="Kick player"
                    >
                      <UserX size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {state.players.some((p) => p.isSpectator) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="text-xs text-gray-400 font-semibold tracking-wider uppercase mr-1">Watching:</span>
            {state.players.filter((p) => p.isSpectator).map((p) => (
              <span key={p.id} className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full font-semibold">
                {p.name}{p.id === playerId ? " (you)" : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Session Scoreboard */}
      {Object.values(state.sessionScores).some((s) => s > 0) && (
        <div className="animate-slide-up stagger-2">
          <div className="flex items-center gap-2 mb-3">
            <Award size={16} className="text-amber-500" />
            <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase">Session Scores</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {state.players
              .filter((p) => !p.isSpectator)
              .map((p) => ({ ...p, score: state.sessionScores[p.id] || 0 }))
              .sort((a, b) => b.score - a.score)
              .map((p) => (
                <div key={p.id} className={`flex justify-between items-center px-4 py-2.5 rounded-xl border
                  ${p.id === playerId ? "bg-indigo-50 border-indigo-200" : "bg-white border-gray-200"}`}>
                  <span className="text-sm font-semibold text-gray-700">
                    {p.name}
                    {p.id === playerId && <span className="ml-2 text-xs text-indigo-500 font-bold">YOU</span>}
                  </span>
                  <span className="font-extrabold text-base text-indigo-600">{p.score}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-4 animate-slide-up stagger-3 pb-6">
        {state.isSpectator ? (
          <p className="text-center text-base text-gray-400 italic tracking-wide py-6">
            Watching — game hasn't started yet
          </p>
        ) : isHost ? (
          <button
            onClick={() => send({ type: "START_GAME" })}
            disabled={!canStart}
            className={`w-full py-4.5 rounded-2xl font-bold text-lg tracking-wider transition-all
              ${canStart
                ? "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] shadow-lg shadow-indigo-200 cursor-pointer"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
          >
            {canStart ? "START GAME" : `NEED ${4 - state.players.filter((p) => !p.isSpectator).length} MORE`}
          </button>
        ) : (
          <p className="text-center text-base text-gray-400 italic tracking-wide py-6">
            Waiting for host to start...
          </p>
        )}

        <button
          onClick={() => {
            send({ type: "LEAVE_ROOM" });
            clearSession();
          }}
          className="flex items-center justify-center gap-2 py-3 text-sm text-red-500 font-semibold tracking-wider
                     hover:text-red-600 transition-colors cursor-pointer"
        >
          <LogOut size={15} />
          LEAVE ROOM
        </button>
      </div>

      {/* Color Picker Sheet */}
      {colorPickerOpen && (() => {
        const myColor = state.players.find((p) => p.id === playerId)?.color ?? "";
        const takenColors = new Set(state.players.filter((p) => p.id !== playerId).map((p) => p.color));
        return (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4"
            onClick={() => setColorPickerOpen(false)}
          >
            <div
              className="bg-white rounded-2xl w-full max-w-md p-6 animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-extrabold tracking-wider text-gray-800">Pick your color</h2>
                <button onClick={() => setColorPickerOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                  <X size={20} />
                </button>
              </div>
              <div className="grid grid-cols-5 gap-4">
                {PLAYER_COLORS.map((c) => {
                  const isTaken = takenColors.has(c);
                  const isSelected = c === myColor;
                  return (
                    <button
                      key={c}
                      onClick={() => {
                        if (isTaken) return;
                        send({ type: "SET_COLOR", color: c });
                        setColorPickerOpen(false);
                      }}
                      disabled={isTaken}
                      className={`w-full aspect-square rounded-2xl transition-all active:scale-90
                        ${isTaken ? "opacity-25 cursor-not-allowed" : "cursor-pointer active:scale-95"}
                        ${isSelected ? "ring-4 ring-offset-2 ring-gray-800 scale-110" : ""}`}
                      style={{ backgroundColor: c }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Rules Modal */}
      {rulesMode && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4"
          onClick={() => setRulesMode(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-extrabold tracking-wider text-gray-800">
                {rulesMode.replace(/_/g, " ")}
              </h2>
              <button onClick={() => setRulesMode(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <RulesContent mode={rulesMode} />
          </div>
        </div>
      )}
    </div>
  );
}

const RULES: Record<GameMode, { scoring: string; how: string[] }> = {
  IMPOSTOR: {
    scoring: "Town catches impostor: everyone except impostor +1 pt. Impostor survives: impostor +2 pts.",
    how: [
      "Everyone knows a secret word — except the Impostor(s), who only know the category.",
      "Players take turns giving one-word descriptors for the secret word.",
      "Impostors must fake it based on what they hear.",
      "After descriptor rounds, vote out who you think is the Impostor.",
      "Impostors win by surviving the vote.",
    ],
  },
  SPYFALL: {
    scoring: "Town votes out spy: all non-spy players +1 pt. Spy correctly guesses location: spy +2 pts.",
    how: [
      "Everyone knows a secret location — except the Spy.",
      "Players ask each other questions about the location.",
      "The Spy must bluff without knowing where they are.",
      "Vote out who you think is the Spy before time runs out.",
      "The Spy can also win by correctly guessing the location.",
    ],
  },
  ODD_ONE_OUT: {
    scoring: "Town identifies odd player: non-odd players +1 pt. Odd player survives: +2 pts.",
    how: [
      "Everyone answers a question — but one player secretly got a different question.",
      "Share your answers out loud and discuss.",
      "Try to identify who gave an answer that doesn't quite fit.",
      "Vote out who you think had the odd question.",
      "The odd player wins by not getting caught.",
    ],
  },
  HOT_TAKE: {
    scoring: "Town catches faker: non-faker players +1 pt. Faker survives: faker +2 pts.",
    how: [
      "Everyone picks A or B on a hot-take question — but one Faker sees a different question.",
      "Share your pick and argue for it convincingly.",
      "The Faker must fake their opinion based on the options they see.",
      "Discuss, then the host calls a vote to eliminate the Faker.",
      "The Faker wins by not getting caught.",
    ],
  },
  MAFIA: {
    scoring: "Town eliminates all Mafia: all non-Mafia +1 pt. Mafia outnumbers town: Mafia +2 pts each.",
    how: [
      "A secret Mafia faction is hiding among the town.",
      "Each night, Mafia votes to secretly eliminate a town player.",
      "Each day, everyone discusses and votes to eliminate a suspect.",
      "Special roles (Detective, Doctor) have extra powers.",
      "Town wins by eliminating all Mafia; Mafia wins when they equal or outnumber town.",
    ],
  },
  FINGER_POINT: {
    scoring: "Town catches faker: all non-faker players +1 pt. Faker survives all rounds: faker +2 pts.",
    how: [
      "Everyone gets the same prompt and responds with a physical action — except the Faker.",
      "The Faker doesn't see the prompt and must make something up.",
      "After each round, everyone simultaneously points at who they think is faking.",
      "Every few rounds, the group votes to eliminate a suspect.",
      "The Faker wins by surviving all rounds without being caught.",
    ],
  },
  TOUCHY_SUBJECTS: {
    scoring: "+1 pt for each correct majority guess. No losers — pure skill.",
    how: [
      "A question is read aloud (e.g. 'Who would survive a zombie apocalypse?').",
      "Everyone votes for the player they think fits best.",
      "Then everyone guesses who the majority voted for.",
      "Earn a point for each correct guess.",
      "Highest score after all rounds wins.",
    ],
  },
  TRIGGER: {
    scoring: "Guesser: +1 pt per correct trigger identified. Non-guessers: +1 pt if their trigger wasn't found.",
    how: [
      "One player is the Guesser — they leave while others set up.",
      "Each player writes a secret trigger rule for the Guesser: 'When they say X, I do Y.'",
      "The Guesser rejoins and acts naturally, looking for patterns in reactions.",
      "The Guesser gets 3 guesses to identify each player's trigger.",
      "Score more by finding triggers (Guesser) or stumping the Guesser (everyone else).",
    ],
  },
};

function RulesContent({ mode }: { mode: GameMode }) {
  const rules = RULES[mode];
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
        <p className="text-xs font-bold text-indigo-600 tracking-wider uppercase mb-1">Scoring</p>
        <p className="text-sm text-gray-700 leading-relaxed">{rules.scoring}</p>
      </div>
      <div>
        <p className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">How to Play</p>
        <ol className="flex flex-col gap-2">
          {rules.how.map((step, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center text-xs font-bold">
                {i + 1}
              </span>
              <span className="text-sm text-gray-600 leading-snug">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
