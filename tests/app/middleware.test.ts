import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { updateSession } from "@/lib/supabase/middleware";

describe("request middleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not crash when Supabase public variables are not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await updateSession(
      new NextRequest("http://localhost/activities"),
    );

    expect(response.status).toBe(200);
  });

  it("also fails open for a partially configured integration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await updateSession(new NextRequest("http://localhost/"));

    expect(response.status).toBe(200);
  });
});
