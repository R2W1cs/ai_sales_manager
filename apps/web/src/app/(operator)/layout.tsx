"use client";

import type { Route } from "next";
import { useTranslations } from "next-intl";
import { redirect } from "next/navigation";
import React from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";

export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const t = useTranslations("operator");

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="size-5 text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/login" as Route);
  }

  if (!user?.platformAdmin) {
    redirect("/inbox" as Route);
  }

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground">
            AI
          </span>
          <div>
            <p className="text-sm font-semibold">{t("console")}</p>
            <p className="text-[11px] text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void logout()}>
          {t("logout")}
        </Button>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
