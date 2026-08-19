"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { validateSchedule } from "@/features/scheduling/validate-schedule";
import { generateAndPersistSchedule, publishSchedule, saveScheduleDraft, setMemberAttendance } from "./actions";
import { CandidatePool } from "./candidate-pool";
import type { ScheduleWorkbenchData, WorkbenchWave } from "./repository";
import { waveToSnapshot } from "./repository";
import { TeamBoard } from "./team-board";

type Selection = { kind: "candidate"; characterId: string } | { kind: "slot"; waveId: string; slotId: string };
const cloneWaves = (waves: WorkbenchWave[]): WorkbenchWave[] => structuredClone(waves);
function findSlot(waves: WorkbenchWave[], waveId: string, slotId: string) {
  const wave = waves.find((item) => item.id === waveId);
  if (!wave) return null;
  for (const team of Object.values(wave.teams)) {
    const slot = team.slots.find((item) => item.slotId === slotId);
    if (slot) return { wave, slot };
  }
  return null;
}

export function ScheduleWorkbench({ initialData }: { initialData: ScheduleWorkbenchData }) {
  const router = useRouter();
  const [waves, setWaves] = useState(() => cloneWaves(initialData.waves));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingServerData, setPendingServerData] = useState<ScheduleWorkbenchData | null>(null);
  const latestServerData = useRef(initialData);
  const [isPending, startTransition] = useTransition();
  const scheduledIds = useMemo(() => new Set(waves.flatMap((wave) => Object.values(wave.teams).flatMap((team) => team.slots.flatMap((slot) => slot.character ? [slot.character.id] : [])))), [waves]);
  const candidates = initialData.characters.filter((character) => !scheduledIds.has(character.id));
  const selectedCharacterId = selection?.kind === "candidate" ? selection.characterId : null;
  const selectedSlotId = selection?.kind === "slot" ? `${selection.waveId}:${selection.slotId}` : null;
  useEffect(() => {
    const cancelSelection = (event: KeyboardEvent) => { if (event.key === "Escape") setSelection(null); };
    window.addEventListener("keydown", cancelSelection);
    return () => window.removeEventListener("keydown", cancelSelection);
  }, []);
  useEffect(() => {
    if (initialData === latestServerData.current) return;
    latestServerData.current = initialData;
    if (dirty) {
      setPendingServerData(initialData);
      return;
    }
    setWaves(cloneWaves(initialData.waves));
    setSelection(null);
    setPendingServerData(null);
  }, [initialData, dirty]);

  const clickSlot = (waveId: string, slotId: string) => {
    setMessage(null);
    const target = findSlot(waves, waveId, slotId);
    if (!target) return;
    if (target.slot.locked) { setMessage("该槽位已锁定，请先解锁"); return; }
    if (!selection) { if (target.slot.character) setSelection({ kind: "slot", waveId, slotId }); return; }
    const next = cloneWaves(waves);
    const nextTarget = findSlot(next, waveId, slotId);
    if (!nextTarget) return;
    if (selection.kind === "candidate") {
      const character = initialData.characters.find((item) => item.id === selection.characterId);
      if (!character) return;
      if (character.role !== nextTarget.slot.role) { setMessage("角色类型与槽位不匹配"); return; }
      const duplicateAccount = Object.values(nextTarget.wave.teams).flatMap((team) => team.slots).some((slot) => slot.slotId !== slotId && slot.character?.accountId === character.accountId);
      if (duplicateAccount) { setMessage("同一波次不能安排同一账号的多个角色"); return; }
      nextTarget.slot.character = character;
    } else {
      const source = findSlot(next, selection.waveId, selection.slotId);
      if (!source || source.slot.locked) { setMessage("源槽位已锁定，请先解锁"); return; }
      if ((source.slot.character && source.slot.character.role !== nextTarget.slot.role) || (nextTarget.slot.character && nextTarget.slot.character.role !== source.slot.role)) {
        setMessage("交换后的角色类型与槽位不匹配"); return;
      }
      [source.slot.character, nextTarget.slot.character] = [nextTarget.slot.character, source.slot.character];
    }
    setWaves(next); setSelection(null); setDirty(true);
  };

  const returnToPool = () => {
    if (selection?.kind !== "slot") return;
    const next = cloneWaves(waves); const source = findSlot(next, selection.waveId, selection.slotId);
    if (!source || source.slot.locked) { setMessage("该槽位已锁定，请先解锁"); return; }
    source.slot.character = null; setWaves(next); setSelection(null); setDirty(true);
  };
  const toggleLock = (waveId: string, slotId: string) => {
    const next = cloneWaves(waves); const target = findSlot(next, waveId, slotId);
    if (target) { target.slot.locked = !target.slot.locked; setWaves(next); setDirty(true); }
  };
  const run = (operation: () => Promise<{ status: string; message?: string }>, successMessage: string) => startTransition(async () => {
    const result = await operation();
    if (result.status === "success") { setMessage(successMessage); router.refresh(); } else setMessage(result.message ?? "操作失败，请重试");
  });
  const save = () => run(async () => {
    const result = await saveScheduleDraft({
      raidEventId: initialData.event.id,
      expectedVersions: Object.fromEntries(waves.map((wave) => [wave.id, wave.version])),
      snapshots: Object.fromEntries(waves.map((wave) => [wave.id, waveToSnapshot(wave)])),
    });
    if (result.status === "success") {
      setWaves((current) => current.map((wave) => ({ ...wave, version: result.data.versions[wave.id] ?? wave.version })));
      setDirty(false);
    }
    return result;
  }, "草稿已保存");
  const publish = () => {
    const issues = validateSchedule({ waves, weeklyUsedCharacterIds: initialData.weeklyUsedCharacterIds, difficultyPresets: initialData.difficultyPresets });
    if (issues.some((issue) => issue.code === "empty_slot")) { setMessage("排表还有空槽位，补齐后才能发布"); return; }
    if (issues.some((issue) => issue.severity === "blocking")) { setMessage("排表存在角色周次数或同波账号冲突，无法发布"); return; }
    run(() => publishSchedule(initialData.event.id, Object.fromEntries(waves.map((wave) => [wave.id, wave.version]))), "排表已发布");
  };
  const issues = validateSchedule({ waves, weeklyUsedCharacterIds: initialData.weeklyUsedCharacterIds, difficultyPresets: initialData.difficultyPresets });

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge>{initialData.event.status === "published" ? "已发布" : "草稿"}</Badge><Badge className={issues.length ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}>{issues.length ? `${issues.length} 项提示` : "结构完整"}</Badge></div>{initialData.canManage ? <div className="flex flex-wrap gap-2"><Button type="button" disabled={isPending} onClick={() => run(() => generateAndPersistSchedule(initialData.event.id), "初稿已生成")} className="bg-violet-600 text-white">自动生成</Button><Button type="button" disabled={isPending} onClick={save} className="bg-cyan-600 text-white">保存草稿</Button><Button type="button" disabled={isPending} onClick={publish} className="bg-emerald-600 text-white">发布排表</Button></div> : null}</div>
    {message ? <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{message}</p> : null}
    {pendingServerData ? <div role="alert" className="flex flex-col justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center"><span>服务器排表已更新，本地未保存修改仍保留</span><Button type="button" className="border border-amber-400 bg-white" onClick={() => { setWaves(cloneWaves(pendingServerData.waves)); setSelection(null); setDirty(false); setPendingServerData(null); }}>载入服务器版本</Button></div> : null}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="space-y-5">{waves.map((wave) => <Card key={wave.id} className="p-4"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-xl font-bold">第 {wave.number} 波</h2><Badge>{wave.difficulty === "hard" ? "困难" : wave.difficulty === "judgment" ? "审判" : "普通"}</Badge></div><TeamBoard wave={wave} selectedSlotId={selectedSlotId} editable={initialData.canManage} onSlotClick={clickSlot} onToggleLock={toggleLock} /></Card>)}</div><div className="space-y-4">{initialData.canManage ? <Card className="p-4"><CandidatePool candidates={candidates} selectedCharacterId={selectedCharacterId} filter={filter} onFilterChange={setFilter} onSelect={(characterId) => { setMessage(null); setSelection((current) => current?.kind === "candidate" && current.characterId === characterId ? null : { kind: "candidate", characterId }); }} /></Card> : null}{selection?.kind === "slot" ? <Button type="button" onClick={returnToPool} className="w-full border border-slate-300 bg-white">移回候补</Button> : null}<Button type="button" disabled={isPending} onClick={() => run(() => setMemberAttendance(initialData.event.id, initialData.ownAttendance === "absent" ? "participating" : "absent"), initialData.ownAttendance === "absent" ? "已恢复出席" : "已标记缺席")} className="w-full border border-rose-200 bg-rose-50 text-rose-700">{initialData.ownAttendance === "absent" ? "恢复我的出席" : "标记我缺席"}</Button><p className="text-xs text-slate-500">标记缺席会释放你已安排但尚未通关的角色位置。</p></div></div>
  </div>;
}
