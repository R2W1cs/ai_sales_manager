"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  FileText,
  ArrowRight,
  ArrowLeft,
  Truck,
  CreditCard,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";
import { useForm, useWatch, type UseFormRegister } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api-client";

const businessRulesSchema = z.object({
  deliveryFee: z.string().trim().min(1, "Veuillez indiquer les frais de livraison."),
  deliveryEta: z.string().trim().min(1, "Veuillez indiquer le délai de livraison."),
  deliveryZone: z.string().trim().min(1, "Veuillez indiquer la zone couverte."),
  acceptCod: z.boolean(),
  acceptBankTransfer: z.boolean(),
  returnDays: z.string().trim().min(1, "Veuillez indiquer le délai d'échange."),
  returnConditions: z.string().trim().min(1, "Veuillez spécifier les conditions."),
  agentName: z.string().trim().min(1, "Veuillez indiquer le nom de l'agent."),
  agentTone: z.string().trim().min(1),
  agentLanguage: z.string().trim().min(1),
  agentId: z.string().optional(),
});

type BusinessRulesFormData = z.infer<typeof businessRulesSchema>;

export interface StepBusinessRulesProps {
  businessId: string | null;
  onNext: () => void;
  onPrev: () => void;
}

interface DeliveryPolicySectionProps {
  register: UseFormRegister<BusinessRulesFormData>;
  isSubmitting: boolean;
}

function DeliveryPolicySection({
  register,
  isSubmitting,
}: DeliveryPolicySectionProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Truck className="size-4 text-primary" />
        <span>{tOnboarding("deliveryPolicy")}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="delivery-fee">{tOnboarding("deliveryFeeLabel")}</Label>
          <Input
            id="delivery-fee"
            type="number"
            step="0.5"
            min="0"
            {...register("deliveryFee")}
            required
            disabled={isSubmitting}
          />
          <p className="text-[10px] text-muted-foreground">{tOnboarding("deliveryFeeHint")}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="delivery-eta">{tOnboarding("deliveryEtaLabel")}</Label>
          <Input
            id="delivery-eta"
            type="number"
            min="1"
            {...register("deliveryEta")}
            required
            disabled={isSubmitting}
          />
          <p className="text-[10px] text-muted-foreground">{tOnboarding("deliveryEtaHint")}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="delivery-zone">{tOnboarding("deliveryZoneLabel")}</Label>
          <Input
            id="delivery-zone"
            {...register("deliveryZone")}
            required
            disabled={isSubmitting}
          />
          <p className="text-[10px] text-muted-foreground">{tOnboarding("deliveryZoneHint")}</p>
        </div>
      </div>
    </div>
  );
}

interface PaymentPolicySectionProps {
  acceptCod: boolean;
  acceptBankTransfer: boolean;
  onCodChange: (checked: boolean) => void;
  onBankTransferChange: (checked: boolean) => void;
  isSubmitting: boolean;
}

function PaymentPolicySection({
  acceptCod,
  acceptBankTransfer,
  onCodChange,
  onBankTransferChange,
  isSubmitting,
}: PaymentPolicySectionProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CreditCard className="size-4 text-primary" />
        <span>{tOnboarding("paymentPolicy")}</span>
      </div>
      <div className="space-y-2.5">
        <div className="flex items-start gap-2.5 text-xs text-foreground">
          <Checkbox
            id="payment-cod"
            checked={acceptCod}
            onCheckedChange={(checked) => onCodChange(Boolean(checked))}
            disabled={isSubmitting}
          />
          <Label htmlFor="payment-cod" className="cursor-pointer text-xs font-normal">
            <span className="font-medium">{tOnboarding("cashOnDelivery")}</span>
            <p className="text-[11px] font-normal text-muted-foreground">
              {tOnboarding("cashOnDeliveryDesc")}
            </p>
          </Label>
        </div>

        <div className="flex items-start gap-2.5 text-xs text-foreground">
          <Checkbox
            id="payment-bank"
            checked={acceptBankTransfer}
            onCheckedChange={(checked) => onBankTransferChange(Boolean(checked))}
            disabled={isSubmitting}
          />
          <Label htmlFor="payment-bank" className="cursor-pointer text-xs font-normal">
            <span className="font-medium">{tOnboarding("bankTransfer")}</span>
            <p className="text-[11px] font-normal text-muted-foreground">
              {tOnboarding("bankTransferDesc")}
            </p>
          </Label>
        </div>
      </div>
    </div>
  );
}

interface ReturnExchangePolicySectionProps {
  register: UseFormRegister<BusinessRulesFormData>;
  isSubmitting: boolean;
}

function ReturnExchangePolicySection({
  register,
  isSubmitting,
}: ReturnExchangePolicySectionProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <RotateCcw className="size-4 text-primary" />
        <span>{tOnboarding("returnExchangePolicy")}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor="return-days">{tOnboarding("returnDaysLabel")}</Label>
          <Input
            id="return-days"
            type="number"
            min="0"
            {...register("returnDays")}
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="return-conditions">{tOnboarding("returnConditionsLabel")}</Label>
          <Input id="return-conditions" {...register("returnConditions")} disabled={isSubmitting} />
          <p className="text-[10px] text-muted-foreground">{tOnboarding("returnConditionsHint")}</p>
        </div>
      </div>
    </div>
  );
}

interface AgentPersonaSectionProps {
  register: UseFormRegister<BusinessRulesFormData>;
  isSubmitting: boolean;
}

function AgentPersonaSection({
  register,
  isSubmitting,
}: AgentPersonaSectionProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="size-4 text-primary" />
        <span>{tOnboarding("agentPersonaPolicy")}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="agent-name">{tOnboarding("agentNameLabel")}</Label>
          <Input id="agent-name" {...register("agentName")} disabled={isSubmitting} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-tone">{tOnboarding("agentToneLabel")}</Label>
          <select
            id="agent-tone"
            {...register("agentTone")}
            disabled={isSubmitting}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="Chaleureux & Commercial">{tOnboarding("toneWarm")}</option>
            <option value="Professionnel & Formel">{tOnboarding("toneProfessional")}</option>
            <option value="Concis & Rapide">{tOnboarding("toneConcise")}</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-language">{tOnboarding("agentLanguageLabel")}</Label>
          <select
            id="agent-language"
            {...register("agentLanguage")}
            disabled={isSubmitting}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="ar">{tOnboarding("langTunisian")}</option>
            <option value="fr">{tOnboarding("langFrench")}</option>
            <option value="mixed">{tOnboarding("langMixed")}</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export function StepBusinessRules({
  businessId,
  onNext,
  onPrev,
}: StepBusinessRulesProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { isSubmitting },
  } = useForm<BusinessRulesFormData>({
    resolver: zodResolver(businessRulesSchema),
    defaultValues: {
      deliveryFee: "7",
      deliveryEta: "48",
      deliveryZone: "Toute la Tunisie",
      acceptCod: true,
      acceptBankTransfer: false,
      returnDays: "7",
      returnConditions:
        "Échange possible sous 7 jours. Frais de retour (7 DT) à la charge du client.",
      agentName: "Sarra - Conseillère Vente",
      agentTone: "Chaleureux & Commercial",
      agentLanguage: "ar",
    },
  });

  const acceptCod = useWatch({ control, name: "acceptCod" });
  const acceptBankTransfer = useWatch({ control, name: "acceptBankTransfer" });

  useEffect(() => {
    let mounted = true;
    if (!businessId) return;

    const headers: Record<string, string> = { "x-business-id": businessId };

    apiClient
      .get<Record<string, { payload?: unknown }>>("/api/v1/business-rules", {
        headers,
      })
      .then((rules) => {
        if (!mounted || !rules) return;

        const delPayload = rules.delivery?.payload as
          | { zones?: Array<{ fee: number; eta_hours: number; name: string }> }
          | undefined;
        if (delPayload?.zones && delPayload.zones.length > 0) {
          const zone = delPayload.zones[0];
          if (zone) {
            setValue("deliveryFee", String(zone.fee ?? 7));
            setValue("deliveryEta", String(zone.eta_hours ?? 48));
            setValue("deliveryZone", zone.name ?? "Toute la Tunisie");
          }
        }

        const retPayload = rules.returns?.payload as
          | { window_days?: number; conditions?: string }
          | undefined;
        if (retPayload?.window_days) {
          setValue("returnDays", String(retPayload.window_days));
        }
        if (retPayload?.conditions) {
          setValue("returnConditions", retPayload.conditions);
        }
      })
      .catch(() => {});

    apiClient
      .get<Array<{ id: string; name?: string; tone?: string; language?: string }>>(
        "/api/v1/ai/agents",
        {
          headers,
        },
      )
      .then((agents) => {
        if (!mounted || !Array.isArray(agents) || agents.length === 0) return;
        const agent = agents[0];
        if (agent) {
          setValue("agentId", agent.id);
          if (agent.name) setValue("agentName", agent.name);
          if (agent.tone) setValue("agentTone", agent.tone);
          if (agent.language) setValue("agentLanguage", agent.language);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [businessId, setValue]);

  const onSubmit = (data: BusinessRulesFormData) => {
    setErrorMessage(null);

    const feeNum = parseFloat(data.deliveryFee) || 7;
    const etaNum = parseInt(data.deliveryEta, 10) || 48;
    const retDaysNum = parseInt(data.returnDays, 10) || 7;

    const paymentMethods: Array<{ code: string; label: string }> = [];
    if (data.acceptCod) {
      paymentMethods.push({ code: "cod", label: tOnboarding("codPaymentMethodLabel") });
    }
    if (data.acceptBankTransfer) {
      paymentMethods.push({ code: "bank_transfer", label: tOnboarding("bankPaymentMethodLabel") });
    }
    if (paymentMethods.length === 0) {
      paymentMethods.push({ code: "cod", label: tOnboarding("codPaymentMethodLabel") });
    }

    const headers: Record<string, string> = businessId ? { "x-business-id": businessId } : {};

    const tasks: Promise<unknown>[] = [
      apiClient
        .post(
          "/api/v1/business-rules",
          {
            ruleType: "delivery",
            payload: {
              zones: [
                {
                  name: data.deliveryZone.trim() || "Toute la Tunisie",
                  fee: feeNum,
                  currency: "TND",
                  eta_hours: etaNum,
                },
              ],
            },
            enabled: true,
          },
          { headers },
        )
        .catch(() => null),
      apiClient
        .post(
          "/api/v1/business-rules",
          {
            ruleType: "payment",
            payload: {
              methods: paymentMethods,
            },
            enabled: true,
          },
          { headers },
        )
        .catch(() => null),
      apiClient
        .post(
          "/api/v1/business-rules",
          {
            ruleType: "returns",
            payload: {
              window_days: retDaysNum,
              conditions: data.returnConditions.trim(),
            },
            enabled: true,
          },
          { headers },
        )
        .catch(() => null),
    ];

    if (data.agentId) {
      tasks.push(
        apiClient
          .patch(
            `/api/v1/ai/agents/${data.agentId}`,
            {
              name: data.agentName.trim(),
              tone: data.agentTone.trim(),
              language: data.agentLanguage.trim(),
            },
            { headers },
          )
          .catch(() => null),
      );
    }

    return Promise.all(tasks)
      .then(() => {
        onNext();
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : "Erreur lors de l'enregistrement des règles.";
        setErrorMessage(msg);
      });
  };

  return (
    <div data-slot="step-business-rules" className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <FileText className="size-5" />
            <CardTitle>{tOnboarding("rulesTitle")}</CardTitle>
          </div>
          <CardDescription>{tOnboarding("rulesDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {errorMessage && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              >
                {errorMessage}
              </div>
            )}

            <DeliveryPolicySection register={register} isSubmitting={isSubmitting} />

            <PaymentPolicySection
              acceptCod={acceptCod}
              acceptBankTransfer={acceptBankTransfer}
              onCodChange={(checked) => setValue("acceptCod", checked)}
              onBankTransferChange={(checked) => setValue("acceptBankTransfer", checked)}
              isSubmitting={isSubmitting}
            />

            <ReturnExchangePolicySection register={register} isSubmitting={isSubmitting} />

            <AgentPersonaSection register={register} isSubmitting={isSubmitting} />

            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onPrev}
                data-slot="btn-prev-step"
                className="gap-2"
                disabled={isSubmitting}
              >
                <ArrowLeft className="size-4 rtl:rotate-180" />
                <span>{tCommon("back")}</span>
              </Button>

              <Button
                type="submit"
                loading={isSubmitting}
                data-slot="btn-save-rules-next"
                className="gap-2 px-6"
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
