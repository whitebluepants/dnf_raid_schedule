import { describe, expect, test, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  client: null as unknown,
  requireCurrentSpace: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => actionMocks.client),
}));

vi.mock("@/lib/current-space", () => ({
  requireCurrentSpace: actionMocks.requireCurrentSpace,
}));

import { listRoster } from "@/features/roster/repository";
import { archiveCharacter, saveCharacter } from "@/features/roster/actions";

const GROUP_ID = "00000000-0000-4000-8000-000000000001";
const PROFILE_ID = "00000000-0000-4000-8000-000000000002";

describe("listRoster", () => {
  test("lists only the current member's active characters in the requested group", async () => {
    const rows = [
      {
        id: "account-1",
        name: "主账号",
        characters: [
          {
            id: "character-1",
            name: "剑魂",
            class_name: "剑魂",
            role: "dealer",
            fame: 80000,
            strength_tier: "high",
            simulated_damage: 1200,
            buffer_power: null,
            notes: null,
          },
        ],
      },
    ];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eq = vi.fn();
    eq.mockReturnValue({ eq, order });
    const select = vi.fn().mockReturnValue({ eq, order });
    const from = vi.fn().mockReturnValue({ select });

    await expect(listRoster(GROUP_ID, PROFILE_ID, { from } as never)).resolves.toEqual(rows);

    expect(from).toHaveBeenCalledWith("game_accounts");
    expect(select).toHaveBeenCalledWith(expect.stringContaining("characters("));
    expect(eq).toHaveBeenCalledWith("group_id", GROUP_ID);
    expect(eq).toHaveBeenCalledWith("profile_id", PROFILE_ID);
    expect(eq).toHaveBeenCalledWith("is_archived", false);
    expect(eq).toHaveBeenCalledWith("characters.group_id", GROUP_ID);
    expect(eq).toHaveBeenCalledWith("characters.profile_id", PROFILE_ID);
    expect(eq).toHaveBeenCalledWith("characters.is_archived", false);
  });

  test("surfaces a roster query failure instead of treating it as an empty roster", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "query failed" } });
    const eq = vi.fn();
    eq.mockReturnValue({ eq, order });
    const select = vi.fn().mockReturnValue({ eq, order });

    await expect(
      listRoster(GROUP_ID, PROFILE_ID, { from: vi.fn().mockReturnValue({ select }) } as never),
    ).rejects.toThrow("无法读取角色资料");
  });
});

function query(result: unknown) {
  const builder = {
    eq: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
  };
  builder.eq.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.insert.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  return builder;
}

describe("roster writes", () => {
  test("rejects a malformed character id before querying the database", async () => {
    const from = vi.fn();
    actionMocks.client = { from };

    await expect(saveCharacter({
      characterId: "not-a-uuid",
      accountId: "account-1",
      name: "剑魂",
      className: "剑魂",
      role: "dealer",
      fame: 80000,
      strengthTier: "high",
      damageScore: 1200,
    })).resolves.toEqual({ ok: false, error: "角色信息不正确" });

    expect(from).not.toHaveBeenCalled();
  });

  test("rejects a non-string character id without throwing or querying", async () => {
    const from = vi.fn();
    actionMocks.client = { from };

    await expect(saveCharacter({
      characterId: { crafted: "id" } as never,
      accountId: "account-1",
      name: "剑魂",
      className: "剑魂",
      role: "dealer",
      fame: 80000,
      strengthTier: "high",
      damageScore: 1200,
    })).resolves.toEqual({ ok: false, error: "角色信息不正确" });

    expect(from).not.toHaveBeenCalled();
  });

  test("creates a character with the server-authorized group and profile", async () => {
    const accounts = query({ data: { id: "account-1" }, error: null });
    const characters = query({ data: { id: "character-1" }, error: null });
    const from = vi.fn((table: string) => table === "game_accounts" ? accounts : characters);
    actionMocks.client = { from };
    actionMocks.requireCurrentSpace.mockResolvedValue({ groupId: GROUP_ID, profileId: PROFILE_ID, role: "member", isPlatformAdmin: false });

    await expect(saveCharacter({
      accountId: "account-1",
      name: "剑魂",
      className: "剑魂",
      role: "dealer",
      fame: "80000",
      strengthTier: "high",
      damageScore: "1200",
      buffScore: null,
      notes: "主力",
    })).resolves.toEqual({ ok: true, value: "character-1" });

    expect(characters.insert).toHaveBeenCalledWith(expect.objectContaining({
      profile_id: PROFILE_ID,
      group_id: GROUP_ID,
      game_account_id: "account-1",
      simulated_damage: 1200,
      buffer_power: null,
    }));
  });

  test("updates only a character owned in the server-authorized group", async () => {
    const accounts = query({ data: { id: "account-1" }, error: null });
    const characters = query({ data: { id: "character-1" }, error: null });
    const from = vi.fn((table: string) => table === "game_accounts" ? accounts : characters);
    actionMocks.client = { from };
    actionMocks.requireCurrentSpace.mockResolvedValue({ groupId: GROUP_ID, profileId: PROFILE_ID, role: "member", isPlatformAdmin: false });

    await expect(saveCharacter({
      characterId: "00000000-0000-4000-8000-000000000003",
      accountId: "account-1",
      name: "剑魂",
      className: "剑魂",
      role: "dealer",
      fame: 80000,
      strengthTier: "high",
      damageScore: 1200,
    })).resolves.toEqual({ ok: true, value: "character-1" });

    expect(characters.update).toHaveBeenCalledWith(expect.objectContaining({ group_id: GROUP_ID, profile_id: PROFILE_ID }));
    expect(characters.eq).toHaveBeenCalledWith("id", "00000000-0000-4000-8000-000000000003");
    expect(characters.eq).toHaveBeenCalledWith("profile_id", PROFILE_ID);
    expect(characters.eq).toHaveBeenCalledWith("group_id", GROUP_ID);
  });

  test("archives only a character owned in the server-authorized group", async () => {
    const characters = query({ data: { id: "character-1" }, error: null });
    const from = vi.fn().mockReturnValue(characters);
    actionMocks.client = { from };
    actionMocks.requireCurrentSpace.mockResolvedValue({ groupId: GROUP_ID, profileId: PROFILE_ID, role: "member", isPlatformAdmin: false });

    await expect(archiveCharacter("00000000-0000-4000-8000-000000000003")).resolves.toEqual({ ok: true, value: true });

    expect(characters.update).toHaveBeenCalledWith({ is_archived: true });
    expect(characters.eq).toHaveBeenCalledWith("id", "00000000-0000-4000-8000-000000000003");
    expect(characters.eq).toHaveBeenCalledWith("profile_id", PROFILE_ID);
    expect(characters.eq).toHaveBeenCalledWith("group_id", GROUP_ID);
  });

  test("rejects a malformed archive id before creating a database query", async () => {
    const from = vi.fn();
    actionMocks.client = { from };

    await expect(archiveCharacter("character-1")).resolves.toEqual({ ok: false, error: "角色信息不正确" });
    expect(from).not.toHaveBeenCalled();
  });

  test("rejects an archive when there is no authorized current space", async () => {
    const from = vi.fn();
    actionMocks.client = { from };
    actionMocks.requireCurrentSpace.mockRejectedValue(new Error("current_space_forbidden"));

    await expect(archiveCharacter("00000000-0000-4000-8000-000000000003")).resolves.toEqual({ ok: false, error: "当前空间已失效，请重新选择" });
    expect(from).not.toHaveBeenCalled();
  });
});
