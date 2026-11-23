"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { type AuthSchemaTranslateFn, createPasswordSchema } from "@/components/auth/auth-schemas";
import { ErrorBanner } from "@/components/auth/error-banner";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
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
import { ApiClientError } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

function createResetPasswordSchema(t: AuthSchemaTranslateFn) {
  return z
    .object({
      password: createPasswordSchema(t),
      confirmPassword: z.string().min(1),
    })
    .refine((vals) => vals.password === vals.confirmPassword, {
      path: ["confirmPassword"],
      message: t("passwordsDoNotMatch"),
    });
}

type ResetPasswordFormData = z.infer<ReturnType<typeof createResetPasswordSchema>>;

async function submitResetPasswordSafe(
  token: string,
  newPassword: string,
): Promise<{ error?: unknown }> {
  try {
    const res = await authClient.resetPassword({
      newPassword,
      token,
    });

    if (res.error) {
      return {
        error: new ApiClientError(
          res.error.status ?? 400,
          res.error.code ?? "INVALID_TOKEN",
          res.error.message ?? "Invalid or expired reset token",
        ),
      };
    }

    return {};
  } catch (err) {
    return { error: err };
  }
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const tAuth = useTranslations("auth");
  const token = searchParams.get("token")?.trim() ?? "";

  const [apiError, setApiError] = useState<unknown>(null);
  const [completed, setCompleted] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const resetPasswordSchema = useMemo(() => createResetPasswordSchema(tAuth), [tAuth]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  if (!token) {
    return (
      <Card className="w-full border-border bg-card shadow-sm">
        <CardBg />
        <CardHeader className="space-y-1.5 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl font-bold">{tAuth("resetPasswordTitle")}</CardTitle>
          <CardDescription>{tAuth("resetPasswordMissingToken")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={"/forgot-password" as Route} className="block w-full">
            <Button variant="outline" className="w-full">
              {tAuth("forgotPasswordTitle")}
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  async function onSubmit(data: ResetPasswordFormData) {
    setApiError(null);
    const result = await submitResetPasswordSafe(token, data.password);
    if (result.error) {
      setApiError(result.error);
      return;
    }
    setCompleted(true);
  }

  if (completed) {
    return (
      <Card className="w-full border-border bg-card shadow-sm">
        <CardBg />
        <CardHeader className="space-y-1.5 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="size-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl font-bold">{tAuth("resetPasswordSuccessTitle")}</CardTitle>
          <CardDescription>{tAuth("resetPasswordSuccessDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={"/login" as Route} className="block w-full">
            <Button className="w-full">{tAuth("loginSubmit")}</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full border-border bg-card shadow-sm">
      <CardBg />
      <CardHeader className="space-y-1.5 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Lock className="size-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">
          {tAuth("resetPasswordTitle")}
        </CardTitle>
        <CardDescription>{tAuth("resetPasswordDescription")}</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <ErrorBanner error={apiError} />

          <div className="space-y-1.5 text-start">
            <Label htmlFor="reset-password">{tAuth("newPassword")}</Label>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              placeholder={tAuth("createPasswordMinLength")}
              dir="ltr"
              {...register("password", {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                  setPasswordValue(e.target.value),
              })}
            />
            <PasswordStrengthMeter password={passwordValue} />
            {errors.password ? (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5 text-start">
            <Label htmlFor="reset-confirm-password">{tAuth("confirmPassword")}</Label>
            <Input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder={tAuth("passwordPlaceholder")}
              dir="ltr"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword ? (
              <p className="text-xs text-destructive">{tAuth("passwordsDoNotMatch")}</p>
            ) : null}
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? tAuth("resettingPassword") : tAuth("resetPasswordSubmit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCardShell>
      <Suspense fallback={null}>
        <ResetPasswordContent />
      </Suspense>
    </AuthCardShell>
  );
}
