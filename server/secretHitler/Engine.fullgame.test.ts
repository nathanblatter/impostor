import { describe, it, expect } from "vitest";
import { SecretHitlerEngine } from "./Engine.js";
import {
  ROLE_DISTRIBUTION,
  FASCIST_BOARD_POWERS,
  getFascistBoardKey,
  WIN_CONDITIONS,
} from "../../shared/secretHitler.js";
import type { ExecutivePower } from "../../shared/secretHitler.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `player-${i}`);
}

function createRoom(playerCount: number): { room: SecretHitlerEngine; ids: string[] } {
  const ids = makeIds(playerCount);
  const room = new SecretHitlerEngine(ids[0], `P0`);
  for (let i = 1; i < playerCount; i++) {
    room.addPlayer(ids[i], `P${i}`);
  }
  return { room, ids };
}

function startRoom(playerCount: number): { room: SecretHitlerEngine; ids: string[] } {
  const { room, ids } = createRoom(playerCount);
  room.startGame(ids[0]);
  room.acknowledgeRoles();
  return { room, ids };
}

function getAliveIds(room: SecretHitlerEngine): string[] {
  return room.getState().players.filter(p => p.status === "alive").map(p => p.id);
}

function pickChancellor(room: SecretHitlerEngine): string {
  const state = room.getState();
  const president = state.currentPresidentId!;
  const alive = getAliveIds(room);
  const last = state.lastElectedGovernment;
  const aliveCount = alive.length;

  for (const id of alive) {
    if (id === president) continue;
    if (last) {
      if (id === last.chancellorId) continue;
      if (aliveCount > 5 && id === last.presidentId) continue;
    }
    return id;
  }
  throw new Error("No eligible chancellor found");
}

/** Handle an executive power so the game can continue. */
function handleExecutivePower(room: SecretHitlerEngine, power: ExecutivePower, log: string[]): void {
  const state = room.getState();
  const president = state.currentPresidentId!;
  const pName = state.players.find(p => p.id === president)?.name;

  switch (power) {
    case "policy-peek": {
      const peek = room.getPolicyPeek();
      expect(peek.length).toBe(3); // deck reshuffles below 3 after legislative sessions
      log.push(`    [exec] ${pName} peeks: [${peek.join(", ")}]`);
      room.acknowledgePolicyPeek(president);
      break;
    }
    case "investigate-loyalty": {
      // Pick a target this president hasn't investigated yet
      const candidates = getAliveIds(room).filter(id => id !== president);
      for (const c of candidates) {
        try {
          const party = room.investigateLoyalty(president, c);
          const tName = room.getState().players.find(p => p.id === c)?.name;
          room.acknowledgeInvestigation(president);
          log.push(`    [exec] ${pName} investigates ${tName}: ${party}`);
          break;
        } catch {
          continue; // already investigated, try next
        }
      }
      break;
    }
    case "special-election": {
      const target = getAliveIds(room).find(id => id !== president)!;
      const tName = room.getState().players.find(p => p.id === target)?.name;
      room.callSpecialElection(president, target);
      log.push(`    [exec] ${pName} calls special election for ${tName}`);
      break;
    }
    case "execution": {
      const roles = room.getAllRoles();
      // Don't execute Hitler (game would end)
      const target = getAliveIds(room).find(
        id => id !== president && roles[id].role !== "hitler"
      );
      if (!target) {
        // Only Hitler left to execute — do it and end the game
        const hitler = getAliveIds(room).find(id => id !== president)!;
        const hName = room.getState().players.find(p => p.id === hitler)?.name;
        room.executePlayer(president, hitler);
        log.push(`    [exec] ${pName} executes ${hName} (was Hitler!)`);
        return;
      }
      const tName = room.getState().players.find(p => p.id === target)?.name;
      room.executePlayer(president, target);
      log.push(`    [exec] ${pName} executes ${tName}`);
      break;
    }
  }
}

/**
 * Play rounds until the game ends. Returns the log.
 */
function playFullGame(room: SecretHitlerEngine, maxRounds = 50): string[] {
  const log: string[] = [];
  const roles = room.getAllRoles();
  const roleList = Object.entries(roles).map(([_, r]) => `${r.name}=${r.role}`).join(", ");
  const boardKey = getFascistBoardKey(room.getPlayerIds().length);
  log.push(`Roles: ${roleList}`);
  log.push(`Board: ${boardKey}, Powers: ${FASCIST_BOARD_POWERS[boardKey].map((p, i) => `${i + 1}:${p ?? "-"}`).join(" ")}`);

  let rounds = 0;
  while (rounds < maxRounds && !room.getState().result) {
    rounds++;
    const state = room.getState();

    if (state.phase !== "election-nominate") {
      log.push(`  R${rounds}: stuck at phase ${state.phase}, aborting`);
      break;
    }

    const president = state.currentPresidentId!;
    const pName = state.players.find(p => p.id === president)?.name;
    const chancellor = pickChancellor(room);
    const cName = state.players.find(p => p.id === chancellor)?.name;

    // ── Election
    room.nominateChancellor(president, chancellor);
    for (const id of getAliveIds(room)) {
      room.castVote(id, true);
    }
    room.resolveVote();

    if (room.getState().result) {
      log.push(`  R${rounds}: ${pName}+${cName} elected → GAME OVER (Hitler elected chancellor)`);
      break;
    }

    room.advanceAfterVote();
    if (room.getState().result) {
      log.push(`  R${rounds}: GAME OVER after vote advance`);
      break;
    }

    // ── Legislative
    const legState = room.getState();
    if (legState.phase !== "legislative-president") {
      log.push(`  R${rounds}: expected legislative-president, got ${legState.phase}`);
      break;
    }

    const presPrivate = room.getPrivateState(president);
    const cards = presPrivate.policyChoices ?? [];
    room.presidentDiscard(president, 0);
    const { enacted, power } = room.chancellorEnact(chancellor, 0);

    const track = room.getState().policyTrack;
    log.push(`  R${rounds}: ${pName}→${cName} | drew [${cards.join(",")}] | enacted ${enacted} | L:${track.liberal} F:${track.fascist}${power ? ` | power: ${power}` : ""}`);

    if (room.getState().result) {
      log.push(`  → GAME OVER: ${JSON.stringify(room.getState().result)}`);
      break;
    }

    // ── Executive Power
    if (power) {
      handleExecutivePower(room, power, log);
      if (room.getState().result) {
        log.push(`  → GAME OVER: ${JSON.stringify(room.getState().result)}`);
        break;
      }
    }
  }

  const final = room.getState();
  const alive = final.players.filter(p => p.status === "alive").length;
  log.push(`Result: ${JSON.stringify(final.result)} | ${rounds} rounds | ${alive}/${room.getPlayerIds().length} alive | L:${final.policyTrack.liberal} F:${final.policyTrack.fascist}`);
  return log;
}

// ─── Full Game Tests ────────────────────────────────────────────────────────────

describe.each([5, 6, 7, 8, 9, 10])("Full game with %d players", (playerCount) => {
  it("starts with correct roles", () => {
    const { room, ids } = startRoom(playerCount);
    const dist = ROLE_DISTRIBUTION[playerCount];
    const roles = room.getAllRoles();

    let liberals = 0, fascists = 0, hitlers = 0;
    for (const id of ids) {
      const role = roles[id].role;
      if (role === "liberal") liberals++;
      else if (role === "fascist") fascists++;
      else if (role === "hitler") hitlers++;
    }

    expect(liberals).toBe(dist.liberals);
    expect(fascists).toBe(dist.fascists);
    expect(hitlers).toBe(1);
    expect(liberals + fascists + hitlers).toBe(playerCount);
  });

  it("all players get correct private state", () => {
    const { room, ids } = startRoom(playerCount);
    const boardKey = getFascistBoardKey(playerCount);
    const roles = room.getAllRoles();
    const dist = ROLE_DISTRIBUTION[playerCount];

    for (const id of ids) {
      const priv = room.getPrivateState(id);
      expect(priv.playerId).toBe(id);
      expect(priv.role).toBe(roles[id].role);

      if (priv.role === "fascist") {
        expect(priv.knownHitlerId).toBeTruthy();
        // In 5-6p there's only 1 fascist so knownFascists could be empty (no OTHER fascists)
        if (dist.fascists > 1) {
          expect(priv.knownFascists.length).toBeGreaterThan(0);
        }
      }

      if (priv.role === "hitler") {
        if (boardKey === "5-6") {
          expect(priv.knownFascists.length).toBe(dist.fascists);
        } else {
          expect(priv.knownFascists.length).toBe(0);
        }
      }
    }
  });

  it("president receives 3 policy cards in legislative phase", () => {
    const { room } = startRoom(playerCount);

    // Pass election
    const state = room.getState();
    const president = state.currentPresidentId!;
    const chancellor = pickChancellor(room);
    room.nominateChancellor(president, chancellor);
    for (const id of getAliveIds(room)) room.castVote(id, true);
    room.resolveVote();
    room.advanceAfterVote();

    const priv = room.getPrivateState(president);
    expect(priv.policyChoices).toBeDefined();
    expect(priv.policyChoices!.length).toBe(3);
  });

  it("chancellor receives 2 cards after president discards", () => {
    const { room } = startRoom(playerCount);

    const state = room.getState();
    const president = state.currentPresidentId!;
    const chancellor = pickChancellor(room);
    room.nominateChancellor(president, chancellor);
    for (const id of getAliveIds(room)) room.castVote(id, true);
    room.resolveVote();
    room.advanceAfterVote();

    const chancellorPolicies = room.presidentDiscard(president, 0);
    expect(chancellorPolicies.length).toBe(2);

    const priv = room.getPrivateState(chancellor);
    expect(priv.policyChoices).toBeDefined();
    expect(priv.policyChoices!.length).toBe(2);
  });

  it("plays a complete game to a win condition", () => {
    const { room } = startRoom(playerCount);
    const log = playFullGame(room);

    const final = room.getState();
    expect(final.result).not.toBeNull();
    expect(final.phase).toBe("game-over");
    expect(["liberals", "fascists"]).toContain(final.result!.winner);

    // Verify consistency
    if (final.result!.condition === "liberals-policies") {
      expect(final.policyTrack.liberal).toBe(WIN_CONDITIONS.liberal.policies);
    }
    if (final.result!.condition === "fascists-policies") {
      expect(final.policyTrack.fascist).toBe(WIN_CONDITIONS.fascist.policies);
    }
    expect(log.length).toBeGreaterThan(2);
  });

  it("tracks draw/discard pile counts", () => {
    const { room } = startRoom(playerCount);
    expect(room.getState().drawPileCount).toBe(17);
    expect(room.getState().discardPileCount).toBe(0);

    // One legislative round
    const state = room.getState();
    const president = state.currentPresidentId!;
    const chancellor = pickChancellor(room);
    room.nominateChancellor(president, chancellor);
    for (const id of getAliveIds(room)) room.castVote(id, true);
    room.resolveVote();
    room.advanceAfterVote();

    room.presidentDiscard(president, 0);
    room.chancellorEnact(chancellor, 0);

    const s = room.getState();
    expect(s.drawPileCount).toBe(14);
    expect(s.discardPileCount).toBe(2);
  });

  it("handles failed elections and chaos", () => {
    const { room } = startRoom(playerCount);
    const initialTrack = { ...room.getState().policyTrack };

    // Fail 3 elections
    for (let fail = 0; fail < 3; fail++) {
      const state = room.getState();
      if (state.result) break;
      const president = state.currentPresidentId!;
      const chancellor = pickChancellor(room);
      room.nominateChancellor(president, chancellor);
      for (const id of getAliveIds(room)) room.castVote(id, false);
      const { result, chaosPolicy } = room.resolveVote();
      expect(result).toBe("failed");

      if (fail === 2) {
        expect(chaosPolicy).toBeDefined();
        const newTrack = room.getState().policyTrack;
        expect(newTrack.liberal + newTrack.fascist).toBe(
          initialTrack.liberal + initialTrack.fascist + 1
        );
      }

      if (!room.getState().result) room.advanceAfterVote();
    }
  });

  it("enforces term limits", () => {
    const { room } = startRoom(playerCount);

    // Elect and complete a legislative session
    const state = room.getState();
    const president = state.currentPresidentId!;
    const chancellor = pickChancellor(room);
    room.nominateChancellor(president, chancellor);
    for (const id of getAliveIds(room)) room.castVote(id, true);
    room.resolveVote();
    room.advanceAfterVote();

    room.presidentDiscard(president, 0);
    const { power } = room.chancellorEnact(chancellor, 0);

    if (room.getState().result) return;
    if (power) {
      handleExecutivePower(room, power, []);
      if (room.getState().result) return;
    }

    // Now the last chancellor should be term-limited
    const newState = room.getState();
    if (newState.phase !== "election-nominate") return;
    const newPresident = newState.currentPresidentId!;
    // If the presidency rotated onto the old chancellor, self-nomination is
    // rejected before the term-limit check — nothing to assert here.
    if (newPresident === chancellor) return;

    expect(() => {
      room.nominateChancellor(newPresident, chancellor);
    }).toThrow("term-limited");
  });

  it("rotates presidents", () => {
    const { room } = startRoom(playerCount);
    const seenPresidents = new Set<string>();

    let rounds = 0;
    while (rounds < playerCount + 2 && !room.getState().result) {
      rounds++;
      const state = room.getState();
      if (state.phase !== "election-nominate") break;

      seenPresidents.add(state.currentPresidentId!);

      const president = state.currentPresidentId!;
      const chancellor = pickChancellor(room);
      room.nominateChancellor(president, chancellor);
      for (const id of getAliveIds(room)) room.castVote(id, true);
      room.resolveVote();
      if (room.getState().result) break;
      room.advanceAfterVote();
      if (room.getState().result) break;

      const legState = room.getState();
      if (legState.phase !== "legislative-president") break;

      room.presidentDiscard(president, 0);
      const { power } = room.chancellorEnact(chancellor, 0);
      if (room.getState().result) break;
      if (power) {
        handleExecutivePower(room, power, []);
        if (room.getState().result) break;
      }
    }

    if (!room.getState().result) {
      expect(seenPresidents.size).toBeGreaterThan(1);
    }
  });
});

// ─── Executive Power Tests ──────────────────────────────────────────────────────

describe("Executive powers trigger at correct slots", () => {
  it.each([
    { board: "5-6" as const },
    { board: "7-8" as const },
    { board: "9-10" as const },
  ])("$board board powers are correct", ({ board }) => {
    const powers = FASCIST_BOARD_POWERS[board];

    // Verify powers are in expected slots per the rules
    if (board === "5-6") {
      expect(powers[0]).toBeNull();
      expect(powers[1]).toBeNull();
      expect(powers[2]).toBe("policy-peek");
      expect(powers[3]).toBe("execution");
      expect(powers[4]).toBe("execution");
    }
    if (board === "7-8") {
      expect(powers[0]).toBeNull();
      expect(powers[1]).toBe("investigate-loyalty");
      expect(powers[2]).toBe("special-election");
      expect(powers[3]).toBe("execution");
      expect(powers[4]).toBe("execution");
    }
    if (board === "9-10") {
      expect(powers[0]).toBe("investigate-loyalty");
      expect(powers[1]).toBe("investigate-loyalty");
      expect(powers[2]).toBe("special-election");
      expect(powers[3]).toBe("execution");
      expect(powers[4]).toBe("execution");
    }
  });
});

// ─── Cross-count summary ────────────────────────────────────────────────────────

describe("Cross-count game summary", () => {
  it("all player counts 5-10 complete a full game", () => {
    for (let count = 5; count <= 10; count++) {
      const { room } = startRoom(count);
      playFullGame(room);
      const final = room.getState();
      expect(final.result).not.toBeNull();
      expect(final.phase).toBe("game-over");
    }
  });
});
