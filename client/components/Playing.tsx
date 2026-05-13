import React, { useCallback, useEffect, useRef, useState } from "react";
import { Clock, AlertTriangle, Eye, EyeOff, Send, Briefcase, Cpu } from "react-feather";
import MafiaPlaying from "./MafiaPlaying.js";
import FingerPointPlaying from "./FingerPointPlaying.js";
import TouchySubjectsPlaying from "./TouchySubjectsPlaying.js";
import TriggerPlaying from "./TriggerPlaying.js";
import { useTimer } from "../useTimer.js";
import { playTick, playRoleReveal } from "../useSound.js";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState, DescriptorEntry } from "../../shared/types.js";

interface Props {
  state: GameState;
  playerId: string;
  send: (msg: ClientMessage) => void;
}

function usePeek(durationMs = 3000) {
  const [peeking, setPeeking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const peek = useCallback(() => {
    setPeeking(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPeeking(false), durationMs);
  }, [durationMs]);

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    setPeeking(false);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { peeking, peek, dismiss };
}

function PeekOverlay({ onDismiss, children }: { onDismiss: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm p-6"
      onClick={onDismiss}
    >
      <div className="w-full max-w-sm animate-pop-in" onClick={(e) => e.stopPropagation()}>
        {children}
        <p className="text-center text-white/50 text-xs mt-4 tracking-wider">Tap anywhere to dismiss</p>
      </div>
    </div>
  );
}

function PeekButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 mx-auto text-xs font-semibold text-gray-400
                 hover:text-indigo-500 tracking-wider transition-colors cursor-pointer"
    >
      <Eye size={13} />
      VIEW MY ROLE
    </button>
  );
}

function RoleRevealCountdown({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(3);
  const doneRef = useRef(false);

  useEffect(() => {
    playRoleReveal();
    const id = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(id);
          if (!doneRef.current) {
            doneRef.current = true;
            // Delay so the "1" is visible briefly
            setTimeout(onDone, 300);
          }
          return 0;
        }
        return c - 1;
      });
    }, 700);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <p className="text-white/60 text-sm font-semibold tracking-[0.3em] uppercase">Your role</p>
        <div
          key={count}
          className="text-8xl font-black text-white animate-pop-in"
          style={{ textShadow: "0 0 40px rgba(255,255,255,0.4)" }}
        >
          {count > 0 ? count : "!"}
        </div>
      </div>
    </div>
  );
}

export default function Playing({ state, playerId, send }: Props) {
  const round = state.round!;
  const [revealed, setRevealed] = useState(false);
  const revealedForRound = useRef<number>(-1);

  // Show countdown at the start of each new round (not for MAFIA/sub-games with their own flow)
  const showCountdown =
    !revealed &&
    round.roundNumber !== revealedForRound.current &&
    state.mode !== "MAFIA" &&
    state.mode !== "FINGER_POINT" &&
    state.mode !== "TOUCHY_SUBJECTS" &&
    state.mode !== "TRIGGER" &&
    !state.isSpectator;

  function handleRevealDone() {
    revealedForRound.current = round.roundNumber;
    setRevealed(true);
  }

  // Reset when round number changes
  useEffect(() => {
    setRevealed(false);
  }, [round.roundNumber]);

  if (showCountdown) {
    return <RoleRevealCountdown onDone={handleRevealDone} />;
  }

  switch (state.mode) {
    case "SPYFALL":
      return <SpyfallPlaying state={state} round={round} playerId={playerId} send={send} />;
    case "ODD_ONE_OUT":
      return <OddOneOutPlaying state={state} round={round} playerId={playerId} send={send} />;
    case "HOT_TAKE":
      return <HotTakePlaying state={state} round={round} playerId={playerId} send={send} />;
    case "MAFIA":
      return <MafiaPlaying state={state} playerId={playerId} send={send} />;
    case "FINGER_POINT":
      return <FingerPointPlaying state={state} playerId={playerId} send={send} />;
    case "TOUCHY_SUBJECTS":
      return <TouchySubjectsPlaying state={state} playerId={playerId} send={send} />;
    case "TRIGGER":
      return <TriggerPlaying state={state} playerId={playerId} send={send} />;
    default:
      return <ImpostorPlaying state={state} round={round} playerId={playerId} send={send} />;
  }
}

function SpyfallPlaying({ state, round, playerId, send }: Props & { round: any }) {
  const { secondsLeft, display } = useTimer(round.timerEndsAt, playTick);
  const [showLocations, setShowLocations] = useState(false);
  const isHost = state.players.find((p) => p.id === playerId)?.isHost ?? false;
  const { peeking, peek, dismiss } = usePeek();

  return (
    <div className="flex flex-col gap-6 pt-5 animate-fade-in">
      <Timer secondsLeft={secondsLeft} display={display} paused={state.timerPaused} isHost={isHost} onTogglePause={() => send({ type: "TOGGLE_PAUSE" })} />

      {/* Role Card */}
      <div
        className={`rounded-2xl border-2 p-7 text-center animate-pop-in ${
          round.isSpy
            ? "bg-red-50 border-red-300"
            : "bg-emerald-50 border-emerald-300"
        }`}
      >
        {round.isSpy ? (
          <>
            <div className="flex items-center justify-center gap-2 mb-3">
              <EyeOff size={22} className="text-red-500" />
              <h2 className="text-xl font-extrabold text-red-600 tracking-wider">YOU ARE THE SPY</h2>
            </div>
            <p className="text-base text-red-500/80 tracking-wide">
              Figure out the location from the conversation
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Eye size={20} className="text-emerald-500" />
              <h2 className="text-sm font-bold text-emerald-600 tracking-wider uppercase">Location</h2>
            </div>
            <p className="text-3xl font-extrabold text-gray-800 tracking-wide mb-3">{round.location}</p>
            {round.role && (
              <div className="inline-flex items-center gap-2 bg-white/70 px-4 py-2 rounded-full">
                <Briefcase size={14} className="text-emerald-600" />
                <span className="text-sm font-bold text-emerald-700 tracking-wide">Your role: {round.role}</span>
              </div>
            )}
            <p className="text-sm text-emerald-500 mt-3 tracking-wider">Find the spy!</p>
          </>
        )}
      </div>

      {/* AI Directives (Spyfall) */}
      {round.isAiControlled && round.aiDirectives.length > 0 && !round.isSpy && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 animate-slide-up stagger-1">
          <div className="flex items-center gap-2 mb-3">
            <Cpu size={16} className="text-amber-600" />
            <span className="text-sm font-bold text-amber-600 tracking-wider">AI HARD MODE — YOUR DIRECTIVES</span>
          </div>
          <p className="text-xs text-amber-600/70 mb-3 tracking-wide">You must work ALL of these into the conversation naturally</p>
          <div className="flex flex-col gap-2">
            {round.aiDirectives.map((d: string, i: number) => (
              <div key={i} className="flex gap-3 items-start bg-white/60 rounded-xl px-4 py-3">
                <span className="flex-shrink-0 w-6 h-6 bg-amber-200 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </span>
                <span className="text-sm text-gray-700 font-medium leading-snug">{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {round.isAiControlled && round.aiDirectives.length === 0 && !round.isSpy && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center animate-fade-in">
          <div className="flex items-center justify-center gap-2 text-amber-600">
            <Cpu size={16} className="animate-pulse" />
            <span className="text-sm font-semibold tracking-wider">AI is generating your directives...</span>
          </div>
        </div>
      )}

      {/* Spy location guess */}
      {round.isSpy && !state.isSpectator && (
        <div className="animate-slide-up stagger-1">
          <button
            onClick={() => setShowLocations(!showLocations)}
            className="w-full flex items-center justify-between px-5 py-4 bg-white rounded-2xl border border-gray-200
                       text-base font-semibold tracking-wider text-gray-600 hover:border-red-300 transition-colors cursor-pointer"
          >
            <span>{showLocations ? "HIDE LOCATIONS" : "GUESS LOCATION"}</span>
            <AlertTriangle size={16} className="text-red-400" />
          </button>
          {showLocations && (
            <div className="grid grid-cols-2 gap-2 mt-3 max-h-72 overflow-y-auto">
              {round.allLocations.map((loc: string) => (
                <button
                  key={loc}
                  onClick={() => {
                    if (confirm(`Guess "${loc}"?`)) {
                      send({ type: "SPY_GUESS", locationGuess: loc });
                    }
                  }}
                  className="px-3 py-3 bg-white border border-gray-200 rounded-xl text-sm font-semibold
                             text-gray-700 tracking-wide hover:border-red-400 hover:bg-red-50 transition-all cursor-pointer"
                >
                  {loc}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Players */}
      <div className="flex flex-col gap-2">
        {state.players.map((p) => (
          <div
            key={p.id}
            className={`px-5 py-3 bg-white rounded-xl border border-gray-200 text-base font-semibold
                       tracking-wide text-gray-700 ${!p.isConnected ? "opacity-40" : ""}`}
          >
            {p.name}
            {p.id === playerId && <span className="ml-2 text-xs text-indigo-500 font-bold">YOU</span>}
          </div>
        ))}
      </div>

      {/* Ready to Vote */}
      {state.isSpectator ? (
        <p className="text-center text-base text-gray-400 italic tracking-wide py-2">Watching...</p>
      ) : !(state.players.find((p) => p.id === playerId)?.hasVoted) ? (
        <button
          onClick={() => send({ type: "READY_TO_VOTE" })}
          className="w-full py-4 bg-amber-400 text-gray-900 font-bold text-base tracking-wider rounded-2xl
                     hover:bg-amber-500 active:scale-[0.98] transition-all shadow-md cursor-pointer"
        >
          READY TO VOTE
        </button>
      ) : (
        <p className="text-center text-base text-gray-400 italic tracking-wide py-2">
          Waiting for everyone to ready up...
        </p>
      )}

      {/* Ready status */}
      <div className="flex flex-wrap gap-2 justify-center">
        {state.players.map((p) => (
          <span key={p.id} className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wider
            ${p.hasVoted ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-500"}`}>
            {p.name}
          </span>
        ))}
      </div>

      {!state.isSpectator && <PeekButton onClick={peek} />}
      {peeking && (
        <PeekOverlay onDismiss={dismiss}>
          <div className={`rounded-2xl border-2 p-7 text-center ${round.isSpy ? "bg-red-50 border-red-300" : "bg-emerald-50 border-emerald-300"}`}>
            {round.isSpy ? (
              <>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <EyeOff size={20} className="text-red-500" />
                  <h2 className="text-xl font-extrabold text-red-600 tracking-wider">YOU ARE THE SPY</h2>
                </div>
                <p className="text-sm text-red-400 tracking-wide">Figure out the location</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-emerald-600 tracking-wider uppercase mb-2">Location</p>
                <p className="text-3xl font-extrabold text-gray-800">{round.location}</p>
                {round.role && <p className="text-sm font-semibold text-emerald-700 mt-3">Role: {round.role}</p>}
              </>
            )}
          </div>
        </PeekOverlay>
      )}
    </div>
  );
}

function ImpostorPlaying({ state, round, playerId, send }: Props & { round: any }) {
  const { secondsLeft, display } = useTimer(round.timerEndsAt, playTick);
  const [descriptor, setDescriptor] = useState("");
  const { peeking, peek, dismiss } = usePeek();
  const isMyTurn = round.currentTurnPlayerId === playerId;
  const currentPlayer = state.players.find((p) => p.id === round.currentTurnPlayerId);
  const me = state.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;

  const submitDescriptor = () => {
    const word = descriptor.trim();
    if (word && !word.includes(" ")) {
      send({ type: "SUBMIT_DESCRIPTOR", word });
      setDescriptor("");
    }
  };

  return (
    <div className="flex flex-col gap-6 pt-5 animate-fade-in">
      <Timer secondsLeft={secondsLeft} display={display} paused={state.timerPaused} isHost={isHost} onTogglePause={() => send({ type: "TOGGLE_PAUSE" })} />

      {/* Role Card */}
      <div
        className={`rounded-2xl border-2 p-7 text-center animate-pop-in ${
          round.isImpostor
            ? "bg-red-50 border-red-300"
            : "bg-emerald-50 border-emerald-300"
        }`}
      >
        {round.isImpostor ? (
          <>
            <h2 className="text-xl font-extrabold text-red-600 tracking-wider mb-2">
              YOU ARE THE IMPOSTOR
            </h2>
            <p className="text-base text-gray-600">
              Category: <span className="font-bold text-gray-800">{round.category}</span>
            </p>
            {round.fellowImpostorNames.length > 0 && (
              <p className="text-sm text-red-500 mt-3 tracking-wide font-semibold">
                Partner: {round.fellowImpostorNames.join(", ")}
              </p>
            )}
            <p className="text-sm text-red-400 mt-3 tracking-wider">Blend in! Don't get caught.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-emerald-600 font-bold tracking-wider uppercase mb-2">
              {round.category}
            </p>
            <p className="text-3xl font-extrabold text-gray-800 tracking-wide">{round.secretWord}</p>
            <p className="text-sm text-emerald-500 mt-3 tracking-wider">Find the impostor!</p>
          </>
        )}
        {round.isAiControlled && !round.isImpostor && (
          <div className="mt-4 pt-3 border-t border-dashed border-amber-300 flex items-center justify-center gap-2">
            <Cpu size={14} className="text-amber-600" />
            <span className="text-xs font-bold text-amber-600 tracking-wider">
              AI HARD MODE — You must submit the AI's word
            </span>
          </div>
        )}
      </div>

      {/* Descriptor Round */}
      <div className="animate-slide-up stagger-1">
        <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase mb-3 block">
          Round {round.currentDescriptorRound} — Descriptors
        </span>

        {/* History */}
        {round.descriptorHistory.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-4">
            {round.descriptorHistory.map((d: DescriptorEntry, i: number) => (
              <div
                key={`${d.playerId}-${d.round}`}
                className="flex justify-between items-center px-4 py-3 bg-white rounded-xl border border-gray-200"
              >
                <span className="text-sm text-gray-500 tracking-wide">{d.playerName}</span>
                <span className="font-bold text-base text-gray-800 tracking-wider">{d.word}</span>
              </div>
            ))}
          </div>
        )}

        {/* Input or waiting */}
        {state.isSpectator ? null : isMyTurn ? (
          round.isAiControlled && round.aiSuggestedWord ? (
            <div className="animate-pop-in">
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 text-center mb-3">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Cpu size={16} className="text-amber-600" />
                  <span className="text-xs font-bold text-amber-600 tracking-wider">AI CHOSE YOUR WORD</span>
                </div>
                <p className="text-2xl font-extrabold text-gray-800 tracking-wider">{round.aiSuggestedWord}</p>
                <p className="text-xs text-amber-600/70 mt-2 tracking-wide">You must submit this word and justify it verbally</p>
              </div>
              <button
                onClick={() => send({ type: "SUBMIT_DESCRIPTOR", word: round.aiSuggestedWord! })}
                className="w-full py-3.5 bg-amber-500 text-white font-bold text-base tracking-wider rounded-xl
                           hover:bg-amber-600 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Send size={16} />
                SUBMIT AI WORD
              </button>
            </div>
          ) : round.isAiControlled && !round.aiSuggestedWord ? (
            <div className="text-center py-5 animate-fade-in">
              <div className="flex items-center justify-center gap-2 text-amber-600">
                <Cpu size={16} className="animate-pulse" />
                <span className="text-sm font-semibold tracking-wider">AI is thinking...</span>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 animate-pop-in">
              <input
                type="text"
                value={descriptor}
                onChange={(e) => setDescriptor(e.target.value.replace(/\s/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && submitDescriptor()}
                placeholder="One word..."
                maxLength={30}
                autoFocus
                className="flex-1 px-5 py-3.5 bg-white border-2 border-indigo-300 rounded-xl font-bold text-base tracking-wider
                           text-gray-800 placeholder:text-gray-400 placeholder:font-medium outline-none
                           focus:border-indigo-500 transition-colors"
              />
              <button
                onClick={submitDescriptor}
                className="px-5 py-3.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700
                           active:scale-95 transition-all cursor-pointer"
              >
                <Send size={20} />
              </button>
            </div>
          )
        ) : (
          <div className="text-center py-5 text-base text-gray-400 italic tracking-wide">
            {currentPlayer ? `Waiting for ${currentPlayer.name}...` : "Waiting..."}
          </div>
        )}
      </div>

      {/* Players */}
      <div className="flex flex-col gap-2">
        {state.players.map((p) => (
          <div
            key={p.id}
            className={`flex items-center justify-between px-5 py-3 rounded-xl border transition-all
              ${p.id === round.currentTurnPlayerId
                ? "bg-indigo-50 border-indigo-300"
                : "bg-white border-gray-200"
              } ${!p.isConnected ? "opacity-40" : ""}`}
          >
            <span className="text-base font-semibold tracking-wide text-gray-700">
              {p.name}
              {p.id === playerId && <span className="ml-2 text-xs text-indigo-500 font-bold">YOU</span>}
            </span>
            {p.id === round.currentTurnPlayerId && (
              <span className="text-xs text-indigo-500 font-bold tracking-wider animate-pulse">TURN</span>
            )}
          </div>
        ))}
      </div>

      {/* Call Vote (host only) */}
      {isHost && !state.isSpectator && (
        <button
          onClick={() => send({ type: "CALL_VOTE" })}
          className="w-full py-4 bg-amber-400 text-gray-900 font-bold text-base tracking-wider rounded-2xl
                     hover:bg-amber-500 active:scale-[0.98] transition-all shadow-md cursor-pointer"
        >
          CALL VOTE
        </button>
      )}

      {!state.isSpectator && <PeekButton onClick={peek} />}
      {peeking && (
        <PeekOverlay onDismiss={dismiss}>
          <div className={`rounded-2xl border-2 p-7 text-center ${round.isImpostor ? "bg-red-50 border-red-300" : "bg-emerald-50 border-emerald-300"}`}>
            {round.isImpostor ? (
              <>
                <h2 className="text-xl font-extrabold text-red-600 tracking-wider mb-2">YOU ARE THE IMPOSTOR</h2>
                <p className="text-sm text-gray-600">Category: <span className="font-bold text-gray-800">{round.category}</span></p>
                {round.fellowImpostorNames.length > 0 && (
                  <p className="text-sm text-red-500 mt-2 font-semibold">Partner: {round.fellowImpostorNames.join(", ")}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-emerald-600 tracking-wider uppercase mb-1">{round.category}</p>
                <p className="text-3xl font-extrabold text-gray-800">{round.secretWord}</p>
              </>
            )}
          </div>
        </PeekOverlay>
      )}
    </div>
  );
}

function OddOneOutPlaying({ state, round, playerId, send }: Props & { round: any }) {
  const { secondsLeft, display } = useTimer(round.timerEndsAt, playTick);
  const [answer, setAnswer] = useState("");
  const hasAnswered = round.oddHasAnswered;
  const discussing = round.oddDiscussing;
  const me = state.players.find((p: any) => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const isReady = me?.hasVoted ?? false;
  const { peeking, peek, dismiss } = usePeek();

  return (
    <div className="flex flex-col gap-6 pt-5 animate-fade-in">
      <Timer secondsLeft={secondsLeft} display={display} paused={state.timerPaused} isHost={isHost} onTogglePause={() => send({ type: "TOGGLE_PAUSE" })} />

      {/* Prompt Card */}
      <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 p-7 text-center animate-pop-in">
        <h2 className="text-sm font-bold text-violet-600 tracking-wider uppercase mb-3">YOUR QUESTION</h2>
        <p className="text-xl font-extrabold text-gray-800 leading-snug">{round.oddPrompt}</p>
      </div>

      {/* Phase 1: Answer Input */}
      {!discussing && (
        <>
          {state.isSpectator ? (
            <p className="text-center text-base text-gray-400 italic tracking-wide py-4">Watching...</p>
          ) : !hasAnswered ? (
            round.isAiControlled && round.aiSuggestedWord ? (
              <div className="animate-pop-in">
                <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 text-center mb-3">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Cpu size={16} className="text-amber-600" />
                    <span className="text-xs font-bold text-amber-600 tracking-wider">AI CHOSE YOUR ANSWER</span>
                  </div>
                  <p className="text-lg font-extrabold text-gray-800 leading-snug">{round.aiSuggestedWord}</p>
                  <p className="text-xs text-amber-600/70 mt-2 tracking-wide">You must submit this and defend it verbally</p>
                </div>
                <button
                  onClick={() => send({ type: "SUBMIT_ANSWER", answer: round.aiSuggestedWord! })}
                  className="w-full py-3.5 bg-amber-500 text-white font-bold text-base tracking-wider rounded-xl
                             hover:bg-amber-600 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Send size={16} />
                  SUBMIT AI ANSWER
                </button>
              </div>
            ) : round.isAiControlled && !round.aiSuggestedWord ? (
              <div className="text-center py-5 animate-fade-in">
                <div className="flex items-center justify-center gap-2 text-amber-600">
                  <Cpu size={16} className="animate-pulse" />
                  <span className="text-sm font-semibold tracking-wider">AI is writing your answer...</span>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 animate-slide-up stagger-1">
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && answer.trim() && send({ type: "SUBMIT_ANSWER", answer: answer.trim() })}
                  placeholder="Type your answer..."
                  maxLength={100}
                  autoFocus
                  className="flex-1 px-5 py-3.5 bg-white border-2 border-violet-300 rounded-xl font-bold text-base tracking-wide
                             text-gray-800 placeholder:text-gray-400 placeholder:font-medium outline-none
                             focus:border-violet-500 transition-colors"
                />
                <button
                  onClick={() => answer.trim() && send({ type: "SUBMIT_ANSWER", answer: answer.trim() })}
                  className="px-5 py-3.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700
                             active:scale-95 transition-all cursor-pointer"
                >
                  <Send size={20} />
                </button>
              </div>
            )
          ) : (
            <p className="text-center text-base text-gray-400 italic tracking-wide py-4">
              Waiting for others to answer...
            </p>
          )}

          {/* Submission status */}
          <div className="flex flex-wrap gap-2 justify-center">
            {state.players.map((p: any) => (
              <span key={p.id} className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wider
                ${p.hasVoted ? "bg-violet-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                {p.name}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Phase 2: Discussion */}
      {discussing && (
        <>
          <div className="animate-slide-up stagger-1">
            <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase mb-3 block">
              All Answers — Discuss!
            </span>
            <div className="flex flex-col gap-2">
              {round.oddAnswers?.map((a: any) => (
                <div key={a.playerId} className="flex justify-between items-center px-5 py-3.5 bg-white rounded-xl border border-gray-200">
                  <span className="text-sm text-gray-500 tracking-wide">{a.playerName}</span>
                  <span className="font-bold text-base text-gray-800">{a.answer}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-sm text-gray-500 tracking-wide">
            Who had the different question? Discuss, then ready up to vote.
          </p>

          {/* Ready to Vote button */}
          {state.isSpectator ? (
            <p className="text-center text-base text-gray-400 italic tracking-wide">Watching...</p>
          ) : !isReady ? (
            <button
              onClick={() => send({ type: "READY_TO_VOTE" })}
              className="w-full py-4 bg-violet-600 text-white font-bold text-base tracking-wider rounded-2xl
                         hover:bg-violet-700 active:scale-[0.98] transition-all shadow-lg shadow-violet-200 cursor-pointer"
            >
              READY TO VOTE
            </button>
          ) : (
            <p className="text-center text-base text-gray-400 italic tracking-wide">
              Waiting for others to ready up...
            </p>
          )}

          {/* Ready status */}
          <div className="flex flex-wrap gap-2 justify-center">
            {state.players.map((p: any) => (
              <span key={p.id} className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wider
                ${p.hasVoted ? "bg-violet-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                {p.name}
              </span>
            ))}
          </div>
        </>
      )}

      {!state.isSpectator && <PeekButton onClick={peek} />}
      {peeking && (
        <PeekOverlay onDismiss={dismiss}>
          <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 p-7 text-center">
            <p className="text-sm font-bold text-violet-600 tracking-wider uppercase mb-3">YOUR PROMPT</p>
            <p className="text-xl font-extrabold text-gray-800 leading-snug">{round.oddPrompt}</p>
          </div>
        </PeekOverlay>
      )}
    </div>
  );
}

function HotTakePlaying({ state, round, playerId, send }: Props & { round: any }) {
  const { secondsLeft, display } = useTimer(round.timerEndsAt, playTick);
  const hasPicked = round.hotTakeHasPicked;
  const me = state.players.find((p: any) => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const { peeking, peek, dismiss } = usePeek();

  return (
    <div className="flex flex-col gap-6 pt-5 animate-fade-in">
      <Timer secondsLeft={secondsLeft} display={display} paused={state.timerPaused} isHost={isHost} onTogglePause={() => send({ type: "TOGGLE_PAUSE" })} />

      {/* Question Card */}
      <div className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-7 text-center animate-pop-in">
        <h2 className="text-sm font-bold text-orange-600 tracking-wider uppercase mb-3">HOT TAKE</h2>
        <p className="text-xl font-extrabold text-gray-800 leading-snug">{round.hotTakeQuestion}</p>
        {round.hotTakeIsFaker && (
          <div className="mt-4 pt-3 border-t border-dashed border-orange-300">
            <span className="text-sm font-bold text-red-600 tracking-wider">
              YOU ARE THE FAKER — You see a different question! Blend in.
            </span>
          </div>
        )}
      </div>

      {/* Pick Buttons */}
      {!round.hotTakeDiscussing && !hasPicked && !state.isSpectator && (
        round.isAiControlled && round.aiSuggestedWord ? (
          <div className="animate-pop-in">
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 text-center mb-3">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Cpu size={16} className="text-amber-600" />
                <span className="text-xs font-bold text-amber-600 tracking-wider">AI CHOSE YOUR PICK</span>
              </div>
              <p className="text-2xl font-extrabold text-gray-800 tracking-wider">
                {round.hotTakeOptions?.[round.aiSuggestedWord.charCodeAt(0) - 65] ?? round.aiSuggestedWord}
              </p>
              <p className="text-xs text-amber-600/70 mt-2 tracking-wide">You must pick this and defend it with the AI's arguments</p>
            </div>
            <button
              onClick={() => send({ type: "SUBMIT_PICK", pick: round.aiSuggestedWord! })}
              className="w-full py-3.5 bg-amber-500 text-white font-bold text-base tracking-wider rounded-xl
                         hover:bg-amber-600 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Send size={16} />
              SUBMIT AI PICK
            </button>
          </div>
        ) : round.isAiControlled && !round.aiSuggestedWord ? (
          <div className="text-center py-5 animate-fade-in">
            <div className="flex items-center justify-center gap-2 text-amber-600">
              <Cpu size={16} className="animate-pulse" />
              <span className="text-sm font-semibold tracking-wider">AI is choosing for you...</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 animate-slide-up stagger-1">
            {(round.hotTakeOptions ?? []).map((option: string, i: number) => {
              const letter = String.fromCharCode(65 + i);
              return (
                <button
                  key={letter}
                  onClick={() => send({ type: "SUBMIT_PICK", pick: letter })}
                  className="w-full py-4 bg-white border-2 border-gray-200 rounded-2xl font-bold text-base tracking-wider
                             text-gray-800 hover:border-orange-400 hover:bg-orange-50 active:scale-[0.98] transition-all cursor-pointer text-left px-5 flex items-center gap-3"
                >
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-100 text-orange-600 text-sm font-extrabold flex items-center justify-center">
                    {letter}
                  </span>
                  {option}
                </button>
              );
            })}
          </div>
        )
      )}

      {!round.hotTakeDiscussing && (hasPicked || state.isSpectator) && (
        <p className="text-center text-base text-gray-400 italic tracking-wide py-4">
          {state.isSpectator ? "Watching..." : "Waiting for others to pick..."}
        </p>
      )}

      {/* Discussion Phase — show all picks */}
      {round.hotTakeDiscussing && round.hotTakePicks && (
        <div className="animate-slide-up stagger-1">
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase mb-3 block">
            Everyone's Picks — Discuss!
          </span>
          <div className="flex flex-col gap-2">
            {round.hotTakePicks.map((p: any) => {
              const idx = p.pick.charCodeAt(0) - 65;
              const optionColors = ["text-orange-600", "text-blue-600", "text-emerald-600", "text-purple-600"];
              return (
                <div key={p.playerId} className="flex justify-between items-center px-5 py-3 bg-white rounded-xl border border-gray-200">
                  <span className="text-sm text-gray-500 tracking-wide">{p.playerName}</span>
                  <span className={`font-bold text-base tracking-wider ${optionColors[idx] ?? "text-gray-700"}`}>
                    <span className="mr-1.5 opacity-60">{p.pick}.</span>
                    {round.hotTakeOptions?.[idx] ?? p.pick}
                  </span>
                </div>
              );
            })}
          </div>
          {/* AI Directives during discussion */}
          {round.isAiControlled && round.aiDirectives.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Cpu size={16} className="text-amber-600" />
                <span className="text-xs font-bold text-amber-600 tracking-wider">YOUR TALKING POINTS — USE ALL OF THESE</span>
              </div>
              <div className="flex flex-col gap-2">
                {round.aiDirectives.map((d: string, i: number) => (
                  <div key={i} className="flex gap-3 items-start bg-white/60 rounded-xl px-4 py-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-amber-200 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700 font-medium leading-snug">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-sm text-gray-400 mt-4 tracking-wide">
            Who's faking their preference? Discuss and vote!
          </p>

          {isHost && !state.isSpectator && (
            <button
              onClick={() => send({ type: "CALL_VOTE" })}
              className="w-full mt-4 py-4 bg-amber-400 text-gray-900 font-bold text-base tracking-wider rounded-2xl
                         hover:bg-amber-500 active:scale-[0.98] transition-all shadow-md cursor-pointer"
            >
              CALL VOTE
            </button>
          )}
        </div>
      )}

      {/* Pick status */}
      {!round.hotTakeDiscussing && (
        <div className="flex flex-wrap gap-2 justify-center">
          {state.players.map((p: any) => (
            <span key={p.id} className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wider
              ${p.hasVoted ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-500"}`}>
              {p.name}
            </span>
          ))}
        </div>
      )}

      {!state.isSpectator && <PeekButton onClick={peek} />}
      {peeking && (
        <PeekOverlay onDismiss={dismiss}>
          <div className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-7 text-center">
            <p className="text-sm font-bold text-orange-600 tracking-wider uppercase mb-3">HOT TAKE</p>
            <p className="text-xl font-extrabold text-gray-800 leading-snug">{round.hotTakeQuestion}</p>
            {round.hotTakeIsFaker && (
              <p className="mt-3 text-sm font-bold text-red-600">YOU ARE THE FAKER</p>
            )}
            <div className="mt-4 flex flex-col gap-1 text-sm text-gray-600">
              {(round.hotTakeOptions ?? []).map((opt: string, i: number) => (
                <p key={i}><span className="font-bold">{String.fromCharCode(65 + i)}:</span> {opt}</p>
              ))}
            </div>
          </div>
        </PeekOverlay>
      )}
    </div>
  );
}

function Timer({
  secondsLeft,
  display,
  paused,
  isHost,
  onTogglePause,
}: {
  secondsLeft: number;
  display: string;
  paused?: boolean;
  isHost?: boolean;
  onTogglePause?: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <div
        className={`inline-block px-8 py-3 rounded-full font-bold text-2xl tabular-nums tracking-wider
          ${paused
            ? "bg-blue-100 text-blue-700"
            : secondsLeft < 15
            ? "bg-red-100 text-red-700 animate-pulse"
            : secondsLeft < 30
            ? "bg-amber-100 text-amber-700"
            : "bg-gray-100 text-gray-700"
          }`}
      >
        <Clock size={16} className="inline -mt-0.5 mr-2 opacity-60" />
        {paused ? "PAUSED" : display}
      </div>
      {isHost && onTogglePause && (
        <button
          onClick={onTogglePause}
          className="text-xs font-bold tracking-wider text-gray-400 hover:text-gray-600
                     bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl transition-colors cursor-pointer"
        >
          {paused ? "▶" : "⏸"}
        </button>
      )}
    </div>
  );
}
