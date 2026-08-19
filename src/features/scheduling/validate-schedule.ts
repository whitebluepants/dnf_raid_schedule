import type {
  CandidateCharacter,
  DifficultyPreset,
  ScheduleIssue,
  ScheduledSlot,
  ValidateScheduleInput,
} from "./types";

export function validateSchedule(input: ValidateScheduleInput): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  const weeklyUsed = new Set(input.weeklyUsedCharacterIds ?? []);
  const allIds = new Set<string>();

  for (const wave of input.waves) {
    const accounts = new Set<string>();
    const roles = { buffer: 0, dealer: 0 };
    const preset = input.difficultyPresets?.[wave.difficulty];

    for (const team of Object.values(wave.teams)) {
      for (const slot of team.slots) {
        const character = slot.character;
        if (!character) {
          issues.push({ code: "empty_slot", severity: "warning", waveId: wave.id, slotId: slot.slotId, message: "槽位为空" });
          continue;
        }
        roles[character.role] += 1;
        if (allIds.has(character.id)) {
          issues.push({ code: "duplicate_character", severity: "blocking", waveId: wave.id, slotId: slot.slotId, message: "角色重复排入" });
        }
        allIds.add(character.id);
        if (weeklyUsed.has(character.id)) {
          issues.push({ code: "duplicate_weekly_character", severity: "blocking", waveId: wave.id, slotId: slot.slotId, message: "角色本周已使用" });
        }
        if (accounts.has(character.accountId)) {
          issues.push({ code: "duplicate_wave_account", severity: "blocking", waveId: wave.id, slotId: slot.slotId, message: "同波账号重复" });
        }
        accounts.add(character.accountId);
        if (character.role !== slot.role) {
          issues.push({ code: "wrong_role", severity: "warning", waveId: wave.id, slotId: slot.slotId, message: "角色类型与槽位不匹配" });
        }
        if (preset?.minimumFame && character.fame < preset.minimumFame) {
          issues.push({ code: "below_threshold", severity: "warning", waveId: wave.id, slotId: slot.slotId, message: "低于名望参考线" });
        }
      }
    }

    if (roles.buffer < 3) {
      issues.push({ code: "missing_buffer", severity: "warning", waveId: wave.id, message: `缺少 ${3 - roles.buffer} 个奶` });
    }
  }
  return issues;
}

export function characterMatchesPreset(character: CandidateCharacter, preset?: DifficultyPreset): boolean {
  return !preset?.minimumFame || character.fame >= preset.minimumFame;
}

export function slotCharacter(slot: ScheduledSlot): CandidateCharacter | null {
  return slot.character;
}
