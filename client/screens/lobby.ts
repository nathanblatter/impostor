import { send, getPlayerId } from "../connection.js";
import type { GameState } from "../../shared/types.js";

export function renderLobby(state: GameState, container: HTMLElement) {
  const playerId = getPlayerId();
  const me = state.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;

  container.innerHTML = `
    <div class="lobby">
      <div class="room-header">
        <h2>Room Code</h2>
        <div class="room-code" id="roomCode">${state.roomCode}</div>
        <button class="btn btn-small" id="copyCode">Copy</button>
      </div>

      <div class="settings-section">
        <h3>Game Mode</h3>
        <div class="mode-toggle">
          <button class="btn ${state.settings.mode === "IMPOSTOR" ? "btn-active" : ""}" id="modeImpostor" ${!isHost ? "disabled" : ""}>Impostor</button>
          <button class="btn ${state.settings.mode === "SPYFALL" ? "btn-active" : ""}" id="modeSpyfall" ${!isHost ? "disabled" : ""}>Spyfall</button>
        </div>

        ${isHost ? `
        <div class="settings-row">
          <label>Round Duration (sec)</label>
          <input type="number" id="roundDuration" value="${state.settings.roundDurationSec}" min="30" max="600" ${!isHost ? "disabled" : ""}>
        </div>
        ${state.settings.mode === "IMPOSTOR" ? `
        <div class="settings-row">
          <label>Descriptor Rounds</label>
          <input type="number" id="descriptorRounds" value="${state.settings.descriptorRounds}" min="1" max="5" ${!isHost ? "disabled" : ""}>
        </div>
        ` : ""}
        ` : ""}
      </div>

      <div class="players-section">
        <h3>Players (${state.players.length})</h3>
        <ul class="player-list">
          ${state.players
            .map(
              (p) => `
            <li class="player-item ${!p.isConnected ? "disconnected" : ""}">
              <span class="player-name">${escapeHtml(p.name)}${p.isHost ? " (Host)" : ""}${p.id === playerId ? " (You)" : ""}</span>
            </li>
          `
            )
            .join("")}
        </ul>
      </div>

      ${isHost ? `
      <button class="btn btn-primary btn-large" id="startGame" ${state.players.length < 4 ? "disabled" : ""}>
        Start Game ${state.players.length < 4 ? `(Need ${4 - state.players.length} more)` : ""}
      </button>
      ` : `
      <p class="waiting-text">Waiting for host to start...</p>
      `}

      <button class="btn btn-danger btn-small" id="leaveRoom">Leave Room</button>
    </div>
  `;

  // Event listeners
  document.getElementById("copyCode")?.addEventListener("click", () => {
    navigator.clipboard.writeText(state.roomCode);
    const btn = document.getElementById("copyCode")!;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = "Copy"), 1500);
  });

  document.getElementById("modeImpostor")?.addEventListener("click", () => {
    send({ type: "UPDATE_SETTINGS", settings: { mode: "IMPOSTOR" } });
  });

  document.getElementById("modeSpyfall")?.addEventListener("click", () => {
    send({ type: "UPDATE_SETTINGS", settings: { mode: "SPYFALL" } });
  });

  document.getElementById("roundDuration")?.addEventListener("change", (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (val >= 30 && val <= 600) {
      send({ type: "UPDATE_SETTINGS", settings: { roundDurationSec: val } });
    }
  });

  document.getElementById("descriptorRounds")?.addEventListener("change", (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (val >= 1 && val <= 5) {
      send({ type: "UPDATE_SETTINGS", settings: { descriptorRounds: val } });
    }
  });

  document.getElementById("startGame")?.addEventListener("click", () => {
    send({ type: "START_GAME" });
  });

  document.getElementById("leaveRoom")?.addEventListener("click", () => {
    send({ type: "LEAVE_ROOM" });
    import("../connection.js").then((c) => c.clearSession());
    window.location.reload();
  });
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}
