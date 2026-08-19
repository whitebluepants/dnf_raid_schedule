// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest";

import { createBrowserClient } from "@/lib/supabase/client";

describe("createBrowserClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("builds a typed client from public runtime configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key");
    let requestedUrl = "";
    let requestedHeaders = new Headers();
    vi.stubGlobal(
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        requestedUrl = input.toString();
        requestedHeaders = new Headers(init?.headers);
        return new Response("[]", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    );

    const client = createBrowserClient();
    await client.from("profiles").select("id");

    expect(requestedUrl).toBe("https://example.supabase.co/rest/v1/profiles?select=id");
    expect(requestedHeaders.get("apikey")).toBe("public-anon-key");
  });
});
