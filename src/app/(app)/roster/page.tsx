import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const characters = [
  { name: "破军", account: "蓝色账号", className: "剑魂", role: "C", fame: 84_520, tier: "high", metric: "模拟 1,240 亿" },
  { name: "奶妈一号", account: "蓝色账号", className: "圣职者", role: "奶", fame: 78_300, tier: "medium", metric: "奶量 920" },
  { name: "机械七号", account: "备用账号", className: "机械师", role: "C", fame: 76_110, tier: "medium", metric: "模拟 980 亿" },
];

export default function RosterPage() {
  return <div className="space-y-6"><section className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-cyan-700">我的资料</p><h1 className="mt-1 text-3xl font-bold">账号与角色</h1><p className="mt-2 text-sm text-slate-600">名望和强度档位会影响半自动初排，团长仍可手动调整。</p></div><Button className="bg-cyan-600 text-white">新增角色</Button></section><Card className="divide-y divide-slate-200">{characters.map((character) => <article key={character.name} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="font-bold">{character.name}</h2><Badge>{character.role}</Badge><Badge className={character.tier === "high" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>{character.tier} 档</Badge></div><p className="mt-1 text-sm text-slate-500">{character.account} · {character.className}</p></div><div className="flex items-center gap-4 text-sm"><span className="font-semibold">{character.fame.toLocaleString()} 名望</span><span className="text-slate-600">{character.metric}</span><Button className="border border-slate-300 bg-white text-slate-800">编辑</Button></div></article>)}</Card></div>;
}
