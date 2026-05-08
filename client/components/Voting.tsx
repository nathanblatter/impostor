import React from "react";
import { Clock, CheckCircle } from "react-feather";
import { useTimer } from "../useTimer.js";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState } from "../../shared/types.js";

interface Props {
  state: GameState;
  playerId: string;
  send: (msg: ClientMessage) => void;
}

export default function Voting({ state, playerId, send }: Props) {
  const round = state.round!;
  const { secondsLeft, display } = useTimer(round.timerEndsAt);
  const me = state.players.find((p) => p.id === playerId);
  const hasVoted = me?.hasVoted ?? false;

  return (
    <div className="flex flex-col gap-6 pt-5 animate-fade-in">
      {/* Timer */}
      <div className="text-center">
        <div
          className={`inline-block px-8 py-3 rounded-full font-bold text-2xl tabular-nums tracking-wider
            ${secondsLeft < 10 ? "bg-red-100 text-red-700 animate-pulse" : "bg-gray-100 text-gray-700"}`}
        >
          <Clock size={16} className="inline -mt-0.5 mr-2 opacity-60" />
          {display}
        </div>
      </div>

      {/* Header */}
      <div className="text-center animate-pop-in">
        <h2 className="text-2xl font-extrabold tracking-wider text-gray-800">VOTE</h2>
        <p className="text-base text-gray-500 tracking-wide mt-2">
          {state.mode === "SPYFALL" ? "Who is the spy?"
            : state.mode === "IMPOSTOR" ? "Who is the impostor?"
            : state.mode === "ODD_ONE_OUT" ? "Who had the different question?"
            : "Who is the faker?"}
        </p>
      </div>

      {/* Descriptor History (Impostor) */}
      {state.mode === "IMPOSTOR" && round.descriptorHistory.length > 0 && (
        <div className="animate-slide-up">
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase mb-2 block">Descriptors</span>
          <div className="flex flex-col gap-1.5 mb-2">
            {round.descriptorHistory.map((d: any) => (
              <div key={`${d.playerId}-${d.round}`} className="flex justify-between items-center px-4 py-2.5 bg-white rounded-xl border border-gray-200">
                <span className="text-sm text-gray-500 tracking-wide">{d.playerName}</span>
                <span className="font-bold text-sm text-gray-800 tracking-wider">{d.word}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vote Buttons */}
      <div className="flex flex-col gap-3 animate-slide-up stagger-1">
        {state.players
          .filter((p) => p.id !== playerId)
          .map((p, i) => (
            <button
              key={p.id}
              onClick={() => !hasVoted && send({ type: "CAST_VOTE", targetId: p.id })}
              disabled={hasVoted}
              className={`w-full flex items-center justify-between px-6 py-5 rounded-2xl border-2
                         font-bold text-base tracking-wider transition-all
                ${hasVoted
                  ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-white border-gray-200 text-gray-800 hover:border-red-400 hover:bg-red-50 active:scale-[0.98] cursor-pointer"
                }`}
              style={{ animationDelay: `${0.05 * i}s` }}
            >
              <span>{p.name}</span>
              {p.hasVoted && (
                <CheckCircle size={18} className="text-emerald-500" />
              )}
            </button>
          ))}
      </div>

      {hasVoted && (
        <p className="text-center text-base text-gray-400 italic tracking-wide animate-fade-in py-2">
          Waiting for others...
        </p>
      )}

      {/* Vote Status */}
      <div className="flex flex-wrap gap-2.5 justify-center animate-slide-up stagger-2">
        {state.players.map((p) => (
          <span
            key={p.id}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wider transition-all
              ${p.hasVoted
                ? "bg-emerald-500 text-white"
                : "bg-gray-200 text-gray-500"
              }`}
          >
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
