import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireCurrentSpace } from "@/lib/current-space";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const client = await createServerClient();
  const { data: { user } } = await client.auth.getUser();
  const { data: profile } = user
    ? await client.from("profiles").select("display_name, is_platform_admin").eq("id", user.id).maybeSingle()
    : { data: null };
  let memberRole: "member" | "leader" | "admin" = "member";
  let currentSpaceName: string | null = null;
  let isPlatformAdmin = profile?.is_platform_admin ?? false;
  try {
    const context = await requireCurrentSpace(client);
    memberRole = context.role;
    isPlatformAdmin = context.isPlatformAdmin;
    const { data: group } = await client.from("groups").select("name").eq("id", context.groupId).maybeSingle();
    currentSpaceName = group?.name ?? null;
  } catch {
    // The spaces page remains available so the member can select a valid scope.
  }

  return <AppShell userName={profile?.display_name ?? "当前成员"} memberRole={memberRole} currentSpaceName={currentSpaceName} isPlatformAdmin={isPlatformAdmin}>{children}</AppShell>;
}
