import { describe, expect, test } from "vitest";
import { generateSchedule } from "@/features/scheduling/generate-schedule";
import type { CandidateCharacter, GenerateScheduleInput } from "@/features/scheduling/types";

const character = (
  id: string,
  role: CandidateCharacter["role"],
  index: number,
): CandidateCharacter => ({
  id,
  accountId: `account-${index}`,
  profileId: `profile-${index % 4}`,
  role,
  fame: role === "buffer" ? 70_000 - index : 80_000 - index,
  strengthTier: index % 3 === 0 ? "high" : "medium",
  damageScore: role === "dealer" ? 1_000 - index : null,
  buffScore: role === "buffer" ? 1_000 - index : null,
});

const input = (): GenerateScheduleInput => ({
  characters: [
    ...Array.from({ length: 6 }, (_, index) => character(`buffer-${index}`, "buffer", index)),
    ...Array.from({ length: 18 }, (_, index) => character(`dealer-${index}`, "dealer", index + 10)),
  ],
  waves: [
    { id: "normal-wave", difficulty: "normal" },
    { id: "hard-wave", difficulty: "hard" },
  ],
});

describe("generateSchedule", () => {
  test("creates two complete waves, with hard handled first", () => {
    const generated = generateSchedule(input());

    expect(generated.waves.map((wave) => wave.id)).toEqual(["hard-wave", "normal-wave"]);
    expect(generated.waves.every((wave) => wave.gaps.length === 0)).toBe(true);
    expect(
      generated.waves.flatMap((wave) => Object.values(wave.teams).flatMap((team) => team.slots)).filter((slot) => slot.character),
    ).toHaveLength(24);
  });

  test("never duplicates a character or account within a wave and is deterministic", () => {
    const first = generateSchedule(input());
    const second = generateSchedule(input());

    expect(second).toEqual(first);
    for (const wave of first.waves) {
      const characters = Object.values(wave.teams).flatMap((team) => team.slots.flatMap((slot) => (slot.character ? [slot.character.id] : [])));
      expect(new Set(characters).size).toBe(characters.length);
      const accounts = Object.values(wave.teams).flatMap((team) => team.slots.flatMap((slot) => (slot.character ? [slot.character.accountId] : [])));
      expect(new Set(accounts).size).toBe(accounts.length);
    }
  });

  test("preserves locked assignments and emits explicit gaps when buffers are scarce", () => {
    const lockedInput: GenerateScheduleInput = {
      ...input(),
      characters: input().characters.filter((character) => character.role === "dealer").slice(0, 9),
      waves: [
        {
          id: "wave-1",
          difficulty: "hard",
          lockedAssignments: [{ team: "red", slotIndex: 1, characterId: "missing-buffer" }],
        },
      ],
    };

    const generated = generateSchedule(lockedInput);
    const locked = generated.waves[0].teams.red.slots[0];

    expect(locked.locked).toBe(true);
    expect(locked.character?.id).toBe("missing-buffer");
    expect(generated.waves[0].gaps).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: "buffer" })]),
    );
  });

  test("places stronger dealers in red, then yellow, then green", () => {
    const generated = generateSchedule(input());
    const hard = generated.waves[0];
    const tierScore = (team: "red" | "yellow" | "green") =>
      hard.teams[team].slots.slice(1).reduce(
        (sum, slot) => sum + ({ high: 3, medium: 2, low: 1 }[slot.character?.strengthTier ?? "low"]),
        0,
      );

    expect(tierScore("red")).toBeGreaterThanOrEqual(tierScore("yellow"));
    expect(tierScore("yellow")).toBeGreaterThanOrEqual(tierScore("green"));
  });
});
