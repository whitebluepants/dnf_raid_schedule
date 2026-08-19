import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

export async function createServerClient() {
  const config = env();
  const cookieStore = await cookies();

  return createSupabaseServerClient<Database>(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies. Middleware refreshes them.
          }
        },
      },
    },
  );
}
