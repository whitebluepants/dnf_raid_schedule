export type RouteAccess =
  | { type: "allow" }
  | { type: "redirect"; location: string };

const protectedPrefixes = ["/activities", "/roster", "/settings", "/spaces", "/onboarding"];
const authPaths = new Set(["/login", "/register"]);

export function getRouteAccess({
  pathname,
  search = "",
  hasUser,
}: {
  pathname: string;
  search?: string;
  hasUser: boolean;
}): RouteAccess {
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!hasUser && isProtected) {
    return {
      type: "redirect",
      location: `/login?next=${encodeURIComponent(`${pathname}${search}`)}`,
    };
  }

  if (hasUser && authPaths.has(pathname)) {
    return { type: "redirect", location: "/spaces" };
  }

  return { type: "allow" };
}
