import { describe, expect, test, vi } from "vitest";

import {
  getScheduleWorkbench,
  publishSchedule,
  replaceEventScheduleSnapshots,
  replaceScheduleSnapshot,
  setMemberAttendance,
} from "@/features/schedule-workbench/repository";

const ids = {
  group: "00000000-0000-4000-8000-000000000101",
  profile: "00000000-0000-4000-8000-000000000001",
  absentProfile: "00000000-0000-4000-8000-000000000002",
  event: "00000000-0000-4000-8000-000000000201",
  wave: "00000000-0000-4000-8000-000000000301",
  registeredCharacter: "00000000-0000-4000-8000-000000000401",
  absentCharacter: "00000000-0000-4000-8000-000000000402",
  unregisteredCharacter: "00000000-0000-4000-8000-000000000403",
  account: "00000000-0000-4000-8000-000000000501",
};

type QueryResult = { data: unknown; error: { message: string } | null };

function query(result: QueryResult) {
  const value = Promise.resolve(result);
  const builder: Record<string, unknown> = {
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => value),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are deliberately thenable.
    then: value.then.bind(value),
  };
  return builder;
}

function workbenchClient() {
  const rows: Record<string, QueryResult[]> = {
    raid_events: [{ data: { id: ids.event, group_id: ids.group, title: "周六攻坚", game_week: "2026-08-17", event_date: "2026-08-22T12:00:00Z", status: "draft" }, error: null }],
    raid_waves: [{ data: [{ id: ids.wave, wave_number: 1, difficulty: "hard", status: "draft", version: 2 }], error: null }],
    event_registrations: [{ data: [
      { profile_id: ids.profile, state: "participating" },
      { profile_id: ids.absentProfile, state: "absent" },
    ], error: null }],
    event_character_registrations: [{ data: [
      { profile_id: ids.profile, character_id: ids.registeredCharacter },
      { profile_id: ids.absentProfile, character_id: ids.absentCharacter },
    ], error: null }],
    characters: [{ data: [
      { id: ids.registeredCharacter, game_account_id: ids.account, profile_id: ids.profile, name: "报名角色", role: "dealer", fame: 70000, strength_tier: "high", simulated_damage: 100, buffer_power: null },
      { id: ids.absentCharacter, game_account_id: ids.account, profile_id: ids.absentProfile, name: "缺席角色", role: "dealer", fame: 80000, strength_tier: "high", simulated_damage: 200, buffer_power: null },
      { id: ids.unregisteredCharacter, game_account_id: ids.account, profile_id: ids.profile, name: "未报名角色", role: "dealer", fame: 90000, strength_tier: "high", simulated_damage: 300, buffer_power: null },
    ], error: null }],
    game_accounts: [{ data: [{ id: ids.account, group_id: ids.group, name: "主账号" }], error: null }],
    profiles: [{ data: [
      { id: ids.profile, display_name: "团员甲" },
      { id: ids.absentProfile, display_name: "团员乙" },
    ], error: null }],
    schedule_slots: [{ data: [], error: null }],
    character_weekly_usage: [{ data: [], error: null }],
    difficulty_presets: [{ data: [], error: null }],
  };
  const calls: Record<string, Record<string, unknown>[]> = {};
  const from = vi.fn((table: string) => {
    const builder = query(rows[table].shift() ?? { data: [], error: null });
    if (!calls[table]) calls[table] = [];
    calls[table].push(builder);
    return { select: vi.fn(() => builder) };
  });
  return { client: { from, rpc: vi.fn() }, calls, rows };
}

describe("schedule workbench repository", () => {
  test("builds candidates only from participating registrations in the current event and space", async () => {
    const { client, calls } = workbenchClient();

    const result = await getScheduleWorkbench(client as never, {
      groupId: ids.group,
      profileId: ids.profile,
      role: "admin",
      isPlatformAdmin: false,
    }, ids.event);

    expect(result?.characters.map((character) => character.id)).toEqual([ids.registeredCharacter]);
    expect(result?.characters[0]).toMatchObject({ memberName: "团员甲", accountName: "主账号" });
    expect(result?.attendanceMembers).toEqual([
      { profileId: ids.profile, displayName: "团员甲", state: "participating" },
      { profileId: ids.absentProfile, displayName: "团员乙", state: "absent" },
    ]);
    expect(calls.characters[0].eq).toHaveBeenCalledWith("group_id", ids.group);
    expect(calls.event_character_registrations[0].eq).toHaveBeenCalledWith("raid_event_id", ids.event);
  });

  test("hides draft schedules from ordinary members while administrators can open them", async () => {
    const memberFixture = workbenchClient();
    const adminFixture = workbenchClient();

    const memberResult = await getScheduleWorkbench(memberFixture.client as never, {
      groupId: ids.group,
      profileId: ids.profile,
      role: "member",
      isPlatformAdmin: false,
    }, ids.event);
    const adminResult = await getScheduleWorkbench(adminFixture.client as never, {
      groupId: ids.group,
      profileId: ids.profile,
      role: "admin",
      isPlatformAdmin: false,
    }, ids.event);

    expect(memberResult).toBeNull();
    expect(adminResult?.event.status).toBe("draft");
    expect(memberFixture.client.from).toHaveBeenCalledTimes(1);
  });

  test("excludes weekly-used registrations from candidates", async () => {
    const fixture = workbenchClient();
    fixture.rows.character_weekly_usage[0] = { data: [{ character_id: ids.registeredCharacter }], error: null };

    const result = await getScheduleWorkbench(fixture.client as never, {
      groupId: ids.group,
      profileId: ids.profile,
      role: "admin",
      isPlatformAdmin: false,
    }, ids.event);

    expect(result?.characters).toEqual([]);
  });

  test("maps an optimistic version conflict without exposing database text", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "schedule_version_conflict DETAIL private sql" } });

    const result = await replaceScheduleSnapshot({ rpc } as never, {
      raidEventId: ids.event,
      raidWaveId: ids.wave,
      expectedVersion: 2,
      snapshot: [],
    });

    expect(result).toEqual({ status: "conflict", message: "排表已被其他人更新，请刷新后重试" });
  });

  test("persists all wave snapshots through one optimistic transaction", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { [ids.wave]: 3 }, error: null });

    const result = await replaceEventScheduleSnapshots({ rpc } as never, {
      raidEventId: ids.event,
      expectedVersions: { [ids.wave]: 2 },
      snapshots: { [ids.wave]: [] },
    });

    expect(result).toEqual({ status: "success", data: { versions: { [ids.wave]: 3 } } });
    expect(rpc).toHaveBeenCalledWith("replace_event_schedule_snapshots", {
      p_raid_event_id: ids.event,
      p_expected_versions: { [ids.wave]: 2 },
      p_snapshots: { [ids.wave]: [] },
    });
  });

  test("preserves the Supabase client binding for every schedule mutation RPC", async () => {
    const client = {
      marker: "supabase-client",
      rpc(this: { marker: string }, _name: string, _args: unknown) {
        if (this.marker !== "supabase-client") throw new Error("lost rpc binding");
        return Promise.resolve({ data: true, error: null });
      },
    };

    await expect(replaceScheduleSnapshot(client as never, { raidEventId: ids.event, raidWaveId: ids.wave, expectedVersion: 1, snapshot: [] })).resolves.toMatchObject({ status: "success" });
    await expect(replaceEventScheduleSnapshots(client as never, { raidEventId: ids.event, expectedVersions: { [ids.wave]: 1 }, snapshots: { [ids.wave]: [] } })).resolves.toMatchObject({ status: "success" });
    await expect(setMemberAttendance(client as never, { raidEventId: ids.event, profileId: ids.profile, state: "participating" })).resolves.toMatchObject({ status: "success" });
    await expect(publishSchedule(client as never, { raidEventId: ids.event, versions: { [ids.wave]: 1 } })).resolves.toMatchObject({ status: "success" });
  });
});
