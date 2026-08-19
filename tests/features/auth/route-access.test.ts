import { describe, expect, test } from "vitest";

import { getRouteAccess } from "@/features/auth/route-access";

describe("route access", () => {
  test("sends an anonymous activity visitor to login with a return path", () => {
    expect(getRouteAccess({ pathname: "/activities", hasUser: false })).toEqual({
      type: "redirect",
      location: "/login?next=%2Factivities",
    });
  });

  test("protects the legacy onboarding path as well", () => {
    expect(getRouteAccess({ pathname: "/onboarding", hasUser: false })).toEqual({
      type: "redirect",
      location: "/login?next=%2Fonboarding",
    });
  });

  test("lets anonymous visitors view public auth pages", () => {
    expect(getRouteAccess({ pathname: "/login", hasUser: false })).toEqual({
      type: "allow",
    });
  });

  test("sends authenticated visitors away from auth pages into spaces", () => {
    expect(getRouteAccess({ pathname: "/register", hasUser: true })).toEqual({
      type: "redirect",
      location: "/spaces",
    });
  });
});
