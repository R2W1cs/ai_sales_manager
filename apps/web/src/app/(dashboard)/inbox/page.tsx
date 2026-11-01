"use client";

import { useSearchParams, useRouter } from "next/navigation";
import React, { Suspense, useEffect, useState } from "react";

import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationThread } from "@/components/inbox/conversation-thread";
import { OrderDrawer } from "@/components/inbox/order-drawer";
import { useTenant } from "@/components/layout/tenant-context";
import { useInboxConversations } from "@/hooks/use-inbox-conversations";
import type { LeadTemperature } from "@/hooks/use-realtime-inbox";
import { useRealtimeInbox } from "@/hooks/use-realtime-inbox";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ConversationSummaryDto, MessageDto } from "@app/shared";

function InboxView(): React.ReactElement {
  const { currentBusinessId, switchBusiness } = useTenant();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(() =>
    searchParams.get("id"),
  );

  // Filters
  const [activeView, setActiveView] = useState<"needs_me" | "all">("needs_me");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<string | undefined>(undefined);
  const [temperatureFilter, setTemperatureFilter] = useState<LeadTemperature | undefined>(
    undefined,
  );
  const [hasPendingOrderFilter, setHasPendingOrderFilter] = useState<boolean | undefined>(
    undefined,
  );

  // Pane 3 (Details/Order drawer) toggle
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(true);

  // Sync selected conversation from URL params
  useEffect(() => {
    const urlId = searchParams.get("id");
    if (urlId && urlId !== selectedConversationId) {
      queueMicrotask(() => {
        setSelectedConversationId(urlId);
      });
    }
  }, [searchParams, selectedConversationId]);

  // Sync business context from URL params if specified and different from active workspace
  useEffect(() => {
    const urlBusinessId = searchParams.get("businessId");
    if (urlBusinessId && urlBusinessId !== currentBusinessId) {
      queueMicrotask(() => {
        switchBusiness(urlBusinessId);
      });
    }
  }, [searchParams, currentBusinessId, switchBusiness]);

  const { conversations, setConversations, isLoadingConversations, fetchConversations } =
    useInboxConversations({
      currentBusinessId,
      activeView,
      channelFilter,
      temperatureFilter,
      hasPendingOrderFilter,
      selectedConversationId,
      onAutoSelectFirst: (id) => setSelectedConversationId(id),
    });

  // Currently selected conversation object
  const activeConversation = conversations.find((c) => c.id === selectedConversationId) || null;

  // Hook up realtime updates
  const realtime = useRealtimeInbox({
    businessId: currentBusinessId,
    activeConversationId: selectedConversationId,
    onNewMessage: (msg: MessageDto) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === msg.conversationId) {
            return {
              ...c,
              lastMessagePreview: msg.content,
              lastMessageAt: msg.createdAt,
              unread: msg.conversationId !== selectedConversationId,
            };
          }
          return c;
        }),
      );
    },
    onConversationStatusChanged: ({ conversationId, status }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                status,
                aiEnabled: status !== "HUMAN_HANDLING",
              }
            : c,
        ),
      );
    },
    onOrderUpdated: ({ conversationId }) => {
      if (conversationId) {
        void fetchConversations();
      }
    },
  });

  // Mark conversation read upon selection
  const handleSelectConversation = async (conv: ConversationSummaryDto) => {
    setSelectedConversationId(conv.id);
    (router.replace as (href: string) => void)(`/inbox?id=${conv.id}`);

    // Optimistically clear unread badge
    setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, unread: false } : c)));

    // Call POST /conversations/:id/read
    if (currentBusinessId && conv.unread) {
      try {
        await apiClient.post(
          `/api/v1/conversations/${conv.id}/read`,
          {},
          {
            headers: { "x-business-id": currentBusinessId },
          },
        );
      } catch {
        // Ignored
      }
    }
  };

  // Filter conversations locally for search query
  const filteredConversations = searchQuery.trim()
    ? conversations.filter((c) => {
        const q = searchQuery.toLowerCase();
        return (
          c.customer.name?.toLowerCase().includes(q) ||
          c.customer.phone?.includes(q) ||
          c.lastMessagePreview?.toLowerCase().includes(q)
        );
      })
    : conversations;

  return (
    <div
      data-slot="inbox-command-center"
      className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background"
    >
      {/* PANE 1: Conversation Triage List */}
      <div
        className={cn(
          "h-full w-full shrink-0 lg:w-80 xl:w-[28%] xl:max-w-90 xl:min-w-70",
          selectedConversationId ? "hidden lg:flex" : "flex",
        )}
      >
        <ConversationList
          conversations={filteredConversations}
          selectedConversationId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
          activeView={activeView}
          onChangeView={setActiveView}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          channelFilter={channelFilter}
          onChannelFilterChange={setChannelFilter}
          temperatureFilter={temperatureFilter}
          onTemperatureFilterChange={setTemperatureFilter}
          hasPendingOrderFilter={hasPendingOrderFilter}
          onHasPendingOrderFilterChange={setHasPendingOrderFilter}
          isLoading={isLoadingConversations}
        />
      </div>

      {/* PANE 2: Chat Transcript & Takeover System */}
      <div
        className={cn(
          "h-full min-w-0 flex-1 flex-col",
          selectedConversationId ? "flex" : "hidden lg:flex",
        )}
      >
        <ConversationThread
          conversation={activeConversation}
          businessId={currentBusinessId || ""}
          messages={realtime.messages}
          isLoadingMessages={realtime.isLoadingMessages}
          isSending={realtime.isSending}
          activeSuggestion={realtime.activeSuggestion}
          isSuggesting={realtime.isSuggesting}
          onSendMessage={realtime.sendMessage}
          onApproveDraft={realtime.approveDraft}
          onRejectDraft={realtime.rejectDraft}
          onRetryMessage={realtime.retryMessage}
          onTakeover={async () => {
            await realtime.takeover();
            if (selectedConversationId) {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === selectedConversationId
                    ? { ...c, status: "HUMAN_HANDLING", aiEnabled: false }
                    : c,
                ),
              );
            }
          }}
          onResumeAi={async () => {
            await realtime.resumeAi();
            if (selectedConversationId) {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === selectedConversationId
                    ? { ...c, status: "AI_ACTIVE", aiEnabled: true }
                    : c,
                ),
              );
            }
          }}
          onRequestSuggestion={realtime.requestSuggestion}
          onClearSuggestion={realtime.clearSuggestion}
          onCloseConversation={async () => {
            await realtime.closeConversation();
            setSelectedConversationId(null);
            void fetchConversations();
          }}
          onToggleDetailsPane={() => setIsDetailsOpen((prev) => !prev)}
          onBackToList={() => setSelectedConversationId(null)}
          externalError={realtime.error}
        />
      </div>

      {/* PANE 3: Customer Context & Order Action Deck */}
      {activeConversation && (
        <OrderDrawer
          conversation={activeConversation}
          businessId={currentBusinessId || ""}
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          onConfirmOrder={async (paymentCompleted) => {
            await realtime.confirmOrder(paymentCompleted);
            void fetchConversations();
          }}
          onCreateDraftOrder={async (data) => {
            await realtime.createDraftOrder(data);
            void fetchConversations();
          }}
          onCancelOrder={async (orderId) => {
            await realtime.cancelOrder(orderId);
            void fetchConversations();
          }}
        />
      )}
    </div>
  );
}

export default function InboxPage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <InboxView />
    </Suspense>
  );
}
