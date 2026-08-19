import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { generateSchedule } from "@/features/scheduling/generate-schedule";
import type { CandidateCharacter } from "@/features/scheduling/types";

const demoCharacters: CandidateCharacter[] = [
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `demo-buffer-${index}`,
    accountId: `demo-account-${index}`,
    profileId: `demo-profile-${index % 3}`,
    role: "buffer" as const,
    fame: 72_000 - index * 500,
    strengthTier: index === 0 ? ("high" as const) : ("medium" as const),
    damageScore: null,
    buffScore: 1_000 - index * 50,
  })),
  ...Array.from({ length: 12 }, (_, index) => ({
    id: `demo-dealer-${index}`,
    accountId: `demo-account-${index + 4}`,
    profileId: `demo-profile-${index % 4}`,
    role: "dealer" as const,
    fame: 84_000 - index * 400,
    strengthTier: index < 4 ? ("high" as const) : index < 9 ? ("medium" as const) : ("low" as const),
    damageScore: 1_200 - index * 35,
    buffScore: null,
  })),
];

const demoSchedule = generateSchedule({
  characters: demoCharacters,
  waves: [
    { id: "wave-1", difficulty: "hard" },
    { id: "wave-2", difficulty: "hard" },
    { id: "wave-3", difficulty: "normal" },
  ],
});

const roleLabel = { buffer: "奶", dealer: "C" } as const;
const teamLabel = { red: "红队", yellow: "黄队", green: "绿队" } as const;

export default function ActivitiesPage() {
  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-cyan-700">2026-08-22 · 米歇尔攻坚</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">本周开团排表</h1>
          <p className="mt-2 text-sm text-slate-600">当前是演示草稿，团长可以在生成后拖拽调整、锁定和发布。</p>
        </div>
        <div className="flex gap-2"><Button className="bg-slate-900 text-white hover:bg-slate-700">重新生成</Button><Button className="bg-cyan-600 text-white hover:bg-cyan-500">发布排表</Button></div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-sm text-slate-500">已排波次</p><p className="mt-1 text-2xl font-bold">{demoSchedule.waves.filter((wave) => wave.gaps.length === 0).length} / {demoSchedule.waves.length}</p></Card>
        <Card className="p-4"><p className="text-sm text-slate-500">报名角色</p><p className="mt-1 text-2xl font-bold">{demoCharacters.length}</p></Card>
        <Card className="p-4"><p className="text-sm text-slate-500">候补</p><p className="mt-1 text-2xl font-bold">{demoSchedule.candidates.length}</p></Card>
      </div>

      <div className="space-y-5">
        {demoSchedule.waves.map((wave, index) => (
          <Card key={wave.id} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5"><div className="flex items-center gap-3"><h2 className="font-bold">第 {index + 1} 波</h2><Badge className={wave.difficulty === "hard" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}>{wave.difficulty === "hard" ? "困难" : "普通"}</Badge></div><span className="text-xs text-slate-500">草稿 · 可调整</span></div>
            <div className="grid gap-4 p-4 lg:grid-cols-3 sm:p-5">
              {Object.entries(wave.teams).map(([color, team]) => (
                <section key={color} aria-label={teamLabel[color as keyof typeof teamLabel]} className="rounded-xl border border-slate-200 p-3"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{teamLabel[color as keyof typeof teamLabel]}</h3><span className="text-xs text-slate-500">{team.slots.filter((slot) => slot.character).length}/4</span></div><div className="space-y-2">{team.slots.map((slot) => <div key={slot.slotId} className={`rounded-lg border p-3 ${slot.character ? "border-slate-200 bg-white" : "border-dashed border-amber-300 bg-amber-50"}`}><div className="flex items-center justify-between text-xs text-slate-500"><span>{roleLabel[slot.role]}位</span>{slot.locked && <span>已锁定</span>}</div><p className="mt-1 truncate text-sm font-semibold">{slot.character ? `${slot.character.id} · ${slot.character.fame.toLocaleString()} 名望` : "待补位"}</p></div>)}</div></section>
              ))}
            </div>
            {wave.gaps.length > 0 && <p className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">缺口：{wave.gaps.map((gap) => `${teamLabel[gap.team]}${roleLabel[gap.role]}`).join("、")}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}
