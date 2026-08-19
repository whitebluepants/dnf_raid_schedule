"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { archiveCharacter } from "./actions";
import { CharacterForm } from "./character-form";
import type { RosterAccount } from "./repository";

export function CharacterList({ accounts }: { accounts: RosterAccount[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const characters = accounts.flatMap((account) => account.characters.map((character) => ({ ...character, accountId: account.id, accountName: account.name })));

  if (!characters.length) {
    return <Card className="p-8 text-center"><h2 className="text-lg font-bold">还没有角色</h2><p className="mt-2 text-sm text-slate-600">先创建游戏账号，再添加用于报名和排表的角色。</p></Card>;
  }

  return (
    <Card className="divide-y divide-slate-200">
      {error ? <p role="alert" className="m-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {characters.map((character) => {
        const isDealer = character.role === "dealer";
        const metric = isDealer ? `模拟 ${character.simulated_damage ?? 0}` : `奶量 ${character.buffer_power ?? 0}`;
        return <article key={character.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{character.name}</h2><Badge>{isDealer ? "C" : "奶"}</Badge><Badge className={character.strength_tier === "high" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>{character.strength_tier === "high" ? "高" : character.strength_tier === "medium" ? "中" : "低"}档</Badge></div><p className="mt-1 text-sm text-slate-500">{character.accountName} · {character.class_name}{character.notes ? ` · ${character.notes}` : ""}</p></div>
          <div className="flex flex-wrap items-center gap-3 text-sm"><span className="font-semibold">{character.fame.toLocaleString()} 名望</span><span className="text-slate-600">{metric}</span><CharacterForm accounts={accounts} triggerLabel={`编辑${character.name}`} character={character} /><Button type="button" aria-label={`归档${character.name}`} disabled={pendingId === character.id} className="border border-rose-200 bg-white text-rose-700" onClick={() => { setError(null); setPendingId(character.id); startTransition(async () => { const result = await archiveCharacter(character.id); setPendingId(null); if (!result.ok) { setError(result.error); return; } router.refresh(); }); }}>{pendingId === character.id ? "归档中…" : "归档"}</Button></div>
        </article>;
      })}
    </Card>
  );
}
