import React from "react";
import { useSocket } from "../useSocket.js";
import Home from "./Home.js";
import Lobby from "./Lobby.js";
import Playing from "./Playing.js";
import Voting from "./Voting.js";
import SpyGuess from "./SpyGuess.js";
import Results from "./Results.js";
import BonusPlaying from "./BonusPlaying.js";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState } from "../../shared/types.js";

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
        if (gameState.mode === "MAFIA" || gameState.mode === "FINGER_POINT" || gameState.mode === "TOUCHY_SUBJECTS" || gameState.mode === "TRIGGER") return <Playing {...props} />;
        return <Results {...props} />;
      case "BONUS":
        return <BonusPlaying {...props} />;
    }
  })();

  return (
    <div className="min-h-dvh flex flex-col items-center p-4">
      {!connected && (
        <div className="fixed top-0 left-0 right-0 bg-red-500 text-white text-center py-1 text-xs font-semibold tracking-wider z-50">
          RECONNECTING...
        </div>
      )}
      {gameState?.isSpectator && gameState.phase !== "LOBBY" && (
        <div className="fixed top-0 left-0 right-0 bg-gray-800 text-white text-center py-1.5 text-xs font-bold tracking-widest z-50">
          SPECTATING
        </div>
      )}
      <div className="w-full max-w-md">
        {gameState?.isSpectator && gameState.spectatorReveal && gameState.phase !== "LOBBY" && (
          <SpectatorRevealBanner state={gameState} />
        )}
        {screen}
      </div>
    </div>
  );
}

function SpectatorRevealBanner({ state }: { state: GameState }) {
  const reveal = state.spectatorReveal!;
  const players = state.players.filter((p) => !p.isSpectator);

  const lines: string[] = [];
  if (reveal.spyId) {
    const spy = players.find((p) => p.id === reveal.spyId);
    if (spy) lines.push(`Spy: ${spy.name}`);
  }
  if (reveal.impostorIds.length > 0) {
    const names = reveal.impostorIds.map((id) => players.find((p) => p.id === id)?.name).filter(Boolean);
    if (names.length) lines.push(`Impostor: ${names.join(", ")}`);
  }
  if (reveal.fakerId) {
    const faker = players.find((p) => p.id === reveal.fakerId);
    if (faker) lines.push(`Faker: ${faker.name}`);
  }
  if (reveal.oddPlayerId) {
    const odd = players.find((p) => p.id === reveal.oddPlayerId);
    if (odd) lines.push(`Odd one out: ${odd.name}`);
  }
  if (reveal.mafiaRoles.length > 0) {
    const roleLines = reveal.mafiaRoles.map((r) => `${r.playerName}: ${r.role}`).join(", ");
    lines.push(roleLines);
  }

  if (!lines.length) return null;

  return (
    <div className="mb-4 mt-6 bg-gray-800 text-white rounded-xl px-4 py-3 text-xs font-semibold tracking-wide">
      <p className="text-gray-400 uppercase tracking-widest text-xs mb-1.5">Secret Roles</p>
      {lines.map((l, i) => <p key={i} className="text-white">{l}</p>)}
    </div>
  );
}
