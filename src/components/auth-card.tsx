import type { ReactNode } from "react";

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-4"><section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-8"><p className="text-sm font-bold text-cyan-700">米歇尔 · 团本排表</p><h1 className="mt-2 text-2xl font-bold">{title}</h1><div className="mt-6">{children}</div></section></main>;
}
