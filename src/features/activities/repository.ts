import type { SupabaseClient } from "@supabase/supabase-js";

import type { CurrentSpace } from "@/lib/current-space";
import type { Database } from "@/lib/database.types";
import type { Result } from "@/lib/result";
import type { DifficultyPresetInput, RaidEventInput, WavePlanInput } from "./schemas";

type Client = SupabaseClient<Database>;

export type Activity = {
  id: string;
  title: string;
  eventDate: string;
  gameWeek: string;
  status: Database["public"]["Enums"]["event_state"];
  waves: Array<{
    id: string;
    number: number;
    difficulty: Database["public"]["Enums"]["difficulty_code"];
  }>;
};

export type SignupCharacter = {
  id: string;
  name: string;
  role: Database["public"]["Enums"]["character_role"];
  fame: number;
  accountName: string | null;
};

export type Signup = {
  state: Database["public"]["Enums"]["registration_state"];
  characterIds: string[];
} | null;

export type DifficultyPreset = {
  id: string;
  code: Database["public"]["Enums"]["difficulty_code"];
  name: string;
  minimumFame: number | null;
  redDealerFame: number | null;
  yellowDealerFame: number | null;
  greenDealerFame: number | null;
  redBufferPower: number | null;
  yellowBufferPower: number | null;
  greenBufferPower: number | null;
  simulatedDamageReference: number | null;
  autoAssignmentEnabled: boolean;
};

type DifficultyPresetRow = Pick<
  Database["public"]["Tables"]["difficulty_presets"]["Row"],
  | "id"
  | "group_id"
  | "code"
  | "name"
  | "minimum_fame"
  | "red_dealer_fame"
  | "yellow_dealer_fame"
  | "green_dealer_fame"
  | "red_buffer_power"
  | "yellow_buffer_power"
  | "green_buffer_power"
  | "simulated_damage_reference"
  | "auto_assignment_enabled"
>;

export function canManageActivities(space: Pick<CurrentSpace, "role" | "isPlatformAdmin">): boolean {
  return space.isPlatformAdmin || space.role === "admin" || space.role === "leader";
}

function isoWeekStart(gameWeek: string): string {
  const [yearPart, weekPart] = gameWeek.split("-W");
  const year = Number(yearPart);
  const week = Number(weekPart);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const mondayOffset = (januaryFourth.getUTCDay() + 6) % 7;
  const weekStart = new Date(Date.UTC(year, 0, 4 - mondayOffset + (week - 1) * 7));
  return weekStart.toISOString().slice(0, 10);
}

export async function createRaidEvent(
  client: Client,
  space: CurrentSpace,
  input: RaidEventInput,
): Promise<Result<string, string>> {
  if (!canManageActivities(space)) {
    return { ok: false, error: "只有空间管理员可以创建活动" };
  }

  const rpc = client.rpc.bind(client) as unknown as (
    name: "create_raid_event_with_waves",
    args: {
      p_group_id: string;
      p_title: string;
      p_event_date: string;
      p_game_week: string;
      p_waves: RaidEventInput["waves"];
    },
  ) => Promise<{ data: string | null; error: { message: string } | null }>;
  const { data, error } = await rpc("create_raid_event_with_waves", {
    p_group_id: space.groupId,
    p_title: input.title,
    p_event_date: input.eventDate,
    p_game_week: isoWeekStart(input.gameWeek),
    p_waves: [...input.waves].sort((left, right) => left.order - right.order),
  });
  if (!error && data) return { ok: true, value: data };
  if (error?.message.includes("activity_forbidden")) return { ok: false, error: "只有空间管理员可以创建活动" };
  return { ok: false, error: "活动创建失败，请稍后重试" };
}

export async function syncEventWaves(
  client: Client,
  space: CurrentSpace,
  eventId: string,
  waves: WavePlanInput,
): Promise<Result<true, string>> {
  if (!canManageActivities(space)) return { ok: false, error: "只有空间管理员可以调整波次" };
  const rpc = client.rpc.bind(client) as unknown as (
    name: "sync_raid_event_waves",
    args: { p_raid_event_id: string; p_waves: WavePlanInput },
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
  const { data, error } = await rpc("sync_raid_event_waves", {
    p_raid_event_id: eventId,
    p_waves: [...waves].sort((left, right) => left.order - right.order),
  });
  if (!error && data) return { ok: true, value: true };
  if (error?.message.includes("wave_plan_locked")) return { ok: false, error: "已有排表数据，不能再增减波次；请先清空排表。" };
  if (error?.message.includes("activity_forbidden")) return { ok: false, error: "只有空间管理员可以调整波次" };
  if (error?.message.includes("event_plan_locked")) return { ok: false, error: "已发布活动不能调整波次" };
  return { ok: false, error: "波次调整失败，请稍后重试" };
}

export async function listActivities(client: Client, groupId: string): Promise<Result<Activity[], string>> {
  const { data: events, error: eventsError } = await client
    .from("raid_events")
    .select("id, title, event_date, game_week, status")
    .eq("group_id", groupId)
    .neq("status", "archived")
    .order("event_date", { ascending: true });
  if (eventsError) return { ok: false, error: "读取活动列表失败，请稍后刷新" };
  if (!events?.length) return { ok: true, value: [] };
  const { data: waves, error: wavesError } = await client
    .from("raid_waves")
    .select("id, raid_event_id, wave_number, difficulty")
    .in("raid_event_id", events.map((event) => event.id));

  if (wavesError) return { ok: false, error: "读取活动波次失败，请稍后刷新" };
  return { ok: true, value: events.map((event) => ({
    id: event.id,
    title: event.title,
    eventDate: event.event_date,
    gameWeek: event.game_week,
    status: event.status,
    waves: (waves ?? [])
      .filter((wave) => wave.raid_event_id === event.id)
      .map((wave) => ({ id: wave.id, number: wave.wave_number, difficulty: wave.difficulty }))
      .sort((left, right) => left.number - right.number),
  })) };
}

export async function getActivity(client: Client, eventId: string, groupId: string): Promise<Result<Activity | null, string>> {
  const { data, error: eventError } = await client
    .from("raid_events")
    .select("id, title, event_date, game_week, status")
    .eq("id", eventId)
    .eq("group_id", groupId)
    .neq("status", "archived")
    .maybeSingle();
  if (eventError) return { ok: false, error: "读取活动失败，请稍后刷新" };
  if (!data) return { ok: true, value: null };
  const { data: waves, error: wavesError } = await client
    .from("raid_waves")
    .select("id, wave_number, difficulty")
    .eq("raid_event_id", data.id);
  if (wavesError) return { ok: false, error: "读取活动波次失败，请稍后刷新" };
  return { ok: true, value: {
    id: data.id,
    title: data.title,
    eventDate: data.event_date,
    gameWeek: data.game_week,
    status: data.status,
    waves: (waves ?? [])
      .map((wave) => ({ id: wave.id, number: wave.wave_number, difficulty: wave.difficulty }))
      .sort((left, right) => left.number - right.number),
  } };
}

export async function listSignupCharacters(
  client: Client,
  space: Pick<CurrentSpace, "groupId" | "profileId">,
): Promise<Result<SignupCharacter[], string>> {
  const { data, error: charactersError } = await client
    .from("characters")
    .select("id, name, role, fame, game_account_id")
    .eq("group_id", space.groupId)
    .eq("profile_id", space.profileId)
    .eq("is_archived", false)
    .order("fame", { ascending: false });

  if (charactersError) return { ok: false, error: "读取可报名角色失败，请稍后刷新" };
  const accountIds = [...new Set((data ?? []).map((character) => character.game_account_id))];
  const { data: accounts, error: accountsError } = accountIds.length
    ? await client.from("game_accounts").select("id, name").in("id", accountIds)
    : { data: [], error: null };
  if (accountsError) return { ok: false, error: "读取角色账号失败，请稍后刷新" };
  const accountNames = new Map((accounts ?? []).map((account) => [account.id, account.name]));
  return { ok: true, value: (data ?? []).map((character) => ({
    id: character.id,
    name: character.name,
    role: character.role,
    fame: character.fame,
    accountName: accountNames.get(character.game_account_id) ?? null,
  })) };
}

export async function getSignup(client: Client, eventId: string, profileId: string): Promise<Result<Signup, string>> {
  const { data: registration, error: registrationError } = await client
    .from("event_registrations")
    .select("state")
    .eq("raid_event_id", eventId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (registrationError) return { ok: false, error: "读取报名信息失败，请稍后刷新" };
  if (!registration) return { ok: true, value: null };

  const { data: characterRegistrations, error: charactersError } = await client
    .from("event_character_registrations")
    .select("character_id")
    .eq("raid_event_id", eventId)
    .eq("profile_id", profileId);
  if (charactersError) return { ok: false, error: "读取报名角色失败，请稍后刷新" };
  return { ok: true, value: { state: registration.state, characterIds: (characterRegistrations ?? []).map((item) => item.character_id) } };
}

export async function listDifficultyPresets(client: Client, groupId: string): Promise<Result<DifficultyPreset[], string>> {
  const { data, error } = await client
    .from("difficulty_presets")
    .select("id, group_id, code, name, minimum_fame, red_dealer_fame, yellow_dealer_fame, green_dealer_fame, red_buffer_power, yellow_buffer_power, green_buffer_power, simulated_damage_reference, auto_assignment_enabled")
    .or(`group_id.is.null,group_id.eq.${groupId}`);
  if (error) return { ok: false, error: "读取难度参考失败，请稍后刷新" };
  const byCode = new Map<Database["public"]["Enums"]["difficulty_code"], DifficultyPresetRow>();
  for (const preset of data ?? []) {
    if (preset.group_id === groupId || !byCode.has(preset.code)) byCode.set(preset.code, preset);
  }
  const order = { normal: 1, hard: 2, judgment: 3 } as const;
  return { ok: true, value: [...byCode.values()]
    .map((preset) => ({
      id: preset.id,
      code: preset.code,
      name: preset.name,
      minimumFame: preset.minimum_fame,
      redDealerFame: preset.red_dealer_fame,
      yellowDealerFame: preset.yellow_dealer_fame,
      greenDealerFame: preset.green_dealer_fame,
      redBufferPower: preset.red_buffer_power,
      yellowBufferPower: preset.yellow_buffer_power,
      greenBufferPower: preset.green_buffer_power,
      simulatedDamageReference: preset.simulated_damage_reference,
      autoAssignmentEnabled: preset.auto_assignment_enabled,
    }))
    .sort((left, right) => order[left.code] - order[right.code]) };
}

export async function updateDifficultyPreset(
  client: Client,
  space: CurrentSpace,
  input: DifficultyPresetInput,
): Promise<Result<true, string>> {
  if (!canManageActivities(space)) return { ok: false, error: "只有空间管理员可以修改难度参考" };
  const { data: source, error: sourceError } = await client
    .from("difficulty_presets")
    .select("id, group_id, code, name")
    .eq("id", input.presetId)
    .maybeSingle();
  if (sourceError || !source) return { ok: false, error: "难度配置不存在或不属于当前空间" };
  if (source.group_id && source.group_id !== space.groupId) return { ok: false, error: "难度配置不属于当前空间" };

  const values = {
    minimum_fame: input.minimumFame,
    red_dealer_fame: input.redDealerFame ?? null,
    yellow_dealer_fame: input.yellowDealerFame ?? null,
    green_dealer_fame: input.greenDealerFame ?? null,
    red_buffer_power: input.redBufferPower ?? null,
    yellow_buffer_power: input.yellowBufferPower ?? null,
    green_buffer_power: input.greenBufferPower ?? null,
    simulated_damage_reference: input.simulatedDamageReference ?? null,
    auto_assignment_enabled: input.autoAssignmentEnabled,
  };
  const query = source.group_id === space.groupId
    ? client.from("difficulty_presets").update(values).eq("id", source.id)
    : client.from("difficulty_presets").upsert({
      ...values,
      group_id: space.groupId,
      code: source.code,
      name: source.name,
      created_by: space.profileId,
    }, { onConflict: "group_id,code" });
  const { error } = await query;
  return error ? { ok: false, error: "难度参考保存失败，请稍后重试" } : { ok: true, value: true };
}
