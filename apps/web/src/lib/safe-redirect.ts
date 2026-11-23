import type { Route } from "next";

export const AUTH_ROUTES = [
  "/login",
  "/register",
  "/invite",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/2fa",
] as const;

export function isPublicAuthRoute(pathname: string): boolean {
  return (
    AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)) ||
    pathname.startsWith("/embed")
  );
}

const CONTINUATION_DISALLOWED_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/2fa",
];

function isValidSameOriginPath(candidate: string | null | undefined): candidate is string {
  return Boolean(
    candidate &&
    candidate.startsWith("/") &&
    !candidate.startsWith("//") &&
    !candidate.startsWith("/\\") &&
    !candidate.includes(":"),
  );
}

/**
 * Validates same-origin continuation targets preserved across email verification,
 * login, and MFA challenge/enrollment (e.g. `/invite?token=<id>`), preventing CWE-601 open redirects.
 */
export function getSafeAuthContinuationRedirect(
  redirectParam: string | null | undefined,
): Route | null {
  if (!isValidSameOriginPath(redirectParam)) {
    return null;
  }

  const isLoopTarget = CONTINUATION_DISALLOWED_ROUTES.some(
    (route) =>
      redirectParam === route ||
      redirectParam.startsWith(`${route}?`) ||
      redirectParam.startsWith(`${route}/`),
  );

  if (isLoopTarget) {
    return null;
  }

  return redirectParam as Route;
}

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

    if (isValidSameOriginPath(redirectParam)) {
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

/**
 * Resolves the canonical post-authentication destination once any pending MFA
 * setup or challenge has been satisfied.
 */
export function resolvePostAuthDestination(params: {
  platformAdmin?: boolean;
  membershipsCount: number;
  continuation?: Route | null;
  search?: string;
}): Route {
  if (params.platformAdmin) {
    return "/operator" as Route;
  }

  const resolvedSearch =
    params.search ?? (typeof window !== "undefined" ? window.location.search : "");
  const continuation =
    params.continuation !== undefined
      ? params.continuation
      : getSafeAuthContinuationRedirect(new URLSearchParams(resolvedSearch).get("redirect"));

  if (continuation?.startsWith("/invite")) {
    return continuation;
  }

  return getSafeRedirectUrl(resolvedSearch, params.membershipsCount > 0);
}
