import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import type { Database } from "@/lib/database.types";
import { publicEnvOrNull } from "@/lib/env";
import { getRouteAccess } from "@/features/auth/route-access";

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const config = publicEnvOrNull();
  let response = NextResponse.next({ request });

  // Supabase is an optional integration for the initial shell. If Vercel has
  // not received the public variables yet, allow static/public routes to load
  // instead of crashing the Edge middleware on every request. Data-mutating
  // server actions still validate their required configuration with `env()`.
  if (!config) {
    const access = getRouteAccess({
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
      hasUser: false,
    });
    if (access.type === "redirect") {
      return NextResponse.redirect(new URL(access.location, request.url));
    }
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = getRouteAccess({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    hasUser: Boolean(user),
  });

  if (access.type === "redirect") {
    const redirect = NextResponse.redirect(new URL(access.location, request.url));
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}
