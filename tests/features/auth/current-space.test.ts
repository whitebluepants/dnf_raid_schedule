// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const cookieGet = vi.fn();
const cookieSet = vi.fn();
const serverClientState = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet, set: cookieSet, delete: vi.fn() }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => serverClientState.client,
}));

import {
  CURRENT_SPACE_COOKIE,
  CurrentSpaceError,
  requireCurrentSpace,
} from "@/lib/current-space";
import { setCurrentSpace } from "@/features/auth/actions";

function rpcClient(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc }, rpc };
}

describe("requireCurrentSpace", () => {
  beforeEach(() => {
    cookieGet.mockReset();
    cookieSet.mockReset();
  });

  test("rejects a malformed current-space cookie before querying the database", async () => {
    cookieGet.mockReturnValue({ value: "not-a-uuid" });
    const { client, rpc } = rpcClient({ data: null, error: null });

    await expect(requireCurrentSpace(client)).rejects.toEqual(
      new CurrentSpaceError("invalid_current_space"),
    );
    expect(cookieGet).toHaveBeenCalledWith(CURRENT_SPACE_COOKIE);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("rejects a valid cookie when the authenticated profile cannot access that space", async () => {
    const groupId = "00000000-0000-4000-8000-000000000101";
    cookieGet.mockReturnValue({ value: groupId });
    const { client, rpc } = rpcClient({ data: [], error: null });

    await expect(requireCurrentSpace(client)).rejects.toEqual(
      new CurrentSpaceError("current_space_forbidden"),
    );
    expect(rpc).toHaveBeenCalledWith("get_space_context", {
      p_group_id: groupId,
    });
  });

  test("returns the database-authorized member context for the cookie space", async () => {
    const groupId = "00000000-0000-4000-8000-000000000101";
    const profileId = "00000000-0000-4000-8000-000000000001";
    cookieGet.mockReturnValue({ value: groupId });
    const { client } = rpcClient({
      data: [
        {
          profile_id: profileId,
          group_id: groupId,
          role: "admin",
          is_platform_admin: false,
        },
      ],
      error: null,
    });

    await expect(requireCurrentSpace(client)).resolves.toEqual({
      profileId,
      groupId,
      role: "admin",
      isPlatformAdmin: false,
    });
  });

  test("accepts a caller-provided server cookie store", async () => {
    const groupId = "00000000-0000-4000-8000-000000000101";
    const profileId = "00000000-0000-4000-8000-000000000001";
    const { client } = rpcClient({
      data: [{ profile_id: profileId, group_id: groupId, role: "member", is_platform_admin: false }],
      error: null,
    });
    const providedCookies = { get: vi.fn().mockReturnValue({ value: groupId }) };

    await expect(
      requireCurrentSpace(
        client,
        providedCookies as unknown as Awaited<ReturnType<typeof import("next/headers").cookies>>,
      ),
    ).resolves.toEqual({
      profileId,
      groupId,
      role: "member",
      isPlatformAdmin: false,
    });
    expect(providedCookies.get).toHaveBeenCalledWith(CURRENT_SPACE_COOKIE);
    expect(cookieGet).not.toHaveBeenCalled();
  });
});

describe("setCurrentSpace", () => {
  beforeEach(() => {
    cookieSet.mockReset();
  });

  test("stores only a database-authorized space in a server-only cookie", async () => {
    const groupId = "00000000-0000-4000-8000-000000000101";
    const { client, rpc } = rpcClient({
      data: [
        {
          profile_id: "00000000-0000-4000-8000-000000000001",
          group_id: groupId,
          role: "member",
          is_platform_admin: false,
        },
      ],
      error: null,
    });
    serverClientState.client = client;

    await expect(setCurrentSpace(groupId)).resolves.toEqual({ ok: true, value: groupId });
    expect(rpc).toHaveBeenCalledWith("get_space_context", { p_group_id: groupId });
    expect(cookieSet).toHaveBeenCalledWith(
      CURRENT_SPACE_COOKIE,
      groupId,
      expect.objectContaining({ httpOnly: true, path: "/", sameSite: "lax" }),
    );
  });

  test("does not store a space when the database rejects access", async () => {
    const groupId = "00000000-0000-4000-8000-000000000101";
    const { client } = rpcClient({ data: [], error: null });
    serverClientState.client = client;

    await expect(setCurrentSpace(groupId)).resolves.toEqual({
      ok: false,
      error: "你无权进入该空间",
    });
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
