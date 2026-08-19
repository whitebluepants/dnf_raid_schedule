import { SpaceForms, SpaceSelectButton } from "@/features/auth/space-forms";
import { requireCurrentSpace } from "@/lib/current-space";
import { createServerClient } from "@/lib/supabase/server";

async function getSpaces() {
  const client = await createServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { activeGroupId: null, spaces: [] };
  const { data: profile } = await client
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  const { data: memberships } = await client
    .from("group_members")
    .select("group_id, role")
    .eq("profile_id", user.id);
  const groupIds = memberships?.map((membership) => membership.group_id) ?? [];
  let groupsQuery = client.from("groups").select("id, name, invite_code").order("name");
  if (!profile?.is_platform_admin) {
    if (groupIds.length === 0) return { activeGroupId: null, spaces: [] };
    groupsQuery = groupsQuery.in("id", groupIds);
  }
  const { data: groups } = await groupsQuery;
  let activeGroupId: string | null = null;
  try {
    activeGroupId = (await requireCurrentSpace(client)).groupId;
  } catch {
    activeGroupId = null;
  }
  return { activeGroupId, spaces: (groups ?? []).map((group) => ({
    ...group,
    role: memberships?.find((membership) => membership.group_id === group.id)?.role
      ?? (profile?.is_platform_admin ? "admin" : "member"),
  })) };
}

export default async function SpacesPage() {
  const { activeGroupId, spaces } = await getSpaces();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section>
        <p className="text-sm font-semibold text-cyan-700">团队空间</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">创建或加入空间</h1>
        <p className="mt-2 text-sm text-slate-600">每个空间的数据彼此隔离。成员、账号和角色已按空间归属；后续活动、报名和排表也会沿用同一边界。</p>
      </section>
      {spaces.length > 0 ? <section className="grid gap-4 sm:grid-cols-2">
        {spaces.map((space) => <article key={space.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-cyan-700">{space.role === "admin" ? "管理员" : "成员"}</p>
          <h2 className="mt-1 text-lg font-bold">{space.name}</h2>
          <p className="mt-3 text-sm text-slate-600">邀请码</p>
          <code className="mt-1 block rounded-lg bg-slate-100 px-3 py-2 text-sm">{space.invite_code ?? "旧空间暂未设置邀请码"}</code>
          <SpaceSelectButton groupId={space.id} active={space.id === activeGroupId} />
        </article>)}
      </section> : null}
      <SpaceForms />
    </div>
  );
}
