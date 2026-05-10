import React from "react";
import { Clock, Award, RotateCcw, Home, HelpCircle, Target, Check, X } from "react-feather";
import { useTimer } from "../useTimer.js";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState, TouchySubjectsState } from "../../shared/types.js";

interface Props {
  state: GameState;
  playerId: string;
  send: (msg: ClientMessage) => void;
}

export default function TouchySubjectsPlaying({ state, playerId, send }: Props) {
  const ts = state.round?.touchySubjects;
  if (!ts) return null;

  return (
    <div className="flex flex-col gap-6 pt-5 animate-fade-in">
      {ts.subPhase === "VOTING" && <VotingPhase ts={ts} state={state} playerId={playerId} send={send} />}
      {ts.subPhase === "GUESSING" && <GuessingPhase ts={ts} state={state} playerId={playerId} send={send} />}
      {ts.subPhase === "REVEAL" && <RevealPhase ts={ts} state={state} playerId={playerId} />}
      {ts.subPhase === "GAME_OVER" && <GameOverPhase ts={ts} state={state} playerId={playerId} send={send} />}
    </div>
  );
}

function VotingPhase({ ts, state, playerId, send }: Props & { ts: TouchySubjectsState }) {
  const { secondsLeft, display } = useTimer(state.round?.timerEndsAt);

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
          ROUND {ts.questionRound} / {ts.totalRounds}
        </span>
      </div>

      {/* Question */}
      <div className="rounded-2xl border-2 border-pink-300 bg-pink-50 p-7 text-center animate-pop-in">
        <HelpCircle size={20} className="text-pink-500 mx-auto mb-3" />
        <p className="text-xl font-extrabold text-gray-800 leading-snug">{ts.question}</p>
      </div>

      {/* Vote buttons */}
      {!ts.hasVoted ? (
        <div className="flex flex-col gap-2 animate-slide-up stagger-1">
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase">Vote for someone</span>
          {state.players
            .filter((p) => p.id !== playerId)
            .map((p) => (
              <button
                key={p.id}
                onClick={() => send({ type: "TOUCHY_VOTE", targetId: p.id })}
                className="w-full px-5 py-4 bg-white border-2 border-gray-200 rounded-xl font-bold text-base
                           tracking-wider text-gray-800 hover:border-pink-400 hover:bg-pink-50
                           active:scale-[0.98] transition-all cursor-pointer"
              >
                {p.name}
              </button>
            ))}
        </div>
      ) : (
        <p className="text-center text-base text-gray-400 italic tracking-wide py-3">
          Waiting for others to vote...
        </p>
      )}

      <StatusDots players={state.players} />
    </>
  );
}

function GuessingPhase({ ts, state, playerId, send }: Props & { ts: TouchySubjectsState }) {
  const { secondsLeft, display } = useTimer(state.round?.timerEndsAt);

  return (
    <>
      <div className="text-center">
        <div className={`inline-block px-8 py-3 rounded-full font-bold text-2xl tabular-nums tracking-wider
          ${secondsLeft < 10 ? "bg-amber-100 text-amber-700 animate-pulse" : "bg-gray-100 text-gray-700"}`}>
          <Clock size={16} className="inline -mt-0.5 mr-2 opacity-60" />
          {display}
        </div>
      </div>

      <div className="rounded-2xl border-2 border-pink-300 bg-pink-50 p-5 text-center">
        <p className="text-lg font-extrabold text-gray-800 leading-snug">{ts.question}</p>
      </div>

      <div className="text-center animate-pop-in">
        <Target size={20} className="text-pink-500 mx-auto mb-2" />
        <h2 className="text-xl font-extrabold tracking-wider text-gray-800">GUESS</h2>
        <p className="text-base text-gray-500 mt-1">Who did the group vote for most?</p>
      </div>

      {!ts.hasGuessed ? (
        <div className="flex flex-col gap-2 animate-slide-up stagger-1">
          {state.players
            .filter((p) => p.id !== playerId)
            .map((p) => (
              <button
                key={p.id}
                onClick={() => send({ type: "TOUCHY_GUESS", targetId: p.id })}
                className="w-full px-5 py-4 bg-white border-2 border-gray-200 rounded-xl font-bold text-base
                           tracking-wider text-gray-800 hover:border-amber-400 hover:bg-amber-50
                           active:scale-[0.98] transition-all cursor-pointer"
              >
                {p.name}
              </button>
            ))}
          {/* Can also guess yourself */}
          <button
            onClick={() => send({ type: "TOUCHY_GUESS", targetId: playerId })}
            className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl font-bold text-base
                       tracking-wider text-gray-600 hover:border-amber-400 hover:bg-amber-50
                       active:scale-[0.98] transition-all cursor-pointer"
          >
            {state.players.find((p) => p.id === playerId)?.name} (me)
          </button>
        </div>
      ) : (
        <p className="text-center text-base text-gray-400 italic tracking-wide py-3">
          Waiting for others to guess...
        </p>
      )}

      <StatusDots players={state.players} />
    </>
  );
}

function RevealPhase({ ts, state, playerId }: { ts: TouchySubjectsState; state: GameState; playerId: string }) {
  const { secondsLeft, display } = useTimer(state.round?.timerEndsAt);

  return (
    <>
      <div className="text-center">
        <div className="inline-block px-8 py-3 rounded-full font-bold text-2xl tabular-nums tracking-wider bg-gray-100 text-gray-700">
          <Clock size={16} className="inline -mt-0.5 mr-2 opacity-60" />
          {display}
        </div>
      </div>

      <div className="rounded-2xl border-2 border-pink-300 bg-pink-50 p-5 text-center">
        <p className="text-lg font-bold text-gray-800">{ts.question}</p>
      </div>

      {/* Majority answer */}
      <div className="text-center animate-pop-in">
        <h2 className="text-sm font-bold text-pink-600 tracking-wider uppercase mb-1">The group says...</h2>
        <p className="text-3xl font-extrabold text-gray-800 tracking-wide">{ts.majorityPlayerName}</p>
      </div>

      {/* Your guess result */}
      <div className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 animate-slide-up ${
        ts.myGuessCorrect
          ? "bg-emerald-50 border-emerald-300"
          : "bg-red-50 border-red-300"
      }`}>
        {ts.myGuessCorrect
          ? <><Check size={18} className="text-emerald-600" /><span className="font-bold text-emerald-700 tracking-wider">You guessed right! +1</span></>
          : <><X size={18} className="text-red-500" /><span className="font-bold text-red-600 tracking-wider">Wrong guess</span></>
        }
      </div>

      {/* Vote breakdown */}
      {ts.voteResults && (
        <div className="animate-slide-up stagger-1">
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase mb-2 block">Vote Breakdown</span>
          <div className="flex flex-col gap-1.5">
            {ts.voteResults.map((r) => (
              <div key={r.playerId} className={`flex justify-between items-center px-5 py-3 rounded-xl border
                ${r.playerId === ts.majorityPlayerId ? "bg-pink-50 border-pink-200" : "bg-white border-gray-200"}`}>
                <span className="text-base font-semibold text-gray-800">{r.playerName}</span>
                <span className={`font-extrabold text-lg tracking-wider ${
                  r.playerId === ts.majorityPlayerId ? "text-pink-600" : "text-gray-400"
                }`}>{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current scores */}
      <ScoreBoard ts={ts} state={state} playerId={playerId} />
    </>
  );
}

function GameOverPhase({ ts, state, playerId, send }: Props & { ts: TouchySubjectsState }) {
  const me = state.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;

  // Find winner
  const sortedScores = state.players
    .map((p) => ({ name: p.name, id: p.id, score: ts.scores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);

  return (
    <>
      <div className="text-center animate-pop-in py-2">
        <h2 className="text-3xl font-extrabold tracking-wider text-gray-800 mb-1">GAME OVER</h2>
        <p className="text-lg text-pink-600 font-bold tracking-wide">
          {sortedScores[0]?.name} wins with {sortedScores[0]?.score} points!
        </p>
      </div>

      <ScoreBoard ts={ts} state={state} playerId={playerId} />

      {/* History */}
      {ts.history.length > 0 && (
        <div>
          <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase mb-2 block">All Rounds</span>
          <div className="flex flex-col gap-1.5">
            {ts.history.map((h, i) => (
              <div key={i} className="flex justify-between items-center px-4 py-3 bg-white rounded-xl border border-gray-200">
                <span className="text-sm text-gray-600 flex-1">{h.question}</span>
                <span className="font-bold text-sm text-pink-600 ml-3 flex-shrink-0">{h.majorityName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isHost && (
        <div className="flex flex-col gap-3 mt-2">
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

function ScoreBoard({ ts, state, playerId }: { ts: TouchySubjectsState; state: GameState; playerId: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Award size={16} className="text-amber-500" />
        <span className="text-sm text-gray-500 tracking-wider font-semibold uppercase">Scores</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {state.players
          .map((p) => ({ name: p.name, id: p.id, score: ts.scores[p.id] || 0 }))
          .sort((a, b) => b.score - a.score)
          .map((p) => (
            <div key={p.id} className={`flex justify-between items-center px-5 py-3 rounded-xl border
              ${p.id === playerId ? "bg-indigo-50 border-indigo-200" : "bg-white border-gray-200"}`}>
              <span className="text-base font-semibold text-gray-800">
                {p.name}
                {p.id === playerId && <span className="ml-2 text-xs text-indigo-500 font-bold">YOU</span>}
              </span>
              <span className="font-extrabold text-lg text-indigo-600 tracking-wider">{p.score}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function StatusDots({ players }: { players: any[] }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {players.map((p: any) => (
        <span key={p.id} className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wider
          ${p.hasVoted ? "bg-pink-500 text-white" : "bg-gray-200 text-gray-500"}`}>
          {p.name}
        </span>
      ))}
    </div>
  );
}
