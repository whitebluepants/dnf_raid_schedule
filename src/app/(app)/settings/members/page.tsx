import { redirect } from "next/navigation";

import { MemberManagement, type ManagedMember } from "@/features/auth/member-management";
import { requireCurrentSpace } from "@/lib/current-space";
import type { CurrentSpace } from "@/lib/current-space";
import { createServerClient } from "@/lib/supabase/server";

export default async function MembersPage() {
  const client = await createServerClient();
  let context: CurrentSpace;
  try {
    context = await requireCurrentSpace(client);
  } catch {
    redirect("/spaces");
  }
  if (context.role !== "admin" && !context.isPlatformAdmin) redirect("/activities");

  const [{ data: group }, { data: memberships }] = await Promise.all([
    client.from("groups").select("name").eq("id", context.groupId).maybeSingle(),
    client.from("group_members").select("profile_id, role").eq("group_id", context.groupId),
  ]);
  const profileIds = memberships?.map((membership) => membership.profile_id) ?? [];
  const { data: profiles } = profileIds.length > 0
    ? await client.from("profiles").select("id, display_name").in("id", profileIds)
    : { data: [] };
  const members: ManagedMember[] = (memberships ?? []).map((membership) => ({
    profileId: membership.profile_id,
    displayName: profiles?.find((profile) => profile.id === membership.profile_id)?.display_name ?? "未知成员",
    role: membership.role,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section>
        <p className="text-sm font-semibold text-cyan-700">{group?.name ?? "当前空间"}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">成员管理</h1>
        <p className="mt-2 text-sm text-slate-600">管理员可以授予或收回空间管理员权限；旧版团长角色仅保留兼容能力，不再从界面授予。</p>
      </section>
      <MemberManagement groupId={context.groupId} members={members} />
    </div>
  );
}
