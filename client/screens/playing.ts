import { send, getPlayerId } from "../connection.js";
import type { GameState } from "../../shared/types.js";

export function renderPlaying(state: GameState, container: HTMLElement) {
  const playerId = getPlayerId();
  const round = state.round!;
  const me = state.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;

  const timeLeft = Math.max(0, Math.ceil((round.timerEndsAt - Date.now()) / 1000));

  if (state.mode === "SPYFALL") {
    renderSpyfallPlaying(state, round, playerId!, isHost, timeLeft, container);
  } else {
    renderImpostorPlaying(state, round, playerId!, isHost, timeLeft, container);
  }

  // Start timer update
  startTimerUpdate(round.timerEndsAt);
}

function renderSpyfallPlaying(
  state: GameState,
  round: any,
  playerId: string,
  isHost: boolean,
  timeLeft: number,
  container: HTMLElement
) {
  container.innerHTML = `
    <div class="playing spyfall">
      <div class="timer" id="timer">${formatTime(timeLeft)}</div>

      <div class="role-card ${round.isSpy ? "role-spy" : "role-normal"}">
        ${round.isSpy
          ? `<h2>You are the SPY!</h2><p>Try to figure out the location from the conversation.</p>`
          : `<h2>Location</h2><p class="secret-word">${escapeHtml(round.location)}</p><p class="role-hint">Find the spy!</p>`
        }
      </div>

      ${round.isSpy ? `
      <div class="spy-guess-section">
        <h3>Guess the Location</h3>
        <div class="location-grid">
          ${round.allLocations.map((loc: string) => `
            <button class="btn btn-location" data-location="${escapeHtml(loc)}">${escapeHtml(loc)}</button>
          `).join("")}
        </div>
      </div>
      ` : ""}

      <div class="players-section">
        <h3>Players</h3>
        <ul class="player-list">
          ${state.players.map((p) => `
            <li class="player-item ${!p.isConnected ? "disconnected" : ""}">
              ${escapeHtml(p.name)}${p.id === playerId ? " (You)" : ""}
            </li>
          `).join("")}
        </ul>
      </div>

      <button class="btn btn-warning btn-large" id="callVote">Call Vote</button>
    </div>
  `;

  // Spy guess buttons
  container.querySelectorAll(".btn-location").forEach((btn) => {
    btn.addEventListener("click", () => {
      const loc = (btn as HTMLElement).dataset.location!;
      if (confirm(`Guess "${loc}" as the location?`)) {
        send({ type: "SPY_GUESS", locationGuess: loc });
      }
    });
  });

  document.getElementById("callVote")?.addEventListener("click", () => {
    send({ type: "CALL_VOTE" });
  });
}

function renderImpostorPlaying(
  state: GameState,
  round: any,
  playerId: string,
  isHost: boolean,
  timeLeft: number,
  container: HTMLElement
) {
  const isMyTurn = round.currentTurnPlayerId === playerId;
  const currentTurnPlayer = state.players.find(
    (p) => p.id === round.currentTurnPlayerId
  );

  container.innerHTML = `
    <div class="playing impostor">
      <div class="timer" id="timer">${formatTime(timeLeft)}</div>

      <div class="role-card ${round.isImpostor ? "role-impostor" : "role-normal"}">
        ${round.isImpostor
          ? `
            <h2>You are the IMPOSTOR!</h2>
            <p>Category: <strong>${escapeHtml(round.category)}</strong></p>
            ${round.fellowImpostorNames.length > 0
              ? `<p class="fellow-impostors">Fellow impostor: ${round.fellowImpostorNames.map(escapeHtml).join(", ")}</p>`
              : ""}
            <p class="role-hint">Blend in! Don't get caught.</p>
          `
          : `
            <h2>The Word</h2>
            <p class="secret-word">${escapeHtml(round.secretWord)}</p>
            <p class="category-label">Category: ${escapeHtml(round.category)}</p>
            <p class="role-hint">Find the impostor!</p>
          `
        }
      </div>

      <div class="descriptor-section">
        <h3>Round ${round.currentDescriptorRound} — Descriptors</h3>
        ${round.descriptorHistory.length > 0 ? `
          <div class="descriptor-history">
            ${round.descriptorHistory.map((d: any) => `
              <div class="descriptor-entry">
                <span class="descriptor-name">${escapeHtml(d.playerName)}</span>
                <span class="descriptor-word">${escapeHtml(d.word)}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}

        ${isMyTurn ? `
          <div class="descriptor-input">
            <p class="turn-indicator">Your turn! Enter a one-word descriptor:</p>
            <div class="input-row">
              <input type="text" id="descriptorInput" placeholder="One word..." maxlength="30" autofocus>
              <button class="btn btn-primary" id="submitDescriptor">Submit</button>
            </div>
          </div>
        ` : `
          <p class="turn-indicator">
            ${currentTurnPlayer ? `Waiting for ${escapeHtml(currentTurnPlayer.name)}...` : "Waiting..."}
          </p>
        `}
      </div>

      <div class="players-section">
        <h3>Players</h3>
        <ul class="player-list">
          ${state.players.map((p) => `
            <li class="player-item ${!p.isConnected ? "disconnected" : ""} ${p.id === round.currentTurnPlayerId ? "current-turn" : ""}">
              ${escapeHtml(p.name)}${p.id === playerId ? " (You)" : ""}
              ${round.currentTurnPlayerId === p.id ? " ⬅" : ""}
            </li>
          `).join("")}
        </ul>
      </div>

      ${isHost ? `<button class="btn btn-warning" id="callVote">Call Vote</button>` : ""}
    </div>
  `;

  // Descriptor submit
  const input = document.getElementById("descriptorInput") as HTMLInputElement;
  const submitBtn = document.getElementById("submitDescriptor");

  submitBtn?.addEventListener("click", () => {
    const word = input?.value.trim();
    if (word && !word.includes(" ")) {
      send({ type: "SUBMIT_DESCRIPTOR", word });
    }
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const word = input.value.trim();
      if (word && !word.includes(" ")) {
        send({ type: "SUBMIT_DESCRIPTOR", word });
      }
    }
  });

  document.getElementById("callVote")?.addEventListener("click", () => {
    send({ type: "CALL_VOTE" });
  });
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
