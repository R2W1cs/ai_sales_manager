"use client";

import { ShieldCheck } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
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
import { useAuth } from "@/hooks/use-auth";
import { ApiClientError } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { getSafeAuthContinuationRedirect, resolvePostAuthDestination } from "@/lib/safe-redirect";

function TwoFactorChallengeContent() {
  const {
    user,
    memberships,
    isAuthenticated,
    isLoading,
    mfaVerified,
    mfaSetupRequired,
    refreshSession,
    logout,
  } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tAuth = useTranslations("auth");

  const continuation = getSafeAuthContinuationRedirect(searchParams.get("redirect"));
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (mfaSetupRequired) {
      const target = continuation
        ? (`/2fa/setup?redirect=${encodeURIComponent(continuation)}` as Route)
        : ("/2fa/setup" as Route);
      router.replace(target);
      return;
    }

    if (isAuthenticated && mfaVerified && user) {
      const target = resolvePostAuthDestination({
        platformAdmin: user.platformAdmin,
        membershipsCount: memberships.length,
        continuation,
      });
      router.replace(target);
    }
  }, [
    continuation,
    isAuthenticated,
    isLoading,
    memberships.length,
    mfaSetupRequired,
    mfaVerified,
    router,
    user,
  ]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = code.trim();
    if (!cleaned) {
      return;
    }

    setApiError(null);
    setSubmitting(true);

    try {
      const res =
        mode === "totp"
          ? await authClient.twoFactor.verifyTotp({ code: cleaned })
          : await authClient.twoFactor.verifyBackupCode({ code: cleaned });

      if (res.error) {
        throw new ApiClientError(
          res.error.status ?? 400,
          res.error.code ?? "INVALID_TWO_FACTOR_CODE",
          res.error.message ?? "Invalid verification code",
        );
      }

      const updated = await refreshSession();
      if (!updated?.mfaVerified) {
        throw new ApiClientError(403, "unauthorized", tAuth("twoFactorVerificationFailed"));
      }

      const target = resolvePostAuthDestination({
        platformAdmin: updated.user.platformAdmin,
        membershipsCount: updated.memberships?.length ?? 0,
        continuation,
      });
      router.push(target);
    } catch (err) {
      setApiError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full border-border bg-card shadow-sm">
      <CardBg />
      <CardHeader className="space-y-1.5 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">
          {tAuth("twoFactorTitle")}
        </CardTitle>
        <CardDescription>{tAuth("twoFactorDescription")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <ErrorBanner error={apiError} />

          <div className="space-y-1.5 text-start">
            <Label htmlFor="two-factor-code">
              {mode === "totp" ? tAuth("twoFactorCodeLabel") : tAuth("twoFactorBackupCodeLabel")}
            </Label>
            <Input
              id="two-factor-code"
              type="text"
              inputMode={mode === "totp" ? "numeric" : "text"}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={
                mode === "totp"
                  ? tAuth("twoFactorCodePlaceholder")
                  : tAuth("twoFactorBackupCodePlaceholder")
              }
              dir="ltr"
              required
            />
          </div>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? tAuth("twoFactorVerifying") : tAuth("twoFactorVerifySubmit")}
          </Button>
        </form>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            className="w-full text-xs"
            onClick={() => {
              setMode((prev) => (prev === "totp" ? "backup" : "totp"));
              setCode("");
              setApiError(null);
            }}
          >
            {mode === "totp" ? tAuth("twoFactorUseBackupCode") : tAuth("twoFactorUseAuthenticator")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full text-xs"
            onClick={() => logout("/login")}
          >
            {tAuth("logout")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TwoFactorPage() {
  return (
    <AuthCardShell>
      <Suspense fallback={null}>
        <TwoFactorChallengeContent />
      </Suspense>
    </AuthCardShell>
  );
}
