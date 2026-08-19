import { Card } from "@/components/ui/card";
import { ScheduleRealtimeIndicator } from "@/features/schedule-workbench/realtime-indicator";
import { getScheduleWorkbench } from "@/features/schedule-workbench/repository";
import { ScheduleWorkbench } from "@/features/schedule-workbench/schedule-workbench";
import { CurrentSpaceError, requireCurrentSpace } from "@/lib/current-space";
import { createServerClient } from "@/lib/supabase/server";

export default async function SchedulePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params; const client = await createServerClient();
  try {
    const space = await requireCurrentSpace(client); const data = await getScheduleWorkbench(client, space, eventId);
    if (!data) return <Card className="p-8 text-center"><h1 className="text-xl font-bold">找不到这个活动</h1><p className="mt-2 text-sm text-slate-600">活动不存在、已归档，或不属于当前空间。</p></Card>;
    return <div className="space-y-6"><header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-cyan-700">排表工作台</p><h1 className="mt-1 text-3xl font-bold tracking-tight">{data.event.title}</h1><p className="mt-2 text-sm text-slate-600">点击候补与槽位进行放置、交换和移回；保存时会检查服务器版本。</p></div><ScheduleRealtimeIndicator raidEventId={eventId} /></header><ScheduleWorkbench initialData={data} /></div>;
  } catch (error) {
    return <Card className="p-8 text-center"><h1 className="text-xl font-bold">暂时无法打开排表</h1><p className="mt-2 text-sm text-slate-600">{error instanceof CurrentSpaceError ? "请先选择有权访问的空间。" : "读取真实排表数据失败，请稍后刷新。"}</p></Card>;
  }
}
