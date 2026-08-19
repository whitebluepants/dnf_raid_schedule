"use client";

import { Input } from "@/components/ui/input";
import type { WorkbenchCharacter } from "./repository";

const tierLabel = { high: "高档", medium: "中档", low: "低档" } as const;

export function CandidatePool({ candidates, selectedCharacterId, filter, onFilterChange, onSelect }: {
  candidates: WorkbenchCharacter[];
  selectedCharacterId: string | null;
  filter: string;
  onFilterChange: (value: string) => void;
  onSelect: (characterId: string) => void;
}) {
  const normalized = filter.trim().toLocaleLowerCase();
  const visible = candidates.filter((character) => !normalized || [character.name, character.memberName, character.accountName, character.role, character.strengthTier].some((value) => value.toLocaleLowerCase().includes(normalized)));
  return <aside className="space-y-3" aria-label="候补池">
    <div><h2 className="text-lg font-bold">候补角色</h2><p className="mt-1 text-xs text-slate-500">先选角色，再点目标槽位</p></div>
    <label htmlFor="candidate-filter" className="block text-sm font-medium">筛选候补<Input id="candidate-filter" className="mt-1" value={filter} onChange={(event) => onFilterChange(event.target.value)} placeholder="成员、账号、角色、C/奶" /></label>
    <div className="space-y-2">{visible.map((character) => <button key={character.id} type="button" aria-label={`候补角色 ${character.name}，${character.memberName}，${character.accountName}`} aria-pressed={selectedCharacterId === character.id} onClick={() => onSelect(character.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedCharacterId === character.id ? "border-cyan-500 bg-cyan-50 ring-2 ring-cyan-200" : "border-slate-200 bg-white hover:border-cyan-300"}`}><span className="block font-semibold">{character.name}</span><span className="mt-1 block text-xs text-slate-600">{character.memberName} · {character.accountName}</span><span className="mt-1 block text-xs text-slate-500">{character.role === "buffer" ? "奶" : "C"} · {character.fame.toLocaleString()} 名望 · {tierLabel[character.strengthTier]}</span></button>)}{visible.length === 0 ? <p className="rounded-xl bg-slate-100 p-4 text-sm text-slate-500">没有符合筛选条件的候补。</p> : null}</div>
  </aside>;
}
