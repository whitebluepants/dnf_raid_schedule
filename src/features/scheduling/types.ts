export type CharacterRole = "dealer" | "buffer";
export type StrengthTier = "high" | "medium" | "low";
export type TeamColor = "red" | "yellow" | "green";
export type DifficultyCode = "normal" | "hard" | "judgment";

export interface CandidateCharacter {
  id: string;
  accountId: string;
  profileId: string;
  role: CharacterRole;
  fame: number;
  strengthTier: StrengthTier;
  damageScore: number | null;
  buffScore: number | null;
}

export interface DifficultyPreset {
  minimumFame?: number | null;
  redDealerFame?: number | null;
  yellowDealerFame?: number | null;
  greenDealerFame?: number | null;
  redBufferPower?: number | null;
  yellowBufferPower?: number | null;
  greenBufferPower?: number | null;
}

export interface LockedAssignment {
  team: TeamColor;
  slotIndex: number;
  characterId: string;
}

export interface WaveInput {
  id: string;
  difficulty: DifficultyCode;
  lockedAssignments?: LockedAssignment[];
}

export interface GenerateScheduleInput {
  characters: CandidateCharacter[];
  waves: WaveInput[];
  weeklyUsedCharacterIds?: string[];
  difficultyPresets?: Partial<Record<DifficultyCode, DifficultyPreset>>;
}

export interface ScheduledSlot {
  slotId: string;
  role: CharacterRole;
  character: CandidateCharacter | null;
  locked?: boolean;
}

export interface ScheduledTeam {
  color: TeamColor;
  slots: ScheduledSlot[];
}

export interface ScheduleGap {
  role: CharacterRole;
  team: TeamColor;
  slotIndex: number;
  reason: string;
}

export interface ScheduledWave {
  id: string;
  difficulty: DifficultyCode;
  teams: Record<TeamColor, ScheduledTeam>;
  gaps: ScheduleGap[];
}

export interface GeneratedSchedule {
  waves: ScheduledWave[];
  candidates: CandidateCharacter[];
}

export interface CandidateScore {
  candidate: CandidateCharacter;
  tierRank: number;
  metric: number;
}

export interface ScheduleIssue {
  code:
    | "duplicate_weekly_character"
    | "duplicate_wave_account"
    | "duplicate_character"
    | "empty_slot"
    | "wrong_role"
    | "missing_buffer"
    | "below_threshold";
  severity: "blocking" | "warning";
  waveId: string;
  slotId?: string;
  message: string;
}

export interface ValidateScheduleInput {
  waves: ScheduledWave[];
  weeklyUsedCharacterIds?: string[];
  difficultyPresets?: Partial<Record<DifficultyCode, DifficultyPreset>>;
}

export interface CandidateInput {
  characters: CandidateCharacter[];
  role?: CharacterRole;
  excludeCharacterIds?: string[];
  excludeAccountIds?: string[];
  difficulty?: DifficultyCode;
  preset?: DifficultyPreset;
}

export interface RankedCandidate {
  character: CandidateCharacter;
  score: CandidateScore;
  reasons: string[];
}
