export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center p-8">
      <section aria-labelledby="page-title" className="space-y-4">
        <p className="text-sm font-medium text-indigo-700">DNF RAID SCHEDULER</p>
        <h1 id="page-title" className="text-4xl font-bold tracking-tight">
          DNF 攻坚战排期器
        </h1>
        <p className="text-lg text-slate-700">
          为团队安排攻坚时间、成员与角色分工，让每一次开团都清晰有序。
        </p>
        <div className="flex flex-wrap gap-3"><a className="inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white" href="/activities">进入本周排表</a><a className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800" href="/login">登录 / 注册</a></div>
      </section>
    </main>
  );
}
