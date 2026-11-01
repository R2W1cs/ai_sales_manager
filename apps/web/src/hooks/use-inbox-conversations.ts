import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

import type { LeadTemperature } from "@/hooks/use-realtime-inbox";
import { apiClient } from "@/lib/api-client";
import type { ConversationSummaryDto, PaginatedConversationsResponse } from "@app/shared";

export interface UseInboxConversationsProps {
  currentBusinessId: string | null;
  activeView: "needs_me" | "all";
  channelFilter?: string;
  temperatureFilter?: LeadTemperature;
  hasPendingOrderFilter?: boolean;
  selectedConversationId: string | null;
  onAutoSelectFirst?: (id: string) => void;
}

export function useInboxConversations({
  currentBusinessId,
  activeView,
  channelFilter,
  temperatureFilter,
  hasPendingOrderFilter,
  selectedConversationId,
  onAutoSelectFirst,
}: UseInboxConversationsProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummaryDto[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(true);

  const fetchConversations = useCallback(async () => {
    if (!currentBusinessId) return;

    const params = new URLSearchParams();
    params.set("view", activeView);
    params.set("sort", "sales_priority");
    if (channelFilter) params.set("channel", channelFilter);
    if (temperatureFilter) params.set("temperature", temperatureFilter);
    if (hasPendingOrderFilter !== undefined) {
      params.set("has_pending_order", String(hasPendingOrderFilter));
    }

    try {
      const res = await apiClient.get<PaginatedConversationsResponse>(
        `/api/v1/conversations?${params.toString()}`,
        {
          headers: { "x-business-id": currentBusinessId },
        },
      );
      setConversations(res.items || []);
      setIsLoadingConversations(false);

      if (!selectedConversationId && res.items?.length > 0 && typeof window !== "undefined") {
        if (window.innerWidth >= 1024) {
          const firstId = res.items[0].id;
          onAutoSelectFirst?.(firstId);
          (router.replace as (href: string) => void)(`/inbox?id=${firstId}`);
        }
      }
    } catch {
      setIsLoadingConversations(false);
    }
  }, [
    currentBusinessId,
    activeView,
    channelFilter,
    temperatureFilter,
    hasPendingOrderFilter,
    selectedConversationId,
    onAutoSelectFirst,
    router,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!currentBusinessId) return;

    queueMicrotask(() => {
      if (!cancelled) setIsLoadingConversations(true);
    });

    const params = new URLSearchParams();
    params.set("view", activeView);
    params.set("sort", "sales_priority");
    if (channelFilter) params.set("channel", channelFilter);
    if (temperatureFilter) params.set("temperature", temperatureFilter);
    if (hasPendingOrderFilter !== undefined) {
      params.set("has_pending_order", String(hasPendingOrderFilter));
    }

    apiClient
      .get<PaginatedConversationsResponse>(`/api/v1/conversations?${params.toString()}`, {
        headers: { "x-business-id": currentBusinessId },
      })
      .then((res) => {
        if (!cancelled) {
          setConversations(res.items || []);
          setIsLoadingConversations(false);

          if (!selectedConversationId && res.items?.length > 0 && typeof window !== "undefined") {
            if (window.innerWidth >= 1024) {
              const firstId = res.items[0].id;
              onAutoSelectFirst?.(firstId);
              (router.replace as (href: string) => void)(`/inbox?id=${firstId}`);
            }
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoadingConversations(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentBusinessId,
    activeView,
    channelFilter,
    temperatureFilter,
    hasPendingOrderFilter,
    selectedConversationId,
    onAutoSelectFirst,
    router,
  ]);

  return {
    conversations,
    setConversations,
    isLoadingConversations,
    fetchConversations,
  };
}
