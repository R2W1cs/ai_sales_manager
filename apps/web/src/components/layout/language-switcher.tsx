"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import React, { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SUPPORTED_LOCALES = [
  { code: "fr-TN", canonical: "fr", label: "Français (Tunisie)", short: "FR", dir: "ltr" },
  { code: "ar-TN", canonical: "ar", label: "تونسي / عربي", short: "ع", dir: "rtl" },
  { code: "en", canonical: "en", label: "English", short: "EN", dir: "ltr" },
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]["code"];

export interface LanguageSwitcherProps {
  currentLocale?: SupportedLocale;
  onLocaleChange?: (locale: SupportedLocale) => void;
  className?: string;
}

function applyLocaleAttributes(code: SupportedLocale) {
  if (typeof document !== "undefined") {
    const isArabic = code.startsWith("ar");
    document.documentElement.dir = isArabic ? "rtl" : "ltr";
    document.documentElement.lang = isArabic ? "ar" : code.startsWith("en") ? "en" : "fr";
  }
}

function setLocaleCookie(code: SupportedLocale) {
  if (typeof document !== "undefined") {
    document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000; SameSite=Lax`;
  }
}

export function LanguageSwitcher({
  currentLocale,
  onLocaleChange,
  className,
}: LanguageSwitcherProps) {
  const activeLocale = useLocale();
  const tLanguages = useTranslations("languages");

  const active =
    SUPPORTED_LOCALES.find(
      (l) =>
        l.canonical === activeLocale ||
        (currentLocale && (l.code === currentLocale || currentLocale.startsWith(l.canonical))),
    ) ?? SUPPORTED_LOCALES[0];

  useEffect(() => {
    applyLocaleAttributes(active.code);
  }, [active.code]);

  function handleSelect(code: SupportedLocale) {
    setLocaleCookie(code);
    applyLocaleAttributes(code);
    onLocaleChange?.(code);
    window.location.reload();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={tLanguages("selectLanguage")}
            title={tLanguages("selectLanguage")}
            className={
              className ??
              "h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            }
          />
        }
      >
        <Globe className="size-3.5" />
        <span>{active.short}</span>
        <span className="sr-only">{tLanguages("selectLanguage")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {SUPPORTED_LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale.code}
            onClick={() => handleSelect(locale.code)}
            className="flex cursor-pointer items-center justify-between text-xs"
          >
            <span>{locale.label}</span>
            <span className="text-xs text-muted-foreground">{locale.short}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
