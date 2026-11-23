"use client";

import type { Route } from "next";
import { redirect } from "next/navigation";
import React from "react";

import { useAuth } from "@/hooks/use-auth";
import { getSafeAuthContinuationRedirect, resolvePostAuthDestination } from "@/lib/safe-redirect";

function resolveGuestRedirectTarget(params: {
  mfaSetupRequired: boolean;
  mfaChallengeRequired: boolean;
  isAuthenticated: boolean;
  platformAdmin?: boolean;
  membershipsCount: number;
}): Route | null {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const rawRedirect = new URLSearchParams(search).get("redirect");
  const continuation = getSafeAuthContinuationRedirect(rawRedirect);

  if (params.mfaSetupRequired) {
    return continuation
      ? (`/2fa/setup?redirect=${encodeURIComponent(continuation)}` as Route)
      : ("/2fa/setup" as Route);
  }

  if (params.mfaChallengeRequired) {
    return continuation
      ? (`/2fa?redirect=${encodeURIComponent(continuation)}` as Route)
      : ("/2fa" as Route);
  }

  if (!params.isAuthenticated) {
    return null;
  }

  return resolvePostAuthDestination({
    platformAdmin: params.platformAdmin,
    membershipsCount: params.membershipsCount,
    continuation,
    search,
  });
}

/**
 * Redirects authenticated users away from guest-only pages (/login, /register)
 * to the appropriate post-auth destination (MFA setup/challenge, operator, invite
 * continuation, or dashboard/onboarding).
 */
export function GuestGuard({ children }: { children: React.ReactNode }) {
  const { user, memberships, isAuthenticated, isLoading, mfaSetupRequired, mfaChallengeRequired } =
    useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-50 items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const target = resolveGuestRedirectTarget({
    mfaSetupRequired,
    mfaChallengeRequired,
    isAuthenticated: Boolean(isAuthenticated && user),
    platformAdmin: user?.platformAdmin,
    membershipsCount: memberships.length,
  });

  if (target) {
    redirect(target);
  }

  return <>{children}</>;
}
