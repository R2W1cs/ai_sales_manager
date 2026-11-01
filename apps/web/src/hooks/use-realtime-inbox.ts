"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { apiClient, ApiClientError } from "@/lib/api-client";
import {
  REALTIME_EVENTS,
  type MessageDto,
  type ConversationStatus,
  type HandoffPriority,
  type CreateDraftOrderDto,
} from "@app/shared";

export type LeadTemperature = "hot" | "warm" | "cold";

export type SocketConnectionStatus = "connecting" | "connected" | "disconnected";

export interface UseRealtimeInboxOptions {
  businessId: string | null;
  activeConversationId: string | null;
  onNewMessage?: (message: MessageDto) => void;
  onMessageUpdated?: (message: MessageDto) => void;
  onLeadScoreUpdated?: (data: {
    conversationId: string;
    score: number;
    temperature: LeadTemperature;
  }) => void;
  onConversationStatusChanged?: (data: {
    conversationId: string;
    status: ConversationStatus;
    handoffPriority?: HandoffPriority | null;
    escalationReason?: string | null;
  }) => void;
  onSuggestionReceived?: (data: { conversationId: string; suggestion: unknown }) => void;
  onOrderUpdated?: (data: { conversationId?: string | null; orderId: string }) => void;
}

export interface RealtimeInboxState {
  socketStatus: SocketConnectionStatus;
  messages: MessageDto[];
  isLoadingMessages: boolean;
  isSending: boolean;
  activeSuggestion: string | null;
  isSuggesting: boolean;
  error: string | null;
  sendMessage: (content: string, attachments?: unknown[]) => Promise<MessageDto>;
  approveDraft: (messageId: string, editedContent?: string) => Promise<MessageDto>;
  rejectDraft: (messageId: string) => Promise<void>;
  retryMessage: (messageId: string) => Promise<MessageDto>;
  takeover: () => Promise<void>;
  resumeAi: () => Promise<void>;
  requestSuggestion: () => Promise<void>;
  clearSuggestion: () => void;
  confirmOrder: (paymentCompleted?: boolean) => Promise<unknown>;
  createDraftOrder: (data: CreateDraftOrderDto) => Promise<unknown>;
  cancelOrder: (orderId: string) => Promise<void>;
  closeConversation: () => Promise<void>;
  refreshMessages: () => Promise<void>;
}

export function useRealtimeInbox({
  businessId,
  activeConversationId,
  onNewMessage,
  onMessageUpdated,
  onLeadScoreUpdated,
  onConversationStatusChanged,
  onSuggestionReceived,
  onOrderUpdated,
}: UseRealtimeInboxOptions): RealtimeInboxState {
  const [socketStatus, setSocketStatus] = useState<SocketConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [activeSuggestion, setActiveSuggestion] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  const lastMessageIdRef = useRef<string | null>(null);
  const isInitialConnectRef = useRef<boolean>(true);

  // 1. Fetch messages for active conversation
  const fetchMessages = useCallback((convId: string, bId: string, afterId?: string) => {
    let mounted = true;
    if (!afterId) {
      queueMicrotask(() => {
        if (mounted) {
          setIsLoadingMessages(true);
          setError(null);
        }
      });
    }

    const url = afterId
      ? `/api/v1/conversations/${convId}/messages?after=${encodeURIComponent(afterId)}`
      : `/api/v1/conversations/${convId}/messages`;

    apiClient
      .get<{ items: MessageDto[] }>(url, {
        headers: { "x-business-id": bId },
      })
      .then((res) => {
        if (mounted) {
          if (afterId) {
            // Reconnect backfill: merge new items without dropping existing
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id));
              const newItems = (res.items || []).filter((m) => !existingIds.has(m.id));
              return [...prev, ...newItems].sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
              );
            });
          } else {
            const sorted = [...(res.items || [])].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
            setMessages(sorted);
            setIsLoadingMessages(false);
          }
        }
      })
      .catch((err) => {
        if (mounted) {
          const msg =
            err instanceof ApiClientError ? err.message : "Erreur lors du chargement des messages";
          setError(msg);
          setIsLoadingMessages(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const refreshMessages = useCallback(async () => {
    if (activeConversationId && businessId) {
      fetchMessages(activeConversationId, businessId);
    }
  }, [activeConversationId, businessId, fetchMessages]);

  // When active conversation changes, load messages & clear suggestion
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
    lastMessageIdRef.current = null;
    if (activeConversationId && businessId) {
      return fetchMessages(activeConversationId, businessId);
    }
    return undefined;
  }, [activeConversationId, businessId, fetchMessages]);

  // Keep lastMessageIdRef in sync for reconnect backfill without side-effects in updaters
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && !last.id.startsWith("opt-")) {
      lastMessageIdRef.current = last.id;
    }
  }, [messages]);

  // 2. Initialize Socket.IO connection
  useEffect(() => {
    if (!businessId || typeof window === "undefined") {
      return undefined;
    }

    const socketUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    const socket = io(socketUrl, {
      path: "/socket.io",
      auth: { businessId },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    const handleConnect = () => {
      setSocketStatus("connected");
      // On connect or reconnect, join active conversation room if open
      if (activeConversationIdRef.current) {
        socket.emit(REALTIME_EVENTS.THREAD_OPEN, {
          conversationId: activeConversationIdRef.current,
        });
        // Reconnect backfill: only fetch on reconnect (not initial mount) to catch up missed messages
        if (!isInitialConnectRef.current && lastMessageIdRef.current) {
          void fetchMessages(activeConversationIdRef.current, businessId, lastMessageIdRef.current);
        }
      }
      isInitialConnectRef.current = false;
    };

    const handleDisconnect = () => {
      setSocketStatus("disconnected");
    };

    const handleConnectError = () => {
      setSocketStatus("disconnected");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    // Realtime message incoming
    const handleNewMessage = (payload: { conversationId: string; message: MessageDto }) => {
      if (!payload?.message) return;
      const msg = payload.message;

      // Notify parent list regardless of active thread
      onNewMessage?.(msg);

      // If matches active thread, append or replace optimistic message
      if (payload.conversationId === activeConversationIdRef.current) {
        setMessages((prev) => {
          // Check if message already exists by id
          const existingIndex = prev.findIndex((m) => m.id === msg.id);
          if (existingIndex >= 0) {
            const next = [...prev];
            next[existingIndex] = msg;
            return next;
          }

          // Check if matches an optimistic message by temporary id
          const optimisticIndex = prev.findIndex(
            (m) =>
              m.id.startsWith("opt-") &&
              m.content === msg.content &&
              m.senderType === msg.senderType,
          );
          if (optimisticIndex >= 0) {
            const next = [...prev];
            next[optimisticIndex] = msg;
            return next;
          }

          return [...prev, msg];
        });
      }
    };

    // Realtime message updated (e.g. status changes, draft edited)
    const handleMessageUpdated = (payload: { conversationId: string; message: MessageDto }) => {
      if (!payload?.message) return;
      const msg = payload.message;
      onMessageUpdated?.(msg);

      if (payload.conversationId === activeConversationIdRef.current) {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
      }
    };

    // Realtime lead score update
    const handleLeadScore = (payload: {
      conversationId: string;
      score: number;
      temperature: LeadTemperature;
    }) => {
      if (payload?.conversationId) {
        onLeadScoreUpdated?.(payload);
      }
    };

    // Realtime conversation status changes (takeover, handoff, etc.)
    const handleConversationStatus = (payload: {
      conversationId: string;
      status: ConversationStatus;
      handoffPriority?: HandoffPriority | null;
      escalationReason?: string | null;
    }) => {
      if (payload?.conversationId) {
        onConversationStatusChanged?.(payload);
      }
    };

    // Realtime on-demand suggestion
    const handleSuggestion = (payload: { conversationId: string; suggestion: unknown }) => {
      if (payload?.conversationId === activeConversationIdRef.current) {
        setIsSuggesting(false);
        const suggestionText =
          typeof payload.suggestion === "string"
            ? payload.suggestion
            : (payload.suggestion as { content?: string })?.content ||
              JSON.stringify(payload.suggestion);
        setActiveSuggestion(suggestionText);
        onSuggestionReceived?.(payload);
      }
    };

    // Realtime order updates
    const handleOrderConfirmed = (payload: { conversationId?: string | null; orderId: string }) => {
      onOrderUpdated?.(payload);
    };

    const handleOrderCancelled = (payload: { conversationId?: string | null; orderId: string }) => {
      onOrderUpdated?.(payload);
    };

    socket.on(REALTIME_EVENTS.MESSAGE_NEW, handleNewMessage);
    socket.on(REALTIME_EVENTS.MESSAGE_UPDATED, handleMessageUpdated);
    socket.on(REALTIME_EVENTS.LEAD_SCORE_UPDATED, handleLeadScore);
    socket.on(REALTIME_EVENTS.CONVERSATION_STATUS, handleConversationStatus);
    socket.on(REALTIME_EVENTS.CONVERSATION_STATUS_CHANGED, handleConversationStatus);
    socket.on(REALTIME_EVENTS.CONVERSATION_SUGGESTION, handleSuggestion);
    socket.on(REALTIME_EVENTS.ORDER_CONFIRMED, handleOrderConfirmed);
    socket.on(REALTIME_EVENTS.ORDER_CANCELLED, handleOrderCancelled);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off(REALTIME_EVENTS.MESSAGE_NEW, handleNewMessage);
      socket.off(REALTIME_EVENTS.MESSAGE_UPDATED, handleMessageUpdated);
      socket.off(REALTIME_EVENTS.LEAD_SCORE_UPDATED, handleLeadScore);
      socket.off(REALTIME_EVENTS.CONVERSATION_STATUS, handleConversationStatus);
      socket.off(REALTIME_EVENTS.CONVERSATION_STATUS_CHANGED, handleConversationStatus);
      socket.off(REALTIME_EVENTS.CONVERSATION_SUGGESTION, handleSuggestion);
      socket.off(REALTIME_EVENTS.ORDER_CONFIRMED, handleOrderConfirmed);
      socket.off(REALTIME_EVENTS.ORDER_CANCELLED, handleOrderCancelled);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    businessId,
    fetchMessages,
    onNewMessage,
    onMessageUpdated,
    onLeadScoreUpdated,
    onConversationStatusChanged,
    onSuggestionReceived,
    onOrderUpdated,
  ]);

  // 3. Thread open / close room emit when conversation changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeConversationId) return undefined;

    socket.emit(REALTIME_EVENTS.THREAD_OPEN, { conversationId: activeConversationId });

    return () => {
      socket.emit(REALTIME_EVENTS.THREAD_CLOSE, { conversationId: activeConversationId });
    };
  }, [activeConversationId]);

  // 4. Send Message with Optimistic Update
  const sendMessage = useCallback(
    async (content: string, attachments?: unknown[]): Promise<MessageDto> => {
      if (!activeConversationId || !businessId) {
        throw new Error("Aucune conversation active ou entreprise sélectionnée");
      }

      setIsSending(true);
      setError(null);

      // Generate optimistic message
      const tempId = `opt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const optimisticMessage: MessageDto = {
        id: tempId,
        businessId,
        conversationId: activeConversationId,
        direction: "outbound",
        senderType: "human",
        content,
        contentType: "text",
        deliveryStatus: "queued",
        createdAt: new Date().toISOString(),
        attachments: [],
      };

      // Draft vs Human Send Race Resolution: Sending manual human message automatically dismisses pending draft card
      setMessages((prev) => [
        ...prev.filter((m) => m.deliveryStatus !== "draft"),
        optimisticMessage,
      ]);

      try {
        const idempotencyKey = crypto.randomUUID();
        const serverMessage = await apiClient.post<MessageDto>(
          `/api/v1/conversations/${activeConversationId}/messages`,
          { content, attachments },
          {
            headers: {
              "x-business-id": businessId,
              "idempotency-key": idempotencyKey,
            },
          },
        );

        // Replace optimistic message with confirmed server message
        setMessages((prev) => prev.map((m) => (m.id === tempId ? serverMessage : m)));
        setIsSending(false);
        return serverMessage;
      } catch (err) {
        setIsSending(false);
        // Rollback or mark as failed for retry
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, deliveryStatus: "failed" } : m)),
        );
        const errorMsg = err instanceof ApiClientError ? err.message : "Échec d'envoi du message";
        setError(errorMsg);
        throw err;
      }
    },
    [activeConversationId, businessId],
  );

  // 5. Approve Draft Message
  const approveDraft = useCallback(
    async (messageId: string, editedContent?: string): Promise<MessageDto> => {
      if (!activeConversationId || !businessId) {
        throw new Error("Aucune conversation active");
      }

      try {
        const approvedMessage = await apiClient.post<MessageDto>(
          `/api/v1/conversations/${activeConversationId}/messages/${messageId}/approve`,
          editedContent ? { content: editedContent } : {},
          {
            headers: { "x-business-id": businessId },
          },
        );

        // Update local message list
        setMessages((prev) => prev.map((m) => (m.id === messageId ? approvedMessage : m)));

        return approvedMessage;
      } catch (err) {
        const errorMsg =
          err instanceof ApiClientError ? err.message : "Échec de validation du brouillon";
        setError(errorMsg);
        throw err;
      }
    },
    [activeConversationId, businessId],
  );

  // 5b. Reject / Dismiss Draft Message
  const rejectDraft = useCallback(async (messageId: string): Promise<void> => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  // 6. Retry Failed Message
  const retryMessage = useCallback(
    async (messageId: string): Promise<MessageDto> => {
      if (!activeConversationId || !businessId) {
        throw new Error("Aucune conversation active");
      }

      try {
        const retriedMessage = await apiClient.post<MessageDto>(
          `/api/v1/conversations/${activeConversationId}/messages/${messageId}/retry`,
          {},
          {
            headers: { "x-business-id": businessId },
          },
        );

        setMessages((prev) => prev.map((m) => (m.id === messageId ? retriedMessage : m)));

        return retriedMessage;
      } catch (err) {
        const errorMsg = err instanceof ApiClientError ? err.message : "Échec du renvoi du message";
        setError(errorMsg);
        throw err;
      }
    },
    [activeConversationId, businessId],
  );

  // 7. Human Takeover
  const takeover = useCallback(async (): Promise<void> => {
    if (!activeConversationId || !businessId) return;

    try {
      await apiClient.post(
        `/api/v1/conversations/${activeConversationId}/takeover`,
        {},
        {
          headers: { "x-business-id": businessId },
        },
      );
    } catch (err) {
      const errorMsg = err instanceof ApiClientError ? err.message : "Échec de la prise en main";
      setError(errorMsg);
      throw err;
    }
  }, [activeConversationId, businessId]);

  // 8. Resume AI
  const resumeAi = useCallback(async (): Promise<void> => {
    if (!activeConversationId || !businessId) return;

    try {
      await apiClient.post(
        `/api/v1/conversations/${activeConversationId}/resume-ai`,
        {},
        {
          headers: { "x-business-id": businessId },
        },
      );
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setError(
          "Une commande en attente bloque la réactivation de l'IA. Veuillez la confirmer ou l'annuler.",
        );
      } else {
        setError(err instanceof ApiClientError ? err.message : "Échec de réactivation de l'IA");
      }
      throw err;
    }
  }, [activeConversationId, businessId]);

  // 9. Request on-demand AI suggestion
  const requestSuggestion = useCallback(async (): Promise<void> => {
    if (!activeConversationId || !businessId) return;

    setIsSuggesting(true);
    setError(null);
    try {
      await apiClient.post(
        `/api/v1/conversations/${activeConversationId}/suggest`,
        {},
        {
          headers: { "x-business-id": businessId },
        },
      );
      // Wait for socket event `conversation.suggestion` or fallback timeout
    } catch (err) {
      setIsSuggesting(false);
      if (err instanceof ApiClientError && err.status === 409) {
        setError(
          "La suggestion IA est indisponible pour les réclamations ou demandes de remboursement.",
        );
      } else if (err instanceof ApiClientError && err.status === 403) {
        setError("Quota IA dépassé pour cette période.");
      } else {
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Erreur lors de la génération de suggestion",
        );
      }
      throw err;
    }
  }, [activeConversationId, businessId]);

  const clearSuggestion = useCallback(() => {
    setActiveSuggestion(null);
  }, []);

  // 10. Confirm Order
  const confirmOrder = useCallback(
    async (paymentCompleted = false): Promise<unknown> => {
      if (!activeConversationId || !businessId) return undefined;

      try {
        const res = await apiClient.post(
          `/api/v1/conversations/${activeConversationId}/confirm-order`,
          paymentCompleted ? { paymentStatus: "COMPLETED" } : {},
          {
            headers: { "x-business-id": businessId },
          },
        );
        return res;
      } catch (err) {
        const errorMsg =
          err instanceof ApiClientError ? err.message : "Échec de confirmation de commande";
        setError(errorMsg);
        throw err;
      }
    },
    [activeConversationId, businessId],
  );

  // 11. Create Draft Order from Drawer
  const createDraftOrder = useCallback(
    async (data: CreateDraftOrderDto): Promise<unknown> => {
      if (!activeConversationId || !businessId) return undefined;

      try {
        const res = await apiClient.post(
          `/api/v1/conversations/${activeConversationId}/orders/draft`,
          data,
          {
            headers: { "x-business-id": businessId },
          },
        );
        return res;
      } catch (err) {
        const errorMsg =
          err instanceof ApiClientError ? err.message : "Échec de création de la commande";
        setError(errorMsg);
        throw err;
      }
    },
    [activeConversationId, businessId],
  );

  // 12. Cancel Order
  const cancelOrder = useCallback(
    async (orderId: string): Promise<void> => {
      if (!businessId) return;

      try {
        await apiClient.patch(
          `/api/v1/orders/${orderId}/status`,
          { status: "CANCELLED" },
          {
            headers: { "x-business-id": businessId },
          },
        );
      } catch (err) {
        const errorMsg =
          err instanceof ApiClientError ? err.message : "Échec de l'annulation de la commande";
        setError(errorMsg);
        throw err;
      }
    },
    [businessId],
  );

  // 13. Close Conversation
  const closeConversation = useCallback(async (): Promise<void> => {
    if (!activeConversationId || !businessId) return;

    try {
      await apiClient.post(
        `/api/v1/conversations/${activeConversationId}/close`,
        {},
        {
          headers: { "x-business-id": businessId },
        },
      );
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setError("Impossible de clôturer: une commande en attente doit être traitée en priorité.");
      } else {
        setError(err instanceof ApiClientError ? err.message : "Échec de clôture de conversation");
      }
      throw err;
    }
  }, [activeConversationId, businessId]);

  return {
    socketStatus,
    messages,
    isLoadingMessages,
    isSending,
    activeSuggestion,
    isSuggesting,
    error,
    sendMessage,
    approveDraft,
    rejectDraft,
    retryMessage,
    takeover,
    resumeAi,
    requestSuggestion,
    clearSuggestion,
    confirmOrder,
    createDraftOrder,
    cancelOrder,
    closeConversation,
    refreshMessages,
  };
}
