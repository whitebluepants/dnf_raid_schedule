import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { CredentialsForm } from "@/features/auth/credentials-form";

export default function RegisterPage() {
  return <AuthCard title="创建账号"><Suspense><CredentialsForm mode="register" /></Suspense><p className="mt-4 text-center text-sm text-slate-600">已有账号？<Link className="font-semibold text-cyan-700" href="/login">返回登录</Link></p></AuthCard>;
}
