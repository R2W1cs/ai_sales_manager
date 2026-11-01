"use client";

import {
  Bot,
  ArrowRight,
  ArrowLeft,
  Send,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Tag,
  ShoppingBag,
  AlertTriangle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useContext, useRef, useState } from "react";

import { TenantContext } from "@/components/layout/tenant-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import {
  type PlaygroundScenario,
  type PlaygroundSimulateResponse,
  PLAYGROUND_SCENARIO_PROMPTS,
} from "@app/shared";

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
}

interface DecisionInspectorCardProps {
  response: PlaygroundSimulateResponse | null;
}

function DecisionInspectorCard({ response }: DecisionInspectorCardProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div
      data-slot="decision-inspector"
      className="flex flex-col justify-between rounded-lg border border-border bg-card p-3 text-xs"
    >
      <div>
        <div className="flex items-center gap-1.5 border-b border-border pb-2 font-semibold text-primary">
          <ShieldCheck className="size-4" />
          <span>{tOnboarding("inspectorTitle")}</span>
        </div>

        <div className="mt-3 space-y-2.5">
          <div>
            <span className="text-[11px] font-medium text-muted-foreground">
              {tOnboarding("detectedIntent")}
            </span>
            <p className="font-mono text-xs font-medium text-foreground">
              {response?.executionSummary || "—"}
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium text-muted-foreground">
              {tOnboarding("confidenceLabel")}
            </span>
            <p className="font-mono text-xs font-medium text-foreground">
              {response ? (response.groundingPassed ? "0.95" : "0.85") : "—"}
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium text-muted-foreground">
              {tOnboarding("toolsExecuted")}
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {response?.toolCalls && response.toolCalls.length > 0 ? (
                response.toolCalls.map((t, idx) => (
                  <span
                    key={`${t}-${idx}`}
                    className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground"
                  >
                    {t}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-muted-foreground">—</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface StepPlaygroundTestProps {
  businessId: string;
  onNext?: () => void;
  onPrev?: () => void;
  /** Hide wizard next/back when used as a standalone customer-test page. */
  standalone?: boolean;
}

export function StepPlaygroundTest({
  businessId,
  onNext,
  onPrev,
  standalone = false,
}: StepPlaygroundTestProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "initial-assistant-msg",
      sender: "assistant",
      text: "Bonjour ! Je suis votre assistante commerciale IA. Testez-moi avec une question ou choisissez un scénario ci-dessous.",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const [lastResponse, setLastResponse] = useState<PlaygroundSimulateResponse | null>(null);
  const [hasSimulated, setHasSimulated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tenant = useContext(TenantContext);
  const isEmployee = tenant?.currentRole === "employee";

  const scenarioChips: Array<{
    id: PlaygroundScenario;
    label: string;
    icon: React.ReactNode;
    slot: string;
  }> = [
    {
      id: "price",
      label: tOnboarding("scenarioPriceLabel"),
      icon: <Tag className="size-3.5" />,
      slot: "scenario-price",
    },
    {
      id: "buying_intent",
      label: tOnboarding("scenarioBuyingIntentLabel"),
      icon: <ShoppingBag className="size-3.5" />,
      slot: "scenario-buying_intent",
    },
    {
      id: "angry",
      label: tOnboarding("scenarioAngryLabel"),
      icon: <AlertTriangle className="size-3.5" />,
      slot: "scenario-angry",
    },
    {
      id: "recommendation",
      label: tOnboarding("scenarioRecommendationLabel"),
      icon: <Sparkles className="size-3.5" />,
      slot: "scenario-recommendation",
    },
  ];

  function runSimulation(payload: { message?: string; scenario?: PlaygroundScenario }) {
    if (isEmployee) {
      setErrorMessage(tOnboarding("unauthorizedAction", { perm: "ai.playground" }));
      return;
    }

    setErrorMessage(null);
    setIsSimulating(true);

    const userPrompt =
      payload.message ||
      (payload.scenario ? PLAYGROUND_SCENARIO_PROMPTS[payload.scenario] : "") ||
      "Bonjour, avez-vous des articles disponibles ?";

    setMessages((prev) => [
      ...prev,
      { id: `user-msg-${prev.length}`, sender: "user", text: userPrompt },
    ]);

    const requestBody = {
      ...payload,
      ...(activeConversationIdRef.current
        ? { conversationId: activeConversationIdRef.current }
        : {}),
    };

    apiClient
      .post<PlaygroundSimulateResponse>("/api/v1/ai/playground", requestBody, {
        headers: { "x-business-id": businessId },
      })
      .then((result) => {
        if (result?.conversationId) {
          activeConversationIdRef.current = result.conversationId;
        }
        setLastResponse(result);
        setHasSimulated(true);
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-msg-${prev.length}`,
            sender: "assistant",
            text: result.response,
          },
        ]);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : tOnboarding("simulateError");
        setErrorMessage(msg);
      })
      .finally(() => {
        setIsSimulating(false);
        setInputMessage("");
      });
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    runSimulation({ message: inputMessage.trim() });
  }

  return (
    <div data-slot="step-playground-test" className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <Bot className="size-5" />
              <CardTitle>{tOnboarding("playgroundTitle")}</CardTitle>
            </div>
            {hasSimulated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                <CheckCircle2 className="size-3.5" />
                {tOnboarding("simulateSuccessBadge")}
              </span>
            )}
          </div>
          <CardDescription>{tOnboarding("playgroundDesc")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isEmployee && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning"
            >
              <AlertTriangle className="size-4 shrink-0" />
              <span>{tOnboarding("playgroundRestricted", { perm: "ai.playground" })}</span>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              {errorMessage}
            </div>
          )}

          {/* Quick Scenario Chips */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {tOnboarding("precalibratedScenarios")}
            </span>
            <div className="flex flex-wrap gap-2">
              {scenarioChips.map((chip) => (
                <Button
                  key={chip.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => runSimulation({ scenario: chip.id })}
                  disabled={isSimulating}
                  data-slot={`scenario-${chip.id}`}
                  className="gap-1.5 text-xs"
                >
                  {chip.icon}
                  <span>{chip.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Split Workspace: Chat Transcript + Decision Inspector */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Chat Transcript Window */}
            <div className="flex h-80 flex-col justify-between rounded-lg border border-border bg-muted/20 p-3 lg:col-span-2">
              <div
                data-slot="playground-chat-transcript"
                className="flex-1 space-y-3 overflow-y-auto pe-2"
              >
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3.5 py-2 text-xs leading-relaxed shadow-xs ${
                        msg.sender === "user"
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-card text-foreground"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isSimulating && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                      <Sparkles className="size-3.5 animate-spin text-primary" />
                      <span>{tOnboarding("aiThinking")}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleFormSubmit} className="mt-3 flex items-center gap-2">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={tOnboarding("simulateCustomerQuestion")}
                  disabled={isSimulating}
                  data-slot="playground-input"
                  className="text-xs"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSimulating || !inputMessage.trim()}
                  data-slot="btn-send-simulation"
                  className="shrink-0"
                >
                  <Send className="size-3.5" />
                </Button>
              </form>
            </div>

            {/* Decision Inspector */}
            <DecisionInspectorCard response={lastResponse} />
          </div>

          {!standalone && (
            <div className="flex items-center justify-between pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onPrev}
                data-slot="btn-prev-step"
                className="gap-2"
              >
                <ArrowLeft className="size-4 rtl:rotate-180" />
                <span>{tCommon("back")}</span>
              </Button>

              <Button type="button" onClick={onNext} data-slot="btn-next-step" className="gap-2">
                <span>{tCommon("next")}</span>
                <ArrowRight className="size-4 rtl:rotate-180" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
