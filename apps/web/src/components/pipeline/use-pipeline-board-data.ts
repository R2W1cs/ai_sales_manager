"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { apiClient, ApiClientError } from "@/lib/api-client";
import { REALTIME_EVENTS, type PipelineResponseDto } from "@app/shared";

export interface UsePipelineBoardDataResult {
  pipeline: PipelineResponseDto | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  isRealtimeActive: boolean;
  refreshData: (manual?: boolean) => void;
}

export function usePipelineBoardData(currentBusinessId: string | null): UsePipelineBoardDataResult {
  const t = useTranslations("pipeline");

  const [pipeline, setPipeline] = useState<PipelineResponseDto | null>(null);
  const [loadedBusinessId, setLoadedBusinessId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isRealtimeActive, setIsRealtimeActive] = useState<boolean>(false);

  const socketRef = useRef<Socket | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<number>(0);
  const currentBusinessIdRef = useRef(currentBusinessId);

  useEffect(() => {
    currentBusinessIdRef.current = currentBusinessId;
  }, [currentBusinessId]);

  const fetchPipeline = useCallback(
    (targetBusinessId: string, signal?: AbortSignal) => {
      const requestId = ++activeRequestIdRef.current;

      return apiClient
        .get<PipelineResponseDto>("/api/v1/pipeline", {
          headers: { "x-business-id": targetBusinessId },
          signal,
        })
        .then((data) => {
          if (
            signal?.aborted ||
            activeRequestIdRef.current !== requestId ||
            currentBusinessIdRef.current !== targetBusinessId
          ) {
            return;
          }
          setPipeline(data);
          setLoadedBusinessId(targetBusinessId);
          setError(null);
        })
        .catch((err) => {
          if (
            signal?.aborted ||
            activeRequestIdRef.current !== requestId ||
            currentBusinessIdRef.current !== targetBusinessId ||
            (err instanceof Error && err.name === "AbortError")
          ) {
            return;
          }
          const message = err instanceof ApiClientError ? err.message : t("fetchError");
          setError(message);
        })
        .finally(() => {
          if (
            !signal?.aborted &&
            activeRequestIdRef.current === requestId &&
            currentBusinessIdRef.current === targetBusinessId
          ) {
            setIsLoading(false);
            setIsRefreshing(false);
          }
        });
    },
    [t],
  );

  const refreshData = useCallback(
    (manual?: boolean) => {
      if (!currentBusinessId) return;
      if (manual) {
        setIsRefreshing(true);
      }
      setIsLoading(true);
      setError(null);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      activeRequestIdRef.current += 1;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      void fetchPipeline(currentBusinessId, controller.signal);
    },
    [currentBusinessId, fetchPipeline],
  );

  const triggerDebouncedRefetch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      const activeBusinessId = currentBusinessIdRef.current;
      if (!activeBusinessId) return;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      void fetchPipeline(activeBusinessId, controller.signal);
    }, 300);
  }, [fetchPipeline]);

  // Initial load on mount or workspace switch
  useEffect(() => {
    if (!currentBusinessId) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    activeRequestIdRef.current += 1;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    void fetchPipeline(currentBusinessId, controller.signal);

    return () => {
      controller.abort();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [currentBusinessId, fetchPipeline]);

  // Socket.IO realtime event subscription
  useEffect(() => {
    if (!currentBusinessId || typeof window === "undefined") {
      return () => {};
    }

    const socketUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;

    const socket = io(socketUrl, {
      path: "/socket.io",
      auth: { businessId: currentBusinessId },
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    const handleConnect = () => setIsRealtimeActive(true);
    const handleDisconnect = () => setIsRealtimeActive(false);
    const handleConnectError = () => setIsRealtimeActive(false);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    socket.on(REALTIME_EVENTS.CONVERSATION_STATUS, triggerDebouncedRefetch);
    socket.on(REALTIME_EVENTS.CONVERSATION_STATUS_CHANGED, triggerDebouncedRefetch);
    socket.on(REALTIME_EVENTS.CONVERSATION_SCORE, triggerDebouncedRefetch);
    socket.on(REALTIME_EVENTS.LEAD_SCORE_UPDATED, triggerDebouncedRefetch);
    socket.on(REALTIME_EVENTS.NOTIFICATION_NEW, triggerDebouncedRefetch);
    socket.on(REALTIME_EVENTS.ORDER_CONFIRMED, triggerDebouncedRefetch);
    socket.on(REALTIME_EVENTS.ORDER_CANCELLED, triggerDebouncedRefetch);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off(REALTIME_EVENTS.CONVERSATION_STATUS, triggerDebouncedRefetch);
      socket.off(REALTIME_EVENTS.CONVERSATION_STATUS_CHANGED, triggerDebouncedRefetch);
      socket.off(REALTIME_EVENTS.CONVERSATION_SCORE, triggerDebouncedRefetch);
      socket.off(REALTIME_EVENTS.LEAD_SCORE_UPDATED, triggerDebouncedRefetch);
      socket.off(REALTIME_EVENTS.NOTIFICATION_NEW, triggerDebouncedRefetch);
      socket.off(REALTIME_EVENTS.ORDER_CONFIRMED, triggerDebouncedRefetch);
      socket.off(REALTIME_EVENTS.ORDER_CANCELLED, triggerDebouncedRefetch);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [currentBusinessId, triggerDebouncedRefetch]);

  const isEffectiveLoading =
    isLoading || (Boolean(currentBusinessId) && loadedBusinessId !== currentBusinessId && !error);
  const effectivePipeline = loadedBusinessId === currentBusinessId ? pipeline : null;

  return {
    pipeline: effectivePipeline,
    isLoading: isEffectiveLoading,
    isRefreshing,
    error,
    isRealtimeActive,
    refreshData,
  };
}
