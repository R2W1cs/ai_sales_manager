"use client";

import type { CreateBusinessResponse } from "@app/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { Store, ArrowRight, Building2, Globe2, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api-client";

const storeSetupSchema = z.object({
  name: z.string().trim().min(1, "Veuillez saisir le nom de votre entreprise."),
  industry: z.string().trim().min(1),
  defaultLanguage: z.enum(["fr", "ar"]),
  phone: z.string().trim().max(30).optional(),
});

type StoreSetupFormData = z.infer<typeof storeSetupSchema>;

interface BusinessProfile {
  id: string;
  name: string;
  industry: string;
  country: string;
  defaultLanguage: "fr" | "ar";
  timezone: string;
  currency: string;
  phone?: string;
}

export interface StepStoreSetupProps {
  businessId: string;
  initialName?: string;
  onNext: (createdBusinessId?: string) => void;
}

export function StepStoreSetup({
  businessId,
  initialName = "",
  onNext,
}: StepStoreSetupProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");
  const tLanguages = useTranslations("languages");
  const { refreshSession } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<StoreSetupFormData>({
    resolver: zodResolver(storeSetupSchema),
    defaultValues: {
      name: initialName,
      industry: "Mode & Habillement",
      defaultLanguage: "fr",
      phone: "",
    },
  });

  useEffect(() => {
    let mounted = true;
    if (!businessId) return;

    apiClient
      .get<BusinessProfile>(`/api/v1/businesses/${businessId}`)
      .then((profile) => {
        if (!mounted || !profile) return;
        if (profile.name) setValue("name", profile.name);
        if (profile.industry) setValue("industry", profile.industry);
        if (profile.defaultLanguage) setValue("defaultLanguage", profile.defaultLanguage);
        if (profile.phone) setValue("phone", profile.phone);
      })
      .catch(() => {
        // Fallback to initial values if profile fetch fails
      });

    return () => {
      mounted = false;
    };
  }, [businessId, setValue]);

  const onSubmit = async (data: StoreSetupFormData) => {
    setErrorMessage(null);
    const payload = {
      name: data.name.trim(),
      industry: data.industry.trim() || "Mode & Habillement",
      country: "TN",
      defaultLanguage: data.defaultLanguage,
      timezone: "Africa/Tunis",
      currency: "TND",
      phone: data.phone?.trim() || undefined,
    };

    try {
      if (businessId) {
        await apiClient.patch(`/api/v1/businesses/${businessId}`, payload);
        onNext();
        return;
      }

      const created = await apiClient.post<CreateBusinessResponse>(
        "/api/v1/businesses",
        payload,
        {
          headers: {
            "Idempotency-Key": `onboarding-create-${crypto.randomUUID()}`,
          },
        },
      );

      await refreshSession();

      if (typeof window !== "undefined" && created?.business?.id) {
        window.localStorage.setItem("active_business_id", created.business.id);
        document.cookie = `x-business-id=${created.business.id}; path=/; max-age=31536000; SameSite=Lax`;
      }

      onNext(created?.business?.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : tOnboarding("saveStoreError");
      setErrorMessage(msg);
    }
  };

  return (
    <div data-slot="step-store-setup" className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <Store className="size-5" />
            <CardTitle>{tOnboarding("storeProfileTitle")}</CardTitle>
          </div>
          <CardDescription>{tOnboarding("storeProfileDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {(errorMessage || errors.name) && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              >
                {errorMessage || errors.name?.message}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="store-name">{tOnboarding("storeNameLabel")}</Label>
              <div className="relative">
                <Input
                  id="store-name"
                  {...register("name")}
                  placeholder={tOnboarding("storeNamePlaceholder")}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">{tOnboarding("storeNameHint")}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="store-industry" className="flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-muted-foreground" />
                  {tOnboarding("industryLabel")}
                </Label>
                <select
                  id="store-industry"
                  {...register("industry")}
                  disabled={isSubmitting}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="Mode & Habillement">{tOnboarding("industryFashion")}</option>
                  <option value="Cosmétiques & Beauté">{tOnboarding("industryBeauty")}</option>
                  <option value="Électronique & Maison">{tOnboarding("industryHome")}</option>
                  <option value="Chaussures & Maroquinerie">{tOnboarding("industryShoes")}</option>
                  <option value="Autre">{tOnboarding("industryOther")}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="store-language" className="flex items-center gap-1.5">
                  <Globe2 className="size-3.5 text-muted-foreground" />
                  {tOnboarding("defaultLanguageLabel")}
                </Label>
                <select
                  id="store-language"
                  {...register("defaultLanguage")}
                  disabled={isSubmitting}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="fr">{tLanguages("fr")}</option>
                  <option value="ar">{tLanguages("ar")}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="store-country">{tOnboarding("countryLabel")}</Label>
                <Input
                  id="store-country"
                  value="Tunisie (TN)"
                  disabled
                  readOnly
                  className="cursor-not-allowed bg-muted/50"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="store-currency">{tOnboarding("currency")}</Label>
                <Input
                  id="store-currency"
                  value={tOnboarding("currencyVal")}
                  disabled
                  readOnly
                  className="cursor-not-allowed bg-muted/50"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="store-timezone">{tOnboarding("timezone")}</Label>
                <Input
                  id="store-timezone"
                  value={tOnboarding("timezoneVal")}
                  disabled
                  readOnly
                  className="cursor-not-allowed bg-muted/50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="store-phone" className="flex items-center gap-1.5">
                <Phone className="size-3.5 text-muted-foreground" />
                {tOnboarding("contactPhoneLabel")}
              </Label>
              <Input
                id="store-phone"
                type="tel"
                {...register("phone")}
                placeholder={tOnboarding("contactPhonePlaceholder")}
                disabled={isSubmitting}
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                loading={isSubmitting}
                data-slot="btn-next-step"
                className="gap-2"
              >
                <span>{tOnboarding("saveAndContinue")}</span>
                <ArrowRight className="size-4 rtl:rotate-180" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
