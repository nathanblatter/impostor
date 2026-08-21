import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./AiPlayer.js", () => ({
  generateCodenamesWords: vi.fn(async () =>
    Array.from({ length: 25 }, (_, i) => `WORD${i}`)
  ),
  generateCodenamesHint: vi.fn(async () => ({ word: "HINT", count: 2 })),
}));

import { CodenamesGame } from "./CodenamesGame.js";

type Team = "red" | "blue";

function makePlayers(ids: string[]): Map<string, any> {
  return new Map(ids.map((id) => [id, { id, name: id } as any]));
}

function game(
  ids: string[],
  assignMode: "RANDOM" | "HOST" = "RANDOM",
  presetTeams?: Map<string, Team>,
  presetSpymasters?: { red: string | null; blue: string | null }
): CodenamesGame {
  return new CodenamesGame(
    makePlayers(ids),
    () => {},
    false,
    assignMode as any,
    presetTeams,
    presetSpymasters
  );
}

function internals(g: CodenamesGame) {
  const anyG = g as any;
  return {
    types: anyG.types as string[],
    teams: anyG.teams as Map<string, Team>,
    spymasters: anyG.spymasters as { red: string | null; blue: string | null },
    get subPhase() {
      return anyG.subPhase as string;
    },
    get winner() {
      return anyG.winner as Team | null;
    },
    get currentTurn() {
      return anyG.currentTurn as Team;
    },
    set currentTurn(t: Team) {
      anyG.currentTurn = t;
    },
  };
}

// Force a known turn and put the game into GUESS so we can exercise reveals.
function startGuessing(g: CodenamesGame, team: Team): { guesser: string; sm: string } {
  const s = internals(g);
  s.currentTurn = team;
  const sm = s.spymasters[team]!;
  const guesser = [...s.teams.entries()].find(
    ([id, t]) => t === team && id !== sm
  )![0];
  const err = g.giveClue(sm, "zebra", 2);
  expect(err).toBeNull();
  return { guesser, sm };
}

describe("HOST team assignment (impostor-4)", () => {
  const ids = ["a", "b", "c", "d"];

  it("honors preset teams and spymasters exactly", () => {
    const teams = new Map<string, Team>([
      ["a", "red"],
      ["b", "red"],
      ["c", "blue"],
      ["d", "blue"],
    ]);
    const g = game(ids, "HOST", teams, { red: "b", blue: "d" });
    const s = internals(g);
    expect([...s.teams.entries()].sort()).toEqual([...teams.entries()].sort());
    expect(s.spymasters).toEqual({ red: "b", blue: "d" });
  });

  it("falls back to the team's first member when the preset spymaster is on the wrong team", () => {
    const teams = new Map<string, Team>([
      ["a", "red"],
      ["b", "red"],
      ["c", "blue"],
      ["d", "blue"],
    ]);
    // "c" is blue — invalid as red spymaster.
    const g = game(ids, "HOST", teams, { red: "c", blue: null });
    const s = internals(g);
    expect(s.spymasters.red).toBe("a");
    expect(s.spymasters.blue).toBe("c");
  });

  it("defaults players missing from the preset map to red", () => {
    const teams = new Map<string, Team>([["a", "blue"]]);
    const g = game(ids, "HOST", teams, { red: null, blue: "a" });
    const s = internals(g);
    expect(s.teams.get("b")).toBe("red");
    expect(s.teams.get("c")).toBe("red");
    expect(s.teams.get("d")).toBe("red");
  });
});

describe("assassin instant loss (impostor-5)", () => {
  let g: CodenamesGame;

  beforeEach(() => {
    g = game(["a", "b", "c", "d"], "HOST",
      new Map<string, Team>([
        ["a", "red"],
        ["b", "red"],
        ["c", "blue"],
        ["d", "blue"],
      ]),
      { red: "a", blue: "c" });
  });

  it("guessing the assassin ends the game immediately with the other team winning", () => {
    const s = internals(g);
    const { guesser } = startGuessing(g, "red");
    const assassinIdx = s.types.findIndex((t) => t === "assassin");
    expect(assassinIdx).toBeGreaterThanOrEqual(0);

    const err = g.guess(guesser, assassinIdx);
    expect(err).toBeNull();
    expect(s.winner).toBe("blue");
    expect(s.subPhase).toBe("GAME_OVER");
  });

  it("rejects any further guesses and clues after the assassin ends the game", () => {
    const s = internals(g);
    const { guesser } = startGuessing(g, "red");
    g.guess(guesser, s.types.findIndex((t) => t === "assassin"));

    const otherIdx = s.types.findIndex((t) => t !== "assassin");
    expect(g.guess(guesser, otherIdx)).not.toBeNull();
    expect(g.giveClue(s.spymasters.blue!, "moon", 1)).toBe("Game is over");
  });

  it("the assassin loss goes to the guessing team regardless of which team guesses", () => {
    const s = internals(g);
    const { guesser } = startGuessing(g, "blue");
    g.guess(guesser, s.types.findIndex((t) => t === "assassin"));
    expect(s.winner).toBe("red");
  });
});

describe("core guess flow", () => {
  it("revealing the last of a team's cards wins the game", () => {
    const g = game(["a", "b", "c", "d"], "HOST",
      new Map<string, Team>([
        ["a", "red"],
        ["b", "red"],
        ["c", "blue"],
        ["d", "blue"],
      ]),
      { red: "a", blue: "c" });
    const s = internals(g);
    s.currentTurn = "red";
    // Reveal all but one red card up front.
    const redIdxs = s.types
      .map((t, i) => (t === "red" ? i : -1))
      .filter((i) => i >= 0);
    const anyG = g as any;
    for (const i of redIdxs.slice(0, -1)) anyG.revealed[i] = true;

    g.giveClue("a", "zebra", 1);
    const err = g.guess("b", redIdxs[redIdxs.length - 1]);
    expect(err).toBeNull();
    expect(s.winner).toBe("red");
    expect(s.subPhase).toBe("GAME_OVER");
  });

  it("guessing a neutral card ends the turn without a winner", () => {
    const g = game(["a", "b", "c", "d"], "HOST",
      new Map<string, Team>([
        ["a", "red"],
        ["b", "red"],
        ["c", "blue"],
        ["d", "blue"],
      ]),
      { red: "a", blue: "c" });
    const s = internals(g);
    const { guesser } = startGuessing(g, "red");
    const neutralIdx = s.types.findIndex((t) => t === "neutral");
    const err = g.guess(guesser, neutralIdx);
    expect(err).toBeNull();
    expect(s.winner).toBeNull();
    expect(s.currentTurn).toBe("blue");
    expect(s.subPhase).toBe("CLUE");
  });
});
