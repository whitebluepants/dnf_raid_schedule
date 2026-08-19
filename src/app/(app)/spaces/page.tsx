import { SpaceForms } from "@/features/auth/space-forms";

export default function SpacesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section>
        <p className="text-sm font-semibold text-cyan-700">团队空间</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">创建或加入空间</h1>
        <p className="mt-2 text-sm text-slate-600">每个空间的数据彼此隔离。成员、账号和角色已按空间归属；后续活动、报名和排表也会沿用同一边界。</p>
      </section>
      <SpaceForms />
    </div>
  );
}
