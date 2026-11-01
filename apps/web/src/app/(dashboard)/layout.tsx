"use client";

import type { Route } from "next";
import { redirect, usePathname } from "next/navigation";
import React from "react";

import { AppShell } from "@/components/layout/app-shell";
import { useTenant } from "@/components/layout/tenant-context";
import { TenantProvider } from "@/components/layout/tenant-switcher";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { currentRole, isLoading: tenantLoading } = useTenant();
  const pathname = usePathname() || "";

  // Invariant: No Route Bypass — Employee visiting /settings redirects to /inbox
  if (
    !tenantLoading &&
    currentRole === "employee" &&
    (pathname.startsWith("/settings") || pathname.startsWith("/website"))
  ) {
    redirect("/inbox" as Route);
  }

  return <>{children}</>;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-base font-black text-primary-foreground shadow-md">
            AI
          </span>
          <Spinner className="size-5 text-primary" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/login" as Route);
  }

  return (
    <TenantProvider>
      <RouteGuard>
        <AppShell>{children}</AppShell>
      </RouteGuard>
    </TenantProvider>
  );
}
