"use client";

import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { getSafeRedirectUrl } from "@/lib/safe-redirect";

interface GuestGuardProps {
  children: React.ReactNode;
}

export function GuestGuard({ children }: GuestGuardProps): React.ReactElement {
  const router = useRouter();
  const { isAuthenticated, isLoading, memberships } = useAuth();
  const hasMemberships = (memberships?.length ?? 0) > 0;

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const targetUrl = getSafeRedirectUrl(undefined, hasMemberships);
      // react-doctor-disable-next-line nextjs-no-client-side-redirect
      router.replace(targetUrl);
    }
  }, [isAuthenticated, isLoading, hasMemberships, router]);

  // While checking auth status or when authenticated, render the brand loading indicator inside
  // the card container so the guest auth form is never displayed to an authenticated user.
  if (isLoading || isAuthenticated) {
    return (
      <Card
        data-slot="guest-guard-loading"
        className="flex min-h-80 w-full items-center justify-center border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex flex-col items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-base font-black text-primary-foreground shadow-md">
            AI
          </span>
          <Spinner className="size-5 text-primary" />
        </div>
      </Card>
    );
  }

  return <>{children}</>;
}
