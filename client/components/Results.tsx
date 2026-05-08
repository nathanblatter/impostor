import React from "react";
import { Award, RotateCcw, Home, ArrowRight } from "react-feather";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState, DescriptorEntry } from "../../shared/types.js";

interface Props {
  state: GameState;
  playerId: string;
  send: (msg: ClientMessage) => void;
}

export default function Results({ state, playerId, send }: Props) {
  const round = state.round!;
  const results = round.results!;
  const me = state.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const playerMap = new Map(state.players.map((p) => [p.id, p.name]));

  return (
    <div className="flex flex-col gap-5 pt-4 animate-fade-in">
      {/* Outcome */}
      <div className="text-center animate-pop-in">
        <h2 className="text-lg font-extrabold tracking-wider text-gray-800 leading-snug">
          {results.reason}
        </h2>
      </div>

      {/* Reveal Cards */}
      <div className="grid grid-cols-2 gap-3 animate-slide-up stagger-1">
        {state.mode === "SPYFALL" ? (
          <>
            <RevealCard
              label="THE SPY"
              value={playerMap.get(results.spyId!) || "?"}
              accent="red"
            />
            <RevealCard
              label="LOCATION"
              value={results.location || "?"}
              accent="indigo"
            />
          </>
        ) : (
          <>
            <RevealCard
              label={`IMPOSTOR${(results.impostorIds?.length || 0) > 1 ? "S" : ""}`}
              value={(results.impostorIds || []).map((id) => playerMap.get(id) || "?").join(", ")}
              accent="red"
            />
            <RevealCard
              label={results.category || "WORD"}
              value={results.secretWord || "?"}
              accent="indigo"
            />
          </>
        )}
      </div>

      {/* Descriptors Recap */}
      {round.descriptorHistory.length > 0 && (
        <div className="animate-slide-up stagger-2">
          <span className="text-xs text-gray-500 tracking-wider font-semibold uppercase mb-2 block">
            Descriptors
          </span>
          <div className="flex flex-col gap-1">
            {round.descriptorHistory.map((d: DescriptorEntry) => {
              const isImpostor = (results.impostorIds || []).includes(d.playerId);
              return (
                <div
                  key={`${d.playerId}-${d.round}`}
                  className={`flex justify-between items-center px-3 py-2 rounded-lg border
                    ${isImpostor
                      ? "bg-red-50 border-red-200"
                      : "bg-white border-gray-200"
                    }`}
                >
                  <span className={`text-xs tracking-wide ${isImpostor ? "text-red-500 font-bold" : "text-gray-500"}`}>
                    {d.playerName}
                  </span>
                  <span className="font-bold text-sm text-gray-800 tracking-wider">{d.word}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Votes */}
      <div className="animate-slide-up stagger-3">
        <span className="text-xs text-gray-500 tracking-wider font-semibold uppercase mb-2 block">
          Votes
        </span>
        <div className="flex flex-col gap-1">
          {Object.entries(results.votes).map(([voterId, targetId]) => (
            <div key={voterId} className="flex items-center justify-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 text-sm">
              <span className="text-gray-700 font-semibold">{playerMap.get(voterId) || "?"}</span>
              <ArrowRight size={12} className="text-gray-400" />
              <span className="text-gray-700 font-semibold">{playerMap.get(targetId as string) || "?"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scores */}
      <div className="animate-slide-up stagger-4">
        <div className="flex items-center gap-2 mb-2">
          <Award size={14} className="text-amber-500" />
          <span className="text-xs text-gray-500 tracking-wider font-semibold uppercase">Scores</span>
        </div>
        <div className="flex flex-col gap-1">
          {state.players
            .map((p) => ({
              id: p.id,
              name: p.name,
              score: results.scores[p.id] || 0,
            }))
            .sort((a, b) => b.score - a.score)
            .map((p) => (
              <div
                key={p.id}
                className={`flex justify-between items-center px-4 py-2.5 rounded-lg border
                  ${p.id === playerId
                    ? "bg-indigo-50 border-indigo-200"
                    : "bg-white border-gray-200"
                  }`}
              >
                <span className="text-sm font-semibold tracking-wide text-gray-800">
                  {p.name}
                  {p.id === playerId && <span className="ml-1 text-xs text-indigo-500 font-bold">YOU</span>}
                </span>
                <span className="font-extrabold text-indigo-600 tracking-wider">{p.score}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Actions */}
      {isHost ? (
        <div className="flex flex-col gap-2 animate-slide-up stagger-5">
          <button
            onClick={() => send({ type: "NEXT_ROUND" })}
            className="w-full py-3.5 bg-indigo-600 text-white font-bold tracking-wider rounded-xl
                       hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200 cursor-pointer"
          >
            <RotateCcw size={14} className="inline -mt-0.5 mr-1.5" />
            NEXT ROUND
          </button>
          <button
            onClick={() => send({ type: "RETURN_TO_LOBBY" })}
            className="w-full py-3 bg-gray-200 text-gray-600 font-bold tracking-wider rounded-xl
                       hover:bg-gray-300 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Home size={14} className="inline -mt-0.5 mr-1.5" />
            BACK TO LOBBY
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-gray-400 italic tracking-wide py-3">
          Waiting for host...
        </p>
      )}
    </div>
  );
}

function RevealCard({ label, value, accent }: { label: string; value: string; accent: "red" | "indigo" }) {
  const colors = accent === "red"
    ? "bg-red-50 border-red-200"
    : "bg-indigo-50 border-indigo-200";
  const labelColor = accent === "red" ? "text-red-500" : "text-indigo-500";
  const valueColor = accent === "red" ? "text-red-700" : "text-indigo-700";

  return (
    <div className={`${colors} border-2 rounded-xl p-4 text-center animate-pop-in`}>
      <p className={`text-[10px] font-bold tracking-widest uppercase ${labelColor} mb-1`}>{label}</p>
      <p className={`text-base font-extrabold tracking-wide ${valueColor}`}>{value}</p>
    </div>
  );
}
