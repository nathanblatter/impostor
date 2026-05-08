import { send, getPlayerId } from "../connection.js";
import type { GameState } from "../../shared/types.js";

export function renderResults(state: GameState, container: HTMLElement) {
  const playerId = getPlayerId();
  const round = state.round!;
  const results = round.results!;
  const me = state.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;

  const playerMap = new Map(state.players.map((p) => [p.id, p.name]));

  container.innerHTML = `
    <div class="results">
      <h2>${results.reason}</h2>

      <div class="reveal-section">
        ${state.mode === "SPYFALL" ? `
          <div class="reveal-card">
            <h3>The Spy</h3>
            <p class="reveal-name">${escapeHtml(playerMap.get(results.spyId!) || "Unknown")}</p>
          </div>
          <div class="reveal-card">
            <h3>The Location</h3>
            <p class="reveal-word">${escapeHtml(results.location || "")}</p>
          </div>
        ` : `
          <div class="reveal-card">
            <h3>The Impostor${(results.impostorIds?.length || 0) > 1 ? "s" : ""}</h3>
            <p class="reveal-name">${(results.impostorIds || []).map((id) => escapeHtml(playerMap.get(id) || "Unknown")).join(", ")}</p>
          </div>
          <div class="reveal-card">
            <h3>The Word</h3>
            <p class="reveal-word">${escapeHtml(results.secretWord || "")}</p>
            <p class="reveal-category">${escapeHtml(results.category || "")}</p>
          </div>
        `}
      </div>

      ${round.descriptorHistory.length > 0 ? `
        <div class="descriptor-recap">
          <h3>Descriptors</h3>
          <div class="descriptor-history">
            ${round.descriptorHistory.map((d) => `
              <div class="descriptor-entry ${(results.impostorIds || []).includes(d.playerId) ? "impostor-entry" : ""}">
                <span class="descriptor-name">${escapeHtml(d.playerName)}</span>
                <span class="descriptor-word">${escapeHtml(d.word)}</span>
              </div>
            `).join("")}
          </div>
        </div>
      ` : ""}

      <div class="votes-section">
        <h3>Votes</h3>
        <div class="vote-results">
          ${Object.entries(results.votes).map(([voterId, targetId]) => `
            <div class="vote-entry">
              <span>${escapeHtml(playerMap.get(voterId) || "?")}</span>
              <span class="vote-arrow">voted for</span>
              <span>${escapeHtml(playerMap.get(targetId as string) || "?")}</span>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="scores-section">
        <h3>Scores</h3>
        <div class="score-list">
          ${state.players
            .map((p) => ({
              name: p.name,
              score: results.scores[p.id] || 0,
              isMe: p.id === playerId,
            }))
            .sort((a, b) => b.score - a.score)
            .map(
              (p) => `
            <div class="score-entry ${p.isMe ? "score-me" : ""}">
              <span class="score-name">${escapeHtml(p.name)}</span>
              <span class="score-value">${p.score}</span>
            </div>
          `
            )
            .join("")}
        </div>
      </div>

      ${isHost ? `
        <div class="results-actions">
          <button class="btn btn-primary btn-large" id="nextRound">Next Round</button>
          <button class="btn btn-secondary" id="returnToLobby">Return to Lobby</button>
        </div>
      ` : `
        <p class="waiting-text">Waiting for host...</p>
      `}
    </div>
  `;

  document.getElementById("nextRound")?.addEventListener("click", () => {
    send({ type: "NEXT_ROUND" });
  });

  document.getElementById("returnToLobby")?.addEventListener("click", () => {
    send({ type: "RETURN_TO_LOBBY" });
  });
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}
