import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EventForm } from "@/features/activities/event-form";
import { WavePlanEditor } from "@/features/activities/wave-plan-editor";
import { canManageActivities, listActivities } from "@/features/activities/repository";
import { CurrentSpaceError, requireCurrentSpace } from "@/lib/current-space";
import { createServerClient } from "@/lib/supabase/server";

const difficultyLabel = { normal: "普通", hard: "困难", judgment: "审判" } as const;

export default async function ActivitiesPage() {
  const client = await createServerClient();
  try {
    const space = await requireCurrentSpace(client);
    const activitiesResult = await listActivities(client, space.groupId);
    if (!activitiesResult.ok) return <div className="mx-auto max-w-2xl rounded-2xl bg-rose-50 p-6 text-rose-900"><h1 className="text-xl font-bold">无法读取活动</h1><p className="mt-2 text-sm">{activitiesResult.error}</p><a className="mt-4 inline-block font-semibold text-cyan-800 underline" href="/activities">重新加载</a></div>;
    const activities = activitiesResult.value;
    const canManage = canManageActivities(space);
    return <div className="space-y-6"><section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-cyan-700">当前空间活动</p><h1 className="mt-1 text-3xl font-bold tracking-tight">开团与报名</h1><p className="mt-2 text-sm text-slate-600">成员可以查看活动并报名自己的角色；管理员可以创建多波活动。</p></div><p className="text-sm text-slate-500">{activities.length} 个进行中活动</p></section>{canManage ? <EventForm /> : null}<section className="space-y-4" aria-label="活动列表">{activities.map((activity) => <Card key={activity.id} className="p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{activity.title}</h2><Badge className="bg-slate-100 text-slate-700">{activity.status === "draft" ? "报名中" : activity.status}</Badge></div><p className="mt-2 text-sm text-slate-600">{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.eventDate))} · 游戏周 {activity.gameWeek}</p><div className="mt-3 flex flex-wrap gap-2">{activity.waves.map((wave) => <Badge key={wave.id} className={wave.difficulty === "hard" ? "bg-rose-50 text-rose-700" : wave.difficulty === "judgment" ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"}>第 {wave.number} 波 · {difficultyLabel[wave.difficulty]}</Badge>)}</div></div><div className="flex flex-wrap gap-2"><a href={`/activities/${activity.id}/signup`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white">去报名</a>{canManage ? <a href={`/activities/${activity.id}/schedule`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">进入排表工作台</a> : null}</div></div>{canManage && (activity.status === "draft" || activity.status === "open") ? <div className="mt-4"><WavePlanEditor eventId={activity.id} initialWaves={activity.waves} /></div> : null}</Card>)}{activities.length === 0 ? <Card className="p-8 text-center"><h2 className="text-lg font-bold">还没有活动</h2><p className="mt-2 text-sm text-slate-600">{canManage ? "创建第一个活动后，成员就可以选择角色报名。" : "请等待空间管理员创建活动。"}</p></Card> : null}</section></div>;
  } catch (error) {
    return <div className="mx-auto max-w-2xl rounded-2xl bg-amber-50 p-6 text-amber-900"><h1 className="text-xl font-bold">请先选择空间</h1><p className="mt-2 text-sm">{error instanceof CurrentSpaceError ? "活动需要在已选择且可访问的空间中查看。" : "暂时无法读取活动，请稍后刷新。"}</p><a className="mt-4 inline-block font-semibold text-cyan-800 underline" href="/spaces">前往空间页</a></div>;
  }
}
