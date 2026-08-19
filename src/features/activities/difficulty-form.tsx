"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateDifficultyPreset } from "./actions";
import type { DifficultyPreset } from "./repository";

const references = [
  ["minimumFame", "最低名望"],
  ["redDealerFame", "红队 C 参考名望"],
  ["yellowDealerFame", "黄队 C 参考名望"],
  ["greenDealerFame", "绿队 C 参考名望"],
  ["redBufferPower", "红队奶量参考"],
  ["yellowBufferPower", "黄队奶量参考"],
  ["greenBufferPower", "绿队奶量参考"],
  ["simulatedDamageReference", "模拟伤害参考"],
] as const;

export function DifficultyForm({ preset }: { preset: DifficultyPreset }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return <form className="mt-5 space-y-3" onSubmit={(event) => {
    event.preventDefault();
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const input = Object.fromEntries(references.map(([key]) => [key, String(data.get(key) ?? "")])) as Record<string, string>;
    startTransition(async () => {
      const result = await updateDifficultyPreset({ presetId: preset.id, ...input, autoAssignmentEnabled: data.get("autoAssignmentEnabled") === "on" });
      setMessage(result.ok ? "难度参考已保存。" : result.error);
      if (result.ok) router.refresh();
    });
  }}>
    {references.map(([key, label]) => <div key={key}><label htmlFor={`${preset.id}-${key}`} className="block text-sm font-medium">{label}</label><Input id={`${preset.id}-${key}`} name={key} className="mt-1" type="number" min="0" step="any" defaultValue={preset[key] ?? ""} placeholder="未设置" /></div>)}
    <label className="flex items-center gap-2 text-sm"><input name="autoAssignmentEnabled" type="checkbox" defaultChecked={preset.autoAssignmentEnabled} className="size-4 accent-cyan-600" />启用半自动参考</label>
    <Button type="submit" disabled={pending} className="w-full border border-slate-300 bg-white">{pending ? "保存中…" : "保存配置"}</Button>
    {message ? <p role="alert" className={`rounded-xl p-3 text-sm ${message === "难度参考已保存。" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{message}</p> : null}
  </form>;
}
