import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell userName="当前成员" memberRole="member">{children}</AppShell>;
}
