import { afterEach, describe, expect, test, vi } from "vitest";

import { createBrowserClient } from "@/lib/supabase/client";

describe("browser Supabase client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("returns no client instead of throwing while public configuration is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(createBrowserClient()).toBeNull();
  });
});
