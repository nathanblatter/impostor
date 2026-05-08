import React, { useState } from "react";
import type { ClientMessage } from "../../shared/messages.js";

interface Props {
  send: (msg: ClientMessage) => void;
  error: string | null;
}

export default function Home({ send, error }: Props) {
  const [name, setName] = useState(localStorage.getItem("playerName") || "");
  const [code, setCode] = useState("");

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem("playerName", trimmed);
    send({ type: "CREATE_ROOM", playerName: trimmed });
  };

  const handleJoin = () => {
    const trimmed = name.trim();
    const roomCode = code.trim().toUpperCase();
    if (!trimmed || !roomCode) return;
    localStorage.setItem("playerName", trimmed);
    send({ type: "JOIN_ROOM", roomCode, playerName: trimmed });
  };

  return (
    <div className="flex flex-col items-center gap-8 pt-24 animate-fade-in">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-wide text-gray-800">
          IMPOSTOR
        </h1>
        <p className="text-sm text-gray-500 tracking-wider mt-1">
          / SPYFALL
        </p>
      </div>

      <div className="w-full flex flex-col gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Your name"
          maxLength={20}
          autoFocus
          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-800 font-medium
                     placeholder:text-gray-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20
                     transition-all"
        />

        <button
          onClick={handleCreate}
          className="w-full py-3 bg-indigo-600 text-white font-bold tracking-wider rounded-lg
                     hover:bg-indigo-700 active:scale-[0.98] transition-all"
        >
          CREATE ROOM
        </button>

        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-gray-300" />
          <span className="text-xs text-gray-400 tracking-widest">OR</span>
          <div className="flex-1 h-px bg-gray-300" />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="ROOM CODE"
            maxLength={4}
            className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-800 font-bold
                       tracking-[0.3em] text-center uppercase placeholder:tracking-wider placeholder:font-medium
                       outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
          <button
            onClick={handleJoin}
            className="px-6 py-3 bg-gray-800 text-white font-bold tracking-wider rounded-lg
                       hover:bg-gray-700 active:scale-[0.98] transition-all"
          >
            JOIN
          </button>
        </div>
      </div>

      {error && (
        <div className="w-full text-center text-sm text-red-600 font-medium animate-fade-in">
          {error}
        </div>
      )}
    </div>
  );
}
