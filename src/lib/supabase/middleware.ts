import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import type { Database } from "@/lib/database.types";
import { publicEnvOrNull } from "@/lib/env";

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const config = publicEnvOrNull();
  let response = NextResponse.next({ request });

  // Supabase is an optional integration for the initial shell. If Vercel has
  // not received the public variables yet, allow static/public routes to load
  // instead of crashing the Edge middleware on every request. Data-mutating
  // server actions still validate their required configuration with `env()`.
  if (!config) {
    return response;
  }

  const supabase = createSupabaseServerClient<Database>(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}
