import React from "react";
import { Clock, MapPin } from "react-feather";
import { useTimer } from "../useTimer.js";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState } from "../../shared/types.js";

interface Props {
  state: GameState;
  playerId: string;
  send: (msg: ClientMessage) => void;
}

export default function SpyGuess({ state, playerId, send }: Props) {
  const round = state.round!;
  const { secondsLeft, display } = useTimer(round.timerEndsAt);
  const isSpy = round.isSpy;

  return (
    <div className="flex flex-col gap-5 pt-4 animate-fade-in">
      {/* Timer */}
      <div className="text-center">
        <div
          className={`inline-block px-6 py-2 rounded-full font-bold text-xl tabular-nums tracking-wider
            ${secondsLeft < 10 ? "bg-red-100 text-red-700 animate-pulse" : "bg-amber-100 text-amber-700"}`}
        >
          <Clock size={14} className="inline -mt-0.5 mr-1.5 opacity-60" />
          {display}
        </div>
      </div>

      {isSpy ? (
        <>
          <div className="text-center animate-pop-in">
            <h2 className="text-xl font-extrabold tracking-wider text-gray-800">GUESS THE LOCATION</h2>
            <p className="text-sm text-gray-500 tracking-wide mt-1">
              You survived the vote! Now guess correctly to win.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1.5 max-h-80 overflow-y-auto animate-slide-up stagger-1">
            {round.allLocations.map((loc: string) => (
              <button
                key={loc}
                onClick={() => send({ type: "SPY_GUESS", locationGuess: loc })}
                className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-xs font-bold
                           text-gray-700 tracking-wide hover:border-indigo-400 hover:bg-indigo-50
                           active:scale-95 transition-all cursor-pointer"
              >
                <MapPin size={10} className="inline -mt-0.5 mr-1 text-gray-400" />
                {loc}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-12 animate-pop-in">
          <div className="text-4xl mb-4">🕵️</div>
          <h2 className="text-lg font-extrabold tracking-wider text-gray-800">SPY IS GUESSING</h2>
          <p className="text-sm text-gray-500 tracking-wide mt-2">
            The spy is trying to guess the location...
          </p>
        </div>
      )}
    </div>
  );
}
