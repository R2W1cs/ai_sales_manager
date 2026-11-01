"use client";

import { Send, Sparkles, Zap, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";

export interface InboxActionBarProps {
  onSendMessage: (content: string) => Promise<void>;
  onAttachFile?: (file: File) => Promise<void>;
  onRequestSuggestion?: () => Promise<void>;
  isSuggesting?: boolean;
  canSuggest?: boolean;
  isSending?: boolean;
  isAttaching?: boolean;
  disabled?: boolean;
  draftText?: string | null;
  onDraftTextConsumed?: () => void;
  className?: string;
}

export function InboxActionBar({
  onSendMessage,
  onAttachFile,
  onRequestSuggestion,
  isSuggesting = false,
  canSuggest = false,
  isSending = false,
  isAttaching = false,
  disabled = false,
  draftText,
  onDraftTextConsumed,
  className,
}: InboxActionBarProps): React.ReactElement {
  const tInbox = useTranslations("inbox");
  const [content, setContent] = useState<string>("");
  const [showCanned, setShowCanned] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const cannedResponses = [
    {
      label: tInbox("cannedGreetingLabel"),
      text: tInbox("cannedGreetingText"),
    },
    {
      label: tInbox("cannedAvailabilityLabel"),
      text: tInbox("cannedAvailabilityText"),
    },
    {
      label: tInbox("cannedDeliveryLabel"),
      text: tInbox("cannedDeliveryText"),
    },
    {
      label: tInbox("cannedConfirmationLabel"),
      text: tInbox("cannedConfirmationText"),
    },
  ];

  const onDraftTextConsumedRef = useRef(onDraftTextConsumed);
  useEffect(() => {
    onDraftTextConsumedRef.current = onDraftTextConsumed;
  });

  // Sync external draft text if provided
  useEffect(() => {
    if (draftText) {
      queueMicrotask(() => {
        setContent(draftText);
        onDraftTextConsumedRef.current?.();
        textareaRef.current?.focus();
      });
    }
  }, [draftText]);

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed || isSending || disabled) return;

    try {
      await onSendMessage(trimmed);
      setContent("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch {
      // Error handled upstream
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    } else if (e.key === "/" && content === "") {
      setShowCanned(true);
    } else if (e.key === "Escape") {
      setShowCanned(false);
    }
  }

  function handleSelectCanned(text: string) {
    setContent(text);
    setShowCanned(false);
    textareaRef.current?.focus();
  }

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    const target = e.target;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 140)}px`;
  };

  return (
    <div
      data-slot="inbox-action-bar"
      className={cn("relative border-t border-border bg-background p-3", className)}
    >
      {/* Canned responses dropdown palette */}
      {showCanned && (
        <div className="absolute inset-s-3 bottom-full z-30 mb-2 w-80 rounded-md border border-border bg-popover p-1 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold text-muted-foreground">
            <span>{tInbox("cannedResponsesTitle")}</span>
            <span className="text-[10px]">{tInbox("escToClose")}</span>
          </div>
          <div className="space-y-0.5">
            {cannedResponses.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handleSelectCanned(item.text)}
                className="w-full rounded-sm px-2 py-1.5 text-start text-xs transition-colors hover:bg-muted"
              >
                <span className="font-medium text-foreground">{item.label} : </span>
                <span className="truncate text-muted-foreground">{item.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Composer Box */}
      <div className="flex flex-col gap-2 rounded-lg border border-input bg-card p-2 shadow-2xs focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          dir="auto"
          rows={2}
          disabled={disabled}
          placeholder={tInbox("typeMessageExtended")}
          className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />

        {/* Action Controls Toolbar */}
        <Stack
          direction="row"
          justify="between"
          size="xs"
          className="border-t border-border/50 pt-1"
        >
          <Stack direction="row" size="xs">
            {/* Quick replies trigger */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowCanned((prev) => !prev)}
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
              title={tInbox("cannedQuickTitle")}
            >
              <Zap className="size-3.5" />
              <span className="hidden text-xs sm:inline">{tInbox("quick")}</span>
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file && onAttachFile) void onAttachFile(file);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || isAttaching || !onAttachFile}
              loading={isAttaching}
              onClick={() => fileInputRef.current?.click()}
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
              title={tInbox("attachFile")}
            >
              <Paperclip className="size-3.5" />
            </Button>

            {/* AI Suggest Trigger (Available in HUMAN_HANDLING / HUMAN_REQUIRED) */}
            {canSuggest && onRequestSuggestion && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={isSuggesting}
                onClick={onRequestSuggestion}
                className="h-8 gap-1.5 border-primary/30 bg-primary/10 text-xs text-primary hover:bg-primary/20"
                title={tInbox("askAiSuggestion")}
              >
                <Sparkles className="size-3.5 text-primary" />
                <span>{tInbox("suggest")}</span>
              </Button>
            )}
          </Stack>

          {/* Send Button */}
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!content.trim() || disabled}
            loading={isSending}
            onClick={handleSend}
            className="h-8 gap-1.5 px-3"
          >
            <span>{tInbox("send")}</span>
            <Send className="size-3.5 rtl:-scale-x-100" />
          </Button>
        </Stack>
      </div>
    </div>
  );
}
