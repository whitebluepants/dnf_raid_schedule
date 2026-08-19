"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

export type RealtimeState = "connected" | "connecting" | "offline";

export function useScheduleRealtime(raidEventId: string, onChange: () => void): RealtimeState {
  const [state, setState] = useState<RealtimeState>("connecting");
  useEffect(() => {
    const client = createBrowserClient();
    if (!client) {
      setState("offline");
      return;
    }
    const channel = client
      .channel(`raid-event:${raidEventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "raid_waves" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_slots" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_revisions" }, onChange)
      .subscribe((status) => setState(status === "SUBSCRIBED" ? "connected" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "offline" : "connecting"));
    return () => { void client.removeChannel(channel); };
  }, [raidEventId, onChange]);
  return state;
}
