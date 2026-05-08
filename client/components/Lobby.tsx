import React from "react";
import { Copy, LogOut, Users, Settings } from "react-feather";
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

  const copyCode = () => {
    navigator.clipboard.writeText(state.roomCode);
  };

  return (
    <div className="flex flex-col gap-6 pt-6 animate-fade-in">
      {/* Room Code */}
      <div className="text-center">
        <p className="text-xs text-gray-500 tracking-widest uppercase font-semibold">Room Code</p>
        <button
          onClick={copyCode}
          className="group flex items-center justify-center gap-2 mx-auto mt-2 cursor-pointer"
        >
          <span className="text-5xl font-extrabold tracking-[0.25em] text-indigo-600">
            {state.roomCode}
          </span>
          <Copy size={18} className="text-gray-400 group-hover:text-indigo-500 transition-colors mt-1" />
        </button>
        <p className="text-xs text-gray-400 mt-1">tap to copy</p>
      </div>

      {/* Mode Toggle */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 animate-slide-up stagger-1">
        <div className="flex items-center gap-2 mb-3">
          <Settings size={14} className="text-gray-400" />
          <span className="text-xs text-gray-500 tracking-wider font-semibold uppercase">Game Mode</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => isHost && send({ type: "UPDATE_SETTINGS", settings: { mode: "IMPOSTOR" } })}
            className={`flex-1 py-2.5 rounded-lg font-bold text-sm tracking-wider transition-all
              ${state.settings.mode === "IMPOSTOR"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              } ${!isHost ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >
            IMPOSTOR
          </button>
          <button
            onClick={() => isHost && send({ type: "UPDATE_SETTINGS", settings: { mode: "SPYFALL" } })}
            className={`flex-1 py-2.5 rounded-lg font-bold text-sm tracking-wider transition-all
              ${state.settings.mode === "SPYFALL"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              } ${!isHost ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >
            SPYFALL
          </button>
        </div>

        {isHost && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500 tracking-wider">Round time (sec)</span>
              <input
                type="number"
                value={state.settings.roundDurationSec}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v >= 30 && v <= 600) send({ type: "UPDATE_SETTINGS", settings: { roundDurationSec: v } });
                }}
                className="w-20 text-center bg-gray-100 border border-gray-200 rounded-lg py-1.5 text-sm font-semibold
                           outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            {state.settings.mode === "IMPOSTOR" && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 tracking-wider">Descriptor rounds</span>
                <input
                  type="number"
                  value={state.settings.descriptorRounds}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (v >= 1 && v <= 5) send({ type: "UPDATE_SETTINGS", settings: { descriptorRounds: v } });
                  }}
                  className="w-20 text-center bg-gray-100 border border-gray-200 rounded-lg py-1.5 text-sm font-semibold
                             outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Players */}
      <div className="animate-slide-up stagger-2">
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-gray-400" />
          <span className="text-xs text-gray-500 tracking-wider font-semibold uppercase">
            Players ({state.players.length})
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {state.players.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center justify-between px-4 py-2.5 bg-white rounded-lg border border-gray-200
                         ${!p.isConnected ? "opacity-40" : ""} animate-slide-up`}
              style={{ animationDelay: `${0.05 * i}s` }}
            >
              <span className="font-semibold text-sm text-gray-800 tracking-wide">
                {p.name}
                {p.id === playerId && (
                  <span className="ml-1.5 text-xs text-indigo-500 font-bold">YOU</span>
                )}
              </span>
              {p.isHost && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold tracking-wider">
                  HOST
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 animate-slide-up stagger-3">
        {isHost ? (
          <button
            onClick={() => send({ type: "START_GAME" })}
            disabled={!canStart}
            className={`w-full py-4 rounded-xl font-bold text-base tracking-wider transition-all
              ${canStart
                ? "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] shadow-lg shadow-indigo-200"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
          >
            {canStart ? "START GAME" : `NEED ${4 - state.players.length} MORE`}
          </button>
        ) : (
          <p className="text-center text-sm text-gray-400 italic tracking-wide py-4">
            Waiting for host to start...
          </p>
        )}

        <button
          onClick={() => {
            send({ type: "LEAVE_ROOM" });
            clearSession();
          }}
          className="flex items-center justify-center gap-2 py-2 text-sm text-red-500 font-semibold tracking-wider
                     hover:text-red-600 transition-colors cursor-pointer"
        >
          <LogOut size={14} />
          LEAVE ROOM
        </button>
      </div>
    </div>
  );
}
