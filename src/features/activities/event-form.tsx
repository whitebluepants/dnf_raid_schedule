"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createRaidEvent } from "./actions";

type Difficulty = "normal" | "hard" | "judgment";
type EditableWave = { id: string; difficulty: Difficulty };

const labels: Record<Difficulty, string> = { normal: "普通", hard: "困难", judgment: "审判" };

function weekFor(date: Date): string {
  const current = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((current.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${current.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function EventForm() {
  const router = useRouter();
  const [waves, setWaves] = useState<EditableWave[]>([{ id: crypto.randomUUID(), difficulty: "hard" }]);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="rounded-2xl border border-cyan-100 bg-cyan-50 p-5 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        const formData = new FormData(event.currentTarget);
        const form = event.currentTarget;
        const localDate = String(formData.get("eventDate") ?? "");
        if (localDate) {
          const date = new Date(localDate);
          formData.set("eventDate", date.toISOString());
          formData.set("gameWeek", weekFor(date));
        }
        waves.forEach((wave, index) => { formData.append("wave", `${wave.difficulty}:${index + 1}`); });
        startTransition(async () => {
          const result = await createRaidEvent(formData);
          setMessage(result.ok ? "活动与波次已创建，可以通知团员报名。" : result.error);
          if (result.ok) {
            form.reset();
            setWaves([{ id: crypto.randomUUID(), difficulty: "hard" }]);
            router.refresh();
          }
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-bold">创建活动</h2><p className="mt-1 text-sm text-slate-600">按顺序添加普通、困难或审判波次。</p></div>
        <span className="text-sm text-cyan-800">共 {waves.length} 波</span>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label htmlFor="event-title" className="text-sm font-medium">活动名称</label><Input id="event-title" name="title" maxLength={160} required placeholder="例如：周六米歇尔攻坚" />
        <label htmlFor="event-date" className="text-sm font-medium">活动时间</label><Input id="event-date" name="eventDate" type="datetime-local" required />
      </div>
      <input type="hidden" name="gameWeek" />
      <div className="mt-4 space-y-2">
        {waves.map((wave, index) => <div key={wave.id} className="flex items-center gap-3 rounded-xl border border-cyan-100 bg-white p-3">
          <span className="w-14 text-sm font-semibold">第 {index + 1} 波</span>
          <Select aria-label={`第 ${index + 1} 波难度`} value={wave.difficulty} onChange={(event) => setWaves((current) => current.map((item, position) => position === index ? { ...item, difficulty: event.target.value as Difficulty } : item))}>
            {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Button type="button" disabled={waves.length === 1} className="border border-slate-300 bg-white" onClick={() => setWaves((current) => current.filter((_, position) => position !== index))}>删除</Button>
        </div>)}
      </div>
      <div className="mt-4 flex flex-wrap justify-between gap-3"><Button type="button" className="border border-cyan-300 bg-white text-cyan-800" onClick={() => setWaves((current) => [...current, { id: crypto.randomUUID(), difficulty: "hard" }])}>添加一波</Button><Button type="submit" disabled={pending} className="bg-cyan-600 text-white">{pending ? "创建中…" : "创建活动"}</Button></div>
      {message ? <p role="alert" className={`mt-4 rounded-xl p-3 text-sm ${message.includes("已创建") ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{message}</p> : null}
    </form>
  );
}
