import { compareCandidates, scoreCandidate } from "./score";
import type { CandidateInput, RankedCandidate } from "./types";

export function recommendCandidates(input: CandidateInput): RankedCandidate[] {
  const excludedCharacters = new Set(input.excludeCharacterIds ?? []);
  const excludedAccounts = new Set(input.excludeAccountIds ?? []);

  return input.characters
    .filter((character) => !input.role || character.role === input.role)
    .filter((character) => !excludedCharacters.has(character.id))
    .filter((character) => !excludedAccounts.has(character.accountId))
    .map((character) => {
      const score = scoreCandidate(character);
      const reasons = [`${character.strengthTier} 档`, `${character.fame} 名望`];
      if (input.preset?.minimumFame && character.fame < input.preset.minimumFame) {
        reasons.push("低于名望参考线");
      }
      return { character, score, reasons };
    })
    .sort((left, right) => compareCandidates(left.score, right.score));
}
