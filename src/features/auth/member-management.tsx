"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { setMemberRole } from "@/features/auth/actions";

export type ManagedMember = {
  profileId: string;
  displayName: string;
  role: "member" | "leader" | "admin";
};

function roleLabel(role: ManagedMember["role"]): string {
  if (role === "admin") return "空间管理员";
  if (role === "leader") return "兼容团长";
  return "成员";
}

export function MemberManagement({ groupId, members }: { groupId: string; members: ManagedMember[] }) {
  const router = useRouter();
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {members.map((member) => {
        const nextRole = member.role === "admin" ? "member" : "admin";
        return (
          <article key={member.profileId} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">{member.displayName}</h2>
              <p className="text-sm text-slate-500">{roleLabel(member.role)}</p>
            </div>
            <Button
              type="button"
              disabled={pending && pendingProfileId === member.profileId}
              className="bg-slate-900 text-white"
              onClick={() => {
                setError(null);
                setPendingProfileId(member.profileId);
                startTransition(async () => {
                  const result = await setMemberRole(groupId, member.profileId, nextRole);
                  if (!result.ok) setError(result.error);
                  router.refresh();
                  setPendingProfileId(null);
                });
              }}
            >
              {pending && pendingProfileId === member.profileId
                ? "保存中…"
                : nextRole === "admin"
                  ? "设为管理员"
                  : "设为成员"}
            </Button>
          </article>
        );
      })}
      {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
