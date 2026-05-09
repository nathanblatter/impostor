import React, { useState } from "react";
import { Clock, Moon, Sun, Skull, Shield, Search, Users, Volume2, CheckCircle, Cpu } from "react-feather";
import { useTimer } from "../useTimer.js";
import { unlockAudio, isAudioUnlocked } from "../useAudio.js";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState, MafiaState } from "../../shared/types.js";

interface Props {
  state: GameState;
  playerId: string;
  send: (msg: ClientMessage) => void;
}

export default function MafiaPlaying({ state, playerId, send }: Props) {
  const mafia = state.round?.mafia;
  if (!mafia) return null;

  return (
    <div className="flex flex-col gap-6 pt-5 animate-fade-in">
      <AudioUnlock />
      {mafia.phase === "NIGHT" && <NightPhase mafia={mafia} state={state} playerId={playerId} send={send} />}
      {mafia.phase === "NARRATION" && <NarrationPhase mafia={mafia} state={state} playerId={playerId} />}
      {mafia.phase === "DAY" && <DayPhase mafia={mafia} state={state} playerId={playerId} send={send} />}
      {mafia.phase === "DAY_VOTE" && <DayVotePhase mafia={mafia} state={state} playerId={playerId} send={send} />}
      {mafia.phase === "GAME_OVER" && <GameOverPhase mafia={mafia} state={state} playerId={playerId} send={send} />}
    </div>
  );
}

function AudioUnlock() {
  const [unlocked, setUnlocked] = useState(isAudioUnlocked());
  if (unlocked) return null;

  return (
    <button
      onClick={() => { unlockAudio(); setUnlocked(true); }}
      className="w-full py-3 bg-gray-800 text-white font-bold text-sm tracking-wider rounded-xl
                 flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-700 transition-colors"
    >
      <Volume2 size={16} />
      ENABLE NARRATION AUDIO
    </button>
  );
}

function RoleCard({ mafia }: { mafia: MafiaState }) {
  const roleInfo: Record<string, { label: string; color: string; bg: string; border: string; desc: string }> = {
    MAFIA: { label: "MAFIA", color: "text-red-600", bg: "bg-red-50", border: "border-red-300", desc: "Eliminate the town. Choose someone to kill each night." },
    DOCTOR: { label: "DOCTOR", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-300", desc: "Save someone each night. You can save yourself." },
    DETECTIVE: { label: "DETECTIVE", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-300", desc: "Investigate one player each night to learn if they're mafia." },
    CIVILIAN: { label: "CIVILIAN", color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-300", desc: "Find and vote out the mafia during the day." },
  };
  const info = roleInfo[mafia.myRole];

  return (
    <div className={`rounded-2xl border-2 ${info.border} ${info.bg} p-5 text-center`}>
      <h2 className={`text-lg font-extrabold ${info.color} tracking-wider`}>{info.label}</h2>
      <p className="text-sm text-gray-600 mt-1">{info.desc}</p>
      {mafia.fellowMafia.length > 0 && (
        <p className="text-sm text-red-500 mt-2 font-semibold">
          Partners: {mafia.fellowMafia.join(", ")}
        </p>
      )}
    </div>
  );
}

function PlayerList({ mafia, state, playerId }: { mafia: MafiaState; state: GameState; playerId: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {state.players.map((p) => {
        const alive = mafia.alivePlayers.includes(p.id);
        const dead = mafia.deadPlayers.find((d) => d.id === p.id);
        return (
          <div key={p.id} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border
            ${alive ? "bg-white border-gray-200" : "bg-gray-100 border-gray-200 opacity-50"}`}>
            <span className={`text-sm font-semibold tracking-wide ${alive ? "text-gray-700" : "text-gray-400 line-through"}`}>
              {p.name}
              {p.id === playerId && <span className="ml-1.5 text-xs text-indigo-500 font-bold">YOU</span>}
            </span>
            {dead && (
              <span className="text-xs text-gray-400 font-bold tracking-wider">{dead.role}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NightPhase({ mafia, state, playerId, send }: Props & { mafia: MafiaState }) {
  const { secondsLeft, display } = useTimer(state.round?.timerEndsAt);
  const isAlive = mafia.alivePlayers.includes(playerId);
  const canAct = isAlive && !mafia.hasActed && mafia.myRole !== "CIVILIAN";

  const rolePrompt: Record<string, string> = {
    MAFIA: "Choose someone to eliminate",
    DOCTOR: "Choose someone to protect",
    DETECTIVE: "Choose someone to investigate",
    CIVILIAN: "Close your eyes... wait for morning",
  };

  return (
    <>
      <div className="text-center">
        <div className="inline-block px-8 py-3 rounded-full font-bold text-2xl tabular-nums tracking-wider bg-gray-800 text-white">
          <Moon size={16} className="inline -mt-0.5 mr-2 opacity-60" />
          {display}
        </div>
      </div>

      <div className="text-center animate-pop-in">
        <h2 className="text-2xl font-extrabold tracking-wider text-gray-800">NIGHT {mafia.dayNumber}</h2>
        <p className="text-base text-gray-500 mt-2">{rolePrompt[mafia.myRole]}</p>
      </div>

      <RoleCard mafia={mafia} />

      {mafia.investigationResult && (
        <div className={`rounded-xl border-2 p-4 text-center animate-pop-in ${
          mafia.investigationResult === "MAFIA" ? "bg-red-50 border-red-300" : "bg-emerald-50 border-emerald-300"
        }`}>
          <Search size={16} className="inline -mt-0.5 mr-1.5 opacity-60" />
          <span className="text-sm font-bold tracking-wider">
            Last investigation: {mafia.investigationResult}
          </span>
        </div>
      )}

      {canAct && (
        <div className="flex flex-col gap-2 animate-slide-up stagger-1">
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase">Choose a target</span>
          {state.players
            .filter((p) => mafia.alivePlayers.includes(p.id) && p.id !== playerId)
            .map((p) => (
              <button
                key={p.id}
                onClick={() => send({ type: "MAFIA_ACTION", targetId: p.id })}
                className="w-full px-5 py-4 bg-white border-2 border-gray-200 rounded-xl font-bold text-base
                           tracking-wider text-gray-800 hover:border-gray-800 hover:bg-gray-50
                           active:scale-[0.98] transition-all cursor-pointer"
              >
                {p.name}
              </button>
            ))}
          {mafia.myRole === "DOCTOR" && (
            <button
              onClick={() => send({ type: "MAFIA_ACTION", targetId: playerId })}
              className="w-full px-5 py-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl font-bold text-base
                         tracking-wider text-emerald-700 hover:bg-emerald-100
                         active:scale-[0.98] transition-all cursor-pointer"
            >
              <Shield size={16} className="inline -mt-0.5 mr-2" />
              Protect Yourself
            </button>
          )}
        </div>
      )}

      {mafia.hasActed && isAlive && mafia.myRole !== "CIVILIAN" && (
        <p className="text-center text-base text-gray-400 italic tracking-wide">
          Action submitted. Waiting for others...
        </p>
      )}

      {(!isAlive || mafia.myRole === "CIVILIAN") && (
        <p className="text-center text-base text-gray-400 italic tracking-wide py-4">
          {!isAlive ? "You are dead. Watch the game unfold..." : "The night is dark. Wait for morning..."}
        </p>
      )}
    </>
  );
}

function NarrationPhase({ mafia, state, playerId }: { mafia: MafiaState; state: GameState; playerId: string }) {
  return (
    <>
      <div className="text-center animate-pop-in py-4">
        <Sun size={32} className="text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-extrabold tracking-wider text-gray-800 mb-4">
          {mafia.dayNumber === 1 ? "DAWN BREAKS" : `DAY ${mafia.dayNumber}`}
        </h2>
        {mafia.narrationText ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-left animate-fade-in">
            <p className="text-base text-gray-800 leading-relaxed italic">
              "{mafia.narrationText}"
            </p>
          </div>
        ) : (
          <p className="text-base text-gray-400 animate-pulse tracking-wide">
            The narrator is speaking...
          </p>
        )}
      </div>

      <RoleCard mafia={mafia} />

      {mafia.deadPlayers.length > 0 && (
        <div>
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase mb-2 block">Fallen</span>
          {mafia.deadPlayers.map((d) => (
            <div key={d.id} className="flex justify-between items-center px-4 py-2.5 bg-gray-100 rounded-xl border border-gray-200 mb-1">
              <span className="text-sm text-gray-500 line-through">{d.name}</span>
              <span className="text-xs font-bold text-gray-400 tracking-wider">{d.role}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function DayPhase({ mafia, state, playerId, send }: Props & { mafia: MafiaState }) {
  const { secondsLeft, display } = useTimer(state.round?.timerEndsAt);
  const isAlive = mafia.alivePlayers.includes(playerId);
  const isReady = mafia.hasActed;

  return (
    <>
      <div className="text-center">
        <div className={`inline-block px-8 py-3 rounded-full font-bold text-2xl tabular-nums tracking-wider
          ${secondsLeft < 30 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}`}>
          <Sun size={16} className="inline -mt-0.5 mr-2 opacity-60" />
          {display}
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-extrabold tracking-wider text-gray-800">DAY {mafia.dayNumber}</h2>
        <p className="text-base text-gray-500 mt-2">Discuss who you think is mafia</p>
      </div>

      {mafia.narrationText && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-gray-700 italic">"{mafia.narrationText}"</p>
        </div>
      )}

      <RoleCard mafia={mafia} />

      {mafia.investigationResult && mafia.myRole === "DETECTIVE" && (
        <div className={`rounded-xl border-2 p-4 text-center ${
          mafia.investigationResult === "MAFIA" ? "bg-red-50 border-red-300" : "bg-emerald-50 border-emerald-300"
        }`}>
          <Search size={16} className="inline -mt-0.5 mr-1.5" />
          <span className="text-sm font-bold tracking-wider">
            Investigation result: {mafia.investigationResult}
          </span>
        </div>
      )}

      {/* AI Directives */}
      {mafia.aiDirectives.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <Cpu size={16} className="text-amber-600" />
            <span className="text-sm font-bold text-amber-600 tracking-wider">AI HARD MODE — YOUR DIRECTIVES</span>
          </div>
          <p className="text-xs text-amber-600/70 mb-3 tracking-wide">Work ALL of these into the discussion naturally</p>
          <div className="flex flex-col gap-2">
            {mafia.aiDirectives.map((d: string, i: number) => (
              <div key={i} className="flex gap-3 items-start bg-white/60 rounded-xl px-4 py-3">
                <span className="flex-shrink-0 w-6 h-6 bg-amber-200 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </span>
                <span className="text-sm text-gray-700 font-medium leading-snug">{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <PlayerList mafia={mafia} state={state} playerId={playerId} />

      {isAlive && !isReady ? (
        <button
          onClick={() => send({ type: "READY_TO_VOTE" })}
          className="w-full py-4 bg-amber-400 text-gray-900 font-bold text-base tracking-wider rounded-2xl
                     hover:bg-amber-500 active:scale-[0.98] transition-all shadow-md cursor-pointer"
        >
          READY TO VOTE ({mafia.readyCount}/{mafia.totalAlive})
        </button>
      ) : isAlive ? (
        <p className="text-center text-base text-gray-400 italic tracking-wide">
          Waiting for others... ({mafia.readyCount}/{mafia.totalAlive})
        </p>
      ) : (
        <p className="text-center text-base text-gray-400 italic tracking-wide">
          You are dead. Watching...
        </p>
      )}
    </>
  );
}

function DayVotePhase({ mafia, state, playerId, send }: Props & { mafia: MafiaState }) {
  const { secondsLeft, display } = useTimer(state.round?.timerEndsAt);
  const isAlive = mafia.alivePlayers.includes(playerId);
  const hasVoted = mafia.hasActed;

  return (
    <>
      <div className="text-center">
        <div className={`inline-block px-8 py-3 rounded-full font-bold text-2xl tabular-nums tracking-wider
          ${secondsLeft < 10 ? "bg-red-100 text-red-700 animate-pulse" : "bg-gray-100 text-gray-700"}`}>
          <Clock size={16} className="inline -mt-0.5 mr-2 opacity-60" />
          {display}
        </div>
      </div>

      <div className="text-center animate-pop-in">
        <h2 className="text-2xl font-extrabold tracking-wider text-gray-800">VOTE</h2>
        <p className="text-base text-gray-500 mt-2">Who should be eliminated?</p>
      </div>

      {isAlive && !hasVoted ? (
        <div className="flex flex-col gap-3">
          {state.players
            .filter((p) => mafia.alivePlayers.includes(p.id) && p.id !== playerId)
            .map((p) => (
              <button
                key={p.id}
                onClick={() => send({ type: "CAST_VOTE", targetId: p.id })}
                className="w-full flex items-center justify-between px-6 py-5 rounded-2xl border-2
                           bg-white border-gray-200 text-gray-800 font-bold text-base tracking-wider
                           hover:border-red-400 hover:bg-red-50 active:scale-[0.98] transition-all cursor-pointer"
              >
                <span>{p.name}</span>
              </button>
            ))}
        </div>
      ) : isAlive ? (
        <p className="text-center text-base text-gray-400 italic tracking-wide">
          Vote cast. Waiting for others...
        </p>
      ) : (
        <p className="text-center text-base text-gray-400 italic tracking-wide">
          You are dead. Watching...
        </p>
      )}

      <div className="flex flex-wrap gap-2 justify-center">
        {state.players.filter(p => mafia.alivePlayers.includes(p.id)).map((p) => (
          <span key={p.id} className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wider
            ${p.hasVoted ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-500"}`}>
            {p.name}
          </span>
        ))}
      </div>
    </>
  );
}

function GameOverPhase({ mafia, state, playerId, send }: Props & { mafia: MafiaState }) {
  const me = state.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;

  return (
    <>
      <div className="text-center animate-pop-in py-4">
        <h2 className="text-3xl font-extrabold tracking-wider text-gray-800 mb-2">
          {mafia.winner === "TOWN" ? "TOWN WINS!" : "MAFIA WINS!"}
        </h2>
        {mafia.narrationText && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mt-4">
            <p className="text-base text-gray-800 leading-relaxed italic">"{mafia.narrationText}"</p>
          </div>
        )}
      </div>

      {mafia.allRoles && (
        <div>
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase mb-3 block">All Roles Revealed</span>
          <div className="flex flex-col gap-1.5">
            {mafia.allRoles.map((p) => {
              const alive = mafia.alivePlayers.includes(p.id);
              const roleColor = p.role === "MAFIA" ? "text-red-600" : p.role === "DOCTOR" ? "text-emerald-600" : p.role === "DETECTIVE" ? "text-blue-600" : "text-gray-600";
              return (
                <div key={p.id} className={`flex justify-between items-center px-5 py-3 rounded-xl border
                  ${alive ? "bg-white border-gray-200" : "bg-gray-100 border-gray-200 opacity-60"}`}>
                  <span className={`text-base font-semibold ${alive ? "text-gray-800" : "text-gray-400 line-through"}`}>
                    {p.name}
                    {p.id === playerId && <span className="ml-2 text-xs text-indigo-500 font-bold">YOU</span>}
                  </span>
                  <span className={`font-bold text-sm tracking-wider ${roleColor}`}>{p.role}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isHost && (
        <div className="flex flex-col gap-3 mt-4">
          <button
            onClick={() => send({ type: "NEXT_ROUND" })}
            className="w-full py-4 bg-indigo-600 text-white font-bold text-base tracking-wider rounded-2xl
                       hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200 cursor-pointer"
          >
            PLAY AGAIN
          </button>
          <button
            onClick={() => send({ type: "RETURN_TO_LOBBY" })}
            className="w-full py-3.5 bg-gray-200 text-gray-600 font-bold text-base tracking-wider rounded-2xl
                       hover:bg-gray-300 active:scale-[0.98] transition-all cursor-pointer"
          >
            BACK TO LOBBY
          </button>
        </div>
      )}
    </>
  );
}
