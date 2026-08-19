import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthCard } from "../login/page";

export default function RegisterPage() {
  return <AuthCard title="创建账号"><form className="space-y-4"><label className="block text-sm font-medium" htmlFor="nickname">游戏昵称<Input id="nickname" name="nickname" className="mt-1" required /></label><label className="block text-sm font-medium" htmlFor="email">邮箱<Input id="email" name="email" type="email" autoComplete="email" className="mt-1" required /></label><label className="block text-sm font-medium" htmlFor="password">密码<Input id="password" name="password" type="password" autoComplete="new-password" className="mt-1" required /></label><Button type="submit" className="w-full bg-cyan-600 text-white">注册</Button></form><p className="mt-4 text-center text-sm text-slate-600">已有账号？<Link className="font-semibold text-cyan-700" href="/login">返回登录</Link></p></AuthCard>;
}
