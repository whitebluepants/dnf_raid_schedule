"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { RealtimeStatus } from "@/components/realtime-status";
import { useScheduleRealtime } from "./hooks/use-schedule-realtime";

export function ScheduleRealtimeIndicator({ raidEventId }: { raidEventId: string }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const state = useScheduleRealtime(raidEventId, refresh);
  return <RealtimeStatus state={state} />;
}
