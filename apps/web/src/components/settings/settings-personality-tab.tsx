"use client";

import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import type { AiAgentResponse, AiSettingsResponse } from "@app/shared";

export interface SettingsPersonalityTabProps {
  businessId: string | null;
}

export function SettingsPersonalityTab({
  businessId,
}: SettingsPersonalityTabProps): React.ReactElement {
  const t = useTranslations("settings");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const agentIdRef = React.useRef<string | null>(null);
  const [agentName, setAgentName] = useState("Alyssa");
  const [agentTone, setAgentTone] = useState("Chaleureux & Commercial");
  const [agentLanguage, setAgentLanguage] = useState("ar");
  const [confidenceThreshold, setConfidenceThreshold] = useState("0.70");
  const [replyMode, setReplyMode] = useState<"approval_required" | "auto_send">(
    "approval_required",
  );
  const [greetingTemplate, setGreetingTemplate] = useState("");
  const [fallbackTemplate, setFallbackTemplate] = useState("");

  useEffect(() => {
    let isMounted = true;
    const headers: Record<string, string> = businessId ? { "x-business-id": businessId } : {};

    Promise.all([
      apiClient
        .get<AiAgentResponse[]>("/api/v1/ai/agents", { headers })
        .catch(() => [] as AiAgentResponse[]),
      apiClient.get<AiSettingsResponse>("/api/v1/ai/settings", { headers }).catch(() => null),
    ])
      .then(([agents, settings]) => {
        if (!isMounted) return;

        if (agents && agents.length > 0) {
          const agent = agents[0];
          agentIdRef.current = agent.id;
          if (agent.name) setAgentName(agent.name);
          if (agent.tone) setAgentTone(agent.tone);
          if (agent.language) setAgentLanguage(agent.language);
          if (typeof agent.confidenceThreshold === "number") {
            setConfidenceThreshold(agent.confidenceThreshold.toFixed(2));
          }
          if (agent.greetingTemplate) setGreetingTemplate(agent.greetingTemplate);
          if (agent.fallbackTemplate) setFallbackTemplate(agent.fallbackTemplate);
        }

        if (settings && settings.replyMode) {
          setReplyMode(settings.replyMode === "auto_send" ? "auto_send" : "approval_required");
        }
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : t("errorLoadPersonality");
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

    const headers: Record<string, string> = businessId ? { "x-business-id": businessId } : {};
    const parsedConfidence = parseFloat(confidenceThreshold) || 0.7;

    const tasks: Promise<unknown>[] = [];

    if (agentIdRef.current) {
      tasks.push(
        apiClient.patch(
          `/api/v1/ai/agents/${agentIdRef.current}`,
          {
            name: agentName.trim(),
            tone: agentTone.trim(),
            language: agentLanguage.trim(),
            confidenceThreshold: parsedConfidence,
            greetingTemplate: greetingTemplate.trim() || null,
            fallbackTemplate: fallbackTemplate.trim() || null,
          },
          { headers },
        ),
      );
    }

    tasks.push(
      apiClient.patch(
        "/api/v1/ai/settings",
        {
          replyMode,
        },
        { headers },
      ),
    );

    Promise.all(tasks)
      .then(() => {
        setSuccess(t("personalitySaved"));
        setIsSaving(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : t("errorSavePersonality");
        setError(msg);
        setIsSaving(false);
      });
  };

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="settings-personality-loading">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6" data-testid="settings-personality-form">
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

      {/* Identity & Tone */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-5" />
            <CardTitle className="text-base">{t("tabPersonality")}</CardTitle>
          </div>
          <CardDescription className="text-xs">{t("confidenceHelp")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="agent-name">{t("agentName")}</Label>
              <Input
                id="agent-name"
                data-testid="agent-name-input"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder={t("agentNamePlaceholder")}
                required
                disabled={isSaving}
                dir="auto"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="agent-tone-slider">{t("tone")}</Label>
                <span className="text-xs font-semibold text-primary">
                  {agentTone === "Professionnel & Formel"
                    ? t("toneProfessional")
                    : agentTone === "Concis & Rapide"
                      ? t("toneConcise")
                      : t("toneWarm")}
                </span>
              </div>
              <input
                id="agent-tone-slider"
                data-testid="agent-tone-slider"
                type="range"
                min="0"
                max="2"
                step="1"
                aria-label={t("tone")}
                aria-valuetext={
                  agentTone === "Professionnel & Formel"
                    ? t("toneProfessional")
                    : agentTone === "Concis & Rapide"
                      ? t("toneConcise")
                      : t("toneWarm")
                }
                value={
                  agentTone === "Professionnel & Formel"
                    ? 1
                    : agentTone === "Concis & Rapide"
                      ? 2
                      : 0
                }
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  if (idx === 1) setAgentTone("Professionnel & Formel");
                  else if (idx === 2) setAgentTone("Concis & Rapide");
                  else setAgentTone("Chaleureux & Commercial");
                }}
                disabled={isSaving}
                className="h-2 w-full cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{t("toneWarm")}</span>
                <span>{t("toneProfessional")}</span>
                <span>{t("toneConcise")}</span>
              </div>
              <select
                id="agent-tone"
                data-testid="agent-tone-select"
                value={agentTone}
                onChange={(e) => setAgentTone(e.target.value)}
                disabled={isSaving}
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
              >
                <option value="Chaleureux & Commercial">{t("toneWarm")}</option>
                <option value="Professionnel & Formel">{t("toneProfessional")}</option>
                <option value="Concis & Rapide">{t("toneConcise")}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="agent-lang">{t("language")}</Label>
              <select
                id="agent-lang"
                data-testid="agent-language-select"
                value={agentLanguage}
                onChange={(e) => setAgentLanguage(e.target.value)}
                disabled={isSaving}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ar">{t("langAr")}</option>
                <option value="fr">{t("langFr")}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confidence-threshold">{t("confidenceThreshold")}</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="confidence-threshold"
                  data-testid="confidence-threshold-input"
                  type="number"
                  min="0.10"
                  max="0.99"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(e.target.value)}
                  disabled={isSaving}
                  className="w-28"
                />
                <span className="text-xs text-muted-foreground">{t("confidenceHelp")}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reply Mode Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("replyMode")}</CardTitle>
          <CardDescription className="text-xs">
            {replyMode === "approval_required"
              ? t("replyModeApprovalDesc")
              : t("replyModeAutoSendDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div data-testid="reply-mode-radios" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              aria-label={t("replyModeApproval")}
              onClick={() => setReplyMode("approval_required")}
              disabled={isSaving}
              className={`flex cursor-pointer flex-col justify-between rounded-lg border p-4 text-start transition-all ${
                replyMode === "approval_required"
                  ? "border-primary bg-primary/5 shadow-xs"
                  : "border-border bg-card hover:bg-muted/30"
              }`}
            >
              <div className="flex w-full items-start justify-between">
                <div>
                  <span className="text-sm font-semibold text-foreground">
                    {t("replyModeApproval")}
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">{t("replyModeApprovalDesc")}</p>
                </div>
                <div
                  className={`flex size-4 items-center justify-center rounded-full border ${
                    replyMode === "approval_required" ? "border-primary bg-primary" : "border-input"
                  }`}
                >
                  {replyMode === "approval_required" && (
                    <div className="size-1.5 rounded-full bg-primary-foreground" />
                  )}
                </div>
              </div>
            </button>

            <button
              type="button"
              aria-label={t("replyModeAutoSend")}
              onClick={() => setReplyMode("auto_send")}
              disabled={isSaving}
              className={`flex cursor-pointer flex-col justify-between rounded-lg border p-4 text-start transition-all ${
                replyMode === "auto_send"
                  ? "border-primary bg-primary/5 shadow-xs"
                  : "border-border bg-card hover:bg-muted/30"
              }`}
            >
              <div className="flex w-full items-start justify-between">
                <div>
                  <span className="text-sm font-semibold text-foreground">
                    {t("replyModeAutoSend")}
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">{t("replyModeAutoSendDesc")}</p>
                </div>
                <div
                  className={`flex size-4 items-center justify-center rounded-full border ${
                    replyMode === "auto_send" ? "border-primary bg-primary" : "border-input"
                  }`}
                >
                  {replyMode === "auto_send" && (
                    <div className="size-1.5 rounded-full bg-primary-foreground" />
                  )}
                </div>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("greetingTemplate")}</CardTitle>
          <CardDescription className="text-xs">{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="greeting-template">{t("greetingTemplate")}</Label>
            <Input
              id="greeting-template"
              data-testid="greeting-template-input"
              value={greetingTemplate}
              onChange={(e) => setGreetingTemplate(e.target.value)}
              placeholder={t("greetingPlaceholder")}
              disabled={isSaving}
              dir="auto"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fallback-template">{t("fallbackTemplate")}</Label>
            <Input
              id="fallback-template"
              data-testid="fallback-template-input"
              value={fallbackTemplate}
              onChange={(e) => setFallbackTemplate(e.target.value)}
              placeholder={t("fallbackPlaceholder")}
              disabled={isSaving}
              dir="auto"
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          type="submit"
          data-testid="save-personality-button"
          disabled={isSaving}
          className="min-w-32"
        >
          {isSaving ? (
            <>
              <Loader2 className="me-2 size-4 animate-spin" />
              <span>{t("savePersonality")}</span>
            </>
          ) : (
            t("savePersonality")
          )}
        </Button>
      </div>
    </form>
  );
}
