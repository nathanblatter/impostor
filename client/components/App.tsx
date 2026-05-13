import React, { useEffect, useRef } from "react";
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

  // Update document title based on game state
  useEffect(() => {
    if (!gameState) { document.title = "Impostor"; return; }
    const mode = gameState.mode.replace(/_/g, " ");
    const phaseLabel: Record<string, string> = {
      LOBBY: "Lobby", PLAYING: "Playing", VOTING: "Vote",
      SPY_GUESS: "Spy Guess", RESULTS: "Results", BONUS: "Bonus Stars",
    };
    document.title = `${mode} — ${phaseLabel[gameState.phase] ?? gameState.phase}`;
  }, [gameState?.phase, gameState?.mode]);

  // Scroll to top on every phase change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [gameState?.phase]);

  // Wake Lock — keep screen on during active gameplay
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    const active = gameState && gameState.phase !== "LOBBY";
    if (active && "wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then((l) => { wakeLockRef.current = l; }).catch(() => {});
    } else {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, [gameState?.phase]);

  // Re-acquire wake lock after visibility change (required by spec)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && gameState?.phase !== "LOBBY" && "wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then((l) => { wakeLockRef.current = l; }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [gameState?.phase]);

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

  const showSpectatorBar = gameState?.isSpectator && gameState.phase !== "LOBBY";

  return (
    <div
      className="min-h-dvh flex flex-col items-center px-4 pt-4 pb-safe"
      style={{ paddingTop: showSpectatorBar ? undefined : "max(1rem, env(safe-area-inset-top))" }}
    >
      {/* Reconnect overlay — full-screen block when disconnected mid-game */}
      {!connected && gameState && (
        <div className="fixed inset-0 z-50 bg-gray-900/85 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white font-bold tracking-widest text-sm uppercase">Reconnecting...</p>
        </div>
      )}

      {/* Thin bar when disconnected on home screen */}
      {!connected && !gameState && (
        <div className="fixed top-0 left-0 right-0 pt-safe bg-red-500 text-white text-center py-1.5 text-xs font-semibold tracking-wider z-50">
          CONNECTING...
        </div>
      )}

      {/* Spectator bar */}
      {showSpectatorBar && (
        <div className="fixed top-0 left-0 right-0 pt-safe bg-gray-800 text-white text-center py-1.5 text-xs font-bold tracking-widest z-40">
          SPECTATING
        </div>
      )}
      {showSpectatorBar && <div className="h-7 w-full flex-shrink-0 pt-safe" />}

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
