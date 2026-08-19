"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createGroup, joinGroup, setCurrentSpace } from "./actions";

type FormKind = "create" | "join";

function SpaceForm({ kind }: { kind: FormKind }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isCreate = kind === "create";

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = isCreate
            ? await createGroup(String(formData.get("name") ?? ""))
            : await joinGroup(String(formData.get("inviteCode") ?? ""));
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.replace("/activities");
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
      {!isCreate ? (
        <label className="block text-sm font-medium" htmlFor="join-invite-code">
          邀请码
          <Input id="join-invite-code" name="inviteCode" className="mt-1" minLength={6} maxLength={64} required />
        </label>
      ) : (
        <p className="text-xs text-slate-500">创建后系统会生成唯一邀请码，并仅向已登录的空间成员展示。</p>
      )}
      {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full bg-cyan-600 text-white">
        {pending ? "处理中…" : isCreate ? "创建空间" : "加入空间"}
      </Button>
    </form>
  );
}

export function SpaceSelectButton({ groupId, active }: { groupId: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-4">
      <Button
        type="button"
        disabled={pending || active}
        className="w-full bg-slate-900 text-white disabled:bg-slate-300"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setCurrentSpace(groupId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? "切换中…" : active ? "当前空间" : "设为当前空间"}
      </Button>
      {error ? <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p> : null}
    </div>
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
