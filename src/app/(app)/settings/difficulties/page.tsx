import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DifficultyForm } from "@/features/activities/difficulty-form";
import { canManageActivities, listDifficultyPresets } from "@/features/activities/repository";
import { CurrentSpaceError, requireCurrentSpace } from "@/lib/current-space";
import { createServerClient } from "@/lib/supabase/server";

export default async function DifficultySettingsPage() {
  const client = await createServerClient();
  try {
    const space = await requireCurrentSpace(client);
    const presetsResult = await listDifficultyPresets(client, space.groupId);
    if (!presetsResult.ok) return <div className="mx-auto max-w-2xl rounded-2xl bg-rose-50 p-6 text-rose-900"><h1 className="text-xl font-bold">无法读取难度参考</h1><p className="mt-2 text-sm">{presetsResult.error}</p><a className="mt-4 inline-block font-semibold text-cyan-800 underline" href="/settings/difficulties">重新加载</a></div>;
    const presets = presetsResult.value;
    const canManage = canManageActivities(space);
    return <div className="space-y-6"><section><p className="text-sm font-semibold text-cyan-700">空间难度配置</p><h1 className="mt-1 text-3xl font-bold">难度参考</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">参考线仅用于辅助排表，不会替代管理员对非常规队伍的判断。</p></section>{canManage ? null : <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">你可以查看当前空间的难度参考；只有空间管理员可以编辑。</p>}<div className="grid gap-4 lg:grid-cols-3">{presets.map((preset) => <Card key={preset.id} className="p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{preset.name}</h2><Badge>{preset.code}</Badge></div><p className="mt-3 text-sm text-slate-600">最低名望：{preset.minimumFame?.toLocaleString() ?? "未设置"}</p>{canManage ? <DifficultyForm preset={preset} /> : null}</Card>)}</div>{presets.length === 0 ? <Card className="p-8 text-center"><h2 className="text-lg font-bold">尚未配置难度</h2><p className="mt-2 text-sm text-slate-600">请确认已应用数据库种子数据或创建当前空间的难度配置。</p></Card> : null}</div>;
  } catch (error) {
    return <div className="mx-auto max-w-2xl rounded-2xl bg-amber-50 p-6 text-amber-900"><h1 className="text-xl font-bold">请先选择空间</h1><p className="mt-2 text-sm">{error instanceof CurrentSpaceError ? "难度配置需要在已选择且可访问的空间中查看。" : "暂时无法读取难度配置，请稍后刷新。"}</p><a className="mt-4 inline-block font-semibold text-cyan-800 underline" href="/spaces">前往空间页</a></div>;
  }
}
