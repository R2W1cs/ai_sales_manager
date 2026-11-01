"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { nameSchema, passwordSchema } from "@/components/auth/auth-schemas";
import { ErrorBanner } from "@/components/auth/error-banner";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
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
import { useAuth } from "@/hooks/use-auth";
import type { UserDto } from "@app/shared";

const acceptInviteGuestSchema = z.object({
  name: nameSchema,
  password: passwordSchema,
});

type AcceptInviteGuestFormData = z.infer<typeof acceptInviteGuestSchema>;

interface FormProps {
  token: string;
}

function AcceptInviteAuthenticatedSection({ token, user }: FormProps & { user: UserDto }) {
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const { acceptInvite } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<unknown | null>(null);

  async function handleAccept() {
    setIsSubmitting(true);
    setApiError(null);

    try {
      await acceptInvite({ token });
      setIsSubmitting(false);
      router.push("/inbox" as Route);
    } catch (err) {
      setIsSubmitting(false);
      setApiError(err);
    }
  }

  return (
    <div className="space-y-4">
      {apiError ? <ErrorBanner error={apiError} /> : null}

      <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
        <p className="text-muted-foreground">{tAuth("loggedInAs")}</p>
        <p className="font-medium text-foreground">
          {user.name} ({user.email})
        </p>
      </div>

      <Button
        type="button"
        onClick={handleAccept}
        className="h-10 w-full text-sm font-medium"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? tAuth("acceptingInvite") : tAuth("acceptInviteSubmit")}
      </Button>
    </div>
  );
}

function AcceptInviteGuestSection({ token }: FormProps) {
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const { acceptInvite } = useAuth();
  const [apiError, setApiError] = useState<unknown | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInviteGuestFormData>({
    resolver: zodResolver(acceptInviteGuestSchema),
    defaultValues: {
      name: "",
      password: "",
    },
  });

  const passwordValue = useWatch({ control, name: "password" }) ?? "";

  async function onSubmit(data: AcceptInviteGuestFormData) {
    setApiError(null);

    try {
      await acceptInvite({
        token,
        name: data.name,
        password: data.password,
      });
      router.push("/inbox" as Route);
    } catch (err) {
      setApiError(err);
    }
  }

  return (
    <form
      method="post"
      action="#"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(onSubmit)(e);
      }}
      className="space-y-4"
    >
      {apiError ? <ErrorBanner error={apiError} /> : null}

      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-sm font-medium">
          {tAuth("yourFullName")}
        </Label>
        <Input
          id="name"
          type="text"
          placeholder={tAuth("namePlaceholder")}
          autoComplete="name"
          disabled={isSubmitting}
          {...register("name")}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-sm font-medium">
          {tAuth("createPasswordMinLength")}
        </Label>
        <Input
          id="password"
          type="password"
          placeholder={tAuth("passwordPlaceholder")}
          autoComplete="new-password"
          disabled={isSubmitting}
          {...register("password")}
        />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}

        <PasswordStrengthMeter password={passwordValue} />
      </div>

      <Button
        type="submit"
        className="h-10 w-full text-sm font-medium"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? tAuth("acceptingInvite") : tAuth("acceptInviteCreateAccount")}
      </Button>
    </form>
  );
}

export function AcceptInviteForm() {
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { user, isAuthenticated, isLoading } = useAuth();

  if (!token) {
    return (
      <Card className="w-full border border-border shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl font-semibold tracking-tight text-destructive">
            {tAuth("invalidInviteLink")}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            {tAuth("invalidInviteDesc")}
          </CardDescription>
        </CardHeader>
        <CardFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full text-sm font-medium"
            onClick={() => router.push("/login" as Route)}
          >
            {tAuth("backToLogin")}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full border border-border shadow-sm">
      <CardBg />
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl font-semibold tracking-tight">
          {tAuth("acceptInviteTitle")}
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          {tAuth("acceptInviteDescription")}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <output className="block space-y-3 py-4" aria-label={tCommon("loading")}>
            <div className="h-4 w-3/4 animate-pulse rounded-md bg-muted" />
            <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
            <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
          </output>
        ) : isAuthenticated && user ? (
          <AcceptInviteAuthenticatedSection token={token} user={user} />
        ) : (
          <AcceptInviteGuestSection token={token} />
        )}
      </CardContent>

      <CardFooter className="pt-2">
        <p className="w-full text-center text-sm text-muted-foreground">
          {tAuth("alreadyHaveAccount")}{" "}
          <Link
            href={"/login" as Route}
            className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
          >
            {tAuth("login")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
