"use client";

import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";
import { publicEnvOrNull } from "@/lib/env";

export function createBrowserClient() {
  const config = publicEnvOrNull();
  if (!config) return null;

  return createSupabaseBrowserClient<Database>(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
