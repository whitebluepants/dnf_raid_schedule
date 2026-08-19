"use client";

import type { WorkbenchWave } from "./repository";

const teamLabel = { red: "红队", yellow: "黄队", green: "绿队" } as const;
const colorClass = { red: "border-rose-200 bg-rose-50/40", yellow: "border-amber-200 bg-amber-50/40", green: "border-emerald-200 bg-emerald-50/40" } as const;

export function TeamBoard({ wave, selectedSlotId, editable, onSlotClick, onToggleLock }: {
  wave: WorkbenchWave;
  selectedSlotId: string | null;
  editable: boolean;
  onSlotClick: (waveId: string, slotId: string) => void;
  onToggleLock: (waveId: string, slotId: string) => void;
}) {
  return <div className="grid gap-3 xl:grid-cols-3">{(Object.keys(wave.teams) as Array<keyof typeof wave.teams>).map((color) => <section key={color} className={`rounded-2xl border p-3 ${colorClass[color]}`} aria-label={teamLabel[color]}><h3 className="mb-3 font-bold">{teamLabel[color]}</h3><div className="space-y-2">{wave.teams[color].slots.map((slot, index) => {
    const slotName = `${teamLabel[color]} ${index + 1}号 ${slot.role === "buffer" ? "奶" : "C"} 槽位`;
    return <div key={slot.slotId} className="grid grid-cols-[1fr_auto] gap-2"><button type="button" disabled={!editable} aria-label={`${slotName}${slot.character ? `，${slot.character.name}` : "，空"}${slot.locked ? "，已锁定" : ""}`} aria-pressed={selectedSlotId === `${wave.id}:${slot.slotId}`} onClick={() => onSlotClick(wave.id, slot.slotId)} className={`min-h-20 rounded-xl border bg-white p-3 text-left transition disabled:cursor-default ${selectedSlotId === `${wave.id}:${slot.slotId}` ? "border-cyan-500 ring-2 ring-cyan-200" : "border-slate-200"} ${slot.locked ? "border-slate-500 bg-slate-100" : editable ? "hover:border-cyan-300" : ""}`}><span className="block text-xs font-semibold text-slate-500">{index + 1}号 · {slot.role === "buffer" ? "奶" : "C"}</span><span className="mt-1 block font-semibold">{slot.character?.name ?? "空槽位"}</span>{slot.character ? <span className="mt-1 block text-xs text-slate-500">{slot.character.fame.toLocaleString()} 名望</span> : null}{slot.locked ? <span className="mt-1 inline-block rounded bg-slate-700 px-1.5 py-0.5 text-xs font-semibold text-white">已锁定</span> : null}</button>{editable ? <button type="button" aria-label={`${slot.locked ? "解锁" : "锁定"}${slotName}`} onClick={() => onToggleLock(wave.id, slot.slotId)} className="min-h-11 self-center rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold">{slot.locked ? "解锁" : "锁定"}</button> : null}</div>;
  })}</div></section>)}</div>;
}
