"use client";

import { useTranslations } from "next-intl";
import React from "react";

type PasswordStrengthLevel = "none" | "very-weak" | "weak" | "medium" | "strong" | "very-strong";

interface PasswordStrength {
  score: number;
  level: PasswordStrengthLevel;
  labelKey: "weak" | "medium" | "strong" | "veryStrong" | "";
}

function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, level: "none", labelKey: "" };
  }

  // Mandatory requirement: minimum 10 characters
  if (password.length < 10) {
    return { score: 1, level: "weak", labelKey: "weak" };
  }

  let score = 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;

  switch (score) {
    case 1:
      return { score: 1, level: "weak", labelKey: "weak" };
    case 2:
      return { score: 2, level: "medium", labelKey: "medium" };
    case 3:
      return { score: 3, level: "strong", labelKey: "strong" };
    case 4:
      return { score: 4, level: "very-strong", labelKey: "veryStrong" };
    default:
      return { score: 1, level: "weak", labelKey: "weak" };
  }
}

function getStrengthTokenColor(score: number): string {
  switch (score) {
    case 1:
      return "bg-destructive";
    case 2:
      return "bg-warning";
    case 3:
      return "bg-primary";
    case 4:
      return "bg-success";
    case 0:
    default:
      return "bg-muted";
  }
}

interface PasswordStrengthMeterProps {
  password: string;
  className?: string;
}

export function PasswordStrengthMeter({ password, className }: PasswordStrengthMeterProps) {
  const tAuth = useTranslations("auth");

  if (!password) {
    return null;
  }

  const strengthInfo = calculatePasswordStrength(password);
  const fillClass = getStrengthTokenColor(strengthInfo.score);
  const label = strengthInfo.labelKey ? tAuth(strengthInfo.labelKey) : "";

  return (
    <div className={className ?? "space-y-1 pt-1"}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{tAuth("passwordStrength")}</span>
        <span className="font-medium">{label}</span>
      </div>
      <div className="grid h-1 w-full grid-cols-4 gap-1 overflow-hidden bg-muted">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={`h-full transition-all ${
              strengthInfo.score >= step ? fillClass : "bg-transparent"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
