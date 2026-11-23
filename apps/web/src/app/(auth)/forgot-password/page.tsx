"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, KeyRound } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import React, { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { type AuthSchemaTranslateFn, createEmailSchema } from "@/components/auth/auth-schemas";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardBg,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

function createForgotPasswordSchema(t: AuthSchemaTranslateFn) {
  return z.object({
    email: createEmailSchema(t),
  });
}

type ForgotPasswordFormData = z.infer<ReturnType<typeof createForgotPasswordSchema>>;

export default function ForgotPasswordPage() {
  const tAuth = useTranslations("auth");
  const [submitted, setSubmitted] = useState(false);
  const forgotPasswordSchema = useMemo(() => createForgotPasswordSchema(tAuth), [tAuth]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(data: ForgotPasswordFormData) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    try {
      await authClient.requestPasswordReset({
        email: data.email.trim(),
        redirectTo: `${origin}/reset-password`,
      });
    } catch {
      // Neutral response avoids leaking whether the account exists or mail failed.
    }
    setSubmitted(true);
  }

  return (
    <AuthCardShell>
      <Card className="w-full border-border bg-card shadow-sm">
        <CardBg />
        <CardHeader className="space-y-1.5 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {submitted ? (
              <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
            ) : (
              <KeyRound className="size-5" aria-hidden="true" />
            )}
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">
            {submitted ? tAuth("forgotPasswordSentTitle") : tAuth("forgotPasswordTitle")}
          </CardTitle>
          <CardDescription>
            {submitted ? tAuth("forgotPasswordSentDesc") : tAuth("forgotPasswordDescription")}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!submitted ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-1.5 text-start">
                <Label htmlFor="forgot-email">{tAuth("email")}</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  placeholder={tAuth("emailPlaceholder")}
                  dir="ltr"
                  {...register("email")}
                />
                {errors.email ? (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                ) : null}
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? tAuth("sendingResetLink") : tAuth("forgotPasswordSubmit")}
              </Button>
            </form>
          ) : null}

          <Link href={"/login" as Route} className="block w-full">
            <Button type="button" variant="outline" className="w-full">
              {tAuth("backToLogin")}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </AuthCardShell>
  );
}
