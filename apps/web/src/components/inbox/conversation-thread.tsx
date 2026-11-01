"use client";

import {
  Bot,
  User,
  AlertTriangle,
  Sparkles,
  Info,
  Check,
  X,
  RotateCcw,
  ArrowLeft,
  Phone,
  CheckCircle2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Stack } from "@/components/ui/stack";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ConversationSummaryDto, MessageDto, SendMessageAttachmentInput } from "@app/shared";

import { InboxActionBar } from "./inbox-action-bar";
import { MessageBubble } from "./message-bubble";

export interface ConversationThreadProps {
  conversation: ConversationSummaryDto | null;
  businessId: string;
  messages: MessageDto[];
  isLoadingMessages: boolean;
  isSending: boolean;
  activeSuggestion: string | null;
  isSuggesting: boolean;
  onSendMessage: (
    content: string,
    attachments?: SendMessageAttachmentInput[],
  ) => Promise<MessageDto>;
  onApproveDraft: (messageId: string, editedContent?: string) => Promise<MessageDto>;
  onRejectDraft?: (messageId: string) => Promise<void>;
  onRetryMessage: (messageId: string) => Promise<MessageDto>;
  onTakeover: () => Promise<void>;
  onResumeAi: () => Promise<void>;
  onRequestSuggestion: () => Promise<void>;
  onClearSuggestion: () => void;
  onCloseConversation: () => Promise<void>;
  onToggleDetailsPane?: () => void;
  onBackToList?: () => void;
  externalError?: string | null;
  className?: string;
}

interface ConversationThreadEmptyProps {
  className?: string;
}

function ConversationThreadEmpty({ className }: ConversationThreadEmptyProps): React.ReactElement {
  const tInbox = useTranslations("inbox");

  return (
    <div
      data-slot="conversation-thread-empty"
      className={cn(
        "flex h-full flex-1 flex-col items-center justify-center bg-muted/10 p-8 text-center",
        className,
      )}
    >
      <div className="mb-3 rounded-full bg-muted p-4 text-muted-foreground">
        <Bot className="size-8" />
      </div>
      <h3 className="text-base font-semibold text-foreground">
        {tInbox("selectConversationPrompt")}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {tInbox("selectConversationDesc")}
      </p>
    </div>
  );
}

interface HeaderStatusFlags {
  isHumanHandling: boolean;
  isHumanRequired: boolean;
  hasDraft: boolean;
  isResuming: boolean;
  isTakingOver: boolean;
  isClosing: boolean;
}

function ThreadStatusBadge({
  isHumanHandling,
  isHumanRequired,
  hasDraft,
  aiEnabled,
}: {
  isHumanHandling: boolean;
  isHumanRequired: boolean;
  hasDraft: boolean;
  aiEnabled: boolean;
}): React.ReactElement | null {
  const tInbox = useTranslations("inbox");

  if (isHumanHandling) {
    return (
      <Stack
        direction="row"
        size="xs"
        className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
      >
        <User className="size-3.5" />
        <span className="hidden sm:inline">{tInbox("agentTakeoverBadge")}</span>
      </Stack>
    );
  }

  if (isHumanRequired) {
    return (
      <Stack
        direction="row"
        size="xs"
        className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
      >
        <AlertTriangle className="size-3.5" />
        <span className="hidden sm:inline">{tInbox("actionRequiredBadge")}</span>
      </Stack>
    );
  }

  if (hasDraft) {
    return (
      <Stack
        direction="row"
        size="xs"
        className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning"
      >
        <Sparkles className="size-3.5" />
        <span className="hidden sm:inline">{tInbox("draftPendingBadge")}</span>
      </Stack>
    );
  }

  if (aiEnabled) {
    return (
      <Stack
        direction="row"
        size="xs"
        className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success"
      >
        <Bot className="size-3.5" />
        <span className="hidden sm:inline">{tInbox("aiActiveBadge")}</span>
      </Stack>
    );
  }

  return null;
}

interface ConversationThreadHeaderProps {
  conversation: ConversationSummaryDto;
  onBackToList?: () => void;
  onToggleDetailsPane?: () => void;
  flags: HeaderStatusFlags;
  onTakeover: () => void;
  onResumeAi: () => void;
  onCloseThread: () => void;
}

function ConversationThreadHeader({
  conversation,
  onBackToList,
  onToggleDetailsPane,
  flags,
  onTakeover,
  onResumeAi,
  onCloseThread,
}: ConversationThreadHeaderProps): React.ReactElement {
  const tInbox = useTranslations("inbox");

  return (
    <Stack
      direction="row"
      justify="between"
      wrap={false}
      className="h-14 shrink-0 border-b border-border bg-card px-4 py-2"
    >
      <Stack direction="row" size="sm" wrap={false} className="min-w-30 shrink-0">
        {onBackToList && (
          <button
            type="button"
            onClick={onBackToList}
            className="me-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            aria-label={tInbox("backToList")}
          >
            <ArrowLeft className="size-5 rtl:rotate-180" />
          </button>
        )}

        <div className="min-w-0">
          <Stack direction="row" size="xs" wrap={false}>
            <h2
              className="max-w-35 truncate text-sm font-semibold text-foreground sm:max-w-55"
              title={conversation.customer.name || tInbox("clientLabel")}
            >
              {conversation.customer.name || tInbox("unnamedCustomer")}
            </h2>
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
              {conversation.channel}
            </span>
          </Stack>
          {conversation.customer.phone && (
            <Stack
              direction="row"
              size="xs"
              wrap={false}
              className="text-[11px] text-muted-foreground"
            >
              <Phone className="size-3" />
              <span>{conversation.customer.phone}</span>
            </Stack>
          )}
        </div>
      </Stack>

      <Stack direction="row" size="xs" wrap={false} className="shrink-0 sm:gap-2">
        <ThreadStatusBadge
          isHumanHandling={flags.isHumanHandling}
          isHumanRequired={flags.isHumanRequired}
          hasDraft={flags.hasDraft}
          aiEnabled={conversation.aiEnabled}
        />

        {flags.isHumanHandling ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={flags.isResuming}
            onClick={onResumeAi}
            className="h-8 text-xs"
            title={tInbox("resumeAiTitle")}
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden md:inline">{tInbox("resumeAI")}</span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={flags.isTakingOver}
            onClick={onTakeover}
            className="h-8 text-xs"
            title={tInbox("takeoverTitle")}
          >
            <User className="size-3.5" />
            <span>{flags.isTakingOver ? tInbox("takingOver") : tInbox("takeover")}</span>
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={flags.isClosing}
          onClick={onCloseThread}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          title={tInbox("closeConversation")}
        >
          <CheckCircle2 className="size-4" />
          <span className="hidden xl:inline">{tInbox("close")}</span>
        </Button>

        {onToggleDetailsPane && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleDetailsPane}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            aria-label={tInbox("customerContextAria")}
            title={tInbox("customerContext")}
          >
            <Info className="size-4" />
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

interface ConversationTakeoverBannerProps {
  onResumeAi: () => void;
  isResuming: boolean;
}

function ConversationTakeoverBanner({
  onResumeAi,
  isResuming,
}: ConversationTakeoverBannerProps): React.ReactElement {
  const tInbox = useTranslations("inbox");

  return (
    <div
      data-slot="takeover-banner"
      className="flex items-center justify-between border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-xs text-warning"
    >
      <div className="flex items-center gap-2">
        <User className="size-3.5 text-warning" />
        <span className="font-semibold">{tInbox("humanModeActive")}</span>
        <span className="hidden text-muted-foreground md:inline">{tInbox("aiPausedDesc")}</span>
      </div>
      <button
        type="button"
        onClick={onResumeAi}
        disabled={isResuming}
        className="font-medium underline hover:text-foreground"
      >
        {tInbox("resumeAI")}
      </button>
    </div>
  );
}

interface ConversationSuggestionPanelProps {
  activeSuggestion: string;
  onClearSuggestion: () => void;
  onInsertInComposer: (content: string) => void;
  onSendDirectly: (content: string) => void;
  isSending: boolean;
}

function ConversationSuggestionPanel({
  activeSuggestion,
  onClearSuggestion,
  onInsertInComposer,
  onSendDirectly,
  isSending,
}: ConversationSuggestionPanelProps): React.ReactElement {
  const tInbox = useTranslations("inbox");

  return (
    <div
      data-slot="suggestion-panel"
      className="my-3 rounded-lg border border-primary/40 bg-primary/5 p-3 shadow-xs dark:bg-primary/10"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="size-3.5" />
          <span>{tInbox("customAiSuggestion")}</span>
        </div>
        <button
          type="button"
          onClick={onClearSuggestion}
          className="text-muted-foreground hover:text-foreground"
          aria-label={tInbox("closeSuggestion")}
        >
          <X className="size-3.5" />
        </button>
      </div>

      <p dir="auto" className="text-sm whitespace-pre-wrap text-foreground">
        {activeSuggestion}
      </p>

      <div className="mt-3 flex items-center justify-end gap-2 border-t border-primary/20 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onInsertInComposer(activeSuggestion)}
        >
          {tInbox("insertInComposer")}
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          loading={isSending}
          className="h-7 bg-primary text-xs text-primary-foreground hover:bg-primary/90"
          onClick={() => onSendDirectly(activeSuggestion)}
        >
          <Check className="me-1 size-3" />
          {tInbox("sendDirectly")}
        </Button>
      </div>
    </div>
  );
}

interface ConversationMessagesListProps {
  messages: MessageDto[];
  isLoadingMessages: boolean;
  businessId: string;
  isSuggesting: boolean;
  activeSuggestion: string | null;
  isSending: boolean;
  onApproveDraft: (messageId: string, editedContent?: string) => Promise<MessageDto>;
  onRejectDraft?: (messageId: string) => Promise<void>;
  onRetryMessage: (messageId: string) => Promise<MessageDto>;
  onInsertDraft: (content: string) => void;
  onClearSuggestion: () => void;
  onSendMessage: (
    content: string,
    attachments?: SendMessageAttachmentInput[],
  ) => Promise<MessageDto>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

function ConversationMessagesList({
  messages,
  isLoadingMessages,
  businessId,
  isSuggesting,
  activeSuggestion,
  isSending,
  onApproveDraft,
  onRejectDraft,
  onRetryMessage,
  onInsertDraft,
  onClearSuggestion,
  onSendMessage,
  messagesEndRef,
}: ConversationMessagesListProps): React.ReactElement {
  const tInbox = useTranslations("inbox");

  if (isLoadingMessages && messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-12 text-center text-sm text-muted-foreground">
        <Spinner className="mb-2 size-6 animate-spin text-primary" />
        <span>{tInbox("loadingMessages")}</span>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-16 text-center text-sm text-muted-foreground">
        <Bot className="mb-2 size-8 opacity-40" />
        <span>{tInbox("noMessagesInConversation")}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-4">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          businessId={businessId}
          onApproveDraft={async (id, content) => {
            await onApproveDraft(id, content);
          }}
          onRejectDraft={onRejectDraft}
          onRetry={async (id) => {
            await onRetryMessage(id);
          }}
          onInsertDraft={onInsertDraft}
        />
      ))}

      {isSuggesting && (
        <div className="my-2 flex justify-end">
          <div className="w-full max-w-[85%] space-y-2 rounded-lg border border-primary/30 bg-card p-3 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5 animate-spin" />
              <span>{tInbox("generatingAiSuggestion")}</span>
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      )}

      {activeSuggestion && (
        <ConversationSuggestionPanel
          activeSuggestion={activeSuggestion}
          onClearSuggestion={onClearSuggestion}
          onInsertInComposer={(content) => {
            onInsertDraft(content);
            onClearSuggestion();
          }}
          onSendDirectly={async (content) => {
            await onSendMessage(content);
            onClearSuggestion();
          }}
          isSending={isSending}
        />
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

export function ConversationThread({
  conversation,
  businessId,
  messages,
  isLoadingMessages,
  isSending,
  activeSuggestion,
  isSuggesting,
  onSendMessage,
  onApproveDraft,
  onRejectDraft,
  onRetryMessage,
  onTakeover,
  onResumeAi,
  onRequestSuggestion,
  onClearSuggestion,
  onCloseConversation,
  onToggleDetailsPane,
  onBackToList,
  externalError,
  className,
}: ConversationThreadProps): React.ReactElement {
  const tInbox = useTranslations("inbox");
  const tCommon = useTranslations("common");
  const [isTakingOver, setIsTakingOver] = useState<boolean>(false);
  const [isResuming, setIsResuming] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draftForComposer, setDraftForComposer] = useState<string | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);

  async function handleAttachFile(file: File) {
    if (!conversation || !businessId) return;
    if (file.size > 280 * 1024) {
      setActionError(tInbox("attachTooLarge"));
      return;
    }
    setActionError(null);
    setIsAttaching(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || "");
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const uploaded = await apiClient.post<SendMessageAttachmentInput>(
        `/api/v1/conversations/${conversation.id}/attachments`,
        {
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          dataBase64,
        },
        { headers: { "x-business-id": businessId } },
      );
      await onSendMessage(file.name, [
        {
          s3Key: uploaded.s3Key,
          contentType: uploaded.contentType,
          sizeBytes: uploaded.sizeBytes,
        },
      ]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : tCommon("error"));
    } finally {
      setIsAttaching(false);
    }
  }

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeSuggestion]);

  if (!conversation) {
    return <ConversationThreadEmpty className={className} />;
  }

  const isHumanHandling = conversation.status === "HUMAN_HANDLING";
  const isHumanRequired = conversation.status === "HUMAN_REQUIRED";
  const hasDraft = messages.some((m) => m.deliveryStatus === "draft");

  async function handleTakeover() {
    setIsTakingOver(true);
    setActionError(null);
    try {
      await onTakeover();
      setIsTakingOver(false);
    } catch (err: unknown) {
      setActionError((err as Error)?.message || tInbox("takeoverFailed"));
      setIsTakingOver(false);
    }
  }

  async function handleResumeAi() {
    setIsResuming(true);
    setActionError(null);
    try {
      await onResumeAi();
      setIsResuming(false);
    } catch (err: unknown) {
      setActionError((err as Error)?.message || tInbox("resumeAiFailed"));
      setIsResuming(false);
    }
  }

  async function handleCloseThread() {
    setIsClosing(true);
    setActionError(null);
    try {
      await onCloseConversation();
      setIsClosing(false);
    } catch (err: unknown) {
      setActionError((err as Error)?.message || tInbox("closeConversationFailed"));
      setIsClosing(false);
    }
  }

  return (
    <div
      data-slot="conversation-thread"
      className={cn("flex h-full flex-1 flex-col overflow-hidden bg-background", className)}
    >
      <ConversationThreadHeader
        conversation={conversation}
        onBackToList={onBackToList}
        onToggleDetailsPane={onToggleDetailsPane}
        flags={{
          isHumanHandling,
          isHumanRequired,
          hasDraft,
          isResuming,
          isTakingOver,
          isClosing,
        }}
        onTakeover={handleTakeover}
        onResumeAi={handleResumeAi}
        onCloseThread={handleCloseThread}
      />

      {(externalError || actionError) && (
        <div className="flex items-center justify-between border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <span>{externalError || actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label={tCommon("close")}
            className="text-destructive hover:opacity-75"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {(isHumanHandling || isHumanRequired || !conversation.aiEnabled) && (
        <ConversationTakeoverBanner onResumeAi={handleResumeAi} isResuming={isResuming} />
      )}

      <ConversationMessagesList
        messages={messages}
        isLoadingMessages={isLoadingMessages}
        businessId={businessId}
        isSuggesting={isSuggesting}
        activeSuggestion={activeSuggestion}
        isSending={isSending}
        onApproveDraft={onApproveDraft}
        onRejectDraft={onRejectDraft}
        onRetryMessage={onRetryMessage}
        onInsertDraft={(content) => setDraftForComposer(content)}
        onClearSuggestion={onClearSuggestion}
        onSendMessage={onSendMessage}
        messagesEndRef={messagesEndRef}
      />

      <InboxActionBar
        onSendMessage={async (content) => {
          await onSendMessage(content);
        }}
        onAttachFile={handleAttachFile}
        onRequestSuggestion={onRequestSuggestion}
        isSuggesting={isSuggesting}
        canSuggest={isHumanHandling || isHumanRequired}
        isSending={isSending}
        isAttaching={isAttaching}
        draftText={draftForComposer}
        onDraftTextConsumed={() => setDraftForComposer(null)}
      />
    </div>
  );
}
