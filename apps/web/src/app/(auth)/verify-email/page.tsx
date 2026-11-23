"use client";

import { CheckCircle2, Mail, XCircle } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense, useEffect, useState } from "react";

import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { ErrorBanner } from "@/components/auth/error-banner";
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
import { getSafeAuthContinuationRedirect } from "@/lib/safe-redirect";

const pendingVerifyRequests = new Map<string, Promise<{ error?: unknown }>>();

function verifyEmailTokenSafe(token: string): Promise<{ error?: unknown }> {
  const existing = pendingVerifyRequests.get(token);
  if (existing) {
    return existing;
  }

  const request = (async () => {
    try {
      const res = await authClient.verifyEmail({ query: { token } });
      if (res.error) {
        return {
          error: new ApiClientError(
            res.error.status ?? 400,
            res.error.code ?? "INVALID_TOKEN",
            res.error.message ?? "Invalid verification token",
          ),
        };
      }
      return {};
    } catch (err) {
      return { error: err };
    }
  })();

  pendingVerifyRequests.set(token, request);
  return request;
}

async function resendVerificationEmailSafe(
  email: string,
  safeRedirect: Route | null,
): Promise<{ error?: unknown }> {
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const callbackURL = safeRedirect
      ? `${origin}/login?redirect=${encodeURIComponent(safeRedirect)}`
      : `${origin}/login`;
    const res = await authClient.sendVerificationEmail({
      email,
      callbackURL,
    });

    if (res.error) {
      return {
        error: new ApiClientError(
          res.error.status ?? 400,
          res.error.code ?? "validation_error",
          res.error.message ?? "Unable to send verification email",
        ),
      };
    }

    return {};
  } catch (err) {
    return { error: err };
  }
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const tAuth = useTranslations("auth");

  const token = searchParams.get("token")?.trim() ?? "";
  const safeRedirect = getSafeAuthContinuationRedirect(searchParams.get("redirect"));
  const initialEmail = searchParams.get("email")?.trim() ?? "";

  const [status, setStatus] = useState<"verifying" | "success" | "error" | "resend">(() =>
    token ? "verifying" : "resend",
  );
  const [error, setError] = useState<unknown>(null);
  const [resendEmail, setResendEmail] = useState(initialEmail);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let cancelled = false;
    void verifyEmailTokenSafe(token).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.error) {
        setError(result.error);
        setStatus("error");
      } else {
        setStatus("success");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    const cleanedEmail = resendEmail.trim();
    if (!cleanedEmail) {
      return;
    }

    setError(null);
    setResent(false);
    setResending(true);

    const result = await resendVerificationEmailSafe(cleanedEmail, safeRedirect);
    setResending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setResent(true);
  }

  const loginHref = (
    safeRedirect ? `/login?redirect=${encodeURIComponent(safeRedirect)}` : "/login"
  ) as Route;

  if (status === "verifying") {
    return (
      <Card className="w-full border-border bg-card shadow-sm">
        <CardBg />
        <CardHeader className="space-y-1.5 text-center">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <CardTitle className="text-xl font-bold">{tAuth("verifyEmailTitle")}</CardTitle>
          <CardDescription>{tAuth("verifyingEmail")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status === "success") {
    return (
      <Card className="w-full border-border bg-card shadow-sm">
        <CardBg />
        <CardHeader className="space-y-1.5 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="size-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl font-bold">{tAuth("verifyEmailSuccessTitle")}</CardTitle>
          <CardDescription>{tAuth("verifyEmailSuccessDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={loginHref} className="block w-full">
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
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-foreground">
          {status === "error" ? (
            <XCircle className="size-5 text-destructive" aria-hidden="true" />
          ) : (
            <Mail className="size-5 text-primary" aria-hidden="true" />
          )}
        </div>
        <CardTitle className="text-xl font-bold">
          {status === "error" ? tAuth("verifyEmailErrorTitle") : tAuth("verifyEmailTitle")}
        </CardTitle>
        <CardDescription>
          {status === "error" ? tAuth("verifyEmailErrorDesc") : tAuth("verifyEmailDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorBanner error={error} />

        {resent ? (
          <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-xs text-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>{tAuth("verificationEmailSent")}</span>
          </div>
        ) : null}

        <form onSubmit={handleResend} className="space-y-3">
          <div className="space-y-1.5 text-start">
            <Label htmlFor="resend-email">{tAuth("email")}</Label>
            <Input
              id="resend-email"
              type="email"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              placeholder={tAuth("emailPlaceholder")}
              dir="ltr"
              required
            />
          </div>
          <Button type="submit" disabled={resending} className="w-full">
            {resending ? tAuth("resendingVerification") : tAuth("resendVerification")}
          </Button>
        </form>

        <Link href={loginHref} className="block w-full">
          <Button type="button" variant="ghost" className="w-full">
            {tAuth("backToLogin")}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthCardShell>
      <Suspense fallback={null}>
        <VerifyEmailContent />
      </Suspense>
    </AuthCardShell>
  );
}
