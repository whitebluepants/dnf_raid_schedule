import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const presets = [
  { code: "normal", name: "普通", note: "暂不设置硬参考线", active: false },
  { code: "hard", name: "困难", note: "由团长按国服实战情况调整", active: false },
  { code: "judgment", name: "审判", note: "未来开放，先保留配置入口", active: false },
];

export default function DifficultySettingsPage() {
  return <div className="space-y-6"><section><p className="text-sm font-semibold text-cyan-700">管理员配置</p><h1 className="mt-1 text-3xl font-bold">难度参考</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">第一版不写死国服社区传言。这里的名望、红黄绿队参考线和模拟伤害只作为软提示，团长最终可以手动确认非常规队伍。</p></section><div className="grid gap-4 lg:grid-cols-3">{presets.map((preset) => <Card key={preset.code} className="p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{preset.name}</h2><Badge>{preset.code}</Badge></div><p className="mt-3 text-sm text-slate-600">{preset.note}</p><div className="mt-5 space-y-3"><label className="block text-sm font-medium">最低名望<input className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" type="number" placeholder="未设置" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-cyan-600" />启用半自动参考</label><Button className="mt-2 w-full border border-slate-300 bg-white">保存配置</Button></div></Card>)}</div></div>;
}
