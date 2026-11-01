"use client";

import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";

export interface ErrorBannerProps {
  /** Error code from 13 §2.6 */
  code?: string | null;
  /** Custom translated copy. If omitted, mapped from code or status */
  message?: string | null;
  /** HTTP status code */
  status?: number;
  /** Direct error instance or string */
  error?: unknown;
  className?: string;
}

const STATUS_TO_CODE: Record<number, string> = {
  401: "unauthorized",
  404: "not_found",
  409: "conflict",
  429: "rate_limited",
  500: "internal_error",
  502: "network_error",
  503: "network_error",
  504: "network_error",
};

const CODE_TO_KEY: Record<string, { title: string; desc: string }> = {
  unauthorized: { title: "unauthorizedTitle", desc: "unauthorizedDesc" },
  rate_limited: { title: "rateLimitedTitle", desc: "rateLimitedDesc" },
  conflict: { title: "conflictTitle", desc: "conflictDesc" },
  not_found: { title: "notFoundTitle", desc: "notFoundDesc" },
  validation_error: { title: "validationErrorTitle", desc: "validationErrorDesc" },
  network_error: { title: "networkErrorTitle", desc: "networkErrorDesc" },
  internal_error: { title: "internalErrorTitle", desc: "internalErrorDesc" },
};

function resolveErrorInfo({ code, message, status, error }: ErrorBannerProps) {
  let resolvedCode = code;
  let resolvedMessage = message;
  let resolvedStatus = status;

  if (error) {
    if (typeof error === "string") {
      resolvedMessage = error;
    } else if (typeof error === "object" && error !== null) {
      const err = error as { code?: string; status?: number; message?: string };
      resolvedCode = resolvedCode ?? err.code;
      resolvedStatus = resolvedStatus ?? err.status;
      resolvedMessage = resolvedMessage ?? err.message;
    }
  }

  if (!resolvedCode && resolvedStatus) {
    resolvedCode = STATUS_TO_CODE[resolvedStatus];
  }

  if (
    !resolvedCode &&
    resolvedMessage &&
    /failed to fetch|networkerror|network error|load failed/i.test(resolvedMessage)
  ) {
    resolvedCode = "network_error";
  }

  return { resolvedCode, resolvedMessage, resolvedStatus };
}

export function ErrorBanner(props: ErrorBannerProps) {
  const { message, className } = props;
  const tErrors = useTranslations("errors");
  const { resolvedCode, resolvedMessage, resolvedStatus } = resolveErrorInfo(props);

  if (!resolvedCode && !resolvedMessage && !resolvedStatus) {
    return null;
  }

  const errorKeys = resolvedCode ? CODE_TO_KEY[resolvedCode] : undefined;
  const title = errorKeys
    ? tErrors(errorKeys.title as Parameters<typeof tErrors>[0])
    : tErrors("genericTitle");

  const displayMessage =
    message ||
    (errorKeys
      ? tErrors(errorKeys.desc as Parameters<typeof tErrors>[0])
      : resolvedMessage || tErrors("genericDesc"));

  const detail =
    !message && resolvedMessage && errorKeys && resolvedMessage !== displayMessage
      ? resolvedMessage
      : null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={
        className ??
        "flex items-start gap-2.5 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive dark:border-destructive/40 dark:bg-destructive/20"
      }
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex-1 space-y-0.5">
        <p className="leading-none font-medium">{title}</p>
        <p className="leading-relaxed text-destructive/90">{displayMessage}</p>
        {detail && <p className="text-xs text-destructive/80">{detail}</p>}
      </div>
    </div>
  );
}
