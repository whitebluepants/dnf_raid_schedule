"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, register } from "./actions";

type Mode = "login" | "register";

function safeNext(next: string | null): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/spaces";
}

export function CredentialsForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isLogin = mode === "login";

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = isLogin ? await login(formData) : await register(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.replace(isLogin ? safeNext(searchParams.get("next")) : "/spaces");
          router.refresh();
        });
      }}
    >
      <label className="block text-sm font-medium" htmlFor="nickname">
        昵称
        <Input id="nickname" name="nickname" autoComplete="username" className="mt-1" required />
      </label>
      <label className="block text-sm font-medium" htmlFor="password">
        密码
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          minLength={8}
          className="mt-1"
          required
        />
      </label>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      <Button type="submit" disabled={pending} className={`w-full text-white ${isLogin ? "bg-slate-900" : "bg-cyan-600"}`}>
        {pending ? "处理中…" : isLogin ? "登录" : "注册"}
      </Button>
    </form>
  );
}
