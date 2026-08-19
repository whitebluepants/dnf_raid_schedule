import Link from "next/link";

import { CharacterForm } from "@/features/roster/character-form";
import { CharacterList } from "@/features/roster/character-list";
import { listRoster } from "@/features/roster/repository";
import { CurrentSpaceError, requireCurrentSpace } from "@/lib/current-space";
import { createServerClient } from "@/lib/supabase/server";

export default async function RosterPage() {
  const client = await createServerClient();
  try {
    const space = await requireCurrentSpace(client);
    const accounts = await listRoster(space.groupId, space.profileId, client);
    return <div className="space-y-6"><section className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-cyan-700">我的资料</p><h1 className="mt-1 text-3xl font-bold">账号与角色</h1><p className="mt-2 text-sm text-slate-600">名望和强度档位会影响半自动初排，团长仍可手动调整。</p></div><CharacterForm accounts={accounts} triggerLabel="新增角色" /></section><CharacterList accounts={accounts} /></div>;
  } catch (error) {
    if (error instanceof CurrentSpaceError) {
      return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900"><h1 className="text-xl font-bold">请先选择空间</h1><p className="mt-2 text-sm">当前空间不可用。请先选择或加入一个空间后，再维护角色。</p><Link className="mt-4 inline-flex rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white" href="/spaces">前往空间页</Link></div>;
    }
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900"><h1 className="text-xl font-bold">角色资料暂时无法读取</h1><p className="mt-2 text-sm">请稍后刷新页面重试；当前空间没有被更改。</p></div>;
  }
}
