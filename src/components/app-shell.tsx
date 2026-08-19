import type { ReactNode } from "react";
import { RealtimeStatus } from "./realtime-status";

export function AppShell({ userName, memberRole, currentSpaceName, isPlatformAdmin = false, children }: { userName: string; memberRole: "member" | "leader" | "admin"; currentSpaceName?: string | null; isPlatformAdmin?: boolean; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/activities" className="font-bold tracking-tight">团队排表</a>
          <button type="button" className="rounded-lg p-2 text-slate-200 focus-visible:outline-2 focus-visible:outline-cyan-400 md:hidden" aria-label="打开菜单">☰</button>
          <div className="hidden items-center gap-4 text-sm md:flex"><span>{currentSpaceName ?? userName}</span><span className="text-slate-400">{userName} / {isPlatformAdmin ? "平台管理员" : memberRole}</span><RealtimeStatus state="connected" /></div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl md:grid-cols-[220px_1fr]">
        <nav aria-label="主导航" className="hidden border-r border-slate-200 bg-white p-4 md:block">
          <div className="space-y-1 pt-4">
            <a className="block rounded-xl px-3 py-3 text-sm font-medium hover:bg-cyan-50" href="/spaces">空间</a>
            <a className="block rounded-xl px-3 py-3 text-sm font-medium hover:bg-cyan-50" href="/activities">活动</a>
            <a className="block rounded-xl px-3 py-3 text-sm font-medium hover:bg-cyan-50" href="/roster">我的角色</a>
            <a className="block rounded-xl px-3 py-3 text-sm font-medium hover:bg-cyan-50" href="/settings/difficulties">配置</a>
            {memberRole === "admin" || isPlatformAdmin ? <a className="block rounded-xl px-3 py-3 text-sm font-medium hover:bg-cyan-50" href="/settings/members">成员管理</a> : null}
          </div>
        </nav>
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
