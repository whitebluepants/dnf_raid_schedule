"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createGroup, joinGroup } from "./actions";

type FormKind = "create" | "join";

function SpaceForm({ kind }: { kind: FormKind }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const isCreate = kind === "create";

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = isCreate ? await createGroup(formData) : await joinGroup(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          if (isCreate) {
            setCreatedInviteCode(String(formData.get("inviteCode") ?? ""));
          } else {
            router.replace("/activities");
          }
          router.refresh();
        });
      }}
    >
      {isCreate ? (
        <label className="block text-sm font-medium" htmlFor="name">
          空间名称
          <Input id="name" name="name" className="mt-1" maxLength={120} required />
        </label>
      ) : null}
      <label className="block text-sm font-medium" htmlFor={`${kind}-invite-code`}>
        邀请码
        <Input id={`${kind}-invite-code`} name="inviteCode" className="mt-1" minLength={6} maxLength={64} required />
      </label>
      {isCreate ? <p className="text-xs text-slate-500">邀请码会展示给该空间的已登录成员，请使用方便团队分享的内容。</p> : null}
      {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {createdInviteCode ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">空间已创建。邀请码：<strong>{createdInviteCode}</strong></p> : null}
      <Button type="submit" disabled={pending} className="w-full bg-cyan-600 text-white">
        {pending ? "处理中…" : isCreate ? "创建空间" : "加入空间"}
      </Button>
    </form>
  );
}

export function SpaceForms() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">创建空间</h2>
        <p className="mt-1 text-sm text-slate-600">为自己的固定团体建立独立的成员、角色和排表数据。</p>
        <div className="mt-5"><SpaceForm kind="create" /></div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">加入空间</h2>
        <p className="mt-1 text-sm text-slate-600">向团长取得邀请码后加入；邀请码不会出现在公开登录页。</p>
        <div className="mt-5"><SpaceForm kind="join" /></div>
      </section>
    </div>
  );
}
