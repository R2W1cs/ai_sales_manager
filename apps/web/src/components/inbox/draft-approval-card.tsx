"use client";

import { Sparkles, Check, Edit3, X, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";
import type { MessageDto } from "@app/shared";

export interface DraftApprovalCardProps {
  message: MessageDto;
  onApprove: (messageId: string, editedContent?: string) => Promise<void>;
  onReject?: (messageId: string) => Promise<void>;
  onCopyToComposer?: (content: string) => void;
  className?: string;
}

export function DraftApprovalCard({
  message,
  onApprove,
  onReject,
  onCopyToComposer,
  className,
}: DraftApprovalCardProps): React.ReactElement {
  const tInbox = useTranslations("inbox");
  const tCommon = useTranslations("common");
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedText, setEditedText] = useState<string>(message.content || "");
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  async function handleApprove() {
    setIsApproving(true);
    setErrorBanner(null);
    try {
      const textToSend = isEditing ? editedText.trim() : undefined;
      await onApprove(message.id, textToSend);
      setIsEditing(false);
      setIsApproving(false);
    } catch (err: unknown) {
      const errorObj = err as { status?: number; code?: string };
      if (errorObj?.status === 409 || errorObj?.code === "conflict") {
        setErrorBanner(tInbox("draftConflictError"));
        onCopyToComposer?.(isEditing ? editedText : message.content || "");
      } else {
        setErrorBanner(tInbox("draftApproveError"));
      }
      setIsApproving(false);
    }
  }

  async function handleReject() {
    if (!onReject) return;
    setIsRejecting(true);
    try {
      await onReject(message.id);
      setIsRejecting(false);
    } catch {
      setErrorBanner(tInbox("draftRejectError"));
      setIsRejecting(false);
    }
  }

  return (
    <div
      data-slot="draft-approval-card"
      className={cn(
        "relative my-2 rounded-lg border border-warning/40 bg-warning/5 p-4 shadow-xs transition-all",
        className,
      )}
    >
      {/* Header Tag */}
      <Stack wrap={false} className="mb-2 items-center justify-between">
        <Stack size="xs" wrap={false} className="items-center text-xs font-semibold text-warning">
          <Sparkles className="size-3.5" />
          <span>{tInbox("aiDraft")}</span>
        </Stack>
        <span className="text-[11px] text-muted-foreground">
          {tInbox("draftPendingValidation")}
        </span>
      </Stack>

      {/* Error alert if any */}
      {errorBanner && (
        <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {errorBanner}
        </div>
      )}

      {/* Content / Editor */}
      {isEditing ? (
        <Stack direction="column" size="sm" wrap={false} className="w-full">
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            rows={3}
            dir="auto"
            className="w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
            placeholder={tInbox("editDraftPlaceholder")}
          />
          <Stack size="xs" wrap={false} className="justify-end self-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditedText(message.content || "");
                setIsEditing(false);
              }}
            >
              <X className="size-3.5" />
              <span>{tCommon("cancel")}</span>
            </Button>
            <Button
              type="button"
              variant="fancy"
              size="sm"
              loading={isApproving}
              onClick={handleApprove}
            >
              <Check className="size-3.5" />
              <span>{tInbox("validateAndSend")}</span>
            </Button>
          </Stack>
        </Stack>
      ) : (
        <>
          <div
            dir="auto"
            className="text-sm leading-relaxed whitespace-pre-wrap text-foreground select-text"
          >
            {message.content || tInbox("noDraftContent")}
          </div>

          {/* Action Buttons */}
          <Stack
            wrap={true}
            className="mt-3 items-center justify-between border-t border-warning/20 pt-3"
          >
            <Stack size="xs" wrap={false} className="items-center">
              <Button
                type="button"
                variant="fancy"
                size="sm"
                loading={isApproving}
                onClick={handleApprove}
              >
                <Check className="size-3.5" />
                <span>{tInbox("approveDraft")}</span>
              </Button>

              <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit3 className="size-3.5" />
                <span>{tCommon("edit")}</span>
              </Button>
            </Stack>

            <Stack size="xs" wrap={false} className="items-center">
              {onCopyToComposer && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title={tInbox("copyToComposer")}
                  onClick={() => onCopyToComposer(message.content || "")}
                >
                  <ArrowUpRight className="size-3.5" />
                  <span className="hidden sm:inline">{tInbox("insert")}</span>
                </Button>
              )}

              {onReject && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={isRejecting}
                  onClick={handleReject}
                  className="text-muted-foreground hover:text-destructive"
                  title={tInbox("rejectDraft")}
                >
                  <X className="size-3.5" />
                  <span className="hidden sm:inline">{tCommon("reject")}</span>
                </Button>
              )}
            </Stack>
          </Stack>
        </>
      )}
    </div>
  );
}
