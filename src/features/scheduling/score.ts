import type { CandidateCharacter, CandidateScore, StrengthTier } from "./types";

const tierRank: Record<StrengthTier, number> = { high: 3, medium: 2, low: 1 };

export function scoreCandidate(candidate: CandidateCharacter): CandidateScore {
  return {
    candidate,
    tierRank: tierRank[candidate.strengthTier],
    metric: candidate.role === "buffer" ? (candidate.buffScore ?? 0) : (candidate.damageScore ?? 0),
  };
}

export function compareCandidates(left: CandidateScore, right: CandidateScore): number {
  return (
    right.tierRank - left.tierRank ||
    right.metric - left.metric ||
    right.candidate.fame - left.candidate.fame ||
    left.candidate.id.localeCompare(right.candidate.id)
  );
}
