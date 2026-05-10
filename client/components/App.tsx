import React from "react";
import { useSocket } from "../useSocket.js";
import Home from "./Home.js";
import Lobby from "./Lobby.js";
import Playing from "./Playing.js";
import Voting from "./Voting.js";
import SpyGuess from "./SpyGuess.js";
import Results from "./Results.js";
import type { ClientMessage } from "../../shared/messages.js";

export default function App() {
  const { gameState, playerId, error, send, clearSession, connected } = useSocket();

  const screen = (() => {
    if (!gameState) {
      return <Home send={send} error={error} />;
    }

    const props = { state: gameState, playerId: playerId!, send };

    switch (gameState.phase) {
      case "LOBBY":
        return <Lobby {...props} clearSession={clearSession} />;
      case "PLAYING":
        return <Playing {...props} />;
      case "VOTING":
        return <Voting {...props} />;
      case "SPY_GUESS":
        return <SpyGuess {...props} />;
      case "RESULTS":
        if (gameState.mode === "MAFIA" || gameState.mode === "FINGER_POINT" || gameState.mode === "TOUCHY_SUBJECTS") return <Playing {...props} />;
        return <Results {...props} />;
    }
  })();

  return (
    <div className="min-h-dvh flex flex-col items-center p-4">
      {!connected && (
        <div className="fixed top-0 left-0 right-0 bg-red-500 text-white text-center py-1 text-xs font-semibold tracking-wider z-50">
          RECONNECTING...
        </div>
      )}
      <div className="w-full max-w-md">
        {screen}
      </div>
    </div>
  );
}
