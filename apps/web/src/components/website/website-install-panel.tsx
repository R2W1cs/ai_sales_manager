"use client";

import { Check, Copy, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";

interface WidgetInstall {
  publicKey: string;
  enabled: boolean;
  businessName: string;
}

function emptySubscribe() {
  return () => {};
}
function getWindowOrigin() {
  return window.location.origin;
}
function getServerOrigin() {
  return "";
}

export function WebsiteInstallPanel({
  businessId,
}: {
  businessId: string | null;
}): React.ReactElement {
  const t = useTranslations("website");
  const [install, setInstall] = useState<WidgetInstall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const origin = useSyncExternalStore(emptySubscribe, getWindowOrigin, getServerOrigin);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    apiClient
      .get<WidgetInstall>("/api/v1/website-widget", {
        headers: { "x-business-id": businessId },
      })
      .then((data) => {
        if (!cancelled) {
          setError(null);
          setInstall(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("loadError"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, t]);

  const snippet =
    origin && install
      ? `<script src="${origin}/widget.js" data-key="${install.publicKey}" async></script>`
      : "";

  async function copySnippet() {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function rotate() {
    if (!businessId || rotating) return;
    setRotating(true);
    setError(null);
    try {
      const next = await apiClient.post<WidgetInstall>(
        "/api/v1/website-widget/rotate",
        {},
        { headers: { "x-business-id": businessId } },
      );
      setInstall(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="website-install-panel">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("snippetTitle")}</CardTitle>
            <CardDescription>{t("snippetHelp")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-5 wrap-break-word whitespace-pre-wrap">
              {snippet || t("loading")}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={copySnippet} disabled={!snippet} className="gap-2">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? t("copied") : t("copy")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={rotate}
                disabled={rotating || !install}
                className="gap-2"
              >
                <RefreshCw className="size-4" />
                {t("rotate")}
              </Button>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>{t("pointKeys")}</li>
              <li>{t("pointInbox")}</li>
              <li>{t("pointReply")}</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">{t("previewTitle")}</CardTitle>
            <CardDescription>{t("previewHelp")}</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {install ? (
              <iframe
                title={t("previewTitle")}
                src={`/embed/preview?key=${encodeURIComponent(install.publicKey)}`}
                className="h-160 w-full border-0 bg-muted/40"
              />
            ) : (
              <div className="h-160 bg-muted" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
