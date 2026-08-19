import { recommendCandidates } from "./candidates";
import { compareCandidates, scoreCandidate } from "./score";
import { characterMatchesPreset } from "./validate-schedule";
import type {
  CandidateCharacter,
  GenerateScheduleInput,
  GeneratedSchedule,
  ScheduleGap,
  ScheduledSlot,
  ScheduledTeam,
  ScheduledWave,
  TeamColor,
} from "./types";

const teamOrder: TeamColor[] = ["red", "yellow", "green"];
const difficultyOrder = { judgment: 0, hard: 1, normal: 2 } as const;

function emptyTeam(color: TeamColor): ScheduledTeam {
  return {
    color,
    slots: [
      { slotId: `${color}-1`, role: "buffer", character: null },
      { slotId: `${color}-2`, role: "dealer", character: null },
      { slotId: `${color}-3`, role: "dealer", character: null },
      { slotId: `${color}-4`, role: "dealer", character: null },
    ],
  };
}

function rank(characters: CandidateCharacter[], role: CandidateCharacter["role"]): CandidateCharacter[] {
  return characters.filter((character) => character.role === role).sort((a, b) => compareCandidates(scoreCandidate(a), scoreCandidate(b)));
}

export function generateSchedule(input: GenerateScheduleInput): GeneratedSchedule {
  const usedWeekly = new Set(input.weeklyUsedCharacterIds ?? []);
  const available = input.characters.filter((character) => !usedWeekly.has(character.id));
  const reserved = new Set<string>();
  const waves: ScheduledWave[] = [];
  const sortedWaves = [...input.waves].sort((a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty] || a.id.localeCompare(b.id));

  for (const waveInput of sortedWaves) {
    const teams = { red: emptyTeam("red"), yellow: emptyTeam("yellow"), green: emptyTeam("green") } as Record<TeamColor, ScheduledTeam>;
    const gaps: ScheduleGap[] = [];
    const locked = new Map<string, CandidateCharacter>();
    for (const assignment of waveInput.lockedAssignments ?? []) {
      const team = teams[assignment.team];
      const slot = team.slots[assignment.slotIndex - 1];
      if (!slot) continue;
      const found = input.characters.find((character) => character.id === assignment.characterId);
      const character = found ?? {
        id: assignment.characterId,
        accountId: `locked-${assignment.characterId}`,
        profileId: "unknown",
        role: slot.role,
        fame: 0,
        strengthTier: "low" as const,
        damageScore: null,
        buffScore: null,
      };
      slot.character = character;
      slot.locked = true;
      locked.set(character.id, character);
      reserved.add(character.id);
    }

    const eligible = available.filter((character) => !reserved.has(character.id));
    const preset = input.difficultyPresets?.[waveInput.difficulty];
    const buffers = rank(eligible, "buffer").filter((character) => !locked.has(character.id));
    const dealers = rank(eligible, "dealer").filter((character) => !locked.has(character.id));
    const waveAccounts = new Set(Object.values(teams).flatMap((team) => team.slots.flatMap((slot) => (slot.character ? [slot.character.accountId] : []))));

    const take = (pool: CandidateCharacter[], slot: ScheduledSlot): boolean => {
      const index = pool.findIndex((character) => !waveAccounts.has(character.accountId) && characterMatchesPreset(character, preset));
      if (index < 0) return false;
      const [character] = pool.splice(index, 1);
      slot.character = character;
      waveAccounts.add(character.accountId);
      reserved.add(character.id);
      return true;
    };

    for (const team of teamOrder) {
      const slot = teams[team].slots[0];
      if (!slot.character && !take(buffers, slot)) gaps.push({ role: "buffer", team, slotIndex: 1, reason: "报名奶不足或不满足参考线" });
    }
    for (const team of teamOrder) {
      for (const slot of teams[team].slots.slice(1)) {
        if (!take(dealers, slot)) gaps.push({ role: "dealer", team, slotIndex: Number(slot.slotId.at(-1)), reason: "报名 C 不足或不满足参考线" });
      }
    }
    waves.push({ id: waveInput.id, difficulty: waveInput.difficulty, teams, gaps });
  }

  const scheduledIds = new Set(waves.flatMap((wave) => Object.values(wave.teams).flatMap((team) => team.slots.flatMap((slot) => (slot.character ? [slot.character.id] : [])))));
  const candidates = recommendCandidates({ characters: input.characters.filter((character) => !scheduledIds.has(character.id) && !usedWeekly.has(character.id)) }).map((item) => item.character);
  return { waves, candidates };
}
