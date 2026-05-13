import React from "react";
import { Star, Award } from "react-feather";
import { useTimer } from "../useTimer.js";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState, BonusVoteState } from "../../shared/types.js";

interface Props {
  state: GameState;
  playerId: string;
  send: (msg: ClientMessage) => void;
}

const CATEGORY_ICONS = ["⭐", "🎭", "😂"];

export default function BonusPlaying({ state, playerId, send }: Props) {
  const bv = state.bonusVote!;
  const isHost = state.players.find((p) => p.id === playerId)?.isHost ?? false;
  const activePlayers = state.players.filter((p) => !p.isSpectator);

  if (bv.done) {
    return <FinalScreen bv={bv} activePlayers={activePlayers} playerId={playerId} isHost={isHost} send={send} />;
  }

  if (bv.revealPhase) {
    return <RevealScreen bv={bv} icon={CATEGORY_ICONS[bv.categoryIndex] ?? "⭐"} />;
  }

  return <VotingScreen bv={bv} activePlayers={activePlayers} playerId={playerId} isHost={isHost} send={send} icon={CATEGORY_ICONS[bv.categoryIndex] ?? "⭐"} />;
}

function VotingScreen({
  bv, activePlayers, playerId, isHost, send, icon,
}: {
  bv: BonusVoteState;
  activePlayers: { id: string; name: string; color: string; hasVoted: boolean }[];
  playerId: string;
  isHost: boolean;
  send: (msg: ClientMessage) => void;
  icon: string;
}) {
  const { secondsLeft, display } = useTimer(bv.timerEndsAt);
  const votablePlayers = activePlayers.filter((p) => p.id !== playerId);

  return (
    <div className="flex flex-col gap-6 pt-6 animate-fade-in">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Star size={16} className="text-amber-500" />
          <span className="text-xs font-bold text-amber-500 tracking-widest uppercase">
            Bonus Stars — {bv.categoryIndex + 1} of {bv.categories.length}
          </span>
        </div>
        <h2 className="text-2xl font-extrabold text-gray-800 tracking-wide">
          {icon} {bv.currentCategory}
        </h2>
        <p className="text-sm text-gray-400 mt-1">Vote for who deserves this star</p>
      </div>

      {/* Timer */}
      <div className="text-center">
        <span className={`inline-block px-6 py-2 rounded-full font-bold text-lg tabular-nums
          ${secondsLeft < 8 ? "bg-red-100 text-red-700 animate-pulse" : "bg-gray-100 text-gray-600"}`}>
          {display}
        </span>
      </div>

      {/* Vote buttons */}
      {bv.hasVoted ? (
        <div className="text-center text-gray-400 italic tracking-wide py-4">
          Waiting for others to vote...
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {votablePlayers.map((p) => (
            <button
              key={p.id}
              onClick={() => send({ type: "BONUS_VOTE", targetId: p.id })}
              className="flex items-center gap-3 w-full px-5 py-4 rounded-2xl bg-white border-2 border-gray-200
                         font-bold text-gray-800 tracking-wide text-base
                         hover:border-amber-400 hover:bg-amber-50 active:scale-[0.98] transition-all cursor-pointer"
            >
              <span
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Vote status */}
      <div className="flex flex-wrap gap-2 justify-center">
        {activePlayers.map((p) => (
          <span
            key={p.id}
            className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wider
              ${bv.votes[p.id] ? "text-white" : "bg-gray-100 text-gray-400"}`}
            style={bv.votes[p.id] ? { backgroundColor: p.color } : {}}
          >
            {p.name}
          </span>
        ))}
      </div>

      {/* Host skip */}
      {isHost && (
        <button
          onClick={() => send({ type: "FINISH_BONUS" })}
          className="text-xs text-gray-400 underline tracking-wide text-center cursor-pointer hover:text-gray-600"
        >
          Skip bonus stars
        </button>
      )}
    </div>
  );
}

function RevealScreen({ bv, icon }: { bv: BonusVoteState; icon: string }) {
  return (
    <div className="flex flex-col items-center gap-6 pt-10 animate-fade-in">
      <div className="text-center">
        <p className="text-xs font-bold text-amber-500 tracking-widest uppercase mb-2">{icon} {bv.currentCategory}</p>
        <p className="text-sm text-gray-400 mb-6">And the star goes to...</p>
        {bv.winner ? (
          <div className="animate-pop-in">
            <div className="text-6xl mb-3">{icon}</div>
            <h2 className="text-3xl font-extrabold text-gray-800 tracking-wide">{bv.winner.name}</h2>
            <p className="text-sm text-amber-500 font-bold mt-2 tracking-wider">+1 BONUS STAR</p>
          </div>
        ) : (
          <div className="animate-pop-in">
            <div className="text-4xl mb-3">🤝</div>
            <h2 className="text-xl font-bold text-gray-600">It's a tie!</h2>
            <p className="text-sm text-gray-400 mt-1">No star awarded</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FinalScreen({
  bv, activePlayers, playerId, isHost, send,
}: {
  bv: BonusVoteState;
  activePlayers: { id: string; name: string; color: string }[];
  playerId: string;
  isHost: boolean;
  send: (msg: ClientMessage) => void;
}) {
  const sorted = [...activePlayers]
    .map((p) => ({ ...p, bonus: bv.bonusPoints[p.id] ?? 0 }))
    .sort((a, b) => b.bonus - a.bonus);

  return (
    <div className="flex flex-col gap-6 pt-6 animate-fade-in">
      <div className="text-center">
        <Award size={28} className="text-amber-500 mx-auto mb-2" />
        <h2 className="text-2xl font-extrabold text-gray-800 tracking-wide">Bonus Stars</h2>
        <p className="text-sm text-gray-400 mt-1">Results from this session's awards</p>
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map((p, i) => (
          <div
            key={p.id}
            className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl border-2
              ${p.id === playerId ? "bg-amber-50 border-amber-300" : "bg-white border-gray-200"}`}
          >
            <span className="w-6 text-center font-bold text-gray-400 text-sm">{i + 1}</span>
            <span
              className="w-3.5 h-3.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: p.color }}
            />
            <span className="flex-1 font-bold text-gray-800 tracking-wide">
              {p.name}
              {p.id === playerId && <span className="ml-2 text-xs text-indigo-500 font-bold">YOU</span>}
            </span>
            <span className="font-extrabold text-amber-500">
              {"⭐".repeat(p.bonus) || "—"}
            </span>
          </div>
        ))}
      </div>

      {isHost ? (
        <button
          onClick={() => send({ type: "FINISH_BONUS" })}
          className="w-full py-4.5 rounded-2xl bg-indigo-600 text-white font-bold text-lg tracking-wider
                     hover:bg-indigo-700 active:scale-[0.98] shadow-lg shadow-indigo-200 transition-all cursor-pointer"
        >
          RETURN TO LOBBY
        </button>
      ) : (
        <p className="text-center text-gray-400 italic tracking-wide py-2">
          Waiting for host to return to lobby...
        </p>
      )}
    </div>
  );
}
