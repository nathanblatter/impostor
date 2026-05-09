import React from "react";
import { Clock, Target, CheckCircle, Cpu, Send, Award, RotateCcw, Home, ArrowRight } from "react-feather";
import { useTimer } from "../useTimer.js";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState, FingerPointState } from "../../shared/types.js";

interface Props {
  state: GameState;
  playerId: string;
  send: (msg: ClientMessage) => void;
}

export default function FingerPointPlaying({ state, playerId, send }: Props) {
  const fp = state.round?.fingerPoint;
  if (!fp) return null;

  return (
    <div className="flex flex-col gap-6 pt-5 animate-fade-in">
      {fp.subPhase === "PICKING" && <PickingPhase fp={fp} state={state} playerId={playerId} send={send} />}
      {fp.subPhase === "DISCUSSION" && <DiscussionPhase fp={fp} state={state} playerId={playerId} send={send} />}
      {fp.subPhase === "VOTING" && <VotingPhase fp={fp} state={state} playerId={playerId} send={send} />}
      {fp.subPhase === "GAME_OVER" && <GameOverPhase fp={fp} state={state} playerId={playerId} send={send} />}
    </div>
  );
}

function PickingPhase({ fp, state, playerId, send }: Props & { fp: FingerPointState }) {
  const { secondsLeft, display } = useTimer(state.round?.timerEndsAt);
  const isEliminated = fp.eliminated.includes(playerId);

  // Check for AI pick target
  const aiTarget = state.round?.fingerPoint
    ? null // AI target comes from server enforcement, not displayed ahead of time
    : null;

  return (
    <>
      <div className="text-center">
        <div className={`inline-block px-8 py-3 rounded-full font-bold text-2xl tabular-nums tracking-wider
          ${secondsLeft < 10 ? "bg-red-100 text-red-700 animate-pulse" : "bg-gray-100 text-gray-700"}`}>
          <Clock size={16} className="inline -mt-0.5 mr-2 opacity-60" />
          {display}
        </div>
      </div>

      <div className="text-center">
        <span className="text-xs text-gray-500 tracking-widest font-semibold">
          ROUND {fp.promptRound} / {fp.totalRounds}
        </span>
      </div>

      {/* Prompt Card */}
      <div className={`rounded-2xl border-2 p-7 text-center animate-pop-in ${
        fp.isFaker ? "bg-red-50 border-red-300" : "bg-teal-50 border-teal-300"
      }`}>
        <div className="flex items-center justify-center gap-2 mb-3">
          <Target size={18} className={fp.isFaker ? "text-red-500" : "text-teal-500"} />
          <h2 className={`text-sm font-bold tracking-wider uppercase ${
            fp.isFaker ? "text-red-600" : "text-teal-600"
          }`}>
            {fp.isFaker ? "YOUR SECRET PROMPT" : "POINT AT SOMEONE"}
          </h2>
        </div>
        <p className="text-xl font-extrabold text-gray-800 leading-snug">{fp.prompt}</p>
        {fp.isFaker && (
          <p className="text-xs text-red-500 mt-3 tracking-wider font-semibold">
            You're the faker! Others have a different prompt. Blend in!
          </p>
        )}
      </div>

      {/* Pick buttons */}
      {!isEliminated && !fp.hasPicked && (
        <div className="flex flex-col gap-2 animate-slide-up stagger-1">
          {state.players
            .filter((p) => p.id !== playerId && !fp.eliminated.includes(p.id))
            .map((p) => (
              <button
                key={p.id}
                onClick={() => send({ type: "FINGER_POINT_PICK", targetId: p.id })}
                className="w-full px-5 py-4 bg-white border-2 border-gray-200 rounded-xl font-bold text-base
                           tracking-wider text-gray-800 hover:border-teal-400 hover:bg-teal-50
                           active:scale-[0.98] transition-all cursor-pointer"
              >
                {p.name}
              </button>
            ))}
        </div>
      )}

      {fp.hasPicked && !isEliminated && (
        <p className="text-center text-base text-gray-400 italic tracking-wide py-3">
          Waiting for others to point...
        </p>
      )}

      {isEliminated && (
        <p className="text-center text-base text-gray-400 italic tracking-wide py-3">
          You've been eliminated. Watching...
        </p>
      )}

      {/* Status dots */}
      <div className="flex flex-wrap gap-2 justify-center">
        {state.players.filter(p => !fp.eliminated.includes(p.id)).map((p) => (
          <span key={p.id} className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wider
            ${p.hasVoted ? "bg-teal-500 text-white" : "bg-gray-200 text-gray-500"}`}>
            {p.name}
          </span>
        ))}
      </div>
    </>
  );
}

function DiscussionPhase({ fp, state, playerId, send }: Props & { fp: FingerPointState }) {
  const { secondsLeft, display } = useTimer(state.round?.timerEndsAt);
  const isEliminated = fp.eliminated.includes(playerId);
  const isVoteRound = fp.promptRound % 2 === 0;

  return (
    <>
      <div className="text-center">
        <div className={`inline-block px-8 py-3 rounded-full font-bold text-2xl tabular-nums tracking-wider
          ${secondsLeft < 10 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}`}>
          <Clock size={16} className="inline -mt-0.5 mr-2 opacity-60" />
          {display}
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-xl font-extrabold tracking-wider text-gray-800">WHO POINTED WHERE?</h2>
        <p className="text-sm text-gray-500 mt-1 tracking-wide">
          Round {fp.promptRound} / {fp.totalRounds}
          {isVoteRound && " — Vote coming up!"}
        </p>
      </div>

      {/* Show picks */}
      {fp.picks && (
        <div className="flex flex-col gap-2 animate-slide-up stagger-1">
          {fp.picks.map((p) => (
            <div key={p.playerId} className="flex items-center justify-center gap-3 px-5 py-3 bg-white rounded-xl border border-gray-200 text-base">
              <span className="font-semibold text-gray-700">{p.playerName}</span>
              <ArrowRight size={14} className="text-gray-400" />
              <span className="font-bold text-teal-600">{p.pick}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-sm text-gray-500 tracking-wide">
        {isVoteRound
          ? "Discuss! Who's answering a different question? Vote next."
          : "Discuss why you pointed where you did!"}
      </p>

      {/* Ready button */}
      {!isEliminated && !fp.hasPicked ? (
        <button
          onClick={() => send({ type: "READY_TO_VOTE" })}
          className="w-full py-4 bg-teal-500 text-white font-bold text-base tracking-wider rounded-2xl
                     hover:bg-teal-600 active:scale-[0.98] transition-all shadow-md cursor-pointer"
        >
          {isVoteRound ? "READY TO VOTE" : "NEXT ROUND"}
        </button>
      ) : !isEliminated ? (
        <p className="text-center text-base text-gray-400 italic tracking-wide">
          Waiting for others...
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 justify-center">
        {state.players.filter(p => !fp.eliminated.includes(p.id)).map((p) => (
          <span key={p.id} className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wider
            ${p.hasVoted ? "bg-teal-500 text-white" : "bg-gray-200 text-gray-500"}`}>
            {p.name}
          </span>
        ))}
      </div>
    </>
  );
}

function VotingPhase({ fp, state, playerId, send }: Props & { fp: FingerPointState }) {
  const { secondsLeft, display } = useTimer(state.round?.timerEndsAt);
  const isEliminated = fp.eliminated.includes(playerId);

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
        <p className="text-base text-gray-500 mt-2">Who had the different prompt?</p>
      </div>

      {!isEliminated && !fp.hasPicked ? (
        <div className="flex flex-col gap-3">
          {state.players
            .filter((p) => p.id !== playerId && !fp.eliminated.includes(p.id))
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
      ) : !isEliminated ? (
        <p className="text-center text-base text-gray-400 italic tracking-wide">
          Waiting for others...
        </p>
      ) : (
        <p className="text-center text-base text-gray-400 italic tracking-wide">
          You're eliminated. Watching...
        </p>
      )}

      <div className="flex flex-wrap gap-2 justify-center">
        {state.players.filter(p => !fp.eliminated.includes(p.id)).map((p) => (
          <span key={p.id} className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wider
            ${p.hasVoted ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-500"}`}>
            {p.name}
          </span>
        ))}
      </div>
    </>
  );
}

function GameOverPhase({ fp, state, playerId, send }: Props & { fp: FingerPointState }) {
  const me = state.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const playerMap = new Map(state.players.map((p) => [p.id, p.name]));

  return (
    <>
      <div className="text-center animate-pop-in py-4">
        <h2 className="text-3xl font-extrabold tracking-wider text-gray-800 mb-2">
          {fp.winner === "TOWN" ? "FAKER CAUGHT!" : "FAKER WINS!"}
        </h2>
      </div>

      {/* Reveal all round prompts */}
      {fp.history.length > 0 && (
        <div className="flex flex-col gap-4">
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase">All Rounds</span>
          {fp.history.map((h) => (
            <div key={h.round} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex gap-2 mb-2">
                <span className="text-xs font-bold text-gray-400">R{h.round}</span>
                <div className="flex-1">
                  <p className="text-xs text-teal-600 font-semibold">{h.normalPrompt}</p>
                  <p className="text-xs text-red-500 font-semibold mt-0.5">Faker: {h.fakerPrompt}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {h.picks.map((p) => (
                  <span key={p.playerId} className="text-xs text-gray-500">
                    {p.playerName}→{p.pick}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Eliminated */}
      {fp.eliminated.length > 0 && (
        <div>
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase mb-2 block">Eliminated</span>
          <div className="flex flex-wrap gap-2">
            {fp.eliminated.map((id) => (
              <span key={id} className="px-3 py-1.5 bg-gray-200 text-gray-500 rounded-full text-xs font-bold tracking-wider line-through">
                {playerMap.get(id)}
              </span>
            ))}
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
            <RotateCcw size={16} className="inline -mt-0.5 mr-2" />
            PLAY AGAIN
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
      )}
    </>
  );
}
