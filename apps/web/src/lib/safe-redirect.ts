import type { Route } from "next";

const AUTH_ROUTES = ["/login", "/register", "/invite", "/forgot-password", "/reset-password"];

/**
 * Computes a safe redirect destination for authenticated users:
 * - If the user has no active memberships, enforces redirect to `/onboarding` (spec 02 §150).
 * - Sanitizes `?redirect=` query parameters to prevent CWE-601 open redirects.
 * - Prevents infinite redirect loops by rejecting redirect parameters pointing to auth routes.
 */
export function getSafeRedirectUrl(
  search: string | URLSearchParams | undefined,
  hasMemberships: boolean,
): Route {
  if (!hasMemberships) {
    return "/onboarding" as Route;
  }

  if (typeof window === "undefined" && !search) {
    return "/inbox" as Route;
  }

  try {
    const params =
      search instanceof URLSearchParams
        ? search
        : new URLSearchParams(
            typeof search === "string"
              ? search
              : typeof window !== "undefined"
                ? window.location.search
                : "",
          );

    const redirectParam = params.get("redirect");

    if (
      redirectParam &&
      redirectParam.startsWith("/") &&
      !redirectParam.startsWith("//") &&
      !redirectParam.startsWith("/\\") &&
      !redirectParam.includes(":")
    ) {
      // Prevent infinite redirect loop back to authentication routes
      const isAuthRoute = AUTH_ROUTES.some(
        (route) =>
          redirectParam === route ||
          redirectParam.startsWith(`${route}?`) ||
          redirectParam.startsWith(`${route}/`),
      );

      if (!isAuthRoute) {
        return redirectParam as Route;
      }
    }
  } catch {
    // Return fallback on parse error
  }

  return "/inbox" as Route;
}
