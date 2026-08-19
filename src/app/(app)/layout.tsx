import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireCurrentSpace } from "@/lib/current-space";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const client = await createServerClient();
  const { data: { user } } = await client.auth.getUser();
  const { data: profile } = user
    ? await client.from("profiles").select("display_name, is_platform_admin").eq("id", user.id).maybeSingle()
    : { data: null };
  let memberRole: "member" | "leader" | "admin" = "member";
  let currentSpaceName: string | null = null;
  let currentSpaceId: string | null = null;
  let spaces: Array<{ id: string; name: string; inviteCode: string | null; active: boolean }> = [];
  let isPlatformAdmin = profile?.is_platform_admin ?? false;
  try {
    const context = await requireCurrentSpace(client);
    memberRole = context.role;
    isPlatformAdmin = context.isPlatformAdmin;
    currentSpaceId = context.groupId;
    const { data: group } = await client.from("groups").select("name").eq("id", context.groupId).maybeSingle();
    currentSpaceName = group?.name ?? null;
  } catch {
    // The spaces page remains available so the member can select a valid scope.
  }

  if (user) {
    const { data: memberships } = await client.from("group_members").select("group_id").eq("profile_id", user.id);
    const groupIds = memberships?.map((membership) => membership.group_id) ?? [];
    let groupsQuery = client.from("groups").select("id, name, invite_code").order("name");
    if (!isPlatformAdmin) groupsQuery = groupsQuery.in("id", groupIds.length ? groupIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: groups } = await groupsQuery;
    spaces = (groups ?? []).map((group) => ({ id: group.id, name: group.name, inviteCode: group.invite_code, active: group.id === currentSpaceId }));
  }

  return <AppShell userName={profile?.display_name ?? "当前成员"} memberRole={memberRole} currentSpaceName={currentSpaceName} spaces={spaces} isPlatformAdmin={isPlatformAdmin}>{children}</AppShell>;
}
