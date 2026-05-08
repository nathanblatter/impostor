import { send, getPlayerId } from "../connection.js";
import type { GameState } from "../../shared/types.js";

export function renderVoting(state: GameState, container: HTMLElement) {
  const playerId = getPlayerId();
  const round = state.round!;
  const me = state.players.find((p) => p.id === playerId);
  const hasVoted = me?.hasVoted ?? false;
  const timeLeft = Math.max(0, Math.ceil((round.timerEndsAt - Date.now()) / 1000));

  container.innerHTML = `
    <div class="voting">
      <div class="timer" id="timer">${formatTime(timeLeft)}</div>
      <h2>Vote!</h2>
      <p>Who is the ${state.mode === "SPYFALL" ? "spy" : "impostor"}?</p>

      <div class="vote-grid">
        ${state.players
          .filter((p) => p.id !== playerId)
          .map(
            (p) => `
          <button class="btn btn-vote ${hasVoted ? "disabled" : ""}" data-target="${p.id}" ${hasVoted ? "disabled" : ""}>
            <span class="vote-name">${escapeHtml(p.name)}</span>
            ${p.hasVoted ? '<span class="voted-indicator">Voted</span>' : ""}
          </button>
        `
          )
          .join("")}
      </div>

      ${hasVoted ? '<p class="waiting-text">Waiting for others to vote...</p>' : ""}

      <div class="vote-status">
        ${state.players.map((p) => `
          <span class="vote-dot ${p.hasVoted ? "voted" : ""}">${escapeHtml(p.name)}</span>
        `).join("")}
      </div>
    </div>
  `;

  if (!hasVoted) {
    container.querySelectorAll(".btn-vote").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = (btn as HTMLElement).dataset.target!;
        send({ type: "CAST_VOTE", targetId });
      });
    });
  }

  startTimerUpdate(round.timerEndsAt);
}

export function renderSpyGuess(state: GameState, container: HTMLElement) {
  const playerId = getPlayerId();
  const round = state.round!;
  const isSpy = round.isSpy;
  const timeLeft = Math.max(0, Math.ceil((round.timerEndsAt - Date.now()) / 1000));

  container.innerHTML = `
    <div class="spy-guess">
      <div class="timer" id="timer">${formatTime(timeLeft)}</div>
      ${isSpy ? `
        <h2>Guess the Location!</h2>
        <p>You weren't voted out. Now guess the location to win!</p>
        <div class="location-grid">
          ${round.allLocations.map((loc) => `
            <button class="btn btn-location" data-location="${escapeHtml(loc)}">${escapeHtml(loc)}</button>
          `).join("")}
        </div>
      ` : `
        <h2>Spy is Guessing...</h2>
        <p>The spy is trying to guess the location. Wait for their answer.</p>
      `}
    </div>
  `;

  if (isSpy) {
    container.querySelectorAll(".btn-location").forEach((btn) => {
      btn.addEventListener("click", () => {
        const loc = (btn as HTMLElement).dataset.location!;
        send({ type: "SPY_GUESS", locationGuess: loc });
      });
    });
  }

  startTimerUpdate(round.timerEndsAt);
}

let timerIntervalId: ReturnType<typeof setInterval> | null = null;

function startTimerUpdate(endsAt: number) {
  if (timerIntervalId) clearInterval(timerIntervalId);
  timerIntervalId = setInterval(() => {
    const el = document.getElementById("timer");
    if (!el) {
      clearInterval(timerIntervalId!);
      return;
    }
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    el.textContent = formatTime(left);
    if (left <= 10) el.classList.add("timer-urgent");
  }, 1000);
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}
