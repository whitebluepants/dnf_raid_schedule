"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setRegistration } from "./actions";
import type { SignupCharacter } from "./repository";

export function RegistrationForm({ eventId, characters, initialState, initialCharacterIds }: { eventId: string; characters: SignupCharacter[]; initialState: "participating" | "absent"; initialCharacterIds: string[] }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [selected, setSelected] = useState(() => new Set(initialCharacterIds));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return <form className="space-y-5" onSubmit={(event) => {
    event.preventDefault();
    setMessage(null);
    const formData = new FormData();
    formData.set("raidEventId", eventId);
    formData.set("state", state);
    if (state === "participating") selected.forEach((id) => { formData.append("characterId", id); });
    startTransition(async () => {
      const result = await setRegistration(formData);
      setMessage(result.ok ? "报名已保存。" : result.error);
      if (result.ok) router.refresh();
    });
  }}>
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4"><legend className="px-1 text-sm font-semibold">本次是否参加</legend><label className="mr-5 inline-flex items-center gap-2"><input type="radio" name="attendance" checked={state === "participating"} onChange={() => setState("participating")} />参加</label><label className="inline-flex items-center gap-2"><input type="radio" name="attendance" checked={state === "absent"} onChange={() => setState("absent")} />本次缺席</label></fieldset>
    {state === "participating" ? <fieldset><legend className="text-sm font-semibold">选择可用角色</legend><p className="mt-1 text-sm text-slate-600">只显示你在当前空间中未归档的角色。</p><div className="mt-3 space-y-3">{characters.map((character) => <label key={character.id} className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 p-4 hover:border-cyan-400"><span className="flex items-center gap-3"><input type="checkbox" checked={selected.has(character.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(character.id); else next.delete(character.id); return next; })} className="size-5 accent-cyan-600" /><span><span className="block font-semibold">{character.name} <Badge className="ml-1">{character.role === "buffer" ? "奶" : "C"}</Badge></span><span className="text-sm text-slate-500">{character.accountName ?? "未命名账号"} · {character.fame.toLocaleString()} 名望</span></span></span></label>)}</div>{characters.length === 0 ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">当前空间还没有可报名的角色，请先到“我的角色”添加。</p> : null}</fieldset> : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">保存后会保留缺席记录，并撤销本次的角色报名。</p>}
    <div className="flex justify-end"><Button type="submit" disabled={pending} className="bg-cyan-600 text-white">{pending ? "保存中…" : "保存报名"}</Button></div>{message ? <p role="alert" className={`rounded-xl p-3 text-sm ${message === "报名已保存。" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{message}</p> : null}
  </form>;
}
