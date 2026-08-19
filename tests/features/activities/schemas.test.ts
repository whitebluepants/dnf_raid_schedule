import { describe, expect, test } from "vitest";
import {
  difficultyPresetSchema,
  raidEventSchema,
} from "@/features/activities/schemas";

const presetId = "00000000-0000-4000-8000-000000000101";

describe("raid event schema", () => {
  test("accepts an ordered event containing normal, hard and judgment waves", () => {
    expect(
      raidEventSchema.safeParse({
        title: "周六攻坚",
        eventDate: "2026-08-22T12:00:00.000Z",
        gameWeek: "2026-W34",
        waves: [
          { order: 1, difficulty: "normal" },
          { order: 2, difficulty: "hard" },
          { order: 3, difficulty: "judgment" },
        ],
      }).success,
    ).toBe(true);
  });

  test("rejects events without waves or with a duplicate wave order", () => {
    const base = {
      title: "周六攻坚",
      eventDate: "2026-08-22T12:00:00.000Z",
      gameWeek: "2026-W34",
    };

    expect(raidEventSchema.safeParse({ ...base, waves: [] }).success).toBe(false);
    expect(
      raidEventSchema.safeParse({
        ...base,
        waves: [
          { order: 1, difficulty: "normal" },
          { order: 1, difficulty: "hard" },
        ],
      }).success,
    ).toBe(false);
    expect(
      raidEventSchema.safeParse({
        ...base,
        waves: [
          { order: 1, difficulty: "normal" },
          { order: 3, difficulty: "hard" },
        ],
      }).success,
    ).toBe(false);
  });

  test("rejects an invalid game week and difficulty references below zero", () => {
    expect(
      raidEventSchema.safeParse({
        title: "周六攻坚",
        eventDate: "2026-08-22T12:00:00.000Z",
        gameWeek: "2026-34",
        waves: [{ order: 1, difficulty: "hard" }],
      }).success,
    ).toBe(false);
    expect(
      difficultyPresetSchema.safeParse({
        presetId,
        minimumFame: -1,
        autoAssignmentEnabled: true,
      }).success,
    ).toBe(false);
  });
});
