import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";

export const CURRENT_SPACE_COOKIE = "dnf-current-space";

export type CurrentSpace = {
  profileId: string;
  groupId: string;
  role: Database["public"]["Enums"]["member_role"];
  isPlatformAdmin: boolean;
};

export type CurrentSpaceErrorCode =
  | "missing_current_space"
  | "invalid_current_space"
  | "current_space_forbidden";

export class CurrentSpaceError extends Error {
  constructor(readonly code: CurrentSpaceErrorCode) {
    super(code);
    this.name = "CurrentSpaceError";
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function requireCurrentSpace(
  client: Pick<SupabaseClient<Database>, "rpc">,
  cookieStore?: Awaited<ReturnType<typeof cookies>>,
): Promise<CurrentSpace> {
  const resolvedCookieStore = cookieStore ?? (await cookies());
  const groupId = resolvedCookieStore.get(CURRENT_SPACE_COOKIE)?.value;
  if (!groupId) throw new CurrentSpaceError("missing_current_space");
  if (!isUuid(groupId)) throw new CurrentSpaceError("invalid_current_space");

  const { data, error } = await client.rpc("get_space_context", {
    p_group_id: groupId,
  });
  const context = data?.[0];
  if (error || !context) {
    throw new CurrentSpaceError("current_space_forbidden");
  }

  return {
    profileId: context.profile_id,
    groupId: context.group_id,
    role: context.role,
    isPlatformAdmin: context.is_platform_admin,
  };
}
