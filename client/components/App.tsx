import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "../useSocket.js";
import Home from "./Home.js";
import Lobby from "./Lobby.js";
import Playing from "./Playing.js";
import Voting from "./Voting.js";
import SpyGuess from "./SpyGuess.js";
import Results from "./Results.js";
import BonusPlaying from "./BonusPlaying.js";
import BugReport from "./BugReport.js";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState } from "../../shared/types.js";
import type { ReactionEvent } from "../useSocket.js";

const REACTION_EMOJIS = ["😂", "🤔", "😱", "👀", "🔥", "💀"];
const GAME_PHASES = new Set(["PLAYING", "VOTING", "SPY_GUESS", "RESULTS", "BONUS"]);

interface FloatingReaction extends ReactionEvent {
  x: number; // 5–80 (left %)
}

function ReactionsOverlay({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="absolute bottom-20 animate-float-up flex flex-col items-center gap-0.5"
          style={{ left: `${r.x}%` }}
        >
          <span className="text-3xl drop-shadow-md">{r.emoji}</span>
          <span
            className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded-full text-white whitespace-nowrap"
            style={{ backgroundColor: r.color }}
          >
            {r.playerName}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmojiBar({ send, cooldowns, onTap }: {
  send: (msg: ClientMessage) => void;
  cooldowns: Set<string>;
  onTap: (emoji: string) => void;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 pb-safe">
      <div className="flex justify-center gap-1 px-4 py-2 bg-white/90 backdrop-blur-sm border-t border-gray-200">
        {REACTION_EMOJIS.map((emoji) => {
          const cooling = cooldowns.has(emoji);
          return (
            <button
              key={emoji}
              onClick={() => { if (!cooling) { send({ type: "REACT", emoji }); onTap(emoji); } }}
              className={`text-2xl px-3 py-2 rounded-xl transition-all active:scale-125
                ${cooling ? "opacity-30" : "hover:bg-gray-100 cursor-pointer"}`}
            >
              {emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const { gameState, playerId, error, send, clearSession, connected, lastReaction } = useSocket();
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [cooldowns, setCooldowns] = useState<Set<string>>(new Set());

  // Spawn floating emoji when a reaction arrives
  useEffect(() => {
    if (!lastReaction) return;
    const floating: FloatingReaction = { ...lastReaction, x: 5 + Math.random() * 75 };
    setFloatingReactions((prev) => [...prev, floating]);
    const t = setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== floating.id));
    }, 2600);
    return () => clearTimeout(t);
  }, [lastReaction]);

  // Per-emoji 1.5s cooldown after tapping (visual debounce)
  const handleEmojiTap = (emoji: string) => {
    setCooldowns((prev) => new Set([...prev, emoji]));
    setTimeout(() => setCooldowns((prev) => { const n = new Set(prev); n.delete(emoji); return n; }), 1500);
  };

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
        if (gameState.mode === "MAFIA" || gameState.mode === "FINGER_POINT" || gameState.mode === "TOUCHY_SUBJECTS" || gameState.mode === "TRIGGER" || gameState.mode === "SCALE" || gameState.mode === "CODENAMES") return <Playing {...props} />;
        return <Results {...props} />;
      case "BONUS":
        return <BonusPlaying {...props} />;
    }
  })();

  const showSpectatorBar = gameState?.isSpectator && gameState.phase !== "LOBBY";
  const showEmojiBar = !!gameState && GAME_PHASES.has(gameState.phase);

  return (
    <div
      className="min-h-dvh flex flex-col items-center px-4 pt-4"
      style={{
        paddingTop: showSpectatorBar ? undefined : "max(1rem, env(safe-area-inset-top))",
        paddingBottom: showEmojiBar ? "calc(3.5rem + env(safe-area-inset-bottom))" : "env(safe-area-inset-bottom)",
      }}
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

      <ReactionsOverlay reactions={floatingReactions} />
      {showEmojiBar && <EmojiBar send={send} cooldowns={cooldowns} onTap={handleEmojiTap} />}
      {!gameState && <BugReport />}
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
