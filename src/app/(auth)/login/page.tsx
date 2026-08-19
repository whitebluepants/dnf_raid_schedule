import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { CredentialsForm } from "@/features/auth/credentials-form";

export default function LoginPage() {
  return <AuthCard title="登录"><Suspense><CredentialsForm mode="login" /></Suspense><p className="mt-4 text-center text-sm text-slate-600">还没有账号？<Link className="font-semibold text-cyan-700" href="/register">注册</Link></p></AuthCard>;
}
