"use client";

import { Share2, CheckCircle2, MessageCircle, ShieldCheck, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";

import { StepNavigationButtons } from "@/components/onboarding/step-navigation-buttons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";

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

export interface ChannelAccount {
  id: string;
  channel: "instagram" | "messenger" | "whatsapp";
  status: "active" | "disconnected" | "expired";
  displayName?: string;
  externalAccountId: string;
}

interface ChannelCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  channelAccount?: ChannelAccount;
  onConnect: () => void;
  onDisconnect?: () => void;
  isConnecting: boolean;
  connectButtonIcon: React.ReactNode;
  dataSlot: string;
  isQuotaReached?: boolean;
}

function ChannelCard({
  title,
  description,
  icon,
  channelAccount,
  onConnect,
  onDisconnect,
  isConnecting,
  connectButtonIcon,
  dataSlot,
  isQuotaReached,
}: ChannelCardProps): React.ReactElement {
  const tChannels = useTranslations("channels");
  const tOnboarding = useTranslations("onboarding");
  const isActive = channelAccount?.status === "active";

  return (
    <div
      data-slot={dataSlot}
      className="relative flex flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-xs"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {icon}
            <div>
              <h4 className="text-sm font-semibold">{title}</h4>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          {isActive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
              <CheckCircle2 className="size-3" />
              {tChannels("statusActive")}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {tChannels("disconnected")}
            </span>
          )}
        </div>

        {isActive ? (
          <div className="space-y-0.5 rounded-md bg-muted/40 p-2.5 text-xs">
            <p className="font-medium text-foreground">
              {channelAccount.displayName || tChannels("accountTitle", { channel: title })}
            </p>
            <p className="text-[11px] text-muted-foreground">
              ID: {channelAccount.externalAccountId}
            </p>
          </div>
        ) : isQuotaReached ? (
          <div className="space-y-1 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
            <p className="font-medium">{tOnboarding("quotaReachedWarning")}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{tOnboarding("metaChannelsDesc")}</p>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-4">
        {isActive ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 text-xs"
              onClick={onConnect}
              loading={isConnecting}
              data-slot="btn-connect-meta"
            >
              {connectButtonIcon}
              <span>{tChannels("reconnect")}</span>
            </Button>
            {onDisconnect && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onDisconnect}
                disabled={isConnecting}
                data-slot="btn-disconnect-channel"
              >
                <Trash2 className="size-3.5" />
                <span>{tOnboarding("disconnect")}</span>
              </Button>
            )}
          </div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            className="w-full gap-2 text-xs"
            onClick={onConnect}
            loading={isConnecting}
            data-slot="btn-connect-meta"
          >
            {connectButtonIcon}
            <span>
              {isConnecting
                ? tOnboarding("connecting")
                : tChannels("connectChannel", { channel: title })}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}

export interface StepChannelConnectProps {
  businessId: string;
  onNext: () => void;
  onPrev: () => void;
}

interface ChannelQuotaBadgeProps {
  activeCount: number;
  hasActiveChannel: boolean;
}

function ChannelQuotaBadge({
  activeCount,
  hasActiveChannel,
}: ChannelQuotaBadgeProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3.5 py-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">Starter</span>
        <span className="text-muted-foreground">•</span>
        <span className="text-muted-foreground">{activeCount} / 1</span>
      </div>
      {hasActiveChannel ? (
        <span className="font-medium text-success">{tOnboarding("channelConnected")}</span>
      ) : (
        <span className="text-muted-foreground">{tOnboarding("metaChannelsDesc")}</span>
      )}
    </div>
  );
}

interface ChannelCardsGridProps {
  instagramChannel?: ChannelAccount;
  messengerChannel?: ChannelAccount;
  isQuotaReached: boolean;
  isConnecting: boolean;
  onConnect: (channel: "instagram" | "messenger") => void;
  onDisconnect: (id: string) => void;
}

function ChannelCardsGrid({
  instagramChannel,
  messengerChannel,
  isQuotaReached,
  isConnecting,
  onConnect,
  onDisconnect,
}: ChannelCardsGridProps): React.ReactElement {
  const tChannels = useTranslations("channels");
  const tOnboarding = useTranslations("onboarding");

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <ChannelCard
        title={tChannels("instagram")}
        description={tOnboarding("connectInstagramDesc")}
        icon={
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary shadow-xs">
            <InstagramIcon className="size-5" />
          </div>
        }
        channelAccount={instagramChannel}
        onConnect={() => onConnect("instagram")}
        onDisconnect={
          instagramChannel?.status === "active"
            ? () => onDisconnect(instagramChannel.id)
            : undefined
        }
        isConnecting={isConnecting}
        connectButtonIcon={<InstagramIcon className="size-3.5" />}
        dataSlot="channel-card-instagram"
        isQuotaReached={isQuotaReached && instagramChannel?.status !== "active"}
      />

      <ChannelCard
        title={tChannels("messenger")}
        description={tOnboarding("connectMessengerDesc")}
        icon={
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary shadow-xs">
            <MessageCircle className="size-5" />
          </div>
        }
        channelAccount={messengerChannel}
        onConnect={() => onConnect("messenger")}
        onDisconnect={
          messengerChannel?.status === "active"
            ? () => onDisconnect(messengerChannel.id)
            : undefined
        }
        isConnecting={isConnecting}
        connectButtonIcon={<MessageCircle className="size-3.5" />}
        dataSlot="channel-card-messenger"
        isQuotaReached={isQuotaReached && messengerChannel?.status !== "active"}
      />
    </div>
  );
}

function useMetaOAuthListener(
  businessId: string,
  loadChannels: (bizId?: string) => void,
  setErrorMessage: (msg: string | null) => void,
  setIsConnecting: (connecting: boolean) => void,
) {
  useEffect(() => {
    let mounted = true;
    if (typeof window === "undefined" || !businessId) return undefined;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");
    const meta = urlParams.get("meta");
    const reason = urlParams.get("reason");
    const channelParam = urlParams.get("channel") as "messenger" | "instagram" | null;

    if (meta === "error") {
      queueMicrotask(() => {
        setErrorMessage(
          reason
            ? decodeURIComponent(reason)
            : "La connexion Meta OAuth a échoué. Veuillez vérifier vos autorisations et réessayer.",
        );
      });
      const newUrl = window.location.pathname + "?step=2";
      window.history.replaceState(null, "", newUrl);
    } else if (meta === "ok") {
      const newUrl = window.location.pathname + "?step=2";
      window.history.replaceState(null, "", newUrl);
    } else if (code && state) {
      queueMicrotask(() => {
        setIsConnecting(true);
      });
      apiClient
        .post(
          "/api/v1/integrations/meta/callback",
          {
            code,
            state,
            channel: channelParam || undefined,
            businessId,
          },
          {
            headers: { "x-business-id": businessId },
          },
        )
        .then(() => {
          if (!mounted) return;
          loadChannels(businessId);
          const newUrl = window.location.pathname + "?step=2";
          window.history.replaceState(null, "", newUrl);
        })
        .catch((err: unknown) => {
          if (!mounted) return;
          const msg =
            err instanceof Error ? err.message : "Erreur lors de la validation du code Meta OAuth.";
          setErrorMessage(msg);
        })
        .finally(() => {
          if (mounted) setIsConnecting(false);
        });
    }

    return () => {
      mounted = false;
    };
  }, [businessId, loadChannels, setErrorMessage, setIsConnecting]);
}

export function StepChannelConnect({
  businessId,
  onNext,
  onPrev,
}: StepChannelConnectProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const [channels, setChannels] = useState<ChannelAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadChannels = React.useCallback(
    (bizId: string = businessId) => {
      if (!bizId) return;
      setIsLoading(true);
      setErrorMessage(null);
      apiClient
        .get<ChannelAccount[]>("/api/v1/integrations/channels", {
          headers: { "x-business-id": bizId },
        })
        .then((data) => {
          setChannels(Array.isArray(data) ? data : []);
        })
        .catch(() => {})
        .finally(() => {
          setIsLoading(false);
        });
    },
    [businessId],
  );

  useEffect(() => {
    let mounted = true;
    if (!businessId) return undefined;

    apiClient
      .get<ChannelAccount[]>("/api/v1/integrations/channels", {
        headers: { "x-business-id": businessId },
      })
      .then((data) => {
        if (!mounted) return;
        setChannels(Array.isArray(data) ? data : []);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [businessId]);

  useMetaOAuthListener(businessId, loadChannels, setErrorMessage, setIsConnecting);

  const activeChannels = channels.filter((c) => c.status === "active");
  const hasActiveChannel = activeChannels.length > 0;
  const isQuotaReached = activeChannels.length >= 1;

  const instagramChannel =
    channels.find((c) => c.channel === "instagram" && c.status === "active") ||
    channels.find((c) => c.channel === "instagram");
  const messengerChannel =
    channels.find((c) => c.channel === "messenger" && c.status === "active") ||
    channels.find((c) => c.channel === "messenger");

  function handleDisconnect(channelAccountId: string) {
    setIsConnecting(true);
    setErrorMessage(null);
    apiClient
      .delete(`/api/v1/integrations/channel-accounts/${channelAccountId}`, {
        headers: { "x-business-id": businessId },
      })
      .then(() => {
        loadChannels(businessId);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Impossible de déconnecter le canal.";
        setErrorMessage(msg);
      })
      .finally(() => {
        setIsConnecting(false);
      });
  }

  function handleMetaConnect(channel?: "instagram" | "messenger") {
    setErrorMessage(null);

    const isTargetActive = channel
      ? channels.some((c) => c.channel === channel && c.status === "active")
      : false;
    if (isQuotaReached && !isTargetActive) {
      setErrorMessage(
        `Votre forfait Starter inclut 1 canal actif. Pour activer ${
          channel === "instagram" ? "Instagram Direct" : "Facebook Messenger"
        }, veuillez d'abord déconnecter le canal actif ("Déconnecter"), ou passer au forfait Growth.`,
      );
      return;
    }

    setIsConnecting(true);

    const returnUrl =
      typeof window !== "undefined" ? `${window.location.origin}/onboarding?step=2` : undefined;

    apiClient
      .post<{ authorizationUrl: string; state: string }>(
        "/api/v1/integrations/meta/connect",
        {
          channel,
          returnUrl,
        },
        {
          headers: businessId ? { "x-business-id": businessId } : undefined,
        },
      )
      .then((res) => {
        if (res?.authorizationUrl && typeof window !== "undefined") {
          window.location.href = res.authorizationUrl;
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : tOnboarding("oauthInitError");
        setErrorMessage(msg);
      })
      .finally(() => {
        setIsConnecting(false);
      });
  }

  return (
    <div data-slot="step-channel-connect" className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <Share2 className="size-5" />
              <CardTitle>{tOnboarding("metaChannelsTitle")}</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadChannels()}
              loading={isLoading}
              className="gap-1 text-xs"
            >
              <RefreshCw className="size-3.5" />
              <span>{tCommon("refresh")}</span>
            </Button>
          </div>
          <CardDescription>{tOnboarding("metaChannelsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChannelQuotaBadge
            activeCount={activeChannels.length}
            hasActiveChannel={hasActiveChannel}
          />

          {errorMessage && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              {errorMessage}
            </div>
          )}

          <ChannelCardsGrid
            instagramChannel={instagramChannel}
            messengerChannel={messengerChannel}
            isQuotaReached={isQuotaReached}
            isConnecting={isConnecting}
            onConnect={handleMetaConnect}
            onDisconnect={handleDisconnect}
          />

          <div className="flex items-center gap-2 rounded-md bg-primary/5 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-primary" />
            <span>{tCommon("localSupport")}</span>
          </div>

          <StepNavigationButtons onPrev={onPrev} onNext={onNext} />
        </CardContent>
      </Card>
    </div>
  );
}
