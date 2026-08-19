import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  return <AuthCard title="登录团本排表"><form className="space-y-4"><label className="block text-sm font-medium" htmlFor="email">邮箱<Input id="email" name="email" type="email" autoComplete="email" className="mt-1" required /></label><label className="block text-sm font-medium" htmlFor="password">密码<Input id="password" name="password" type="password" autoComplete="current-password" className="mt-1" required /></label><Button type="submit" className="w-full bg-slate-900 text-white">登录</Button></form><p className="mt-4 text-center text-sm text-slate-600">还没有账号？<Link className="font-semibold text-cyan-700" href="/register">注册</Link></p></AuthCard>;
}

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-4"><section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-8"><p className="text-sm font-bold text-cyan-700">米歇尔 · 团本排表</p><h1 className="mt-2 text-2xl font-bold">{title}</h1><div className="mt-6">{children}</div></section></main>;
}
