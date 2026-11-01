"use client";

import {
  Bot,
  User,
  Clock,
  Check,
  CheckCheck,
  AlertTriangle,
  RotateCw,
  ThumbsUp,
  ThumbsDown,
  Info,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiClient, getAccessToken } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { MessageAttachmentDto, MessageDto } from "@app/shared";

import { DraftApprovalCard } from "./draft-approval-card";

function AttachmentPreview({
  attachment,
  businessId,
}: {
  attachment: MessageAttachmentDto;
  businessId?: string;
}): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = attachment.contentType.startsWith("image/");

  useEffect(() => {
    if (!isImage || !businessId) return undefined;
    let objectUrl: string | null = null;
    let cancelled = false;
    const token = getAccessToken();
    void fetch(`/api/v1/attachments/content?key=${encodeURIComponent(attachment.s3Key)}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "x-business-id": businessId,
      },
      credentials: "include",
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.s3Key, businessId, isImage]);

  if (isImage && url) {
    return (
      <img
        src={url}
        alt={attachment.s3Key.split("/").pop() || "attachment"}
        className="mt-2 max-h-48 rounded-md"
      />
    );
  }

  return (
    <p className="mt-2 text-[11px] opacity-80">{attachment.s3Key.split("/").pop()}</p>
  );
}

export interface MessageBubbleProps {
  message: MessageDto;
  businessId?: string;
  onApproveDraft?: (messageId: string, editedContent?: string) => Promise<void>;
  onRejectDraft?: (messageId: string) => Promise<void>;
  onRetry?: (messageId: string) => Promise<void>;
  onInsertDraft?: (content: string) => void;
  className?: string;
}

const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatMessageTime(isoDateString: string | Date, locale: string): string {
  try {
    const d = typeof isoDateString === "string" ? new Date(isoDateString) : isoDateString;
    if (Number.isNaN(d.getTime())) return "";
    let formatter = timeFormatterCache.get(locale);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
      });
      timeFormatterCache.set(locale, formatter);
    }
    return formatter.format(d);
  } catch {
    return "";
  }
}

interface SystemEventChipProps {
  content: string | null;
  createdAt: string | Date;
  locale: string;
  className?: string;
}

function SystemEventChip({
  content,
  createdAt,
  locale,
  className,
}: SystemEventChipProps): React.ReactElement {
  return (
    <div data-slot="system-event-chip" className={cn("my-3 flex justify-center", className)}>
      <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs text-muted-foreground shadow-2xs">
        <Info className="size-3 shrink-0" />
        <span dir="auto">{content ?? ""}</span>
        <span className="text-[10px] opacity-70">{formatMessageTime(createdAt, locale)}</span>
      </div>
    </div>
  );
}

interface DraftBubbleProps {
  message: MessageDto;
  onApproveDraft?: (messageId: string, editedContent?: string) => Promise<void>;
  onRejectDraft?: (messageId: string) => Promise<void>;
  onInsertDraft?: (content: string) => void;
  className?: string;
}

function DraftBubble({
  message,
  onApproveDraft,
  onRejectDraft,
  onInsertDraft,
  className,
}: DraftBubbleProps): React.ReactElement {
  return (
    <div className={cn("my-2 flex justify-end", className)}>
      <div className="w-full max-w-[85%] md:max-w-[70%]">
        <DraftApprovalCard
          message={message}
          onApprove={onApproveDraft || (async () => {})}
          onReject={onRejectDraft}
          onCopyToComposer={onInsertDraft}
        />
      </div>
    </div>
  );
}

interface MessageBubbleHeaderProps {
  senderType: string;
  createdAt: string | Date;
  locale: string;
}

function MessageBubbleHeader({
  senderType,
  createdAt,
  locale,
}: MessageBubbleHeaderProps): React.ReactElement {
  const tInbox = useTranslations("inbox");
  const isAi = senderType === "ai";
  const isHuman = senderType === "human";

  return (
    <div className="mb-0.5 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
      {isAi && (
        <span className="inline-flex items-center gap-1 font-medium text-primary">
          <Bot className="size-3" />
          <span>{tInbox("aiBadge")}</span>
        </span>
      )}
      {isHuman && (
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <User className="size-3" />
          <span>{tInbox("humanOperator")}</span>
        </span>
      )}
      <span>{formatMessageTime(createdAt, locale)}</span>
    </div>
  );
}

interface MessageDeliveryStatusProps {
  deliveryStatus?: string;
}

function MessageDeliveryStatus({
  deliveryStatus,
}: MessageDeliveryStatusProps): React.ReactElement | null {
  const tInbox = useTranslations("inbox");

  if (!deliveryStatus) return null;

  return (
    <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] opacity-75">
      {deliveryStatus === "queued" && (
        <span className="flex items-center gap-0.5" title={tInbox("queued")}>
          <Clock className="size-2.5" />
          <span>{tInbox("queued")}</span>
        </span>
      )}
      {deliveryStatus === "sent" && (
        <span className="flex items-center gap-0.5" title={tInbox("sent")}>
          <Check className="size-2.5" />
          <span>{tInbox("sent")}</span>
        </span>
      )}
      {deliveryStatus === "delivered" && (
        <span className="flex items-center gap-0.5 text-success" title={tInbox("delivered")}>
          <CheckCheck className="size-2.5" />
          <span>{tInbox("delivered")}</span>
        </span>
      )}
    </div>
  );
}

interface AiMessageFeedbackProps {
  message: MessageDto;
  businessId?: string;
}

function AiMessageFeedback({ message, businessId }: AiMessageFeedbackProps): React.ReactElement {
  const tInbox = useTranslations("inbox");
  const [feedbackSent, setFeedbackSent] = useState<"positive" | "negative" | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState<boolean>(false);
  const [showMetadata, setShowMetadata] = useState<boolean>(false);

  async function handleFeedback(rating: "positive" | "negative") {
    if (feedbackSent || isSubmittingFeedback || !businessId) return;
    setIsSubmittingFeedback(true);
    try {
      await apiClient.post(
        `/api/v1/messages/${message.id}/feedback`,
        {
          rating,
          ...(rating === "negative" ? { reason: "unhelpful" } : {}),
        },
        {
          headers: { "x-business-id": businessId },
        },
      );
      setFeedbackSent(rating);
      setIsSubmittingFeedback(false);
    } catch {
      setIsSubmittingFeedback(false);
    }
  }

  return (
    <>
      <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        {message.aiMetadata && (
          <button
            type="button"
            onClick={() => setShowMetadata((prev) => !prev)}
            className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
            title={tInbox("modelInfo")}
          >
            <Info className="size-3" />
            <span>{tInbox("details")}</span>
          </button>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={tInbox("positiveFeedback")}
            disabled={Boolean(feedbackSent) || isSubmittingFeedback}
            onClick={() => handleFeedback("positive")}
            className={cn(
              "rounded-sm p-0.5 hover:text-success",
              feedbackSent === "positive" && "font-semibold text-success",
            )}
          >
            <ThumbsUp className="size-3" />
          </button>
          <button
            type="button"
            aria-label={tInbox("negativeFeedback")}
            disabled={Boolean(feedbackSent) || isSubmittingFeedback}
            onClick={() => handleFeedback("negative")}
            className={cn(
              "rounded-sm p-0.5 hover:text-destructive",
              feedbackSent === "negative" && "font-semibold text-destructive",
            )}
          >
            <ThumbsDown className="size-3" />
          </button>
        </div>
      </div>

      {showMetadata && message.aiMetadata && (
        <div className="mt-1 max-w-[85%] rounded-md border border-border bg-card p-2 text-[10px] text-muted-foreground shadow-xs">
          <p className="font-semibold text-foreground">{tInbox("aiTraceability")}</p>
          <pre className="overflow-x-auto">{JSON.stringify(message.aiMetadata, null, 2)}</pre>
        </div>
      )}
    </>
  );
}

export function MessageBubble({
  message,
  businessId,
  onApproveDraft,
  onRejectDraft,
  onRetry,
  onInsertDraft,
  className,
}: MessageBubbleProps): React.ReactElement {
  const locale = useLocale();
  const tInbox = useTranslations("inbox");
  const tCommon = useTranslations("common");
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  const isCustomer = message.senderType === "customer";
  const isAi = message.senderType === "ai";
  const isHuman = message.senderType === "human";
  const isSystem = message.senderType === "system";
  const isDraft = message.deliveryStatus === "draft";
  const isFailed = message.deliveryStatus === "failed";

  if (isSystem) {
    return (
      <SystemEventChip
        content={message.content}
        createdAt={message.createdAt}
        locale={locale}
        className={className}
      />
    );
  }

  if (isAi && isDraft) {
    return (
      <DraftBubble
        message={message}
        onApproveDraft={onApproveDraft}
        onRejectDraft={onRejectDraft}
        onInsertDraft={onInsertDraft}
        className={className}
      />
    );
  }

  async function handleRetry() {
    if (!onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry(message.id);
      setIsRetrying(false);
    } catch (err) {
      setIsRetrying(false);
      throw err;
    }
  }

  return (
    <div
      data-slot="message-bubble-wrapper"
      className={cn(
        "group my-1.5 flex flex-col",
        isCustomer ? "items-start" : "items-end",
        className,
      )}
    >
      <MessageBubbleHeader
        senderType={message.senderType}
        createdAt={message.createdAt}
        locale={locale}
      />

      <div
        className={cn(
          "relative max-w-[85%] rounded-lg px-4 py-2.5 text-sm shadow-2xs transition-all md:max-w-[70%]",
          isCustomer && "rounded-ss-sm bg-muted text-foreground",
          isHuman && "rounded-se-sm bg-primary text-primary-foreground",
          isAi && "rounded-se-sm border border-border bg-muted/80 text-foreground",
          isFailed && "border-2 border-destructive bg-destructive/5 text-foreground",
        )}
      >
        <div dir="auto" className="leading-relaxed wrap-break-word whitespace-pre-wrap select-text">
          {message.content}
        </div>
        {message.attachments?.map((attachment) => (
          <AttachmentPreview
            key={attachment.id || attachment.s3Key}
            attachment={attachment}
            businessId={businessId}
          />
        ))}

        {isFailed && (
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-destructive/20 pt-2 text-xs text-destructive">
            <span className="flex items-center gap-1 font-medium">
              <AlertTriangle className="size-3.5 shrink-0" />
              {tInbox("sendFailed")}
            </span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              loading={isRetrying}
              onClick={handleRetry}
              className="h-6 px-2 text-[11px]"
            >
              <RotateCw className="me-1 size-3" />
              {tCommon("retry")}
            </Button>
          </div>
        )}

        {!isCustomer && <MessageDeliveryStatus deliveryStatus={message.deliveryStatus} />}
      </div>

      {isAi && !isDraft && <AiMessageFeedback message={message} businessId={businessId} />}
    </div>
  );
}
