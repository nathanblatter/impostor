import { describe, it, expect } from "vitest";
import { SecretHitlerEngine } from "./Engine.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createRoomWithPlayers(count: number): {
  room: SecretHitlerEngine;
  hostId: string;
  playerIds: string[];
} {
  const hostId = "host";
  const room = new SecretHitlerEngine(hostId, "Host");
  const playerIds = [hostId];
  for (let i = 1; i < count; i++) {
    const id = `p${i}`;
    room.addPlayer(id, `Player${i}`);
    playerIds.push(id);
  }
  return { room, hostId, playerIds };
}

function startGame(room: SecretHitlerEngine, hostId: string): void {
  room.startGame(hostId);
  room.acknowledgeRoles();
}

function createStartedGame(count: number): {
  room: SecretHitlerEngine;
  hostId: string;
  playerIds: string[];
} {
  const result = createRoomWithPlayers(count);
  startGame(result.room, result.hostId);
  return result;
}

function getPresidentAndOther(room: SecretHitlerEngine, playerIds: string[]): {
  presidentId: string;
  otherId: string;
} {
  const state = room.getState();
  const presidentId = state.currentPresidentId!;
  const otherId = playerIds.find(
    id => id !== presidentId && room.getState().lastElectedGovernment?.chancellorId !== id
  )!;
  return { presidentId, otherId };
}

function electGovernment(
  room: SecretHitlerEngine,
  playerIds: string[],
  presidentId?: string,
  chancellorId?: string
): { presidentId: string; chancellorId: string } {
  const state = room.getState();
  const pId = presidentId ?? state.currentPresidentId!;
  const cId =
    chancellorId ??
    playerIds.find(id => {
      if (id === pId) return false;
      const last = room.getState().lastElectedGovernment;
      if (!last) return true;
      // Avoid term-limited players
      if (id === last.chancellorId) return false;
      if (playerIds.length > 5 && id === last.presidentId) return false;
      return true;
    })!;

  room.nominateChancellor(pId, cId);

  // Everyone votes yes
  const alivePlayers = playerIds.filter(
    id => room.getState().players.find(p => p.id === id)?.status === "alive"
  );
  for (const pid of alivePlayers) {
    room.castVote(pid, true);
  }
  room.resolveVote();
  room.advanceAfterVote();

  return { presidentId: pId, chancellorId: cId };
}

function failElection(room: SecretHitlerEngine, playerIds: string[]): void {
  const state = room.getState();
  const pId = state.currentPresidentId!;
  const aliveIds = state.players.filter(p => p.status === "alive").map(p => p.id);
  const aliveCount = aliveIds.length;
  const cId = aliveIds.find(id => {
    if (id === pId) return false;
    const last = room.getState().lastElectedGovernment;
    if (!last) return true;
    if (id === last.chancellorId) return false;
    if (aliveCount > 5 && id === last.presidentId) return false;
    return true;
  })!;

  room.nominateChancellor(pId, cId);

  // Everyone votes no
  const alivePlayers = playerIds.filter(
    id => room.getState().players.find(p => p.id === id)?.status === "alive"
  );
  for (const pid of alivePlayers) {
    room.castVote(pid, false);
  }
  room.resolveVote();
  room.advanceAfterVote();
}

function completeLegislativeSession(
  room: SecretHitlerEngine,
  presidentId: string,
  chancellorId: string,
  presidentDiscardIndex = 0,
  chancellorEnactIndex = 0
): { enacted: string } {
  room.presidentDiscard(presidentId, presidentDiscardIndex);
  const result = room.chancellorEnact(chancellorId, chancellorEnactIndex);
  return { enacted: result.enacted };
}

function getRoleCounts(room: SecretHitlerEngine, playerIds: string[]) {
  const roles = room.getAllRoles();
  let liberals = 0;
  let fascists = 0;
  let hitlers = 0;
  for (const id of playerIds) {
    const role = roles[id].role;
    if (role === "liberal") liberals++;
    else if (role === "fascist") fascists++;
    else if (role === "hitler") hitlers++;
  }
  return { liberals, fascists, hitlers };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SecretHitlerEngine", () => {
  // ─── Lobby ────────────────────────────────────────────────────────────────

  describe("Lobby", () => {
    it("should create a room with the host as the first player", () => {
      const room = new SecretHitlerEngine("host1", "Alice");
      const state = room.getState();
      expect(state.phase).toBe("lobby");
      expect(room.getHostId()).toBe("host1");
      expect(room.hasPlayer("host1")).toBe(true);
      expect(room.getPlayerIds()).toEqual(["host1"]);
    });

    it("should add players up to 10", () => {
      const { room } = createRoomWithPlayers(10);
      expect(room.getPlayerIds().length).toBe(10);
      expect(room.getState().players.length).toBe(10);
    });

    it("should reject adding more than 10 players", () => {
      const { room } = createRoomWithPlayers(10);
      expect(() => room.addPlayer("extra", "Extra")).toThrow("Room is full");
    });

    it("should reject adding players after game has started", () => {
      const { room, hostId } = createRoomWithPlayers(5);
      startGame(room, hostId);
      expect(() => room.addPlayer("late", "Late")).toThrow("Game already started");
    });

    it("should remove a player in the lobby", () => {
      const { room } = createRoomWithPlayers(5);
      room.removePlayer("p1");
      expect(room.hasPlayer("p1")).toBe(false);
      expect(room.getPlayerIds().length).toBe(4);
    });

    it("should disconnect (not remove) a player after game starts", () => {
      const { room, hostId } = createRoomWithPlayers(5);
      startGame(room, hostId);
      room.removePlayer("p1");
      expect(room.hasPlayer("p1")).toBe(true);
      const p = room.getState().players.find(p => p.id === "p1");
      expect(p?.isConnected).toBe(false);
    });

    it("should reconnect a disconnected player", () => {
      const { room, hostId } = createRoomWithPlayers(5);
      startGame(room, hostId);
      room.removePlayer("p1");
      room.reconnectPlayer("p1");
      const p = room.getState().players.find(p => p.id === "p1");
      expect(p?.isConnected).toBe(true);
    });

    it("should mark connection state via setConnected", () => {
      const { room, hostId } = createRoomWithPlayers(5);
      startGame(room, hostId);
      room.setConnected("p1", false);
      expect(room.getState().players.find(p => p.id === "p1")?.isConnected).toBe(false);
      room.setConnected("p1", true);
      expect(room.getState().players.find(p => p.id === "p1")?.isConnected).toBe(true);
    });

    it("should require the host to start the game", () => {
      const { room } = createRoomWithPlayers(5);
      expect(() => room.startGame("p1")).toThrow("Only the host can start");
    });

    it("should require at least 5 players to start", () => {
      const { room, hostId } = createRoomWithPlayers(4);
      expect(() => room.startGame(hostId)).toThrow("Need at least 5 players");
    });

    it("should not allow starting the game twice", () => {
      const { room, hostId } = createRoomWithPlayers(5);
      room.startGame(hostId);
      expect(() => room.startGame(hostId)).toThrow("Game already started");
    });

    it("should set phase to role-reveal after starting", () => {
      const { room, hostId } = createRoomWithPlayers(5);
      room.startGame(hostId);
      expect(room.getState().phase).toBe("role-reveal");
    });

    it("should add AI players and flag them", () => {
      const { room } = createRoomWithPlayers(4);
      room.addAIPlayer("ai_0", "Greta");
      expect(room.isAIPlayer("ai_0")).toBe(true);
      expect(room.isAIPlayer("p1")).toBe(false);
      const ai = room.getState().players.find(p => p.id === "ai_0");
      expect(ai?.isAI).toBe(true);
    });
  });

  // ─── Role Assignment ──────────────────────────────────────────────────────

  describe("Role Assignment", () => {
    it("should assign 3 liberals, 1 fascist, 1 hitler for 5 players", () => {
      const { room, hostId, playerIds } = createRoomWithPlayers(5);
      room.startGame(hostId);
      const counts = getRoleCounts(room, playerIds);
      expect(counts).toEqual({ liberals: 3, fascists: 1, hitlers: 1 });
    });

    it("should assign 4 liberals, 2 fascists, 1 hitler for 7 players", () => {
      const { room, hostId, playerIds } = createRoomWithPlayers(7);
      room.startGame(hostId);
      const counts = getRoleCounts(room, playerIds);
      expect(counts).toEqual({ liberals: 4, fascists: 2, hitlers: 1 });
    });

    it("should assign 6 liberals, 3 fascists, 1 hitler for 10 players", () => {
      const { room, hostId, playerIds } = createRoomWithPlayers(10);
      room.startGame(hostId);
      const counts = getRoleCounts(room, playerIds);
      expect(counts).toEqual({ liberals: 6, fascists: 3, hitlers: 1 });
    });

    it("should provide correct private state via getPrivateState", () => {
      const { room, hostId, playerIds } = createRoomWithPlayers(5);
      room.startGame(hostId);
      const roles = room.getAllRoles();
      for (const id of playerIds) {
        const priv = room.getPrivateState(id);
        expect(priv.playerId).toBe(id);
        expect(priv.role).toBe(roles[id].role);
        if (roles[id].role === "liberal") {
          expect(priv.partyMembership).toBe("liberal");
        } else {
          expect(priv.partyMembership).toBe("fascist");
        }
      }
    });

    it("should let fascists know hitler and other fascists", () => {
      const { room, hostId, playerIds } = createRoomWithPlayers(7);
      room.startGame(hostId);
      const roles = room.getAllRoles();
      const fascistId = playerIds.find(id => roles[id].role === "fascist")!;
      const hitlerId = playerIds.find(id => roles[id].role === "hitler")!;
      const priv = room.getPrivateState(fascistId);
      expect(priv.knownHitlerId).toBe(hitlerId);
      expect(priv.knownFascists.length).toBeGreaterThan(0);
    });

    it("should let hitler know fascists in 5-6 player games", () => {
      const { room, hostId, playerIds } = createRoomWithPlayers(5);
      room.startGame(hostId);
      const roles = room.getAllRoles();
      const hitlerId = playerIds.find(id => roles[id].role === "hitler")!;
      const priv = room.getPrivateState(hitlerId);
      // In 5p games, Hitler knows fascists
      expect(priv.knownFascists.length).toBe(1);
    });

    it("should NOT let hitler know fascists in 7+ player games", () => {
      const { room, hostId, playerIds } = createRoomWithPlayers(7);
      room.startGame(hostId);
      const roles = room.getAllRoles();
      const hitlerId = playerIds.find(id => roles[id].role === "hitler")!;
      const priv = room.getPrivateState(hitlerId);
      expect(priv.knownFascists).toEqual([]);
      expect(priv.knownHitlerId).toBeNull();
    });

    it("should expose all roles via getAllRoles", () => {
      const { room, hostId, playerIds } = createRoomWithPlayers(5);
      room.startGame(hostId);
      const roles = room.getAllRoles();
      expect(Object.keys(roles).length).toBe(5);
      for (const id of playerIds) {
        expect(roles[id]).toHaveProperty("role");
        expect(roles[id]).toHaveProperty("name");
      }
    });
  });

  // ─── Election ─────────────────────────────────────────────────────────────

  describe("Election", () => {
    it("should move to election-nominate phase after acknowledging roles", () => {
      const { room, hostId } = createRoomWithPlayers(5);
      startGame(room, hostId);
      expect(room.getState().phase).toBe("election-nominate");
    });

    it("should set a current president", () => {
      const { room, playerIds } = createStartedGame(5);
      const state = room.getState();
      expect(state.currentPresidentId).not.toBeNull();
      expect(playerIds).toContain(state.currentPresidentId);
    });

    it("should allow president to nominate a valid chancellor", () => {
      const { room, playerIds } = createStartedGame(5);
      const { presidentId, otherId } = getPresidentAndOther(room, playerIds);
      room.nominateChancellor(presidentId, otherId);
      expect(room.getState().phase).toBe("election-vote");
      expect(room.getState().nominatedChancellorId).toBe(otherId);
    });

    it("should reject nomination by non-president", () => {
      const { room, playerIds } = createStartedGame(5);
      const presidentId = room.getState().currentPresidentId!;
      const nonPresident = playerIds.find(id => id !== presidentId)!;
      const other = playerIds.find(id => id !== presidentId && id !== nonPresident)!;
      expect(() => room.nominateChancellor(nonPresident, other)).toThrow("Not the president");
    });

    it("should enforce term limits - cannot nominate last chancellor", () => {
      const { room, playerIds } = createStartedGame(5);

      // First election - elect someone
      const { presidentId: p1, chancellorId: c1 } = electGovernment(room, playerIds);
      completeLegislativeSession(room, p1, c1);

      // Now in next election, previous chancellor c1 should be term-limited
      const newPresidentId = room.getState().currentPresidentId!;
      if (newPresidentId !== c1) {
        expect(() => room.nominateChancellor(newPresidentId, c1)).toThrow("term-limited");
      }
    });

    it("should enforce term limits - cannot nominate last president in 6+ player games", () => {
      const { room, playerIds } = createStartedGame(7);

      const { presidentId: p1, chancellorId: c1 } = electGovernment(room, playerIds);
      completeLegislativeSession(room, p1, c1);

      const newPresidentId = room.getState().currentPresidentId!;
      if (newPresidentId !== p1 && newPresidentId !== c1) {
        // Both p1 and c1 should be term-limited in 7 player game
        expect(() => room.nominateChancellor(newPresidentId, p1)).toThrow("term-limited");
        expect(() => room.nominateChancellor(newPresidentId, c1)).toThrow("term-limited");
      }
    });

    it("should track votes and detect when all have voted", () => {
      const { room, playerIds } = createStartedGame(5);
      const presidentId = room.getState().currentPresidentId!;
      const otherId = playerIds.find(id => id !== presidentId)!;
      room.nominateChancellor(presidentId, otherId);

      // Vote one by one
      const voters = [...playerIds];
      for (let i = 0; i < voters.length - 1; i++) {
        const result = room.castVote(voters[i], true);
        expect(result.allVoted).toBe(false);
      }
      const lastResult = room.castVote(voters[voters.length - 1], true);
      expect(lastResult.allVoted).toBe(true);
    });

    it("should reject double-voting", () => {
      const { room, playerIds } = createStartedGame(5);
      const presidentId = room.getState().currentPresidentId!;
      const otherId = playerIds.find(id => id !== presidentId)!;
      room.nominateChancellor(presidentId, otherId);
      room.castVote(playerIds[0], true);
      expect(() => room.castVote(playerIds[0], false)).toThrow("Already voted");
    });

    it("should pass vote with majority yes", () => {
      const { room, playerIds } = createStartedGame(5);
      const presidentId = room.getState().currentPresidentId!;
      const otherId = playerIds.find(id => id !== presidentId)!;
      room.nominateChancellor(presidentId, otherId);

      // 3 yes, 2 no
      room.castVote(playerIds[0], true);
      room.castVote(playerIds[1], true);
      room.castVote(playerIds[2], true);
      room.castVote(playerIds[3], false);
      room.castVote(playerIds[4], false);

      const result = room.resolveVote();
      expect(result.result).toBe("passed");
      expect(room.getState().voteResult).toBe("passed");
    });

    it("should fail vote without majority", () => {
      const { room, playerIds } = createStartedGame(5);
      const presidentId = room.getState().currentPresidentId!;
      const otherId = playerIds.find(id => id !== presidentId)!;
      room.nominateChancellor(presidentId, otherId);

      // 2 yes, 3 no
      room.castVote(playerIds[0], true);
      room.castVote(playerIds[1], true);
      room.castVote(playerIds[2], false);
      room.castVote(playerIds[3], false);
      room.castVote(playerIds[4], false);

      const result = room.resolveVote();
      expect(result.result).toBe("failed");
    });

    it("should fail vote on tie", () => {
      // A tie means yesCount is NOT > aliveCount/2, so it fails
      const { room, playerIds } = createStartedGame(6);
      const presidentId = room.getState().currentPresidentId!;
      const otherId = playerIds.find(id => id !== presidentId)!;
      room.nominateChancellor(presidentId, otherId);

      // 3 yes, 3 no with 6 players => 3 > 3 is false => fail
      room.castVote(playerIds[0], true);
      room.castVote(playerIds[1], true);
      room.castVote(playerIds[2], true);
      room.castVote(playerIds[3], false);
      room.castVote(playerIds[4], false);
      room.castVote(playerIds[5], false);

      const result = room.resolveVote();
      expect(result.result).toBe("failed");
    });

    it("should increment election tracker on failed vote", () => {
      const { room, playerIds } = createStartedGame(5);
      expect(room.getState().electionTracker).toBe(0);

      failElection(room, playerIds);
      expect(room.getState().electionTracker).toBe(1);

      failElection(room, playerIds);
      expect(room.getState().electionTracker).toBe(2);
    });

    it("should enact chaos policy on 3 failed elections", () => {
      const { room, playerIds } = createStartedGame(5);

      failElection(room, playerIds);
      failElection(room, playerIds);

      // Third failure triggers chaos
      const presidentId = room.getState().currentPresidentId!;
      const otherId = playerIds.find(id => {
        if (id === presidentId) return false;
        const last = room.getState().lastElectedGovernment;
        if (!last) return true;
        if (id === last.chancellorId) return false;
        return true;
      })!;
      room.nominateChancellor(presidentId, otherId);
      for (const pid of playerIds) {
        room.castVote(pid, false);
      }
      const result = room.resolveVote();
      expect(result.result).toBe("failed");
      expect(result.chaosPolicy).toBeDefined();
      expect(["liberal", "fascist"]).toContain(result.chaosPolicy);
      // Election tracker resets after chaos
      expect(room.getState().electionTracker).toBe(0);
    });

    it("should reset election tracker on passed vote", () => {
      const { room, playerIds } = createStartedGame(5);
      failElection(room, playerIds);
      expect(room.getState().electionTracker).toBe(1);

      // Now pass an election
      electGovernment(room, playerIds);
      expect(room.getState().electionTracker).toBe(0);
    });

    it("should clear term limits after chaos policy", () => {
      const { room, playerIds } = createStartedGame(5);
      // First, elect a government to set term limits
      const { presidentId: p1, chancellorId: c1 } = electGovernment(room, playerIds);
      completeLegislativeSession(room, p1, c1);

      expect(room.getState().lastElectedGovernment).not.toBeNull();

      // Fail 3 elections to trigger chaos
      failElection(room, playerIds);
      failElection(room, playerIds);

      const presidentId = room.getState().currentPresidentId!;
      const otherId = playerIds.find(id => {
        if (id === presidentId) return false;
        const last = room.getState().lastElectedGovernment;
        if (!last) return true;
        if (id === last.chancellorId) return false;
        return true;
      })!;
      room.nominateChancellor(presidentId, otherId);
      for (const pid of playerIds) {
        room.castVote(pid, false);
      }
      room.resolveVote();

      // Term limits should be cleared
      expect(room.getState().lastElectedGovernment).toBeNull();
    });
  });

  // ─── Legislative Session ──────────────────────────────────────────────────

  describe("Legislative Session", () => {
    it("should give the president 3 policies", () => {
      const { room, playerIds } = createStartedGame(5);
      electGovernment(room, playerIds);
      const policies = room.getPresidentPolicies();
      expect(policies.length).toBe(3);
      for (const p of policies) {
        expect(["liberal", "fascist"]).toContain(p);
      }
    });

    it("should let president discard 1 and give chancellor 2", () => {
      const { room, playerIds } = createStartedGame(5);
      const { presidentId } = electGovernment(room, playerIds);
      const chancellorPolicies = room.presidentDiscard(presidentId, 0);
      expect(chancellorPolicies.length).toBe(2);
      expect(room.getState().phase).toBe("legislative-chancellor");
    });

    it("should reject president discard with invalid index", () => {
      const { room, playerIds } = createStartedGame(5);
      const { presidentId } = electGovernment(room, playerIds);
      expect(() => room.presidentDiscard(presidentId, 5)).toThrow("Invalid index");
      expect(() => room.presidentDiscard(presidentId, -1)).toThrow("Invalid index");
    });

    it("should let chancellor enact 1 policy", () => {
      const { room, playerIds } = createStartedGame(5);
      const { presidentId, chancellorId } = electGovernment(room, playerIds);
      room.presidentDiscard(presidentId, 0);
      const result = room.chancellorEnact(chancellorId, 0);
      expect(["liberal", "fascist"]).toContain(result.enacted);
    });

    it("should update policy track on enacted policy", () => {
      const { room, playerIds } = createStartedGame(5);
      const { presidentId, chancellorId } = electGovernment(room, playerIds);
      const initialTrack = { ...room.getState().policyTrack };
      room.presidentDiscard(presidentId, 0);
      const result = room.chancellorEnact(chancellorId, 0);

      const newTrack = room.getState().policyTrack;
      if (result.enacted === "liberal") {
        expect(newTrack.liberal).toBe(initialTrack.liberal + 1);
      } else {
        expect(newTrack.fascist).toBe(initialTrack.fascist + 1);
      }
    });

    it("should reject chancellor enact by non-chancellor", () => {
      const { room, playerIds } = createStartedGame(5);
      const { presidentId } = electGovernment(room, playerIds);
      room.presidentDiscard(presidentId, 0);
      expect(() => room.chancellorEnact(presidentId, 0)).toThrow("Not the chancellor");
    });

    it("should decrease draw pile count after drawing policies", () => {
      const { room, playerIds } = createStartedGame(5);
      const initialDrawCount = room.getState().drawPileCount;
      electGovernment(room, playerIds);
      // President was dealt 3 cards
      expect(room.getState().drawPileCount).toBe(initialDrawCount - 3);
    });
  });

  // ─── Executive Powers ─────────────────────────────────────────────────────

  describe("Executive Powers", () => {
    it("should return policy peek of top 3 cards", () => {
      const { room } = createStartedGame(5);
      // getPolicyPeek just returns top 3 of draw pile
      const peek = room.getPolicyPeek();
      expect(peek.length).toBe(3);
      for (const p of peek) {
        expect(["liberal", "fascist"]).toContain(p);
      }
    });

    it("should report correct party membership in private state", () => {
      const { room, playerIds } = createStartedGame(7);
      const roles = room.getAllRoles();
      const fascistPlayer = playerIds.find(id => roles[id].role === "fascist")!;
      const liberalPlayer = playerIds.find(id => roles[id].role === "liberal")!;

      const fascistMembership = room.getPrivateState(fascistPlayer).partyMembership;
      expect(fascistMembership).toBe("fascist");
      const liberalMembership = room.getPrivateState(liberalPlayer).partyMembership;
      expect(liberalMembership).toBe("liberal");
    });

    it("should reject investigating a player twice by the same president", () => {
      const { room, playerIds } = createStartedGame(7);
      const presidentId = room.getState().currentPresidentId!;
      const targetId = playerIds.find(id => id !== presidentId)!;

      // First investigation succeeds, then acknowledge to advance president
      const party = room.investigateLoyalty(presidentId, targetId);
      expect(["liberal", "fascist"]).toContain(party);
      room.acknowledgeInvestigation(presidentId);

      // President has advanced; cycle through elections until the same
      // player is president again, then try to investigate same target
      let safety = 0;
      while (room.getState().currentPresidentId !== presidentId && safety < 20) {
        safety++;
        const state = room.getState();
        if (state.phase !== "election-nominate") break;
        const pres = state.currentPresidentId!;
        const chanc = playerIds.find(
          id => id !== pres && id !== state.lastElectedGovernment?.chancellorId
            && (state.players.filter(p => p.status === "alive").length <= 5 || id !== state.lastElectedGovernment?.presidentId)
        )!;
        room.nominateChancellor(pres, chanc);
        for (const p of playerIds) {
          if (room.getState().players.find(pl => pl.id === p)?.status === "alive") {
            room.castVote(p, false);
          }
        }
        room.resolveVote();
        if (room.getState().result) return;
        room.advanceAfterVote();
      }

      // If we cycled back, try re-investigating the same target
      if (room.getState().currentPresidentId === presidentId && !room.getState().result) {
        expect(() => room.investigateLoyalty(presidentId, targetId)).toThrow("Already investigated");
      }
    });

    it("should change president on special election", () => {
      const { room, playerIds } = createStartedGame(7);
      const originalPresidentId = room.getState().currentPresidentId!;
      const targetId = playerIds.find(id => id !== originalPresidentId)!;

      room.callSpecialElection(originalPresidentId, targetId);
      expect(room.getState().currentPresidentId).toBe(targetId);
      expect(room.getState().phase).toBe("election-nominate");
    });

    it("should reject special election targeting self", () => {
      const { room } = createStartedGame(7);
      const presidentId = room.getState().currentPresidentId!;
      expect(() => room.callSpecialElection(presidentId, presidentId)).toThrow("Cannot choose yourself");
    });

    it("should kill a player on execution", () => {
      const { room, playerIds } = createStartedGame(7);
      const presidentId = room.getState().currentPresidentId!;
      const targetId = playerIds.find(id => id !== presidentId)!;

      room.executePlayer(presidentId, targetId);
      const targetPlayer = room.getState().players.find(p => p.id === targetId);
      expect(targetPlayer?.status).toBe("dead");
    });

    it("should end game as liberal win when hitler is executed", () => {
      const { room, playerIds } = createStartedGame(7);
      const roles = room.getAllRoles();
      const hitlerId = playerIds.find(id => roles[id].role === "hitler")!;
      const presidentId = room.getState().currentPresidentId!;

      // If president IS hitler, this scenario can't be exercised
      if (presidentId === hitlerId) {
        return;
      }

      const result = room.executePlayer(presidentId, hitlerId);
      expect(result.wasHitler).toBe(true);
      expect(room.getState().phase).toBe("game-over");
      expect(room.getState().result?.winner).toBe("liberals");
      expect(room.getState().result?.condition).toBe("liberals-hitler-killed");
    });

    it("should continue the game when a non-hitler player is executed", () => {
      const { room, playerIds } = createStartedGame(7);
      const roles = room.getAllRoles();
      const nonHitlertarget = playerIds.find(
        id => roles[id].role !== "hitler" && id !== room.getState().currentPresidentId
      )!;
      const presidentId = room.getState().currentPresidentId!;

      const result = room.executePlayer(presidentId, nonHitlertarget);
      expect(result.wasHitler).toBe(false);
      expect(room.getState().phase).toBe("election-nominate");
    });

    it("should acknowledge policy peek and advance to next election", () => {
      const { room } = createStartedGame(5);
      const presidentId = room.getState().currentPresidentId!;

      room.acknowledgePolicyPeek(presidentId);
      // Should advance to next president
      expect(room.getState().phase).toBe("election-nominate");
    });
  });

  // ─── Veto Power ───────────────────────────────────────────────────────────

  describe("Veto Power", () => {
    it("should reject veto when fewer than 5 fascist policies", () => {
      const { room, playerIds } = createStartedGame(5);
      const { presidentId, chancellorId } = electGovernment(room, playerIds);
      room.presidentDiscard(presidentId, 0);
      // Policy track has 0 fascist policies
      expect(() => room.requestVeto(chancellorId)).toThrow("Veto not unlocked yet");
    });

    it("should reject veto request when not in chancellor phase", () => {
      const { room } = createStartedGame(5);
      // We're in election-nominate phase
      expect(() => room.requestVeto("someone")).toThrow();
    });

    it("should reject respondToVeto when no veto was requested", () => {
      const { room } = createStartedGame(5);
      const presidentId = room.getState().currentPresidentId!;
      expect(() => room.respondToVeto(presidentId, true)).toThrow("No veto requested");
    });
  });

  // ─── Win Conditions ───────────────────────────────────────────────────────

  describe("Win Conditions", () => {
    it("should detect liberal win when hitler is killed", () => {
      const { room, playerIds } = createStartedGame(7);
      const roles = room.getAllRoles();
      const hitlerId = playerIds.find(id => roles[id].role === "hitler")!;
      const presidentId = room.getState().currentPresidentId!;

      if (presidentId !== hitlerId) {
        room.executePlayer(presidentId, hitlerId);
        expect(room.getState().result).toEqual({
          winner: "liberals",
          condition: "liberals-hitler-killed",
        });
      }
    });

    it("should not allow actions after game is over", () => {
      const { room, playerIds } = createStartedGame(7);
      const roles = room.getAllRoles();
      const hitlerId = playerIds.find(id => roles[id].role === "hitler")!;
      const presidentId = room.getState().currentPresidentId!;

      if (presidentId !== hitlerId) {
        room.executePlayer(presidentId, hitlerId);
        expect(room.getState().phase).toBe("game-over");

        // advanceAfterVote should be a no-op when game is over
        room.advanceAfterVote(); // should not throw, just return
        expect(room.getState().phase).toBe("game-over");
      }
    });
  });

  // ─── Deck Management ──────────────────────────────────────────────────────

  describe("Deck Management", () => {
    it("should start with correct number of policies (6 liberal + 11 fascist = 17)", () => {
      const { room, hostId } = createRoomWithPlayers(5);
      room.startGame(hostId);
      expect(room.getState().drawPileCount).toBe(17);
      expect(room.getState().discardPileCount).toBe(0);
    });

    it("should properly track draw and discard pile counts", () => {
      const { room, playerIds } = createStartedGame(5);
      const initialDraw = room.getState().drawPileCount;

      electGovernment(room, playerIds);

      // After dealing 3 to president, draw pile decreases by 3
      expect(room.getState().drawPileCount).toBe(initialDraw - 3);
    });
  });

  // ─── Special Election ─────────────────────────────────────────────────────

  describe("Special Election", () => {
    it("should reject special election targeting dead player", () => {
      const { room, playerIds } = createStartedGame(7);
      const presidentId = room.getState().currentPresidentId!;
      const targetId = playerIds.find(id => id !== presidentId)!;

      // Kill the target first
      room.executePlayer(presidentId, targetId);

      // If game isn't over, try special election on dead player
      if (room.getState().phase !== "game-over") {
        const newPresidentId = room.getState().currentPresidentId!;
        expect(() => room.callSpecialElection(newPresidentId, targetId)).toThrow("Invalid target");
      }
    });
  });

  // ─── Chat & Discussion Gate ───────────────────────────────────────────────

  describe("Chat & Discussion", () => {
    it("should append chat messages to the log", () => {
      const { room } = createStartedGame(5);
      const msg = room.addChatMessage("host", "hello there");
      expect(msg.playerName).toBe("Host");
      expect(msg.isAI).toBe(false);
      expect(room.getChatLog().length).toBe(1);
      expect(room.getState().chatLog[0].text).toBe("hello there");
    });

    it("should gate nomination behind the discussion ready threshold", () => {
      const { room, playerIds } = createStartedGame(5);
      expect(room.getState().awaitingDiscussion).toBe(true);

      // Threshold for 5 alive = floor(5/2)+1 = 3
      let r = room.castReadyVote(playerIds[0]);
      expect(r.canAdvance).toBe(false);
      r = room.castReadyVote(playerIds[1]);
      expect(r.canAdvance).toBe(false);
      r = room.castReadyVote(playerIds[2]);
      expect(r.canAdvance).toBe(true);
      expect(room.getState().awaitingDiscussion).toBe(false);
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────────────────

  describe("Edge Cases", () => {
    it("should throw for invalid player in getPrivateState", () => {
      const { room } = createStartedGame(5);
      expect(() => room.getPrivateState("nonexistent")).toThrow("Player not found");
    });

    it("should throw when nominating during wrong phase", () => {
      const { room, playerIds } = createStartedGame(5);
      const presidentId = room.getState().currentPresidentId!;
      const otherId = playerIds.find(id => id !== presidentId)!;

      // Nominate once to move to vote phase
      room.nominateChancellor(presidentId, otherId);

      // Try to nominate again during vote phase
      expect(() => room.nominateChancellor(presidentId, otherId)).toThrow(
        "Expected phase election-nominate"
      );
    });

    it("should throw when casting vote outside election-vote phase", () => {
      const { room, playerIds } = createStartedGame(5);
      // We're in election-nominate phase
      expect(() => room.castVote(playerIds[0], true)).toThrow();
    });

    it("should throw when getting president policies outside legislative phase", () => {
      const { room } = createStartedGame(5);
      expect(() => room.getPresidentPolicies()).toThrow("Expected phase legislative-president");
    });

    it("should properly report hasPlayer", () => {
      const room = new SecretHitlerEngine("host", "Host");
      expect(room.hasPlayer("host")).toBe(true);
      expect(room.hasPlayer("nobody")).toBe(false);
    });

    it("should properly report getHostId", () => {
      const room = new SecretHitlerEngine("myhost", "Host");
      expect(room.getHostId()).toBe("myhost");
    });

    it("should skip dead players in president rotation", () => {
      const { room, playerIds } = createStartedGame(7);
      const roles = room.getAllRoles();
      const nonHitlerTarget = playerIds.find(
        id => roles[id].role !== "hitler" && id !== room.getState().currentPresidentId
      )!;
      const presidentId = room.getState().currentPresidentId!;

      room.executePlayer(presidentId, nonHitlerTarget);

      if (room.getState().phase !== "game-over") {
        // The dead player should never become president
        const newPresidentId = room.getState().currentPresidentId!;
        expect(newPresidentId).not.toBe(nonHitlerTarget);
      }
    });
  });
});
