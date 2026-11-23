"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, Mail } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  type AuthSchemaTranslateFn,
  createEmailSchema,
  createNameSchema,
  createPasswordSchema,
} from "@/components/auth/auth-schemas";
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
import { useAuth } from "@/hooks/use-auth";
import { ApiClientError } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import type { SessionDto, UserDto } from "@app/shared";

function createInviteSignUpSchema(t: AuthSchemaTranslateFn) {
  return z.object({
    email: createEmailSchema(t),
    name: createNameSchema(t),
    password: createPasswordSchema(t),
  });
}

type InviteSignUpFormData = z.infer<ReturnType<typeof createInviteSignUpSchema>>;

async function resendVerificationEmailForInvite(
  email: string,
  invitePath: string,
): Promise<{ error?: unknown }> {
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const callbackURL = `${origin}/login?redirect=${encodeURIComponent(invitePath)}`;
    const res = await authClient.sendVerificationEmail({ email, callbackURL });
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

async function acceptInviteSafe(
  token: string,
  onAcceptInvite: (invitationId: string) => Promise<{ businessId: string; role: string }>,
  onRefresh: () => Promise<SessionDto | null>,
): Promise<{ nextRoute?: Route; error?: unknown }> {
  try {
    await onAcceptInvite(token);
    const refreshed = await onRefresh();
    if (refreshed?.mfaSetupRequired) {
      return { nextRoute: "/2fa/setup" as Route };
    }
    if (refreshed?.mfaChallengeRequired) {
      return { nextRoute: "/2fa" as Route };
    }
    return { nextRoute: "/inbox" as Route };
  } catch (err) {
    return { error: err };
  }
}

async function signUpWithInviteSafe(
  token: string,
  invitePath: string,
  data: InviteSignUpFormData,
): Promise<{ email?: string; error?: unknown }> {
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const normalizedEmail = data.email.trim();
    const callbackURL = `${origin}/login?redirect=${encodeURIComponent(invitePath)}`;
    const res = await authClient.signUp.email(
      {
        email: normalizedEmail,
        name: data.name.trim(),
        password: data.password,
        callbackURL,
      },
      {
        headers: {
          "x-invitation-id": token,
        },
      },
    );

    if (res.error) {
      return {
        error: new ApiClientError(
          res.error.status ?? 403,
          res.error.code ?? "INVITATION_REQUIRED",
          res.error.message ?? "Invitation required",
        ),
      };
    }

    return { email: normalizedEmail };
  } catch (err) {
    return { error: err };
  }
}

function InvalidInviteCard() {
  const tAuth = useTranslations("auth");
  return (
    <Card className="w-full border-border bg-card shadow-sm">
      <CardBg />
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl font-bold">{tAuth("invalidInviteLink")}</CardTitle>
        <CardDescription>{tAuth("invalidInviteDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center pt-2">
        <Link href={"/login" as Route}>
          <Button variant="outline">{tAuth("backToLogin")}</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function InviteVerifyEmailGate({
  user,
  invitePath,
  onRefresh,
  onLogout,
}: {
  user: UserDto;
  invitePath: string;
  onRefresh: () => Promise<SessionDto | null>;
  onLogout: (redirectTo?: string) => Promise<void>;
}) {
  const tAuth = useTranslations("auth");
  const [apiError, setApiError] = useState<unknown>(null);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  async function handleResend() {
    setApiError(null);
    setResending(true);
    setResendSuccess(false);
    const result = await resendVerificationEmailForInvite(user.email, invitePath);
    setResending(false);
    if (result.error) {
      setApiError(result.error);
      return;
    }
    setResendSuccess(true);
  }

  return (
    <Card className="w-full border-border bg-card shadow-sm">
      <CardBg />
      <CardHeader className="space-y-1.5 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Mail className="size-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">
          {tAuth("inviteVerificationRequiredTitle")}
        </CardTitle>
        <CardDescription>{tAuth("inviteVerificationRequiredDesc")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <ErrorBanner error={apiError} />

        <div className="rounded-md border border-border bg-muted/40 p-3 text-center text-sm text-foreground">
          <span className="block text-xs text-muted-foreground">{tAuth("loggedInAs")}</span>
          <strong className="font-semibold">{user.email}</strong>
        </div>

        {resendSuccess ? (
          <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-xs text-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>{tAuth("verificationEmailSent")}</span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleResend}
            disabled={resending}
            className="w-full"
          >
            {resending ? tAuth("resendingVerification") : tAuth("resendVerification")}
          </Button>
          <Button type="button" onClick={() => void onRefresh()} className="w-full">
            {tAuth("inviteCheckStatus")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void onLogout(invitePath)}
            className="w-full"
          >
            {tAuth("inviteSwitchAccount")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InviteAcceptAuthenticatedCard({
  user,
  token,
  invitePath,
  onAcceptInvite,
  onRefresh,
  onLogout,
}: {
  user: UserDto;
  token: string;
  invitePath: string;
  onAcceptInvite: (invitationId: string) => Promise<{ businessId: string; role: string }>;
  onRefresh: () => Promise<SessionDto | null>;
  onLogout: (redirectTo?: string) => Promise<void>;
}) {
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const [apiError, setApiError] = useState<unknown>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  async function handleAccept() {
    setApiError(null);
    setIsAccepting(true);
    const result = await acceptInviteSafe(token, onAcceptInvite, onRefresh);
    setIsAccepting(false);
    if (result.error) {
      setApiError(result.error);
      return;
    }
    if (result.nextRoute) {
      router.push(result.nextRoute);
    }
  }

  return (
    <Card className="w-full border-border bg-card shadow-sm">
      <CardBg />
      <CardHeader className="space-y-1.5 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CheckCircle2 className="size-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">
          {tAuth("acceptInviteTitle")}
        </CardTitle>
        <CardDescription>{tAuth("acceptInviteDescription")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <ErrorBanner error={apiError} />

        <div className="rounded-md border border-border bg-muted/40 p-3 text-center text-sm text-foreground">
          <span className="block text-xs text-muted-foreground">{tAuth("loggedInAs")}</span>
          <strong className="font-semibold">{user.name || user.email}</strong>
          <span className="block text-xs text-muted-foreground">{user.email}</span>
        </div>

        <Button type="button" onClick={handleAccept} disabled={isAccepting} className="w-full">
          {isAccepting ? tAuth("acceptingInvite") : tAuth("acceptInviteSubmit")}
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => void onLogout(invitePath)}
          className="w-full"
        >
          {tAuth("inviteSwitchAccount")}
        </Button>
      </CardContent>
    </Card>
  );
}

function InviteVerificationSentCard({
  email,
  invitePath,
  loginHref,
}: {
  email: string;
  invitePath: string;
  loginHref: Route;
}) {
  const tAuth = useTranslations("auth");
  const [apiError, setApiError] = useState<unknown>(null);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  async function handleResend() {
    setApiError(null);
    setResending(true);
    setResendSuccess(false);
    const result = await resendVerificationEmailForInvite(email, invitePath);
    setResending(false);
    if (result.error) {
      setApiError(result.error);
      return;
    }
    setResendSuccess(true);
  }

  return (
    <Card className="w-full border-border bg-card shadow-sm">
      <CardBg />
      <CardHeader className="space-y-1.5 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Mail className="size-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">
          {tAuth("verifyEmailTitle")}
        </CardTitle>
        <CardDescription>{tAuth("verifyEmailDescription")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <ErrorBanner error={apiError} />

        <div className="rounded-md border border-border bg-muted/40 p-3 text-center text-sm font-medium text-foreground">
          {email}
        </div>

        {resendSuccess ? (
          <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-xs text-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>{tAuth("verificationEmailSent")}</span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Link href={loginHref} className="block w-full">
            <Button type="button" className="w-full">
              {tAuth("loginSubmit")}
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            onClick={handleResend}
            disabled={resending}
            className="w-full"
          >
            {resending ? tAuth("resendingVerification") : tAuth("resendVerification")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InviteSignUpForm({
  token,
  invitePath,
  loginHref,
  onSignedUp,
}: {
  token: string;
  invitePath: string;
  loginHref: Route;
  onSignedUp: (email: string) => void;
}) {
  const tAuth = useTranslations("auth");
  const [apiError, setApiError] = useState<unknown>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const inviteSignUpSchema = useMemo(() => createInviteSignUpSchema(tAuth), [tAuth]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InviteSignUpFormData>({
    resolver: zodResolver(inviteSignUpSchema),
    defaultValues: { email: "", name: "", password: "" },
  });

  async function onSubmitSignUp(data: InviteSignUpFormData) {
    setApiError(null);
    const result = await signUpWithInviteSafe(token, invitePath, data);
    if (result.error) {
      setApiError(result.error);
      return;
    }
    if (result.email) {
      onSignedUp(result.email);
    }
  }

  return (
    <Card className="w-full border-border bg-card shadow-sm">
      <CardBg />
      <CardHeader className="space-y-1.5 text-center">
        <CardTitle className="text-xl font-bold tracking-tight">
          {tAuth("acceptInviteTitle")}
        </CardTitle>
        <CardDescription>{tAuth("acceptInviteDescription")}</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmitSignUp)} className="space-y-4" noValidate>
          <ErrorBanner error={apiError} />

          <div className="space-y-1.5 text-start">
            <Label htmlFor="invite-email">{tAuth("email")}</Label>
            <Input
              id="invite-email"
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

          <div className="space-y-1.5 text-start">
            <Label htmlFor="invite-name">{tAuth("name")}</Label>
            <Input
              id="invite-name"
              type="text"
              autoComplete="name"
              placeholder={tAuth("yourFullName")}
              dir="auto"
              {...register("name")}
            />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>

          <div className="space-y-1.5 text-start">
            <Label htmlFor="invite-password">{tAuth("password")}</Label>
            <Input
              id="invite-password"
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

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? tAuth("creatingAccount") : tAuth("createAccountSubmit")}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            {tAuth("alreadyHaveAccount")}{" "}
            <Link href={loginHref} className="font-medium text-primary hover:underline">
              {tAuth("login")}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export function AcceptInviteForm() {
  const { user, isAuthenticated, isLoading, acceptInvite, refreshSession, logout } = useAuth();
  const searchParams = useSearchParams();
  const [verificationEmailSentTo, setVerificationEmailSentTo] = useState<string | null>(null);

  const token = searchParams.get("token")?.trim() ?? "";
  const invitePath = token ? `/invite?token=${encodeURIComponent(token)}` : "/invite";
  const loginHref = `/login?redirect=${encodeURIComponent(invitePath)}` as Route;

  if (!token) {
    return <InvalidInviteCard />;
  }

  if (isLoading) {
    return (
      <Card className="w-full border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </Card>
    );
  }

  if (isAuthenticated && user && !user.emailVerified) {
    return (
      <InviteVerifyEmailGate
        user={user}
        invitePath={invitePath}
        onRefresh={refreshSession}
        onLogout={logout}
      />
    );
  }

  if (isAuthenticated && user) {
    return (
      <InviteAcceptAuthenticatedCard
        user={user}
        token={token}
        invitePath={invitePath}
        onAcceptInvite={acceptInvite}
        onRefresh={refreshSession}
        onLogout={logout}
      />
    );
  }

  if (verificationEmailSentTo) {
    return (
      <InviteVerificationSentCard
        email={verificationEmailSentTo}
        invitePath={invitePath}
        loginHref={loginHref}
      />
    );
  }

  return (
    <InviteSignUpForm
      token={token}
      invitePath={invitePath}
      loginHref={loginHref}
      onSignedUp={setVerificationEmailSentTo}
    />
  );
}
