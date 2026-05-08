import { connect, onMessage, send, clearSession } from "./connection.js";
import { renderLobby } from "./screens/lobby.js";
import { renderPlaying } from "./screens/playing.js";
import { renderVoting, renderSpyGuess } from "./screens/voting.js";
import { renderResults } from "./screens/results.js";
import type { ServerMessage } from "../shared/messages.js";
import type { GameState } from "../shared/types.js";

const app = document.getElementById("app")!;
let currentState: GameState | null = null;
let errorTimeout: ReturnType<typeof setTimeout> | null = null;

function showHome() {
  app.innerHTML = `
    <div class="home">
      <h1>Impostor / Spyfall</h1>
      <p class="subtitle">Party Game</p>
      <div class="home-form">
        <input type="text" id="playerName" placeholder="Your name" maxlength="20" autofocus>
        <button class="btn btn-primary btn-large" id="createBtn">Create Room</button>
        <div class="join-row">
          <input type="text" id="roomCodeInput" placeholder="Room Code" maxlength="4" style="text-transform: uppercase">
          <button class="btn btn-secondary btn-large" id="joinBtn">Join</button>
        </div>
      </div>
      <div id="errorMsg" class="error-msg"></div>
    </div>
  `;

  const nameInput = document.getElementById("playerName") as HTMLInputElement;
  const savedName = localStorage.getItem("playerName") || "";
  nameInput.value = savedName;

  document.getElementById("createBtn")?.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) return nameInput.focus();
    localStorage.setItem("playerName", name);
    send({ type: "CREATE_ROOM", playerName: name });
  });

  document.getElementById("joinBtn")?.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const code = (document.getElementById("roomCodeInput") as HTMLInputElement).value.trim().toUpperCase();
    if (!name) return nameInput.focus();
    if (!code) return (document.getElementById("roomCodeInput") as HTMLInputElement).focus();
    localStorage.setItem("playerName", name);
    send({ type: "JOIN_ROOM", roomCode: code, playerName: name });
  });

  // Enter key support
  document.getElementById("roomCodeInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("joinBtn")?.click();
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("createBtn")?.click();
  });
}

function showError(msg: string) {
  if (errorTimeout) clearTimeout(errorTimeout);
  const el = document.getElementById("errorMsg");
  if (el) {
    el.textContent = msg;
    el.classList.add("visible");
    errorTimeout = setTimeout(() => {
      el.classList.remove("visible");
    }, 4000);
  }
}

function renderState(state: GameState) {
  currentState = state;
  const container = app;

  switch (state.phase) {
    case "LOBBY":
      renderLobby(state, container);
      break;
    case "PLAYING":
      renderPlaying(state, container);
      break;
    case "VOTING":
      renderVoting(state, container);
      break;
    case "SPY_GUESS":
      renderSpyGuess(state, container);
      break;
    case "RESULTS":
      renderResults(state, container);
      break;
  }
}

onMessage((msg: ServerMessage) => {
  switch (msg.type) {
    case "ROOM_CREATED":
    case "ROOM_JOINED":
      // State will follow
      break;
    case "GAME_STATE":
      renderState(msg.state);
      break;
    case "ERROR":
      showError(msg.message);
      break;
    case "PONG":
      break;
  }
});

connect();
showHome();
