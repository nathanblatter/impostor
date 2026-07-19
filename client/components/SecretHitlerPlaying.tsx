import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Search, Crosshair, RefreshCw, FileText, ChevronDown, ChevronUp, MessageCircle, Send, Volume2, X } from "react-feather";
import { unlockAudio, isAudioUnlocked } from "../useAudio.js";
import type { ClientMessage } from "../../shared/messages.js";
import type { GameState, SecretHitlerState } from "../../shared/types.js";
import type { SHPlayer, PolicyType, ExecutivePower } from "../../shared/secretHitler.js";
import { FASCIST_BOARD_POWERS, getFascistBoardKey } from "../../shared/secretHitler.js";

interface Props {
  state: GameState;
  playerId: string;
  send: (msg: ClientMessage) => void;
}

// ── Small helpers ──

function nameOf(sh: SecretHitlerState, id: string | null | undefined): string {
  if (!id) return "?";
  return sh.players.find((p) => p.id === id)?.name ?? "?";
}

function aliveCount(sh: SecretHitlerState): number {
  return sh.players.filter((p) => p.status === "alive").length;
}

const POWER_LABELS: Record<ExecutivePower, string> = {
  "policy-peek": "Policy Peek",
  "investigate-loyalty": "Investigate",
  "special-election": "Special Election",
  "execution": "Execution",
};

const POWER_SHORT: Record<ExecutivePower, string> = {
  "policy-peek": "👁",
  "investigate-loyalty": "🔍",
  "special-election": "🗳",
  "execution": "💀",
};

// ── Boards ──

function PolicyBoards({ sh }: { sh: SecretHitlerState }) {
  const boardKey = getFascistBoardKey(sh.players.length);
  const powers = FASCIST_BOARD_POWERS[boardKey];

  return (
    <div className="flex flex-col gap-2">
      {/* Liberal track: 5 slots */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-sky-600 tracking-wider">LIBERAL</span>
          <span className="text-xs text-sky-500 font-semibold">{sh.policyTrack.liberal}/5</span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-10 rounded-lg border-2 flex items-center justify-center text-xs font-bold
                ${i < sh.policyTrack.liberal
                  ? "bg-sky-500 border-sky-600 text-white"
                  : "bg-white border-sky-200 text-sky-300"}`}
            >
              {i === 4 ? "WIN" : ""}
            </div>
          ))}
        </div>
      </div>

      {/* Fascist track: 6 slots with powers */}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-red-600 tracking-wider">FASCIST</span>
          <span className="text-xs text-red-500 font-semibold">{sh.policyTrack.fascist}/6</span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: 6 }, (_, i) => {
            const power = powers[i];
            const filled = i < sh.policyTrack.fascist;
            return (
              <div
                key={i}
                className={`flex-1 h-10 rounded-lg border-2 flex items-center justify-center text-sm
                  ${filled
                    ? "bg-red-600 border-red-700 text-white"
                    : "bg-white border-red-200 text-red-400"}`}
                title={power ? POWER_LABELS[power] : undefined}
              >
                {i === 5 ? <span className="text-xs font-bold">WIN</span> : power ? POWER_SHORT[power] : ""}
              </div>
            );
          })}
        </div>
      </div>

      {/* Election tracker + piles */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-semibold tracking-wider">ELECTION TRACKER</span>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${i < sh.electionTracker
                  ? "bg-amber-500" + (sh.electionTracker === 2 ? " animate-pulse" : "")
                  : "bg-gray-200"}`}
              />
            ))}
          </div>
        </div>
        <span className="text-xs text-gray-400 font-semibold">
          Draw {sh.drawPileCount} · Discard {sh.discardPileCount}
        </span>
      </div>
    </div>
  );
}

// ── Role peek (tap and hold to reveal) ──

function RolePeekBar({ sh }: { sh: SecretHitlerState }) {
  const [show, setShow] = useState(false);
  if (!sh.myRole) return null;

  const isFascistTeam = sh.myRole !== "liberal";
  const label = sh.myRole === "hitler" ? "HITLER" : sh.myRole === "fascist" ? "FASCIST" : "LIBERAL";
  const color = isFascistTeam ? "text-red-600" : "text-sky-600";
  const bg = show ? (isFascistTeam ? "bg-red-50 border-red-300" : "bg-sky-50 border-sky-300") : "bg-white border-gray-200";

  return (
    <button
      onPointerDown={() => setShow(true)}
      onPointerUp={() => setShow(false)}
      onPointerLeave={() => setShow(false)}
      onContextMenu={(e) => e.preventDefault()}
      className={`w-full rounded-xl border px-4 py-2.5 flex items-center justify-between cursor-pointer select-none transition-colors ${bg}`}
    >
      {show ? (
        <>
          <span className={`text-sm font-extrabold tracking-wider ${color}`}>{label}</span>
          <span className="text-xs text-gray-500 truncate ml-2">
            {sh.knownFascists.length > 0 && `Fascists: ${sh.knownFascists.map((id) => nameOf(sh, id)).join(", ")}`}
            {sh.knownHitlerId && ` · Hitler: ${nameOf(sh, sh.knownHitlerId)}`}
            {sh.knownFascists.length === 0 && !sh.knownHitlerId && "Trust no one"}
          </span>
          <Eye size={14} className="text-gray-400 flex-shrink-0" />
        </>
      ) : (
        <>
          <span className="text-sm font-bold tracking-wider text-gray-500">HOLD TO PEEK ROLE</span>
          <EyeOff size={14} className="text-gray-400" />
        </>
      )}
    </button>
  );
}

// ── Player list ──

function PlayerList({
  sh,
  playerId,
  selectable,
  disabledIds,
  onSelect,
}: {
  sh: SecretHitlerState;
  playerId: string;
  selectable?: boolean;
  disabledIds?: Set<string>;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {sh.players.map((p) => {
        const dead = p.status === "dead";
        const isPres = sh.currentPresidentId === p.id;
        const isChan = sh.nominatedChancellorId === p.id;
        const disabled = dead || disabledIds?.has(p.id);
        const clickable = selectable && !disabled;
        return (
          <button
            key={p.id}
            disabled={!clickable}
            onClick={() => clickable && onSelect?.(p.id)}
            className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-left transition-all
              ${dead ? "bg-gray-100 border-gray-200 opacity-50" : "bg-white border-gray-200"}
              ${clickable ? "cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 active:scale-[0.99]" : ""}
              ${selectable && disabled && !dead ? "opacity-40" : ""}`}
          >
            <span className={`text-sm font-semibold tracking-wide ${dead ? "text-gray-400 line-through" : "text-gray-700"}`}>
              {p.name}
              {p.id === playerId && <span className="ml-1.5 text-xs text-indigo-500 font-bold">YOU</span>}
              {p.isAI && <span className="ml-1.5 text-xs text-amber-500 font-bold">AI</span>}
              {!p.isConnected && !p.isAI && <span className="ml-1.5 text-xs text-gray-400">(offline)</span>}
            </span>
            <span className="flex items-center gap-1.5">
              {isPres && <span className="text-[10px] px-2 py-0.5 bg-indigo-600 text-white rounded-full font-bold tracking-wider">PRESIDENT</span>}
              {isChan && <span className="text-[10px] px-2 py-0.5 bg-purple-600 text-white rounded-full font-bold tracking-wider">CHANCELLOR</span>}
              {sh.subPhase === "election-vote" && !dead && (
                sh.votes === null
                  ? <span className={`w-2 h-2 rounded-full ${sh.readyVotes.includes(p.id) ? "" : ""}`} />
                  : null
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Policy tiles ──

function PolicyTileButton({ type, onClick, disabled, label }: { type: PolicyType; onClick?: () => void; disabled?: boolean; label?: string }) {
  const isLib = type === "liberal";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-2xl border-2 p-4 flex flex-col items-center gap-1 transition-all
        ${isLib ? "bg-sky-50 border-sky-300 text-sky-700" : "bg-red-50 border-red-300 text-red-700"}
        ${onClick && !disabled ? "cursor-pointer hover:scale-[1.02] active:scale-[0.98]" : "opacity-90"}`}
    >
      <span className="text-2xl">{isLib ? "🕊" : "☠️"}</span>
      <span className="text-sm font-extrabold tracking-wider">{isLib ? "LIBERAL" : "FASCIST"}</span>
      {label && <span className="text-[10px] font-bold tracking-wider opacity-70">{label}</span>}
    </button>
  );
}

// ── Game log ──

function GameLogPanel({ sh }: { sh: SecretHitlerState }) {
  const [open, setOpen] = useState(false);
  if (sh.gameLog.length === 0) return null;
  const entries = [...sh.gameLog].reverse();
  const shown = open ? entries : entries.slice(0, 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <span className="flex items-center gap-1.5 text-xs font-bold text-gray-400 tracking-wider">
          <FileText size={12} /> GAME LOG
        </span>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      <div className="flex flex-col gap-1 mt-2">
        {shown.map((e, i) => {
          let text = "";
          switch (e.type) {
            case "election-passed": text = `R${e.round}: ${e.presidentName} + ${e.chancellorName} elected (${e.votesYes}-${e.votesNo})`; break;
            case "election-failed": text = `R${e.round}: Government rejected (${e.votesYes}-${e.votesNo})`; break;
            case "policy-enacted": text = `R${e.round}: ${e.policy === "liberal" ? "🕊 Liberal" : "☠️ Fascist"} policy enacted`; break;
            case "chaos-policy": text = `R${e.round}: CHAOS! ${e.policy === "liberal" ? "🕊 Liberal" : "☠️ Fascist"} policy auto-enacted`; break;
            case "execution": text = `R${e.round}: ${e.presidentName} executed ${e.targetName}`; break;
            case "investigation": text = `R${e.round}: ${e.presidentName} investigated ${e.targetName}`; break;
            case "special-election": text = `R${e.round}: ${e.presidentName} chose ${e.targetName} as next president`; break;
            case "veto-approved": text = `R${e.round}: Government vetoed the agenda`; break;
          }
          return <p key={i} className="text-xs text-gray-500 leading-snug">{text}</p>;
        })}
      </div>
    </div>
  );
}

// ── Phase panels ──

function RoleRevealPhase({ sh, playerId, send }: { sh: SecretHitlerState; playerId: string; send: (m: ClientMessage) => void }) {
  const me = sh.players.find((p) => p.id === playerId);
  const isFascistTeam = sh.myRole !== null && sh.myRole !== "liberal";
  const ackedCount = sh.players.filter((p) => p.status === "alive").length; // display only

  if (!me || sh.myRole === null) {
    return <WaitingCard title="ROLES DEALT" subtitle="Players are looking at their secret roles..." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-2xl border-2 p-6 text-center ${isFascistTeam ? "bg-red-50 border-red-300" : "bg-sky-50 border-sky-300"}`}>
        <p className="text-xs font-bold text-gray-400 tracking-widest mb-2">YOUR SECRET ROLE</p>
        <h2 className={`text-3xl font-extrabold tracking-wider ${isFascistTeam ? "text-red-600" : "text-sky-600"}`}>
          {sh.myRole === "hitler" ? "HITLER" : sh.myRole === "fascist" ? "FASCIST" : "LIBERAL"}
        </h2>
        <p className="text-sm text-gray-600 mt-3 leading-relaxed">
          {sh.myRole === "liberal" && "Enact 5 liberal policies or kill Hitler. Trust carefully."}
          {sh.myRole === "fascist" && "Enact fascist policies and get Hitler elected. Blend in."}
          {sh.myRole === "hitler" && "Stay hidden. If you're elected Chancellor after 3 fascist policies, you win."}
        </p>
        {sh.knownFascists.length > 0 && (
          <p className="text-sm text-red-500 mt-3 font-semibold">
            Fellow fascists: {sh.knownFascists.map((id) => nameOf(sh, id)).join(", ")}
          </p>
        )}
        {sh.knownHitlerId && (
          <p className="text-sm text-red-600 mt-1 font-semibold">Hitler is: {nameOf(sh, sh.knownHitlerId)}</p>
        )}
      </div>

      {sh.hasAckedRole ? (
        <p className="text-center text-sm text-gray-400">Waiting for everyone to memorize their role...</p>
      ) : (
        <button
          onClick={() => send({ type: "SECRET_HITLER_READY" })}
          className="w-full py-4 bg-indigo-600 text-white font-bold tracking-wider rounded-xl cursor-pointer
                     hover:bg-indigo-700 transition-colors active:scale-[0.99]"
        >
          GOT IT — HIDE MY ROLE
        </button>
      )}
    </div>
  );
}

function WaitingCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
      <h3 className="text-base font-extrabold text-gray-700 tracking-wider">{title}</h3>
      <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
    </div>
  );
}

function DiscussionPanel({ sh, playerId, send }: { sh: SecretHitlerState; playerId: string; send: (m: ClientMessage) => void }) {
  const threshold = Math.floor(aliveCount(sh) / 2) + 1;
  const isReady = sh.readyVotes.includes(playerId);
  const me = sh.players.find((p) => p.id === playerId);
  const canReady = me?.status === "alive" && !isReady;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col gap-3">
      <div className="text-center">
        <h3 className="text-sm font-extrabold text-amber-700 tracking-wider">DISCUSSION</h3>
        <p className="text-xs text-amber-600 mt-0.5">
          Talk it out — who do you trust? ({sh.readyVotes.length}/{threshold} ready)
        </p>
      </div>
      {canReady ? (
        <button
          onClick={() => send({ type: "SECRET_HITLER_READY" })}
          className="w-full py-3 bg-amber-500 text-white font-bold text-sm tracking-wider rounded-xl cursor-pointer
                     hover:bg-amber-600 transition-colors"
        >
          READY TO CONTINUE
        </button>
      ) : (
        <p className="text-center text-xs text-amber-500 font-semibold">
          {isReady ? "You're ready — waiting for others" : "Watching the discussion"}
        </p>
      )}
    </div>
  );
}

function NominatePhase({ sh, playerId, send }: { sh: SecretHitlerState; playerId: string; send: (m: ClientMessage) => void }) {
  const isPresident = sh.currentPresidentId === playerId;
  const presName = nameOf(sh, sh.currentPresidentId);

  // Term-limit hints (server is authoritative)
  const disabled = new Set<string>();
  disabled.add(sh.currentPresidentId ?? "");
  const last = sh.lastElectedGovernment;
  if (last) {
    disabled.add(last.chancellorId);
    if (aliveCount(sh) > 5) disabled.add(last.presidentId);
  }

  if (sh.awaitingDiscussion) {
    return (
      <div className="flex flex-col gap-3">
        <DiscussionPanel sh={sh} playerId={playerId} send={send} />
        <p className="text-center text-xs text-gray-400">
          Next: President <span className="font-bold">{presName}</span> nominates a Chancellor
        </p>
      </div>
    );
  }

  if (!isPresident) {
    return <WaitingCard title="NOMINATION" subtitle={`President ${presName} is choosing a Chancellor...`} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <h3 className="text-base font-extrabold text-gray-800 tracking-wider">YOU ARE PRESIDENT</h3>
        <p className="text-sm text-gray-500 mt-0.5">Nominate a Chancellor (grayed = term-limited)</p>
      </div>
      <PlayerList
        sh={sh}
        playerId={playerId}
        selectable
        disabledIds={disabled}
        onSelect={(id) => send({ type: "SECRET_HITLER_NOMINATE", targetId: id })}
      />
    </div>
  );
}

function VotePhase({ sh, playerId, send }: { sh: SecretHitlerState; playerId: string; send: (m: ClientMessage) => void }) {
  const me = sh.players.find((p) => p.id === playerId);
  const canVote = me?.status === "alive" && !sh.myHasVoted;
  const presName = nameOf(sh, sh.currentPresidentId);
  const chanName = nameOf(sh, sh.nominatedChancellorId);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
        <p className="text-xs font-bold text-gray-400 tracking-widest">PROPOSED GOVERNMENT</p>
        <p className="text-lg font-extrabold text-gray-800 mt-2">
          {presName} <span className="text-gray-400 font-normal">as President</span>
        </p>
        <p className="text-lg font-extrabold text-gray-800">
          {chanName} <span className="text-gray-400 font-normal">as Chancellor</span>
        </p>
        <p className="text-xs text-gray-400 mt-2">{sh.votedCount}/{aliveCount(sh)} voted</p>
      </div>

      {canVote ? (
        <div className="flex gap-3">
          <button
            onClick={() => send({ type: "SECRET_HITLER_VOTE", ja: true })}
            className="flex-1 py-6 bg-emerald-500 text-white rounded-2xl font-extrabold text-xl tracking-wider
                       cursor-pointer hover:bg-emerald-600 transition-colors active:scale-[0.98]"
          >
            JA!
          </button>
          <button
            onClick={() => send({ type: "SECRET_HITLER_VOTE", ja: false })}
            className="flex-1 py-6 bg-red-500 text-white rounded-2xl font-extrabold text-xl tracking-wider
                       cursor-pointer hover:bg-red-600 transition-colors active:scale-[0.98]"
          >
            NEIN!
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-gray-400">
          {me?.status !== "alive" ? "The dead don't vote" : "Vote cast — waiting for the others..."}
        </p>
      )}
    </div>
  );
}

function ElectionResultPhase({ sh }: { sh: SecretHitlerState }) {
  const passed = sh.voteResult === "passed";
  return (
    <div className="flex flex-col gap-3">
      <div className={`rounded-2xl border-2 p-5 text-center ${passed ? "bg-emerald-50 border-emerald-300" : "bg-red-50 border-red-300"}`}>
        <h3 className={`text-xl font-extrabold tracking-wider ${passed ? "text-emerald-600" : "text-red-600"}`}>
          {passed ? "GOVERNMENT ELECTED" : "GOVERNMENT REJECTED"}
        </h3>
        {!passed && (
          <p className="text-xs text-red-500 mt-1">
            Election tracker advances — 3 failures enacts the top policy automatically
          </p>
        )}
      </div>
      {sh.votes && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {Object.entries(sh.votes).map(([id, ja]) => (
            <div key={id} className="flex items-center justify-between">
              <span className="text-sm text-gray-600 font-semibold truncate">{nameOf(sh, id)}</span>
              <span className={`text-xs font-extrabold ${ja ? "text-emerald-600" : "text-red-500"}`}>{ja ? "JA" : "NEIN"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LegislativePresidentPhase({ sh, playerId, send }: { sh: SecretHitlerState; playerId: string; send: (m: ClientMessage) => void }) {
  const isPresident = sh.currentPresidentId === playerId;
  if (!isPresident || !sh.policyChoices) {
    return <WaitingCard title="LEGISLATIVE SESSION" subtitle={`President ${nameOf(sh, sh.currentPresidentId)} is reviewing policies...`} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <h3 className="text-base font-extrabold text-gray-800 tracking-wider">DISCARD ONE POLICY</h3>
        <p className="text-sm text-gray-500 mt-0.5">The other two go to the Chancellor</p>
      </div>
      <div className="flex gap-2">
        {sh.policyChoices.map((p, i) => (
          <PolicyTileButton key={i} type={p} label="TAP TO DISCARD" onClick={() => send({ type: "SECRET_HITLER_DISCARD", index: i })} />
        ))}
      </div>
    </div>
  );
}

function LegislativeChancellorPhase({ sh, playerId, send }: { sh: SecretHitlerState; playerId: string; send: (m: ClientMessage) => void }) {
  const isChancellor = sh.nominatedChancellorId === playerId;
  const isPresident = sh.currentPresidentId === playerId;

  if (sh.vetoRequested) {
    if (isPresident) {
      return (
        <div className="flex flex-col gap-3">
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-center">
            <h3 className="text-base font-extrabold text-amber-700 tracking-wider">VETO REQUESTED</h3>
            <p className="text-sm text-amber-600 mt-1">The Chancellor wants to discard both policies. Approve?</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => send({ type: "SECRET_HITLER_VETO_RESPONSE", approve: true })}
              className="flex-1 py-4 bg-emerald-500 text-white rounded-xl font-bold tracking-wider cursor-pointer hover:bg-emerald-600 transition-colors"
            >
              APPROVE VETO
            </button>
            <button
              onClick={() => send({ type: "SECRET_HITLER_VETO_RESPONSE", approve: false })}
              className="flex-1 py-4 bg-red-500 text-white rounded-xl font-bold tracking-wider cursor-pointer hover:bg-red-600 transition-colors"
            >
              REJECT
            </button>
          </div>
        </div>
      );
    }
    return <WaitingCard title="VETO REQUESTED" subtitle="The President is deciding whether to veto the agenda..." />;
  }

  if (!isChancellor || !sh.policyChoices) {
    return <WaitingCard title="LEGISLATIVE SESSION" subtitle={`Chancellor ${nameOf(sh, sh.nominatedChancellorId)} is enacting a policy...`} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <h3 className="text-base font-extrabold text-gray-800 tracking-wider">ENACT ONE POLICY</h3>
        <p className="text-sm text-gray-500 mt-0.5">The other is discarded secretly</p>
      </div>
      <div className="flex gap-2">
        {sh.policyChoices.map((p, i) => (
          <PolicyTileButton key={i} type={p} label="TAP TO ENACT" onClick={() => send({ type: "SECRET_HITLER_ENACT", index: i })} />
        ))}
      </div>
      {sh.vetoUnlocked && (
        <button
          onClick={() => send({ type: "SECRET_HITLER_VETO_REQUEST" })}
          className="w-full py-3 bg-gray-800 text-white rounded-xl font-bold text-sm tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
        >
          REQUEST VETO
        </button>
      )}
    </div>
  );
}

function ExecutivePhase({ sh, playerId, send }: { sh: SecretHitlerState; playerId: string; send: (m: ClientMessage) => void }) {
  const isPresident = sh.currentPresidentId === playerId;
  const power = sh.pendingExecutivePower;
  const presName = nameOf(sh, sh.currentPresidentId);
  if (!power) return null;

  if (!isPresident) {
    return (
      <WaitingCard
        title={POWER_LABELS[power].toUpperCase()}
        subtitle={`President ${presName} is using the ${POWER_LABELS[power]} power...`}
      />
    );
  }

  if (power === "policy-peek") {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-center">
          <h3 className="text-base font-extrabold text-gray-800 tracking-wider">POLICY PEEK</h3>
          <p className="text-sm text-gray-500 mt-0.5">The next 3 policies (top first) — for your eyes only</p>
        </div>
        <div className="flex gap-2">
          {(sh.policyPeek ?? []).map((p, i) => <PolicyTileButton key={i} type={p} />)}
        </div>
        <button
          onClick={() => send({ type: "SECRET_HITLER_EXECUTIVE" })}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm tracking-wider cursor-pointer hover:bg-indigo-700 transition-colors"
        >
          GOT IT
        </button>
      </div>
    );
  }

  if (power === "investigate-loyalty") {
    if (sh.investigationResult) {
      const r = sh.investigationResult;
      const fasc = r.party === "fascist";
      return (
        <div className="flex flex-col gap-3">
          <div className={`rounded-2xl border-2 p-5 text-center ${fasc ? "bg-red-50 border-red-300" : "bg-sky-50 border-sky-300"}`}>
            <p className="text-xs font-bold text-gray-400 tracking-widest">INVESTIGATION RESULT</p>
            <p className="text-lg font-extrabold mt-2 text-gray-800">{r.targetName}</p>
            <p className={`text-2xl font-extrabold tracking-wider mt-1 ${fasc ? "text-red-600" : "text-sky-600"}`}>
              {fasc ? "FASCIST" : "LIBERAL"}
            </p>
            <p className="text-xs text-gray-400 mt-2">Party membership only — you may lie about it</p>
          </div>
          <button
            onClick={() => send({ type: "SECRET_HITLER_EXECUTIVE" })}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm tracking-wider cursor-pointer hover:bg-indigo-700 transition-colors"
          >
            CONTINUE
          </button>
        </div>
      );
    }
    const disabled = new Set([playerId]);
    return (
      <div className="flex flex-col gap-3">
        <div className="text-center">
          <h3 className="text-base font-extrabold text-gray-800 tracking-wider flex items-center justify-center gap-1.5"><Search size={16} /> INVESTIGATE LOYALTY</h3>
          <p className="text-sm text-gray-500 mt-0.5">Secretly see a player's party membership</p>
        </div>
        <PlayerList sh={sh} playerId={playerId} selectable disabledIds={disabled}
          onSelect={(id) => send({ type: "SECRET_HITLER_EXECUTIVE", targetId: id })} />
      </div>
    );
  }

  if (power === "special-election") {
    const disabled = new Set([playerId]);
    return (
      <div className="flex flex-col gap-3">
        <div className="text-center">
          <h3 className="text-base font-extrabold text-gray-800 tracking-wider flex items-center justify-center gap-1.5"><RefreshCw size={16} /> SPECIAL ELECTION</h3>
          <p className="text-sm text-gray-500 mt-0.5">Choose the next President</p>
        </div>
        <PlayerList sh={sh} playerId={playerId} selectable disabledIds={disabled}
          onSelect={(id) => send({ type: "SECRET_HITLER_EXECUTIVE", targetId: id })} />
      </div>
    );
  }

  // execution
  const disabled = new Set([playerId]);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <h3 className="text-base font-extrabold text-red-600 tracking-wider flex items-center justify-center gap-1.5"><Crosshair size={16} /> EXECUTION</h3>
        <p className="text-sm text-gray-500 mt-0.5">Choose a player to execute. If it's Hitler, Liberals win.</p>
      </div>
      <PlayerList sh={sh} playerId={playerId} selectable disabledIds={disabled}
        onSelect={(id) => send({ type: "SECRET_HITLER_EXECUTIVE", targetId: id })} />
    </div>
  );
}

function GameOverPhase({ sh, state, playerId, send }: Props & { sh: SecretHitlerState }) {
  const result = sh.result;
  if (!result) return null;
  const libs = result.winner === "liberals";
  const isHost = state.players.find((p) => p.id === playerId)?.isHost;

  const conditionText: Record<string, string> = {
    "liberals-policies": "Five liberal policies were enacted",
    "liberals-hitler-killed": "Hitler was executed",
    "fascists-policies": "Six fascist policies were enacted",
    "fascists-hitler-elected": "Hitler was elected Chancellor",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-2xl border-2 p-6 text-center ${libs ? "bg-sky-50 border-sky-300" : "bg-red-50 border-red-300"}`}>
        <h2 className={`text-2xl font-extrabold tracking-wider ${libs ? "text-sky-600" : "text-red-600"}`}>
          {libs ? "🕊 LIBERALS WIN" : "☠️ FASCISTS WIN"}
        </h2>
        <p className="text-sm text-gray-600 mt-2">{conditionText[result.condition]}</p>
      </div>

      {sh.allRoles && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">The truth</p>
          <div className="flex flex-col gap-1.5">
            {sh.allRoles.map((r) => (
              <div key={r.id} className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">{r.name}</span>
                <span className={`text-xs font-extrabold tracking-wider
                  ${r.role === "liberal" ? "text-sky-600" : r.role === "hitler" ? "text-red-700" : "text-red-500"}`}>
                  {r.role.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isHost && (
        <div className="flex gap-3">
          <button
            onClick={() => send({ type: "NEXT_ROUND" })}
            className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-bold tracking-wider cursor-pointer hover:bg-indigo-700 transition-colors"
          >
            PLAY AGAIN
          </button>
          <button
            onClick={() => send({ type: "RETURN_TO_LOBBY" })}
            className="flex-1 py-4 bg-gray-200 text-gray-700 rounded-xl font-bold tracking-wider cursor-pointer hover:bg-gray-300 transition-colors"
          >
            LOBBY
          </button>
        </div>
      )}
      {!isHost && <p className="text-center text-sm text-gray-400">Waiting for the host...</p>}
    </div>
  );
}

// ── Chat ──

function ChatDrawer({ sh, playerId, send, readOnly }: { sh: SecretHitlerState; playerId: string; send: (m: ClientMessage) => void; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [readCount, setReadCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const unread = Math.max(0, sh.chatLog.length - readCount);

  useEffect(() => {
    if (open) {
      setReadCount(sh.chatLog.length);
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [open, sh.chatLog.length]);

  function submit() {
    const t = text.trim();
    if (!t) return;
    send({ type: "SECRET_HITLER_CHAT", text: t.slice(0, 200) });
    setText("");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 w-13 h-13 p-3.5 bg-gray-800 text-white rounded-full shadow-lg
                   cursor-pointer hover:bg-gray-700 transition-colors"
        aria-label="Open chat"
      >
        <MessageCircle size={22} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-500 text-white text-[10px] font-bold
                           rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 max-w-md mx-auto bg-white border-t border-x border-gray-200
                    rounded-t-2xl shadow-2xl flex flex-col" style={{ height: "60dvh" }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-extrabold text-gray-700 tracking-wider">TABLE TALK</span>
        <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer" aria-label="Close chat">
          <X size={18} />
        </button>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {sh.chatLog.length === 0 && (
          <p className="text-center text-xs text-gray-400 mt-4">No messages yet — accuse someone!</p>
        )}
        {sh.chatLog.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.playerId === playerId ? "items-end" : "items-start"}`}>
            <span className={`text-[10px] font-bold tracking-wider ${m.isAI ? "text-amber-500" : "text-gray-400"}`}>
              {m.playerName}{m.isAI ? " · AI" : ""}
            </span>
            <span className={`px-3 py-1.5 rounded-xl text-sm max-w-[85%] leading-snug
              ${m.playerId === playerId ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}>
              {m.text}
            </span>
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="flex gap-2 p-3 border-t border-gray-100" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            maxLength={200}
            placeholder="Say something..."
            className="flex-1 px-4 py-2.5 bg-gray-100 rounded-xl text-sm text-gray-800 outline-none
                       focus:ring-2 focus:ring-indigo-300"
          />
          <button
            onClick={submit}
            disabled={!text.trim()}
            className={`px-4 rounded-xl flex items-center justify-center transition-colors
              ${text.trim() ? "bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer" : "bg-gray-200 text-gray-400"}`}
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </div>
      )}
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

// ── Main ──

export default function SecretHitlerPlaying({ state, playerId, send }: Props) {
  const sh = state.round?.secretHitler;
  if (!sh) {
    return (
      <div className="w-full max-w-md pt-16 text-center animate-fade-in">
        <h2 className="text-xl font-extrabold text-gray-700 tracking-wider">SETTING UP THE GAME</h2>
        <p className="text-sm text-gray-400 mt-2 animate-pulse">Recruiting AI players and shuffling the deck...</p>
      </div>
    );
  }

  const showBoards = sh.subPhase !== "role-reveal" && sh.subPhase !== "game-over";

  return (
    <div className="w-full max-w-md flex flex-col gap-4 pt-5 pb-8 animate-fade-in">
      {state.settings.secretHitlerTtsNarration && <AudioUnlock />}
      {state.isSpectator && (
        <div className="bg-gray-800 text-white text-center py-2 rounded-xl text-xs font-bold tracking-widest">
          SPECTATING — ROLES HIDDEN UNTIL GAME OVER
        </div>
      )}
      {sh.subPhase !== "role-reveal" && sh.subPhase !== "game-over" && <RolePeekBar sh={sh} />}
      {showBoards && <PolicyBoards sh={sh} />}

      {sh.subPhase === "role-reveal" && <RoleRevealPhase sh={sh} playerId={playerId} send={send} />}
      {sh.subPhase === "election-nominate" && <NominatePhase sh={sh} playerId={playerId} send={send} />}
      {sh.subPhase === "election-vote" && <VotePhase sh={sh} playerId={playerId} send={send} />}
      {sh.subPhase === "election-result" && <ElectionResultPhase sh={sh} />}
      {sh.subPhase === "legislative-president" && <LegislativePresidentPhase sh={sh} playerId={playerId} send={send} />}
      {sh.subPhase === "legislative-chancellor" && <LegislativeChancellorPhase sh={sh} playerId={playerId} send={send} />}
      {sh.subPhase === "executive-action" && <ExecutivePhase sh={sh} playerId={playerId} send={send} />}
      {sh.subPhase === "game-over" && <GameOverPhase sh={sh} state={state} playerId={playerId} send={send} />}

      {showBoards && sh.subPhase !== "election-nominate" && sh.subPhase !== "executive-action" && (
        <PlayerList sh={sh} playerId={playerId} />
      )}
      <GameLogPanel sh={sh} />
      <ChatDrawer sh={sh} playerId={playerId} send={send} readOnly={state.isSpectator} />
    </div>
  );
}
