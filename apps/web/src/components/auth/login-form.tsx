"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { createLoginSchema } from "@/components/auth/auth-schemas";
import { ErrorBanner } from "@/components/auth/error-banner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardBg,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stack } from "@/components/ui/stack";
import { useAuth } from "@/hooks/use-auth";
import { getSafeAuthContinuationRedirect, resolvePostAuthDestination } from "@/lib/safe-redirect";

type LoginFormData = z.infer<ReturnType<typeof createLoginSchema>>;

export function LoginForm() {
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const { login } = useAuth();
  const [apiError, setApiError] = useState<unknown | null>(null);
  const loginSchema = useMemo(() => createLoginSchema(tAuth), [tAuth]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // URL query handling: sanitize any contaminated password queries and pre-fill email if present
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const url = new URL(window.location.href);
      const emailParam = url.searchParams.get("email");
      const hasPasswordParam = url.searchParams.has("password");

      if (emailParam) {
        setValue("email", emailParam);
      }

      // If sensitive credentials were leaked into the query string, strip them immediately
      if (hasPasswordParam) {
        url.searchParams.delete("password");
        const newSearch = url.searchParams.toString();
        window.history.replaceState(null, "", url.pathname + (newSearch ? `?${newSearch}` : ""));
      }
    } catch {
      // Ignored
    }
  }, [setValue]);

  async function onSubmit(data: LoginFormData) {
    setApiError(null);

    try {
      const result = await login(data);
      const search = typeof window !== "undefined" ? window.location.search : "";
      const continuation = getSafeAuthContinuationRedirect(
        new URLSearchParams(search).get("redirect"),
      );

      if (result.twoFactorRedirect || result.session?.mfaChallengeRequired) {
        const target = continuation
          ? (`/2fa?redirect=${encodeURIComponent(continuation)}` as Route)
          : ("/2fa" as Route);
        router.push(target);
        return;
      }

      if (result.session?.mfaSetupRequired) {
        const target = continuation
          ? (`/2fa/setup?redirect=${encodeURIComponent(continuation)}` as Route)
          : ("/2fa/setup" as Route);
        router.push(target);
        return;
      }

      const target = resolvePostAuthDestination({
        platformAdmin: result.session?.user.platformAdmin,
        membershipsCount: result.session?.memberships?.length ?? 0,
        continuation,
        search,
      });
      router.push(target);
    } catch (err) {
      setApiError(err);
    }
  }

  return (
    <Card className="w-full border border-border shadow-sm">
      <CardBg />
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl font-semibold tracking-tight">{tAuth("login")}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          {tAuth("loginDescription")}
        </CardDescription>
      </CardHeader>

      <form
        method="post"
        action="#"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(onSubmit)(e);
        }}
      >
        <CardContent>
          <Stack direction="column" size="md" className="w-full">
            {apiError ? <ErrorBanner error={apiError} /> : null}

            <Stack direction="column" size="xs" className="w-full">
              <Label htmlFor="email" className="text-sm font-medium">
                {tAuth("email")}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={tAuth("emailPlaceholder")}
                autoComplete="email"
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              ) : null}
            </Stack>

            <Stack direction="column" size="xs" className="w-full">
              <Label htmlFor="password" className="text-sm font-medium">
                {tAuth("password")}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={tAuth("passwordPlaceholder")}
                autoComplete="current-password"
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              ) : null}
            </Stack>
          </Stack>
        </CardContent>

        <CardFooter className="border-t border-border/50 pt-4">
          <Stack direction="column" size="md" align="stretch" className="w-full">
            <Button type="submit" className="w-full" loading={isSubmitting} disabled={isSubmitting}>
              {tAuth("loginSubmit")}
            </Button>

            <div className="flex flex-col gap-2 text-center text-xs text-muted-foreground">
              {(apiError as { code?: unknown } | null)?.code === "EMAIL_NOT_VERIFIED" ? (
                <p>
                  {tAuth("verifyEmailRequiredHint")}{" "}
                  <Link
                    href={"/verify-email" as Route}
                    className="font-medium text-primary hover:underline"
                  >
                    {tAuth("goToVerifyEmail")}
                  </Link>
                </p>
              ) : null}
              <p>
                <Link
                  href={"/forgot-password" as Route}
                  className="font-medium text-primary hover:underline"
                >
                  {tAuth("forgotPassword")}
                </Link>
              </p>
              <p>{tAuth("inviteOnlyLoginHint")}</p>
            </div>
          </Stack>
        </CardFooter>
      </form>
    </Card>
  );
}
