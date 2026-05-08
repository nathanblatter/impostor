import React from "react";
import { Award, RotateCcw, Home, ArrowRight, Cpu } from "react-feather";
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
    <div className="flex flex-col gap-6 pt-5 pb-8 animate-fade-in">
      {/* Outcome */}
      <div className="text-center animate-pop-in py-2">
        <h2 className="text-xl font-extrabold tracking-wider text-gray-800 leading-snug">
          {results.reason}
        </h2>
      </div>

      {/* Reveal Cards */}
      <div className="grid grid-cols-2 gap-4 animate-slide-up stagger-1">
        {state.mode === "SPYFALL" ? (
          <>
            <RevealCard label="THE SPY" value={playerMap.get(results.spyId!) || "?"} accent="red" />
            <RevealCard label="LOCATION" value={results.location || "?"} accent="indigo" />
          </>
        ) : state.mode === "IMPOSTOR" ? (
          <>
            <RevealCard
              label={`IMPOSTOR${(results.impostorIds?.length || 0) > 1 ? "S" : ""}`}
              value={(results.impostorIds || []).map((id) => playerMap.get(id) || "?").join(", ")}
              accent="red"
            />
            <RevealCard label={results.category || "WORD"} value={results.secretWord || "?"} accent="indigo" />
          </>
        ) : state.mode === "ODD_ONE_OUT" ? (
          <>
            <RevealCard label="ODD ONE OUT" value={playerMap.get(results.oddPlayerId!) || "?"} accent="red" />
            <div className="col-span-2 flex flex-col gap-2">
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-center">
                <p className="text-[10px] font-bold text-violet-500 tracking-widest uppercase mb-1">NORMAL PROMPT</p>
                <p className="text-sm font-bold text-violet-700">{results.normalPrompt}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-[10px] font-bold text-red-500 tracking-widest uppercase mb-1">ODD PROMPT</p>
                <p className="text-sm font-bold text-red-700">{results.oddPlayerPrompt}</p>
              </div>
            </div>
          </>
        ) : state.mode === "HOT_TAKE" ? (
          <>
            <RevealCard label="THE FAKER" value={playerMap.get(results.fakerId!) || "?"} accent="red" />
            <div className="col-span-2 flex flex-col gap-2">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
                <p className="text-[10px] font-bold text-indigo-500 tracking-widest uppercase mb-1">EVERYONE'S QUESTION</p>
                <p className="text-sm font-bold text-indigo-700">{results.hotTakeQuestion}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-[10px] font-bold text-red-500 tracking-widest uppercase mb-1">FAKER'S QUESTION</p>
                <p className="text-sm font-bold text-red-700">{results.hotTakeFakerQuestion}</p>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* AI Controlled Reveal */}
      {results.aiControlledId && (
        <div className="flex items-center justify-center gap-2 py-3 px-4 bg-amber-50 border border-amber-200 rounded-xl animate-slide-up stagger-1">
          <Cpu size={16} className="text-amber-600" />
          <span className="text-sm font-bold text-amber-700 tracking-wide">
            {playerMap.get(results.aiControlledId) || "?"} was AI-controlled
          </span>
        </div>
      )}

      {/* Descriptors Recap */}
      {round.descriptorHistory.length > 0 && (
        <div className="animate-slide-up stagger-2">
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase mb-3 block">
            Descriptors
          </span>
          <div className="flex flex-col gap-1.5">
            {round.descriptorHistory.map((d: DescriptorEntry) => {
              const isImpostor = (results.impostorIds || []).includes(d.playerId);
              return (
                <div
                  key={`${d.playerId}-${d.round}`}
                  className={`flex justify-between items-center px-5 py-3 rounded-xl border
                    ${isImpostor
                      ? "bg-red-50 border-red-200"
                      : "bg-white border-gray-200"
                    }`}
                >
                  <span className={`text-sm tracking-wide ${isImpostor ? "text-red-500 font-bold" : "text-gray-500"}`}>
                    {d.playerName}
                  </span>
                  <span className="font-bold text-base text-gray-800 tracking-wider">{d.word}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Votes */}
      <div className="animate-slide-up stagger-3">
        <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase mb-3 block">
          Votes
        </span>
        <div className="flex flex-col gap-1.5">
          {Object.entries(results.votes).map(([voterId, targetId]) => (
            <div key={voterId} className="flex items-center justify-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200 text-base">
              <span className="text-gray-700 font-semibold">{playerMap.get(voterId) || "?"}</span>
              <ArrowRight size={14} className="text-gray-400" />
              <span className="text-gray-700 font-semibold">{playerMap.get(targetId as string) || "?"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scores */}
      <div className="animate-slide-up stagger-4">
        <div className="flex items-center gap-2 mb-3">
          <Award size={16} className="text-amber-500" />
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase">Scores</span>
        </div>
        <div className="flex flex-col gap-1.5">
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
                className={`flex justify-between items-center px-5 py-3.5 rounded-xl border
                  ${p.id === playerId
                    ? "bg-indigo-50 border-indigo-200"
                    : "bg-white border-gray-200"
                  }`}
              >
                <span className="text-base font-semibold tracking-wide text-gray-800">
                  {p.name}
                  {p.id === playerId && <span className="ml-2 text-xs text-indigo-500 font-bold">YOU</span>}
                </span>
                <span className="font-extrabold text-lg text-indigo-600 tracking-wider">{p.score}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Actions */}
      {isHost ? (
        <div className="flex flex-col gap-3 animate-slide-up stagger-5">
          <button
            onClick={() => send({ type: "NEXT_ROUND" })}
            className="w-full py-4.5 bg-indigo-600 text-white font-bold text-base tracking-wider rounded-2xl
                       hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200 cursor-pointer"
          >
            <RotateCcw size={16} className="inline -mt-0.5 mr-2" />
            NEXT ROUND
          </button>
          <button
            onClick={() => send({ type: "RETURN_TO_LOBBY" })}
            className="w-full py-3.5 bg-gray-200 text-gray-600 font-bold text-base tracking-wider rounded-2xl
                       hover:bg-gray-300 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Home size={16} className="inline -mt-0.5 mr-2" />
            BACK TO LOBBY
          </button>
        </div>
      ) : (
        <p className="text-center text-base text-gray-400 italic tracking-wide py-4">
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
    <div className={`${colors} border-2 rounded-2xl p-5 text-center animate-pop-in`}>
      <p className={`text-[11px] font-bold tracking-widest uppercase ${labelColor} mb-2`}>{label}</p>
      <p className={`text-lg font-extrabold tracking-wide ${valueColor}`}>{value}</p>
    </div>
  );
}
