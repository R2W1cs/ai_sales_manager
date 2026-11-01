"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  Percent,
  RotateCcw,
  ShieldAlert,
  Truck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";

export interface SettingsRulesTabProps {
  businessId: string | null;
}

interface RawBusinessRule {
  id: string;
  ruleType?: string;
  rule_type?: string;
  payload: unknown;
  enabled?: boolean;
}

export function SettingsRulesTab({ businessId }: SettingsRulesTabProps): React.ReactElement {
  const t = useTranslations("settings");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [deliveryFee, setDeliveryFee] = useState("7");
  const [deliveryEta, setDeliveryEta] = useState("48");
  const [deliveryZone, setDeliveryZone] = useState("Toute la Tunisie");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("150");
  const [acceptCod, setAcceptCod] = useState(true);
  const [acceptBankTransfer, setAcceptBankTransfer] = useState(false);
  const [returnDays, setReturnDays] = useState("7");
  const [returnConditions, setReturnConditions] = useState(
    "Échange possible sous 7 jours, articles non portés avec étiquette d'origine.",
  );
  const [workingDays, setWorkingDays] = useState<Record<string, boolean>>({
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: true,
    sun: false,
  });
  const [openingTime, setOpeningTime] = useState("08:30");
  const [closingTime, setClosingTime] = useState("19:30");
  const initialRulesRef = React.useRef<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;
    const headers: Record<string, string> = businessId ? { "x-business-id": businessId } : {};

    apiClient
      .get<
        | RawBusinessRule[]
        | Record<string, RawBusinessRule>
        | { rules?: RawBusinessRule[]; data?: RawBusinessRule[] }
      >("/api/v1/business-rules", { headers })
      .then((res) => {
        if (!isMounted) return;
        setIsLoading(false);
        if (!res) return;

        let rulesList: RawBusinessRule[] = [];
        if (Array.isArray(res)) {
          rulesList = res;
        } else if (typeof res === "object") {
          if ("data" in res && Array.isArray((res as { data: unknown }).data)) {
            rulesList = (res as { data: RawBusinessRule[] }).data;
          } else if ("rules" in res && Array.isArray((res as { rules: unknown }).rules)) {
            rulesList = (res as { rules: RawBusinessRule[] }).rules;
          } else {
            rulesList = Object.values(res).filter((item): item is RawBusinessRule =>
              Boolean(item && typeof item === "object"),
            );
          }
        }

        const initialMap: Record<string, string> = {};
        rulesList.forEach((rule) => {
          if (!rule) return;
          const ruleType = rule.ruleType ?? rule.rule_type;
          const payload = rule.payload as Record<string, unknown> | null;
          if (!payload || !ruleType) return;
          initialMap[ruleType] = JSON.stringify(payload);

          if (ruleType === "delivery" && Array.isArray(payload.zones) && payload.zones.length > 0) {
            const z = payload.zones[0] as Record<string, unknown>;
            if (z.fee !== undefined) setDeliveryFee(String(z.fee));
            if (z.eta_hours !== undefined) setDeliveryEta(String(z.eta_hours));
            if (z.name) setDeliveryZone(String(z.name));
          } else if (ruleType === "free_shipping") {
            if (payload.threshold !== undefined)
              setFreeShippingThreshold(String(payload.threshold));
          } else if (ruleType === "payment" && Array.isArray(payload.methods)) {
            const codes = (payload.methods as Array<{ code: string }>).map((m) => m.code);
            setAcceptCod(codes.includes("cod"));
            setAcceptBankTransfer(codes.includes("bank_transfer"));
          } else if (ruleType === "returns") {
            if (payload.window_days !== undefined) setReturnDays(String(payload.window_days));
            if (payload.conditions) setReturnConditions(String(payload.conditions));
          } else if (ruleType === "working_hours") {
            const weekly = payload.weekly as
              | Record<string, { open: string; close: string } | null>
              | undefined;
            if (weekly) {
              const newDays: Record<string, boolean> = {};
              let foundOpen = "";
              let foundClose = "";
              for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
                const dayVal = weekly[day];
                newDays[day] = Boolean(dayVal);
                if (dayVal?.open && !foundOpen) foundOpen = dayVal.open;
                if (dayVal?.close && !foundClose) foundClose = dayVal.close;
              }
              setWorkingDays((prev) => ({ ...prev, ...newDays }));
              if (foundOpen) setOpeningTime(foundOpen);
              if (foundClose) setClosingTime(foundClose);
            }
          }
        });
        initialRulesRef.current = initialMap;
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : t("errorLoadRules");
        setError(msg);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [businessId, t]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const feeNum = parseFloat(deliveryFee) || 7;
    const etaNum = parseInt(deliveryEta, 10) || 48;
    const thresholdNum = parseFloat(freeShippingThreshold) || 150;
    const retDaysNum = parseInt(returnDays, 10) || 7;

    const paymentMethods: Array<{ code: string; label: string }> = [];
    if (acceptCod) {
      paymentMethods.push({ code: "cod", label: "Cash on Delivery" });
    }
    if (acceptBankTransfer) {
      paymentMethods.push({ code: "bank_transfer", label: "Virement bancaire" });
    }
    if (paymentMethods.length === 0) {
      paymentMethods.push({ code: "cod", label: "Cash on Delivery" });
    }

    const weeklySchedule: Record<string, { open: string; close: string } | null> = {};
    for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
      weeklySchedule[day] = workingDays[day] ? { open: openingTime, close: closingTime } : null;
    }

    const headers: Record<string, string> = businessId ? { "x-business-id": businessId } : {};

    const ruleDefinitions: Array<{ ruleType: string; payload: Record<string, unknown> }> = [
      {
        ruleType: "delivery",
        payload: {
          zones: [
            {
              name: deliveryZone.trim() || "Toute la Tunisie",
              fee: feeNum,
              currency: "TND",
              eta_hours: etaNum,
            },
          ],
        },
      },
      {
        ruleType: "free_shipping",
        payload: {
          threshold: thresholdNum,
          currency: "TND",
        },
      },
      {
        ruleType: "payment",
        payload: {
          methods: paymentMethods,
        },
      },
      {
        ruleType: "returns",
        payload: {
          window_days: retDaysNum,
          conditions: returnConditions.trim(),
        },
      },
      {
        ruleType: "discount",
        payload: {
          ai_may_offer: false,
          max_percent: null,
        },
      },
      {
        ruleType: "working_hours",
        payload: {
          timezone: "Africa/Tunis",
          weekly: weeklySchedule,
          human_callback: "next_working_day",
        },
      },
    ];

    // 13 §12.4 POST new row only for rules whose payloads were changed or newly defined
    const changedRules = ruleDefinitions.filter((item) => {
      const serialized = JSON.stringify(item.payload);
      return (
        !initialRulesRef.current[item.ruleType] ||
        initialRulesRef.current[item.ruleType] !== serialized
      );
    });

    const tasks = changedRules.map((rule) =>
      apiClient.post(
        "/api/v1/business-rules",
        {
          ruleType: rule.ruleType,
          payload: rule.payload,
          enabled: true,
        },
        { headers },
      ),
    );

    Promise.all(tasks)
      .then(() => {
        changedRules.forEach((rule) => {
          initialRulesRef.current[rule.ruleType] = JSON.stringify(rule.payload);
        });
        setSuccess(t("rulesSaved"));
        setIsSaving(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : t("errorSaveRules");
        setError(msg);
        setIsSaving(false);
      });
  };

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="settings-rules-loading">
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6" data-testid="settings-rules-form">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* 1. Delivery Policy */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <Truck className="size-5" />
            <CardTitle className="text-base">{t("deliverySection")}</CardTitle>
          </div>
          <CardDescription className="text-xs">{t("rulesDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="delivery-fee">{t("deliveryFee")}</Label>
              <Input
                id="delivery-fee"
                data-testid="delivery-fee-input"
                type="number"
                step="0.5"
                min="0"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
                required
                disabled={isSaving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="delivery-eta">{t("deliveryEta")}</Label>
              <Input
                id="delivery-eta"
                data-testid="delivery-eta-input"
                type="number"
                min="1"
                value={deliveryEta}
                onChange={(e) => setDeliveryEta(e.target.value)}
                required
                disabled={isSaving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="delivery-zone">{t("deliveryZone")}</Label>
              <Input
                id="delivery-zone"
                data-testid="delivery-zone-input"
                value={deliveryZone}
                onChange={(e) => setDeliveryZone(e.target.value)}
                required
                disabled={isSaving}
                dir="auto"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Free Shipping Threshold */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <FileText className="size-5" />
            <CardTitle className="text-base">{t("freeShippingSection")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="free-shipping-threshold">{t("freeShippingThreshold")}</Label>
            <Input
              id="free-shipping-threshold"
              data-testid="free-shipping-input"
              type="number"
              step="1"
              min="0"
              value={freeShippingThreshold}
              onChange={(e) => setFreeShippingThreshold(e.target.value)}
              required
              disabled={isSaving}
            />
          </div>
        </CardContent>
      </Card>

      {/* 3. Discount Policy (Locked in MVP) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <Percent className="size-5" />
            <CardTitle className="text-base">{t("discountSection")}</CardTitle>
          </div>
          <CardDescription className="text-xs">{t("discountForbiddenHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <ShieldAlert className="size-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-foreground">{t("discountNegotiation")}</p>
              <p className="text-muted-foreground">{t("discountForbidden")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Payment Methods */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <CreditCard className="size-5" />
            <CardTitle className="text-base">{t("paymentSection")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="accept-cod"
              data-testid="accept-cod-checkbox"
              checked={acceptCod}
              onCheckedChange={(c) => setAcceptCod(Boolean(c))}
              disabled={isSaving}
            />
            <Label htmlFor="accept-cod" className="cursor-pointer text-xs font-medium">
              {t("acceptCod")}
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="accept-bank-transfer"
              data-testid="accept-bank-checkbox"
              checked={acceptBankTransfer}
              onCheckedChange={(c) => setAcceptBankTransfer(Boolean(c))}
              disabled={isSaving}
            />
            <Label htmlFor="accept-bank-transfer" className="cursor-pointer text-xs font-medium">
              {t("acceptBankTransfer")}
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* 5. Returns Policy */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <RotateCcw className="size-5" />
            <CardTitle className="text-base">{t("returnsSection")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="return-days">{t("returnDays")}</Label>
              <Input
                id="return-days"
                data-testid="return-days-input"
                type="number"
                min="0"
                value={returnDays}
                onChange={(e) => setReturnDays(e.target.value)}
                required
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="return-conditions">{t("returnConditions")}</Label>
              <Input
                id="return-conditions"
                data-testid="return-conditions-input"
                value={returnConditions}
                onChange={(e) => setReturnConditions(e.target.value)}
                disabled={isSaving}
                dir="auto"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 6. Working Hours and Escalations */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <Clock className="size-5" />
            <CardTitle className="text-base">{t("workingHoursSection")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">{t("workingDays")}</Label>
            <div className="flex flex-wrap gap-4">
              {[
                { key: "mon", label: t("daysMon") },
                { key: "tue", label: t("daysTue") },
                { key: "wed", label: t("daysWed") },
                { key: "thu", label: t("daysThu") },
                { key: "fri", label: t("daysFri") },
                { key: "sat", label: t("daysSat") },
                { key: "sun", label: t("daysSun") },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-foreground"
                >
                  <Checkbox
                    id={`working-day-${key}`}
                    data-testid={`working-day-${key}`}
                    checked={workingDays[key] ?? false}
                    onCheckedChange={(checked) =>
                      setWorkingDays((prev) => ({ ...prev, [key]: Boolean(checked) }))
                    }
                    disabled={isSaving}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="opening-time">{t("openingTime")}</Label>
              <Input
                id="opening-time"
                data-testid="opening-time-input"
                type="time"
                value={openingTime}
                onChange={(e) => setOpeningTime(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closing-time">{t("closingTime")}</Label>
              <Input
                id="closing-time"
                data-testid="closing-time-input"
                type="time"
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t("workingHoursNotice")}</p>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          type="submit"
          data-testid="save-rules-button"
          disabled={isSaving}
          className="min-w-32"
        >
          {isSaving ? (
            <>
              <Loader2 className="me-2 size-4 animate-spin" />
              <span>{t("saveRules")}</span>
            </>
          ) : (
            t("saveRules")
          )}
        </Button>
      </div>
    </form>
  );
}
