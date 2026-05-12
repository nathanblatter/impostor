import React, { useState, useEffect, useRef } from "react";
import type { ClientMessage } from "../../shared/messages.js";

interface Props {
  send: (msg: ClientMessage) => void;
  error: string | null;
}

export default function Home({ send, error }: Props) {
  const [name, setName] = useState(localStorage.getItem("playerName") || "");
  const [code, setCode] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  // Pre-fill room code from ?join=XXXX deep link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get("join");
    if (joinCode) {
      setCode(joinCode.toUpperCase());
      // Remove the param from the URL without a reload
      window.history.replaceState({}, "", window.location.pathname);
      // Focus name input so user can type their name right away
      nameRef.current?.focus();
    }
  }, []);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem("playerName", trimmed);
    send({ type: "CREATE_ROOM", playerName: trimmed });
  };

  const [asSpectator, setAsSpectator] = useState(false);

  const handleJoin = () => {
    const trimmed = name.trim();
    const roomCode = code.trim().toUpperCase();
    if (!trimmed || !roomCode) return;
    localStorage.setItem("playerName", trimmed);
    send({ type: "JOIN_ROOM", roomCode, playerName: trimmed, asSpectator });
  };

  return (
    <div className="flex flex-col items-center gap-10 pt-28 animate-fade-in">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-wide text-gray-800">
          IMPOSTOR
        </h1>
        <p className="text-base text-gray-500 tracking-wider mt-2">
          / SPYFALL
        </p>
      </div>

      <div className="w-full flex flex-col gap-4">
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Your name"
          maxLength={20}
          autoFocus
          className="w-full px-5 py-4 bg-white border border-gray-200 rounded-xl text-base text-gray-800 font-medium
                     placeholder:text-gray-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20
                     transition-all"
        />

        <button
          onClick={handleCreate}
          className="w-full py-4 bg-indigo-600 text-white font-bold text-base tracking-wider rounded-xl
                     hover:bg-indigo-700 active:scale-[0.98] transition-all cursor-pointer"
        >
          CREATE ROOM
        </button>

        <div className="flex items-center gap-4 my-2">
          <div className="flex-1 h-px bg-gray-300" />
          <span className="text-sm text-gray-400 tracking-widest">OR</span>
          <div className="flex-1 h-px bg-gray-300" />
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="CODE"
            maxLength={4}
            className="flex-1 px-5 py-4 bg-white border border-gray-200 rounded-xl text-base text-gray-800 font-bold
                       tracking-[0.3em] text-center uppercase placeholder:tracking-wider placeholder:font-medium
                       outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
          <button
            onClick={handleJoin}
            className="px-8 py-4 bg-gray-800 text-white font-bold text-base tracking-wider rounded-xl
                       hover:bg-gray-700 active:scale-[0.98] transition-all cursor-pointer"
          >
            JOIN
          </button>
        </div>

        <button
          onClick={() => setAsSpectator((v) => !v)}
          className={`w-full py-3 rounded-xl border-2 text-sm font-bold tracking-wider transition-all cursor-pointer
            ${asSpectator
              ? "bg-gray-100 border-gray-400 text-gray-700"
              : "border-gray-200 text-gray-400 hover:border-gray-300"
            }`}
        >
          {asSpectator ? "JOINING AS SPECTATOR (WATCH ONLY)" : "JOIN AS SPECTATOR"}
        </button>
      </div>

      {error && (
        <div className="w-full text-center text-base text-red-600 font-medium animate-fade-in">
          {error}
        </div>
      )}
    </div>
  );
}
