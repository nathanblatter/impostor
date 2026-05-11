import React, { useState } from "react";
import { Clock, Eye, Send, Zap, CheckCircle, XCircle, Users, ChevronDown } from "react-feather";
import { useTimer } from "../useTimer.js";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState, TriggerState } from "../../shared/types.js";

interface Props {
  state: GameState;
  playerId: string;
  send: (msg: ClientMessage) => void;
}

export default function TriggerPlaying({ state, playerId, send }: Props) {
  const round = state.round!;
  const trigger = round.trigger!;
  const me = state.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;

  const isSpectator = state.isSpectator;

  switch (trigger.subPhase) {
    case "ASSIGNING":
      return <AssigningPhase trigger={trigger} playerId={playerId} isSpectator={isSpectator} send={send} />;
    case "PLAYING":
      return <PlayingPhase trigger={trigger} round={round} playerId={playerId} isSpectator={isSpectator} send={send} />;
    case "GUESSING":
      return <GuessingPhase trigger={trigger} state={state} playerId={playerId} send={send} />;
    case "REVEAL":
      return <RevealPhase trigger={trigger} state={state} isHost={isHost} send={send} />;
    default:
      return null;
  }
}

function AssigningPhase({ trigger, playerId, isSpectator, send }: { trigger: TriggerState; playerId: string; isSpectator: boolean; send: (m: ClientMessage) => void }) {
  const [triggerText, setTriggerText] = useState("");
  const [actionText, setActionText] = useState("");
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  const isGuesser = trigger.isGuesser;
  const submitted = trigger.hasSubmittedAssignment;

  const handleSuggestion = () => {
    setLoadingSuggestion(true);
    send({ type: "TRIGGER_GET_SUGGESTION" });
  };

  // Fill in suggestion when it arrives
  React.useEffect(() => {
    if (trigger.aiSuggestion && !triggerText && !actionText) {
      setTriggerText(trigger.aiSuggestion.trigger);
      setActionText(trigger.aiSuggestion.action);
      setLoadingSuggestion(false);
    }
  }, [trigger.aiSuggestion]);

  const canSubmit = triggerText.trim() && actionText.trim();

  const handleSubmit = () => {
    if (!canSubmit) return;
    send({ type: "TRIGGER_SUBMIT_ASSIGNMENT", trigger: triggerText.trim(), action: actionText.trim() });
  };

  return (
    <div className="flex flex-col gap-6 pt-5 animate-fade-in">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-100 rounded-full">
          <Zap size={16} className="text-indigo-600" />
          <span className="text-sm font-bold text-indigo-700 tracking-wider">TRIGGER — Setup</span>
        </div>
      </div>

      {isSpectator ? (
        <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-7 text-center animate-pop-in">
          <p className="text-base text-gray-400 italic">Watching setup...</p>
        </div>
      ) : isGuesser ? (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-7 text-center animate-pop-in">
          <h2 className="text-xl font-extrabold text-red-600 tracking-wider mb-3">YOU ARE THE GUESSER</h2>
          <p className="text-base text-gray-600 leading-relaxed">
            Other players are secretly assigning triggers. Once everyone is set,<br />
            act natural — try to figure out what's setting them off!
          </p>
          <p className="text-sm text-red-400 mt-4 tracking-wide">Waiting for players to assign triggers...</p>
        </div>
      ) : submitted ? (
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-7 text-center animate-pop-in">
          <CheckCircle size={32} className="text-emerald-500 mx-auto mb-3" />
          <p className="text-lg font-bold text-emerald-700 tracking-wide">Assignment submitted!</p>
          <p className="text-sm text-gray-500 mt-2">Waiting for others...</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 animate-slide-up stagger-1">
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 text-center">
            <p className="text-xs font-bold text-amber-600 tracking-wider uppercase mb-1">Your target</p>
            <p className="text-2xl font-extrabold text-gray-800">{trigger.assignTarget}</p>
            <p className="text-xs text-gray-500 mt-2">Create a secret trigger rule that <span className="font-bold text-amber-700">{trigger.guesserName}</span> will trigger, and {trigger.assignTarget} must respond</p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 tracking-wider uppercase">
                Trigger — what {trigger.guesserName} does
              </label>
              <input
                type="text"
                value={triggerText}
                onChange={(e) => setTriggerText(e.target.value)}
                placeholder={`e.g. "says the word 'like'"`}
                maxLength={80}
                className="px-4 py-3.5 bg-white border-2 border-gray-200 rounded-xl font-medium text-base
                           text-gray-800 placeholder:text-gray-400 outline-none focus:border-indigo-400 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 tracking-wider uppercase">
                Action — what {trigger.assignTarget} does in response
              </label>
              <input
                type="text"
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
                placeholder={`e.g. "clap once"`}
                maxLength={80}
                className="px-4 py-3.5 bg-white border-2 border-gray-200 rounded-xl font-medium text-base
                           text-gray-800 placeholder:text-gray-400 outline-none focus:border-indigo-400 transition-colors"
              />
            </div>
          </div>

          <button
            onClick={() => { setLoadingSuggestion(true); handleSuggestion(); }}
            disabled={loadingSuggestion}
            className="w-full py-3 border-2 border-indigo-200 rounded-xl text-sm font-bold text-indigo-600
                       hover:bg-indigo-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            {loadingSuggestion ? "Getting suggestion..." : "AI Suggestion"}
          </button>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`w-full py-4 rounded-2xl font-bold text-base tracking-wider transition-all flex items-center justify-center gap-2
              ${canSubmit
                ? "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] shadow-lg shadow-indigo-200 cursor-pointer"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
          >
            <Send size={16} />
            SUBMIT ASSIGNMENT
          </button>
        </div>
      )}

      {/* Submission status */}
      {!isGuesser && (
        <div className="flex flex-wrap gap-2 justify-center">
          {/* Only show non-guesser players */}
        </div>
      )}
    </div>
  );
}

function PlayingPhase({ trigger, round, playerId, isSpectator, send }: { trigger: TriggerState; round: any; playerId: string; isSpectator: boolean; send: (m: ClientMessage) => void }) {
  const { secondsLeft, display } = useTimer(round.timerEndsAt);
  const isGuesser = trigger.isGuesser;
  const showTimer = round.timerEndsAt > 0;

  return (
    <div className="flex flex-col gap-6 pt-5 animate-fade-in">
      {showTimer && (
        <div className="text-center">
          <div className={`inline-block px-8 py-3 rounded-full font-bold text-2xl tabular-nums tracking-wider
            ${secondsLeft < 30 ? "bg-red-100 text-red-700 animate-pulse" : "bg-gray-100 text-gray-700"}`}>
            <Clock size={16} className="inline -mt-0.5 mr-2 opacity-60" />
            {display}
          </div>
        </div>
      )}

      {isSpectator ? (
        <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-7 text-center animate-pop-in">
          <p className="text-base text-gray-400 italic">Watching the game...</p>
        </div>
      ) : isGuesser ? (
        <>
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-7 text-center animate-pop-in">
            <h2 className="text-xl font-extrabold text-red-600 tracking-wider mb-3">YOU ARE THE GUESSER</h2>
            <p className="text-base text-gray-600 leading-relaxed">
              Everyone has a secret trigger. Act natural, start conversations, do things — watch for patterns in how people react.
            </p>
            <p className="text-sm text-red-400 mt-3 tracking-wide">You get 3 guesses. Use them wisely!</p>
          </div>

          <button
            onClick={() => send({ type: "READY_TO_VOTE" })}
            className="w-full py-4.5 bg-indigo-600 text-white font-bold text-lg tracking-wider rounded-2xl
                       hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200 cursor-pointer"
          >
            I'M READY TO GUESS
          </button>
        </>
      ) : (
        <>
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-7 animate-pop-in">
            <p className="text-xs font-bold text-emerald-600 tracking-wider uppercase mb-4 text-center">YOUR SECRET RULE</p>
            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-xl p-4 border border-emerald-200">
                <p className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">When {trigger.guesserName}...</p>
                <p className="text-lg font-extrabold text-gray-800">{trigger.myAssignment?.trigger}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-emerald-200">
                <p className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">You must...</p>
                <p className="text-lg font-extrabold text-indigo-700">{trigger.myAssignment?.action}</p>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <p className="text-sm text-amber-700 font-semibold tracking-wide">
              Act natural! Don't make it too obvious. Wait for {trigger.guesserName} to trigger you.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function GuessingPhase({ trigger, state, playerId, send }: { trigger: TriggerState; state: GameState; playerId: string; send: (m: ClientMessage) => void }) {
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [guessText, setGuessText] = useState("");
  const isGuesser = trigger.isGuesser;

  const otherPlayers = state.players.filter((p) => p.id !== playerId);

  const handleGuess = () => {
    if (!selectedPlayer || !guessText.trim()) return;
    send({ type: "TRIGGER_GUESS", targetName: selectedPlayer, triggerGuess: guessText.trim() });
    setGuessText("");
    setSelectedPlayer("");
  };

  return (
    <div className="flex flex-col gap-6 pt-5 animate-fade-in">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-100 rounded-full">
          <Eye size={16} className="text-red-600" />
          <span className="text-sm font-bold text-red-700 tracking-wider">GUESSING TIME</span>
        </div>
      </div>

      {state.isSpectator ? (
        <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-7 text-center animate-pop-in">
          <p className="text-base text-gray-400 italic">Watching {trigger.guesserName} guess...</p>
        </div>
      ) : isGuesser ? (
        <>
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-5 animate-pop-in">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-bold text-gray-500 tracking-wider uppercase">Guesses remaining</span>
              <div className="flex gap-1.5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className={`w-3 h-3 rounded-full ${i < trigger.guessesRemaining ? "bg-indigo-500" : "bg-gray-200"}`} />
                ))}
              </div>
            </div>

            {/* Guess history */}
            {trigger.guessHistory.length > 0 && (
              <div className="flex flex-col gap-2 mb-4">
                {trigger.guessHistory.map((g, i) => (
                  <div key={i} className={`flex items-center justify-between px-4 py-3 rounded-xl border
                    ${g.correct ? "bg-emerald-50 border-emerald-300" : "bg-red-50 border-red-200"}`}>
                    <div>
                      <span className="text-xs text-gray-400 font-semibold">{g.targetName}: </span>
                      <span className="text-sm font-bold text-gray-700">{g.triggerGuess}</span>
                    </div>
                    {g.correct
                      ? <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
                      : <XCircle size={16} className="text-red-400 flex-shrink-0" />
                    }
                  </div>
                ))}
              </div>
            )}

            {trigger.guessesRemaining > 0 ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 tracking-wider uppercase">Pick a player</label>
                  <div className="relative">
                    <select
                      value={selectedPlayer}
                      onChange={(e) => setSelectedPlayer(e.target.value)}
                      className="w-full px-4 py-3.5 bg-white border-2 border-gray-200 rounded-xl font-semibold text-base
                                 text-gray-800 outline-none focus:border-indigo-400 transition-colors appearance-none cursor-pointer"
                    >
                      <option value="">Select player...</option>
                      {otherPlayers.map((p) => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 tracking-wider uppercase">Their trigger is...</label>
                  <input
                    type="text"
                    value={guessText}
                    onChange={(e) => setGuessText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGuess()}
                    placeholder={`e.g. "when I check my phone"`}
                    maxLength={100}
                    className="px-4 py-3.5 bg-white border-2 border-gray-200 rounded-xl font-medium text-base
                               text-gray-800 placeholder:text-gray-400 outline-none focus:border-indigo-400 transition-colors"
                  />
                </div>

                <button
                  onClick={handleGuess}
                  disabled={!selectedPlayer || !guessText.trim()}
                  className={`w-full py-4 rounded-2xl font-bold text-base tracking-wider transition-all flex items-center justify-center gap-2
                    ${selectedPlayer && guessText.trim()
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] shadow-lg cursor-pointer"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                >
                  <Send size={16} />
                  SUBMIT GUESS
                </button>
              </div>
            ) : null}
          </div>

          <button
            onClick={() => send({ type: "TRIGGER_GUESS", targetName: "", triggerGuess: "__REVEAL__" })}
            className="w-full py-3.5 border-2 border-gray-300 rounded-2xl font-bold text-sm text-gray-500
                       hover:border-gray-400 hover:text-gray-700 transition-colors cursor-pointer tracking-wider"
          >
            GIVE UP — REVEAL ALL
          </button>
        </>
      ) : (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-7 text-center animate-pop-in">
          <Eye size={32} className="text-amber-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-amber-700 tracking-wider mb-2">{trigger.guesserName} is guessing!</h2>
          <p className="text-base text-gray-600">Keep a straight face. Don't give it away!</p>
          <div className="mt-4 bg-white rounded-xl p-4 border border-amber-200">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Your trigger</p>
            <p className="text-base font-bold text-gray-700">{trigger.myAssignment?.trigger}</p>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-3 mb-1">Your action</p>
            <p className="text-base font-bold text-indigo-700">{trigger.myAssignment?.action}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function RevealPhase({ trigger, state, isHost, send }: { trigger: TriggerState; state: GameState; isHost: boolean; send: (m: ClientMessage) => void }) {
  const correctGuesses = trigger.guessHistory.filter((g) => g.correct).length;

  return (
    <div className="flex flex-col gap-6 pt-5 animate-fade-in pb-6">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-100 rounded-full">
          <Eye size={16} className="text-indigo-600" />
          <span className="text-sm font-bold text-indigo-700 tracking-wider">REVEAL</span>
        </div>
      </div>

      {/* Score */}
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 text-center animate-pop-in">
        <p className="text-sm font-bold text-gray-400 tracking-wider uppercase mb-2">
          {trigger.guesserName} got
        </p>
        <p className="text-6xl font-extrabold text-indigo-600 mb-1">{correctGuesses}</p>
        <p className="text-sm font-bold text-gray-400 tracking-wider uppercase">
          out of {trigger.allAssignments?.length ?? 0} triggers
        </p>
      </div>

      {/* All assignments */}
      <div className="flex flex-col gap-3 animate-slide-up stagger-1">
        <span className="text-xs font-bold text-gray-400 tracking-wider uppercase">All Secret Triggers</span>
        {trigger.allAssignments?.map((a, i) => {
          const wasGuessed = trigger.guessHistory.some((g) => g.targetName === a.targetName && g.correct);
          return (
            <div key={i} className={`rounded-xl border-2 p-4 ${wasGuessed ? "bg-emerald-50 border-emerald-300" : "bg-white border-gray-200"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-extrabold text-base text-gray-800">{a.targetName}</span>
                {wasGuessed && <CheckCircle size={16} className="text-emerald-500" />}
              </div>
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-0.5">When {trigger.guesserName}...</p>
              <p className="text-sm font-semibold text-gray-700 mb-2">{a.trigger}</p>
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-0.5">Respond by...</p>
              <p className="text-sm font-bold text-indigo-700">{a.action}</p>
            </div>
          );
        })}
      </div>

      {/* Guess history */}
      {trigger.guessHistory.length > 0 && (
        <div className="flex flex-col gap-2 animate-slide-up stagger-2">
          <span className="text-xs font-bold text-gray-400 tracking-wider uppercase">Guess History</span>
          {trigger.guessHistory.map((g, i) => (
            <div key={i} className={`flex items-center justify-between px-4 py-3 rounded-xl border
              ${g.correct ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
              <div>
                <span className="text-xs text-gray-400 font-semibold">{g.targetName}: </span>
                <span className="text-sm font-bold text-gray-700">{g.triggerGuess}</span>
              </div>
              {g.correct
                ? <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
                : <XCircle size={16} className="text-red-400 flex-shrink-0" />
              }
            </div>
          ))}
        </div>
      )}

      {isHost && (
        <div className="flex flex-col gap-3 pt-2 animate-slide-up stagger-3">
          <button
            onClick={() => send({ type: "NEXT_ROUND" })}
            className="w-full py-4.5 bg-indigo-600 text-white font-bold text-lg tracking-wider rounded-2xl
                       hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200 cursor-pointer"
          >
            PLAY AGAIN
          </button>
          <button
            onClick={() => send({ type: "RETURN_TO_LOBBY" })}
            className="w-full py-3.5 border-2 border-gray-200 rounded-2xl font-bold text-sm text-gray-500
                       hover:border-gray-300 transition-colors cursor-pointer tracking-wider"
          >
            BACK TO LOBBY
          </button>
        </div>
      )}
    </div>
  );
}
