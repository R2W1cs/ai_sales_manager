"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Stack } from "@/components/ui/stack";
import { useAuth } from "@/hooks/use-auth";

const registerSchema = z.object({
  name: nameSchema,
  email: z
    .string()
    .trim()
    .min(1, "Veuillez renseigner votre adresse e-mail.")
    .max(255, "L'adresse e-mail ne doit pas dépasser 255 caractères.")
    .pipe(z.email("Adresse e-mail invalide.")),
  password: passwordSchema,
});

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const { register: registerUser } = useAuth();
  const [apiError, setApiError] = useState<unknown | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const passwordValue = useWatch({ control, name: "password" }) ?? "";

  async function onSubmit(data: RegisterFormData) {
    setApiError(null);

    try {
      await registerUser(data);
      router.push("/onboarding" as Route);
    } catch (err) {
      setApiError(err);
    }
  }

  return (
    <Card className="w-full border border-border shadow-sm">
      <CardBg />
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl font-semibold tracking-tight">{tAuth("register")}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          {tAuth("registerDescription")}
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
              <Label htmlFor="name" className="text-sm font-medium">
                {tAuth("name")}
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
            </Stack>

            <Stack direction="column" size="xs" className="w-full">
              <Label htmlFor="email" className="text-sm font-medium">
                {tAuth("email")}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={tAuth("emailPlaceholder")}
                autoComplete="email"
                disabled={isSubmitting}
                {...register("email")}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </Stack>

            <Stack direction="column" size="xs" className="w-full">
              <Label htmlFor="password" className="text-sm font-medium">
                {tAuth("passwordMinLength")}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={tAuth("passwordPlaceholder")}
                autoComplete="new-password"
                disabled={isSubmitting}
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}

              <PasswordStrengthMeter password={passwordValue} />
            </Stack>
          </Stack>
        </CardContent>

        <CardFooter className="pt-2">
          <Stack direction="column" size="sm" align="stretch" className="w-full">
            <Button
              type="submit"
              className="h-10 w-full text-sm font-medium"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? tAuth("creatingAccount") : tAuth("createAccountSubmit")}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {tAuth("alreadyHaveAccount")}{" "}
              <Link
                href={"/login" as Route}
                className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
              >
                {tAuth("login")}
              </Link>
            </p>
          </Stack>
        </CardFooter>
      </form>
    </Card>
  );
}
