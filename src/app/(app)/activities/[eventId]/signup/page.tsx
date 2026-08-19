import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const signupCharacters = [
  { id: "破军", account: "蓝色账号", role: "C", fame: 84_520, checked: true },
  { id: "奶妈一号", account: "蓝色账号", role: "奶", fame: 78_300, checked: true },
  { id: "机械七号", account: "备用账号", role: "C", fame: 76_110, checked: false },
];

export default async function SignupPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <div className="mx-auto max-w-3xl space-y-6"><section><p className="text-sm font-semibold text-cyan-700">活动报名 · {eventId}</p><h1 className="mt-1 text-3xl font-bold">选择本次可用角色</h1><p className="mt-2 text-sm text-slate-600">报名后团长会把角色放入不同波次；同一角色一周内不能重复出场。</p></section><Card className="p-5"><label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><input type="checkbox" defaultChecked className="size-5 accent-cyan-600" /> <span><span className="block font-semibold">本次参加</span><span className="text-sm text-slate-500">如果临时鸽了，可以由团长在排表中标记缺席并重新生成。</span></span></label><div className="mt-5 space-y-3">{signupCharacters.map((character) => <label key={character.id} className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 p-4 hover:border-cyan-400"><span className="flex items-center gap-3"><input type="checkbox" defaultChecked={character.checked} className="size-5 accent-cyan-600" /><span><span className="block font-semibold">{character.id} <Badge className="ml-1">{character.role}</Badge></span><span className="text-sm text-slate-500">{character.account} · {character.fame.toLocaleString()} 名望</span></span></span><span className="text-xs text-slate-500">本周未使用</span></label>)}</div><div className="mt-6 flex justify-end"><Button className="bg-cyan-600 text-white">保存报名</Button></div></Card></div>;
}
