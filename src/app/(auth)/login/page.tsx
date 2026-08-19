import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthCard } from "@/components/auth-card";

export default function LoginPage() {
  return <AuthCard title="登录团本排表"><form className="space-y-4"><label className="block text-sm font-medium" htmlFor="email">邮箱<Input id="email" name="email" type="email" autoComplete="email" className="mt-1" required /></label><label className="block text-sm font-medium" htmlFor="password">密码<Input id="password" name="password" type="password" autoComplete="current-password" className="mt-1" required /></label><Button type="submit" className="w-full bg-slate-900 text-white">登录</Button></form><p className="mt-4 text-center text-sm text-slate-600">还没有账号？<Link className="font-semibold text-cyan-700" href="/register">注册</Link></p></AuthCard>;
}
