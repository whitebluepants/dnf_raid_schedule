import { describe, expect, test, vi } from "vitest";
import {
  canManageActivities,
  createRaidEvent,
  listActivities,
  listSignupCharacters,
  syncEventWaves,
} from "@/features/activities/repository";

const ids = {
  group: "00000000-0000-4000-8000-000000000101",
  profile: "00000000-0000-4000-8000-000000000001",
  event: "00000000-0000-4000-8000-000000000201",
};

function activityClient() {
  const rpc = vi.fn().mockResolvedValue({ data: ids.event, error: null });
  const charactersEqArchived = vi.fn().mockReturnValue({
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  });
  const charactersEqProfile = vi.fn().mockReturnValue({ eq: charactersEqArchived });
  const charactersEqGroup = vi.fn().mockReturnValue({ eq: charactersEqProfile });
  const charactersSelect = vi.fn().mockReturnValue({ eq: charactersEqGroup });
  const from = vi.fn((_table: string) => {
    return { select: charactersSelect };
  });

  return { client: { from, rpc }, rpc, charactersEqGroup, charactersEqProfile, charactersEqArchived };
}

describe("activity repository", () => {
  test("only an admin, legacy leader, or platform admin can manage activities", () => {
    expect(canManageActivities({ role: "member", isPlatformAdmin: false })).toBe(false);
    expect(canManageActivities({ role: "admin", isPlatformAdmin: false })).toBe(true);
    expect(canManageActivities({ role: "leader", isPlatformAdmin: false })).toBe(true);
    expect(canManageActivities({ role: "member", isPlatformAdmin: true })).toBe(true);
  });

  test("creates an event in the current space with waves in their requested order", async () => {
    const { client, rpc } = activityClient();

    const result = await createRaidEvent(client as never, { groupId: ids.group, profileId: ids.profile, role: "admin", isPlatformAdmin: false }, {
      title: "周六攻坚",
      eventDate: "2026-08-22T12:00:00.000Z",
      gameWeek: "2026-W34",
      waves: [
        { order: 2, difficulty: "hard" },
        { order: 1, difficulty: "normal" },
        { order: 3, difficulty: "judgment" },
      ],
    });

    expect(result).toEqual({ ok: true, value: ids.event });
    expect(rpc).toHaveBeenCalledWith("create_raid_event_with_waves", {
      p_group_id: ids.group,
      p_title: "周六攻坚",
      p_event_date: "2026-08-22T12:00:00.000Z",
      p_game_week: "2026-08-17",
      p_waves: [
        { order: 1, difficulty: "normal" },
        { order: 2, difficulty: "hard" },
        { order: 3, difficulty: "judgment" },
      ],
    });
  });

  test("calls the client RPC with its instance binding intact", async () => {
    const client = {
      marker: "supabase-client",
      rpc(this: { marker: string }, _name: string, _args: unknown) {
        if (this.marker !== "supabase-client") throw new Error("lost rpc binding");
        return Promise.resolve({ data: ids.event, error: null });
      },
    };

    await expect(createRaidEvent(
      client as never,
      { groupId: ids.group, profileId: ids.profile, role: "admin", isPlatformAdmin: false },
      { title: "周六攻坚", eventDate: "2026-08-22T12:00:00.000Z", gameWeek: "2026-W34", waves: [{ order: 1, difficulty: "hard" }] },
    )).resolves.toEqual({ ok: true, value: ids.event });
  });

  test("does not write an event for an ordinary member", async () => {
    const { client, rpc } = activityClient();

    const result = await createRaidEvent(client as never, { groupId: ids.group, profileId: ids.profile, role: "member", isPlatformAdmin: false }, {
      title: "周六攻坚",
      eventDate: "2026-08-22T12:00:00.000Z",
      gameWeek: "2026-W34",
      waves: [{ order: 1, difficulty: "hard" }],
    });

    expect(result).toEqual({ ok: false, error: "只有空间管理员可以创建活动" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("replaces an unscheduled event's wave plan through the protected RPC", async () => {
    const { client, rpc } = activityClient();

    await expect(syncEventWaves(
      client as never,
      { groupId: ids.group, profileId: ids.profile, role: "admin", isPlatformAdmin: false },
      ids.event,
      [{ order: 1, difficulty: "hard" }, { order: 2, difficulty: "normal" }],
    )).resolves.toEqual({ ok: true, value: true });

    expect(rpc).toHaveBeenCalledWith("sync_raid_event_waves", {
      p_raid_event_id: ids.event,
      p_waves: [{ order: 1, difficulty: "hard" }, { order: 2, difficulty: "normal" }],
    });
  });

  test("limits signup characters to the active roster in the current space", async () => {
    const { client, charactersEqGroup, charactersEqProfile, charactersEqArchived } = activityClient();

    await listSignupCharacters(client as never, { groupId: ids.group, profileId: ids.profile });

    expect(charactersEqGroup).toHaveBeenCalledWith("group_id", ids.group);
    expect(charactersEqProfile).toHaveBeenCalledWith("profile_id", ids.profile);
    expect(charactersEqArchived).toHaveBeenCalledWith("is_archived", false);
  });

  test("returns a readable failure instead of an empty activity list when the event query fails", async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            neq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({ data: null, error: { message: "network" } }),
            })),
          })),
        })),
      })),
    };

    await expect(listActivities(client as never, ids.group)).resolves.toEqual({
      ok: false,
      error: "读取活动列表失败，请稍后刷新",
    });
  });
});
