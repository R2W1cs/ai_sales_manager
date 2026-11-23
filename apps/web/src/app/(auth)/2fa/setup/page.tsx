"use client";

import { Check, Copy, ShieldAlert, ShieldCheck } from "lucide-react";
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

function extractTotpSecret(totpURI: string): string {
  try {
    const parsed = new URL(totpURI);
    return parsed.searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

function TwoFactorSetupContent() {
  const {
    user,
    memberships,
    isLoading,
    mfaVerified,
    mfaSetupRequired,
    mfaChallengeRequired,
    refreshSession,
    logout,
  } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tAuth = useTranslations("auth");

  const continuation = getSafeAuthContinuationRedirect(searchParams.get("redirect"));

  const [password, setPassword] = useState("");
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifiedDone, setVerifiedDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copiedField, setCopiedField] = useState<"uri" | "secret" | "backup" | null>(null);
  const [apiError, setApiError] = useState<unknown>(null);

  useEffect(() => {
    if (isLoading || verifiedDone) {
      return;
    }

    if (mfaChallengeRequired) {
      router.replace("/2fa" as Route);
      return;
    }

    if (user && !mfaSetupRequired && mfaVerified) {
      router.replace(
        resolvePostAuthDestination({
          platformAdmin: user.platformAdmin,
          membershipsCount: memberships.length,
          continuation,
        }),
      );
    }
  }, [
    continuation,
    isLoading,
    memberships.length,
    mfaChallengeRequired,
    mfaSetupRequired,
    mfaVerified,
    router,
    user,
    verifiedDone,
  ]);

  async function handleEnableSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      return;
    }

    setApiError(null);
    setSubmitting(true);
    try {
      const res = await authClient.twoFactor.enable({ password });
      if (res.error || !res.data) {
        throw new ApiClientError(
          res.error?.status ?? 400,
          res.error?.code ?? "unauthorized",
          res.error?.message ?? "Unable to initialize two-factor setup",
        );
      }
      const data = res.data as { totpURI?: string; backupCodes?: string[] };
      if (!data.totpURI) {
        throw new ApiClientError(500, "internal_error", "Missing TOTP setup URI");
      }
      setTotpURI(data.totpURI);
      setBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : []);
    } catch (err) {
      setApiError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyTotp(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = verifyCode.trim();
    if (!cleaned) {
      return;
    }

    setApiError(null);
    setSubmitting(true);
    try {
      const res = await authClient.twoFactor.verifyTotp({ code: cleaned });
      if (res.error) {
        throw new ApiClientError(
          res.error.status ?? 400,
          res.error.code ?? "INVALID_TWO_FACTOR_CODE",
          res.error.message ?? "Invalid verification code",
        );
      }

      const updated = await refreshSession();
      if (!updated?.mfaVerified) {
        throw new ApiClientError(403, "unauthorized", tAuth("twoFactorSetupNotConfirmed"));
      }

      setVerifiedDone(true);
    } catch (err) {
      setApiError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy(field: "uri" | "secret" | "backup", value: string) {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  }

  function handleContinue() {
    const target = resolvePostAuthDestination({
      platformAdmin: user?.platformAdmin,
      membershipsCount: memberships.length,
      continuation,
    });
    router.push(target);
  }

  if (verifiedDone) {
    return (
      <Card className="w-full border-border bg-card shadow-sm">
        <CardBg />
        <CardHeader className="space-y-1.5 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">
            {tAuth("twoFactorSetupBackupTitle")}
          </CardTitle>
          <CardDescription>{tAuth("twoFactorSetupBackupDesc")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {backupCodes.length > 0 ? (
            <div className="space-y-2">
              <div
                dir="ltr"
                className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-foreground"
              >
                {backupCodes.map((b) => (
                  <span key={b} className="rounded-sm bg-background px-2 py-1 text-center">
                    {b}
                  </span>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => handleCopy("backup", backupCodes.join("\n"))}
              >
                {copiedField === "backup" ? (
                  <>
                    <Check className="me-1.5 size-4" aria-hidden="true" />
                    {tAuth("copiedValue")}
                  </>
                ) : (
                  <>
                    <Copy className="me-1.5 size-4" aria-hidden="true" />
                    {tAuth("copyValue")}
                  </>
                )}
              </Button>
            </div>
          ) : null}

          <Button type="button" className="w-full" onClick={handleContinue}>
            {tAuth("twoFactorSetupContinue")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const secret = totpURI ? extractTotpSecret(totpURI) : "";

  return (
    <Card className="w-full border-border bg-card shadow-sm">
      <CardBg />
      <CardHeader className="space-y-1.5 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <ShieldAlert className="size-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">
          {tAuth("twoFactorSetupTitle")}
        </CardTitle>
        <CardDescription>{tAuth("twoFactorSetupDescription")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <ErrorBanner error={apiError} />

        {!totpURI ? (
          <form onSubmit={handleEnableSubmit} className="space-y-4">
            <p className="text-start text-xs text-muted-foreground">
              {tAuth("twoFactorSetupStepPasswordDesc")}
            </p>
            <div className="space-y-1.5 text-start">
              <Label htmlFor="mfa-setup-password">{tAuth("password")}</Label>
              <Input
                id="mfa-setup-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tAuth("passwordPlaceholder")}
                dir="ltr"
                required
              />
            </div>

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? tAuth("twoFactorSetupStarting") : tAuth("twoFactorSetupStart")}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-start text-xs text-muted-foreground">
              {tAuth("twoFactorSetupScanDesc")}
            </p>

            {secret ? (
              <div className="space-y-1.5 text-start">
                <Label htmlFor="mfa-secret">{tAuth("twoFactorSetupSecretLabel")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="mfa-secret"
                    value={secret}
                    readOnly
                    dir="ltr"
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy("secret", secret)}
                    aria-label={tAuth("copyValue")}
                  >
                    {copiedField === "secret" ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <Copy className="size-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5 text-start">
              <Label htmlFor="mfa-uri">{tAuth("twoFactorSetupUriLabel")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="mfa-uri"
                  value={totpURI}
                  readOnly
                  dir="ltr"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy("uri", totpURI)}
                  aria-label={tAuth("copyValue")}
                >
                  {copiedField === "uri" ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>

            <form onSubmit={handleVerifyTotp} className="space-y-3 border-t border-border pt-4">
              <p className="text-start text-xs text-muted-foreground">
                {tAuth("twoFactorSetupConfirmCodeDesc")}
              </p>
              <div className="space-y-1.5 text-start">
                <Label htmlFor="mfa-confirm-code">{tAuth("twoFactorCodeLabel")}</Label>
                <Input
                  id="mfa-confirm-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder={tAuth("twoFactorCodePlaceholder")}
                  dir="ltr"
                  required
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? tAuth("twoFactorVerifying") : tAuth("twoFactorVerifySubmit")}
              </Button>
            </form>
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          className="w-full text-xs"
          onClick={() => logout("/login")}
        >
          {tAuth("logout")}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function TwoFactorSetupPage() {
  return (
    <AuthCardShell>
      <Suspense fallback={null}>
        <TwoFactorSetupContent />
      </Suspense>
    </AuthCardShell>
  );
}
