import { describe, expect, test } from "vitest";
import { validateSchedule } from "@/features/scheduling/validate-schedule";
import type {
  CandidateCharacter,
  ScheduledSlot,
  ScheduledWave,
} from "@/features/scheduling/types";

const dealer = (id: string, accountId = `${id}-account`): CandidateCharacter => ({
  id,
  accountId,
  profileId: "profile",
  role: "dealer",
  fame: 60_000,
  strengthTier: "high",
  damageScore: 100,
  buffScore: null,
});
const buffer = (id: string, accountId = `${id}-account`): CandidateCharacter => ({
  id,
  accountId,
  profileId: "profile",
  role: "buffer",
  fame: 60_000,
  strengthTier: "high",
  damageScore: null,
  buffScore: 100,
});

const wave = (slots: ScheduledSlot[]): ScheduledWave => ({
  id: "wave-1",
  difficulty: "hard",
  teams: {
    red: { color: "red", slots: slots.slice(0, 4) },
    yellow: { color: "yellow", slots: slots.slice(4, 8) },
    green: { color: "green", slots: slots.slice(8, 12) },
  },
  gaps: [],
});

const completeSlots = (): ScheduledSlot[] =>
  ["red", "yellow", "green"].flatMap((team) => [
    { slotId: `${team}-1`, role: "buffer", character: buffer(`${team}-b`) },
    ...[2, 3, 4].map((index) => ({
      slotId: `${team}-${index}`,
      role: "dealer" as const,
      character: dealer(`${team}-d${index}`),
    })),
  ]);

describe("validateSchedule", () => {
  test("accepts a complete three-buffer nine-dealer wave", () => {
    expect(validateSchedule({ waves: [wave(completeSlots())] })).toEqual([]);
  });

  test("reports duplicate weekly characters and duplicate same-wave accounts as blocking", () => {
    const slots = completeSlots();
    slots[1] = { ...slots[1], character: dealer("duplicate", "shared-account") };
    slots[5] = { ...slots[5], character: dealer("duplicate", "shared-account") };

    const issues = validateSchedule({
      waves: [wave(slots)],
      weeklyUsedCharacterIds: ["duplicate"],
    });

    expect(issues.filter((issue) => issue.severity === "blocking").map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["duplicate_weekly_character", "duplicate_wave_account", "duplicate_character"]),
    );
  });

  test("reports empty, wrong-role, missing-buffer, and threshold warnings", () => {
    const slots = completeSlots();
    slots[0] = { ...slots[0], character: dealer("wrong") };
    slots[1] = { ...slots[1], character: null };

    const issues = validateSchedule({
      waves: [wave(slots)],
      difficultyPresets: {
        hard: { minimumFame: 90_000 },
      },
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["empty_slot", "wrong_role", "missing_buffer", "below_threshold"]),
    );
    expect(issues.every((issue) => issue.severity === "warning")).toBe(true);
  });
});
