import React, { useState } from "react";
import { Clock, AlertTriangle, Eye, EyeOff, Send } from "react-feather";
import { useTimer } from "../useTimer.js";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState, DescriptorEntry } from "../../shared/types.js";

interface Props {
  state: GameState;
  playerId: string;
  send: (msg: ClientMessage) => void;
}

export default function Playing({ state, playerId, send }: Props) {
  const round = state.round!;

  if (state.mode === "SPYFALL") {
    return <SpyfallPlaying state={state} round={round} playerId={playerId} send={send} />;
  }
  return <ImpostorPlaying state={state} round={round} playerId={playerId} send={send} />;
}

function SpyfallPlaying({ state, round, playerId, send }: Props & { round: any }) {
  const { secondsLeft, display } = useTimer(round.timerEndsAt);
  const [showLocations, setShowLocations] = useState(false);

  return (
    <div className="flex flex-col gap-5 pt-4 animate-fade-in">
      <Timer secondsLeft={secondsLeft} display={display} />

      {/* Role Card */}
      <div
        className={`rounded-xl border-2 p-6 text-center animate-pop-in ${
          round.isSpy
            ? "bg-red-50 border-red-300"
            : "bg-emerald-50 border-emerald-300"
        }`}
      >
        {round.isSpy ? (
          <>
            <div className="flex items-center justify-center gap-2 mb-2">
              <EyeOff size={20} className="text-red-500" />
              <h2 className="text-lg font-extrabold text-red-600 tracking-wider">YOU ARE THE SPY</h2>
            </div>
            <p className="text-sm text-red-500/80 tracking-wide">
              Figure out the location from the conversation
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Eye size={20} className="text-emerald-500" />
              <h2 className="text-sm font-bold text-emerald-600 tracking-wider uppercase">Location</h2>
            </div>
            <p className="text-2xl font-extrabold text-gray-800 tracking-wide">{round.location}</p>
            <p className="text-xs text-emerald-500 mt-2 tracking-wider">Find the spy!</p>
          </>
        )}
      </div>

      {/* Spy location guess */}
      {round.isSpy && (
        <div className="animate-slide-up stagger-1">
          <button
            onClick={() => setShowLocations(!showLocations)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200
                       text-sm font-semibold tracking-wider text-gray-600 hover:border-red-300 transition-colors cursor-pointer"
          >
            <span>GUESS LOCATION</span>
            <AlertTriangle size={14} className="text-red-400" />
          </button>
          {showLocations && (
            <div className="grid grid-cols-2 gap-1.5 mt-2 max-h-60 overflow-y-auto">
              {round.allLocations.map((loc: string) => (
                <button
                  key={loc}
                  onClick={() => {
                    if (confirm(`Guess "${loc}"?`)) {
                      send({ type: "SPY_GUESS", locationGuess: loc });
                    }
                  }}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold
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
      <PlayerList players={state.players} playerId={playerId} />

      {/* Call Vote */}
      <button
        onClick={() => send({ type: "CALL_VOTE" })}
        className="w-full py-3.5 bg-amber-400 text-gray-900 font-bold tracking-wider rounded-xl
                   hover:bg-amber-500 active:scale-[0.98] transition-all shadow-md cursor-pointer"
      >
        CALL VOTE
      </button>
    </div>
  );
}

function ImpostorPlaying({ state, round, playerId, send }: Props & { round: any }) {
  const { secondsLeft, display } = useTimer(round.timerEndsAt);
  const [descriptor, setDescriptor] = useState("");
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
    <div className="flex flex-col gap-5 pt-4 animate-fade-in">
      <Timer secondsLeft={secondsLeft} display={display} />

      {/* Role Card */}
      <div
        className={`rounded-xl border-2 p-6 text-center animate-pop-in ${
          round.isImpostor
            ? "bg-red-50 border-red-300"
            : "bg-emerald-50 border-emerald-300"
        }`}
      >
        {round.isImpostor ? (
          <>
            <h2 className="text-lg font-extrabold text-red-600 tracking-wider mb-1">
              YOU ARE THE IMPOSTOR
            </h2>
            <p className="text-sm text-gray-600">
              Category: <span className="font-bold text-gray-800">{round.category}</span>
            </p>
            {round.fellowImpostorNames.length > 0 && (
              <p className="text-xs text-red-500 mt-2 tracking-wide font-semibold">
                Partner: {round.fellowImpostorNames.join(", ")}
              </p>
            )}
            <p className="text-xs text-red-400 mt-2 tracking-wider">Blend in! Don't get caught.</p>
          </>
        ) : (
          <>
            <p className="text-xs text-emerald-600 font-bold tracking-wider uppercase mb-1">
              {round.category}
            </p>
            <p className="text-2xl font-extrabold text-gray-800 tracking-wide">{round.secretWord}</p>
            <p className="text-xs text-emerald-500 mt-2 tracking-wider">Find the impostor!</p>
          </>
        )}
      </div>

      {/* Descriptor Round */}
      <div className="animate-slide-up stagger-1">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500 tracking-wider font-semibold uppercase">
            Round {round.currentDescriptorRound} — Descriptors
          </span>
        </div>

        {/* History */}
        {round.descriptorHistory.length > 0 && (
          <div className="flex flex-col gap-1 mb-3">
            {round.descriptorHistory.map((d: DescriptorEntry, i: number) => (
              <div
                key={`${d.playerId}-${d.round}`}
                className="flex justify-between items-center px-3 py-2 bg-white rounded-lg border border-gray-200"
              >
                <span className="text-xs text-gray-500 tracking-wide">{d.playerName}</span>
                <span className="font-bold text-sm text-gray-800 tracking-wider">{d.word}</span>
              </div>
            ))}
          </div>
        )}

        {/* Input or waiting */}
        {isMyTurn ? (
          <div className="flex gap-2 animate-pop-in">
            <input
              type="text"
              value={descriptor}
              onChange={(e) => setDescriptor(e.target.value.replace(/\s/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && submitDescriptor()}
              placeholder="One word..."
              maxLength={30}
              autoFocus
              className="flex-1 px-4 py-3 bg-white border-2 border-indigo-300 rounded-lg font-bold tracking-wider
                         text-gray-800 placeholder:text-gray-400 placeholder:font-medium outline-none
                         focus:border-indigo-500 transition-colors"
            />
            <button
              onClick={submitDescriptor}
              className="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700
                         active:scale-95 transition-all cursor-pointer"
            >
              <Send size={18} />
            </button>
          </div>
        ) : (
          <div className="text-center py-3 text-sm text-gray-400 italic tracking-wide">
            {currentPlayer ? `Waiting for ${currentPlayer.name}...` : "Waiting..."}
          </div>
        )}
      </div>

      {/* Players */}
      <div className="flex flex-col gap-1.5">
        {state.players.map((p) => (
          <div
            key={p.id}
            className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all
              ${p.id === round.currentTurnPlayerId
                ? "bg-indigo-50 border-indigo-300"
                : "bg-white border-gray-200"
              } ${!p.isConnected ? "opacity-40" : ""}`}
          >
            <span className="text-sm font-semibold tracking-wide text-gray-700">
              {p.name}
              {p.id === playerId && <span className="ml-1 text-xs text-indigo-500 font-bold">YOU</span>}
            </span>
            {p.id === round.currentTurnPlayerId && (
              <span className="text-xs text-indigo-500 font-bold tracking-wider animate-pulse">TURN</span>
            )}
          </div>
        ))}
      </div>

      {/* Call Vote (host only) */}
      {isHost && (
        <button
          onClick={() => send({ type: "CALL_VOTE" })}
          className="w-full py-3 bg-amber-400 text-gray-900 font-bold tracking-wider rounded-xl
                     hover:bg-amber-500 active:scale-[0.98] transition-all shadow-md cursor-pointer"
        >
          CALL VOTE
        </button>
      )}
    </div>
  );
}

function Timer({ secondsLeft, display }: { secondsLeft: number; display: string }) {
  return (
    <div className="text-center">
      <div
        className={`inline-block px-6 py-2 rounded-full font-bold text-xl tabular-nums tracking-wider
          ${secondsLeft < 15
            ? "bg-red-100 text-red-700 animate-pulse"
            : secondsLeft < 30
            ? "bg-amber-100 text-amber-700"
            : "bg-gray-100 text-gray-700"
          }`}
      >
        <Clock size={14} className="inline -mt-0.5 mr-1.5 opacity-60" />
        {display}
      </div>
    </div>
  );
}

function PlayerList({ players, playerId }: { players: any[]; playerId: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {players.map((p) => (
        <div
          key={p.id}
          className={`px-3 py-2 bg-white rounded-lg border border-gray-200 text-sm font-semibold
                     tracking-wide text-gray-700 ${!p.isConnected ? "opacity-40" : ""}`}
        >
          {p.name}
          {p.id === playerId && <span className="ml-1 text-xs text-indigo-500 font-bold">YOU</span>}
        </div>
      ))}
    </div>
  );
}
