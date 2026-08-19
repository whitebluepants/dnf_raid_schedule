import { describe, expect, test } from "vitest";
import {
  compareCandidates,
  scoreCandidate,
} from "@/features/scheduling/score";
import type { CandidateCharacter } from "@/features/scheduling/types";

const candidate = (overrides: Partial<CandidateCharacter> = {}): CandidateCharacter => ({
  id: "c-1",
  accountId: "a-1",
  profileId: "p-1",
  role: "dealer",
  fame: 50_000,
  strengthTier: "medium",
  damageScore: 100,
  buffScore: null,
  ...overrides,
});

describe("candidate scoring", () => {
  test("strength tier dominates fame", () => {
    const high = scoreCandidate(candidate({ strengthTier: "high", fame: 40_000 }));
    const medium = scoreCandidate(candidate({ strengthTier: "medium", fame: 100_000 }));

    expect(compareCandidates(high, medium)).toBeLessThan(0);
  });

  test("uses the role-specific metric as a tie breaker", () => {
    const stronger = scoreCandidate(candidate({ damageScore: 120, fame: 50_000 }));
    const weaker = scoreCandidate(candidate({ damageScore: 80, fame: 50_000 }));

    expect(compareCandidates(stronger, weaker)).toBeLessThan(0);
  });

  test("uses stable id order for identical candidates", () => {
    const first = scoreCandidate(candidate({ id: "c-1" }));
    const second = scoreCandidate(candidate({ id: "c-2" }));

    expect(compareCandidates(first, second)).toBeLessThan(0);
  });
});
