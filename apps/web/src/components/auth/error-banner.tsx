"use client";

import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";

import { ApiClientError } from "@/lib/api-client";

interface ErrorBannerProps {
  error: unknown;
  title?: string;
  className?: string;
}

const CODE_TO_KEY: Record<string, string> = {
  unauthorized: "unauthorized",
  INVALID_EMAIL_OR_PASSWORD: "unauthorized",
  EMAIL_NOT_VERIFIED: "emailNotVerified",
  email_not_verified: "emailNotVerified",
  email_verification_required: "emailNotVerified",
  INVITATION_REQUIRED: "invitationRequired",
  invitation_required: "invitationRequired",
  invite_email_mismatch: "inviteEmailMismatch",
  quota_exceeded: "quotaExceeded",
  MFA_RESET_DISABLED: "mfaResetDisabled",
  INVALID_TWO_FACTOR_CODE: "invalidTwoFactor",
  INVALID_BACKUP_CODE: "invalidTwoFactor",
  INVALID_INVITATION: "notFound",
  INVALID_TOKEN: "invalidToken",
  TOKEN_EXPIRED: "invalidToken",
  csrf_invalid: "csrfInvalid",
  csrf_rejected: "csrfInvalid",
  rate_limited: "rateLimited",
  TOO_MANY_REQUESTS: "rateLimited",
  conflict: "conflict",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "conflict",
  not_found: "notFound",
  validation_error: "validationError",
  network_error: "networkError",
  internal_error: "internalError",
};

const STATUS_TO_KEY: Record<number, string> = {
  400: "validationError",
  401: "unauthorized",
  403: "unauthorized",
  404: "notFound",
  409: "conflict",
  422: "validationError",
  429: "rateLimited",
  500: "internalError",
  502: "internalError",
  503: "internalError",
};

function resolveTranslationKey(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code && CODE_TO_KEY[error.code]) {
      return CODE_TO_KEY[error.code];
    }
    if (error.status && STATUS_TO_KEY[error.status]) {
      return STATUS_TO_KEY[error.status];
    }
  } else if (typeof error === "object" && error !== null) {
    const record = error as { code?: unknown; status?: unknown };
    if (typeof record.code === "string" && CODE_TO_KEY[record.code]) {
      return CODE_TO_KEY[record.code];
    }
    if (typeof record.status === "number" && STATUS_TO_KEY[record.status]) {
      return STATUS_TO_KEY[record.status];
    }
  }

  return "generic";
}

export function ErrorBanner({ error, title, className = "" }: ErrorBannerProps) {
  const tErrors = useTranslations("errors");

  if (!error) {
    return null;
  }

  const key = resolveTranslationKey(error);
  const displayTitle = title ?? tErrors(`${key}Title`);
  const displayDescription = tErrors(`${key}Desc`);

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive ${className}`}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex flex-col gap-0.5 text-start">
        <span className="leading-snug font-medium text-destructive">{displayTitle}</span>
        {displayDescription ? (
          <p className="text-xs leading-relaxed text-destructive/90">{displayDescription}</p>
        ) : null}
      </div>
    </div>
  );
}
