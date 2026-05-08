import React, { useState } from "react";
import { Copy, LogOut, Users, Settings, Check, Cpu } from "react-feather";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState } from "../../shared/types.js";

interface Props {
  state: GameState;
  playerId: string;
  send: (msg: ClientMessage) => void;
  clearSession: () => void;
}

export default function Lobby({ state, playerId, send, clearSession }: Props) {
  const me = state.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const canStart = state.players.length >= 4;
  const [copied, setCopied] = useState(false);

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
      </div>

      {/* Mode Toggle */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 animate-slide-up stagger-1">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={16} className="text-gray-400" />
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase">Game Mode</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["IMPOSTOR", "SPYFALL", "ODD_ONE_OUT", "HOT_TAKE"] as const).map((mode) => {
            const labels: Record<string, string> = {
              IMPOSTOR: "IMPOSTOR",
              SPYFALL: "SPYFALL",
              ODD_ONE_OUT: "ODD ONE OUT",
              HOT_TAKE: "HOT TAKE",
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

        {isHost && (
          <div className="mt-5 flex flex-col gap-4">
            {state.settings.mode !== "ODD_ONE_OUT" && (
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
            {state.settings.mode !== "HOT_TAKE" && (
            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-sm text-gray-500 tracking-wide">AI Hard Mode</span>
                  <span className="text-xs text-gray-400 mt-0.5">
                    {state.settings.mode === "IMPOSTOR"
                      ? "One player gets AI-chosen words"
                      : state.settings.mode === "ODD_ONE_OUT"
                      ? "One player gets AI-chosen answer"
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
            {state.settings.mode === "IMPOSTOR" && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 tracking-wide">Descriptor rounds</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const v = Math.max(1, state.settings.descriptorRounds - 1);
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
                      const v = Math.min(5, state.settings.descriptorRounds + 1);
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
          </div>
        )}
      </div>

      {/* Players */}
      <div className="animate-slide-up stagger-2">
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-gray-400" />
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase">
            Players ({state.players.length})
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {state.players.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center justify-between px-5 py-3.5 bg-white rounded-xl border border-gray-200
                         ${!p.isConnected ? "opacity-40" : ""} animate-slide-up`}
              style={{ animationDelay: `${0.05 * i}s` }}
            >
              <span className="font-semibold text-base text-gray-800 tracking-wide">
                {p.name}
                {p.id === playerId && (
                  <span className="ml-2 text-xs text-indigo-500 font-bold">YOU</span>
                )}
              </span>
              {p.isHost && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-bold tracking-wider">
                  HOST
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-4 animate-slide-up stagger-3 pb-6">
        {isHost ? (
          <button
            onClick={() => send({ type: "START_GAME" })}
            disabled={!canStart}
            className={`w-full py-4.5 rounded-2xl font-bold text-lg tracking-wider transition-all
              ${canStart
                ? "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] shadow-lg shadow-indigo-200 cursor-pointer"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
          >
            {canStart ? "START GAME" : `NEED ${4 - state.players.length} MORE`}
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
    </div>
  );
}
