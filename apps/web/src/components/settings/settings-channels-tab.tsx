"use client";

import { AlertCircle, CheckCircle2, Loader2, MessageCircle, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";

export interface ChannelAccount {
  id: string;
  channel: "instagram" | "messenger" | "whatsapp";
  status: "active" | "disconnected" | "expired";
  displayName?: string;
  externalAccountId: string;
}

export interface SettingsChannelsTabProps {
  businessId: string | null;
}

function InstagramIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function SettingsChannelsTab({ businessId }: SettingsChannelsTabProps): React.ReactElement {
  const t = useTranslations("settings");
  const [channels, setChannels] = useState<ChannelAccount[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(businessId));
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchChannels = useCallback(() => {
    if (!businessId) {
      setIsLoading(false);
      return;
    }
    setError(null);
    const headers: Record<string, string> = { "x-business-id": businessId };

    apiClient
      .get<ChannelAccount[]>("/api/v1/integrations", { headers })
      .then((data) => {
        setChannels(data || []);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : t("errorLoadChannels");
        setError(msg);
        setIsLoading(false);
      });
  }, [businessId, t]);

  useEffect(() => {
    let isMounted = true;
    if (!businessId) return;

    const headers: Record<string, string> = { "x-business-id": businessId };

    apiClient
      .get<ChannelAccount[]>("/api/v1/integrations", { headers })
      .then((data) => {
        if (!isMounted) return;
        setChannels(data || []);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : t("errorLoadChannels");
        setError(msg);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [businessId, t]);

  const handleConnectMeta = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    setError(null);
    setSuccess(null);
    const headers: Record<string, string> = businessId ? { "x-business-id": businessId } : {};

    try {
      const res = await apiClient.post<{ authorizationUrl?: string }>(
        "/api/v1/integrations/meta/connect",
        {},
        { headers },
      );

      if (res?.authorizationUrl) {
        window.location.href = res.authorizationUrl;
      } else {
        await fetchChannels();
      }
      setIsConnecting(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("errorConnectMeta");
      setError(msg);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    if (disconnectingId) return;
    setDisconnectingId(id);
    setError(null);
    setSuccess(null);
    const headers: Record<string, string> = businessId ? { "x-business-id": businessId } : {};

    try {
      await apiClient.delete(`/api/v1/integrations/channel-accounts/${id}`, { headers });
      setSuccess(t("channelDisconnected"));
      await fetchChannels();
      setDisconnectingId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("errorDisconnectChannel");
      setError(msg);
      setDisconnectingId(null);
    }
  };

  const instagramAccount = channels.find((c) => c.channel === "instagram");
  const messengerAccount = channels.find((c) => c.channel === "messenger");

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="settings-channels-loading">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="settings-channels-tab">
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-base">{t("channelsTitle")}</CardTitle>
            <CardDescription className="text-xs">{t("channelsDesc")}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="refresh-channels-button"
              onClick={fetchChannels}
              disabled={isLoading}
            >
              <RefreshCw className="size-3.5" />
              <span className="sr-only">{t("refresh")}</span>
            </Button>
            <Button
              type="button"
              data-testid="connect-meta-button"
              onClick={handleConnectMeta}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <MessageCircle className="me-2 size-4" />
              )}
              <span>{t("connectMeta")}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Instagram Account Card */}
          <div
            data-testid="channel-instagram-card"
            className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-xs">
                <InstagramIcon className="size-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">{t("instagram")}</h4>
                {instagramAccount?.status === "active" ? (
                  <p className="text-xs text-muted-foreground">
                    {instagramAccount.displayName || `ID: ${instagramAccount.externalAccountId}`}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("disconnected")}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {instagramAccount?.status === "active" ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                    <CheckCircle2 className="size-3" />
                    <span>{t("connected")}</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="disconnect-instagram-button"
                    onClick={() => handleDisconnect(instagramAccount.id)}
                    disabled={disconnectingId === instagramAccount.id}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    {disconnectingId === instagramAccount.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    <span className="ms-1">{t("disconnect")}</span>
                  </Button>
                </>
              ) : (
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {t("disconnected")}
                </span>
              )}
            </div>
          </div>

          {/* Messenger Account Card */}
          <div
            data-testid="channel-messenger-card"
            className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-xs">
                <MessageCircle className="size-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">{t("messenger")}</h4>
                {messengerAccount?.status === "active" ? (
                  <p className="text-xs text-muted-foreground">
                    {messengerAccount.displayName || `ID: ${messengerAccount.externalAccountId}`}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("disconnected")}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {messengerAccount?.status === "active" ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                    <CheckCircle2 className="size-3" />
                    <span>{t("connected")}</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="disconnect-messenger-button"
                    onClick={() => handleDisconnect(messengerAccount.id)}
                    disabled={disconnectingId === messengerAccount.id}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    {disconnectingId === messengerAccount.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    <span className="ms-1">{t("disconnect")}</span>
                  </Button>
                </>
              ) : (
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {t("disconnected")}
                </span>
              )}
            </div>
          </div>

          {/* WhatsApp Business Card (Phase 2) */}
          <div
            data-testid="channel-whatsapp-card"
            className="flex flex-col justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 p-4 opacity-75 sm:flex-row sm:items-center"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <MessageCircle className="size-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground/80">{t("whatsapp")}</h4>
                <p className="text-xs text-muted-foreground">{t("whatsappPhase2")}</p>
              </div>
            </div>
            <div>
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {t("whatsappPhase2")}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
