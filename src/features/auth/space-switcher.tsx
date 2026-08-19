"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setCurrentSpace } from "./actions";

export type HeaderSpace = { id: string; name: string; inviteCode: string | null; active: boolean };

export function SpaceSwitcher({ currentSpaceName, spaces }: { currentSpaceName: string | null; spaces: HeaderSpace[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = currentSpaceName ?? "选择空间";
  return <div className="relative"><button type="button" className="rounded-lg px-2 py-1 font-medium text-slate-100 hover:bg-slate-800" aria-expanded={open} aria-label={`当前空间：${current}`} onClick={() => setOpen((value) => !value)}>当前空间：{current} ▾</button>{open ? <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl">{spaces.map((space) => <div key={space.id} className="rounded-lg px-3 py-2 hover:bg-slate-800"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium">{space.name}</span>{space.active ? <span className="text-xs text-cyan-300">当前</span> : <button type="button" disabled={pending} className="text-xs text-cyan-300 underline" onClick={() => startTransition(async () => { const result = await setCurrentSpace(space.id); if (result.ok) { setOpen(false); router.refresh(); } })}>切换</button>}</div>{space.inviteCode ? <p className="mt-1 text-xs text-slate-400">邀请码：{space.inviteCode}</p> : null}</div>)}<a href="/spaces" className="mt-1 block rounded-lg px-3 py-2 text-sm text-cyan-300 hover:bg-slate-800">创建或加入空间</a></div> : null}</div>;
}
