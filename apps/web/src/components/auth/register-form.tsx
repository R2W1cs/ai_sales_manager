"use client";

import { MailCheck } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardBg,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Pilot onboarding is strictly invite-only. Public self-registration is disabled.
 */
export function RegisterForm() {
  const tAuth = useTranslations("auth");

  return (
    <Card className="w-full border-border bg-card shadow-sm">
      <CardBg />
      <CardHeader className="space-y-1.5 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MailCheck className="size-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">
          {tAuth("inviteOnlyTitle")}
        </CardTitle>
        <CardDescription>{tAuth("inviteOnlyDescription")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-start text-sm text-muted-foreground">
          {tAuth("inviteOnlyInstruction")}
        </div>

        <Link href={"/login" as Route} className="block w-full">
          <Button type="button" className="w-full">
            {tAuth("backToLogin")}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
