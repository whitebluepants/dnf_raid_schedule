"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { syncEventWaves } from "./actions";

type Difficulty = "normal" | "hard" | "judgment";
type Wave = { id: string; difficulty: Difficulty };

const labels: Record<Difficulty, string> = { normal: "普通", hard: "困难", judgment: "审判" };

export function WavePlanEditor({ eventId, initialWaves }: { eventId: string; initialWaves: Array<{ id: string; difficulty: Difficulty }> }) {
  const router = useRouter();
  const [waves, setWaves] = useState<Wave[]>(initialWaves);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (!open) return <Button type="button" className="border border-slate-300 bg-white text-slate-800" onClick={() => setOpen(true)}>调整波次</Button>;
  return <section className="w-full rounded-xl border border-cyan-100 bg-cyan-50 p-4 sm:max-w-xl" aria-label="调整波次">
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">调整波次</h3><p className="mt-1 text-sm text-slate-600">排表前可随时增减并修改难度；一旦已有排表数据则会锁定。</p></div><Button type="button" className="border border-slate-300 bg-white text-slate-800" onClick={() => { setOpen(false); setWaves(initialWaves); setMessage(null); }}>取消</Button></div>
    <div className="mt-3 space-y-2">{waves.map((wave, index) => <div key={wave.id} className="flex items-center gap-2 rounded-lg bg-white p-2"><span className="w-14 text-sm font-semibold">第 {index + 1} 波</span><Select aria-label={`调整第 ${index + 1} 波难度`} value={wave.difficulty} onChange={(event) => setWaves((current) => current.map((item, position) => position === index ? { ...item, difficulty: event.target.value as Difficulty } : item))}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Button type="button" disabled={waves.length === 1 || pending} className="border border-slate-300 bg-white text-slate-800" onClick={() => setWaves((current) => current.filter((_, position) => position !== index))}>删除</Button></div>)}</div>
    <div className="mt-3 flex flex-wrap gap-2"><Button type="button" disabled={pending} className="border border-cyan-300 bg-white text-cyan-800" onClick={() => setWaves((current) => [...current, { id: crypto.randomUUID(), difficulty: "hard" }])}>添加一波</Button><Button type="button" disabled={pending} className="bg-cyan-600 text-white" onClick={() => { setMessage(null); startTransition(async () => { const result = await syncEventWaves(eventId, waves.map((wave, index) => ({ order: index + 1, difficulty: wave.difficulty }))); setMessage(result.ok ? "波次已更新。" : result.error); if (result.ok) { setOpen(false); router.refresh(); } }); }}>{pending ? "保存中…" : "保存波次"}</Button></div>
    {message ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{message}</p> : null}
  </section>;
}
