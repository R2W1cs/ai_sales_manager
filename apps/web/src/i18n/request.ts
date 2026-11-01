import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const SUPPORTED_LOCALES = ["fr", "ar", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "fr";

export type TextDirection = "ltr" | "rtl";

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

const LOCALE_ALIASES: Record<string, SupportedLocale> = {
  fr: "fr",
  "fr-tn": "fr",
  "fr-fr": "fr",
  ar: "ar",
  "ar-tn": "ar",
  en: "en",
  "en-us": "en",
  "en-gb": "en",
};

/**
 * Validates if an unknown value is one of the supported canonical locales.
 */
export function isValidLocale(locale: unknown): locale is SupportedLocale {
  return typeof locale === "string" && SUPPORTED_LOCALE_SET.has(locale);
}

/**
 * Resolves raw locale strings (such as "fr-TN", "ar-TN", "en-US")
 * into one of the canonical supported locales: "fr", "ar", "en".
 * Falls back unconditionally to DEFAULT_LOCALE ("fr") for any unsupported or malformed input.
 */
export function resolveLocale(rawLocale?: string | null): SupportedLocale {
  if (!rawLocale || typeof rawLocale !== "string") return DEFAULT_LOCALE;
  const lower = rawLocale.toLowerCase().trim();
  if (LOCALE_ALIASES[lower]) {
    return LOCALE_ALIASES[lower];
  }
  // Boundary-safe prefix matching (e.g. "ar-...", "ar_...", "en-...", "fr-...")
  if (/^ar([-_].*)?$/.test(lower)) return "ar";
  if (/^en([-_].*)?$/.test(lower)) return "en";
  if (/^fr([-_].*)?$/.test(lower)) return "fr";
  return DEFAULT_LOCALE;
}

/**
 * Returns text layout direction ("rtl" or "ltr") for a given locale.
 */
export function getLocaleDirection(locale: string | null | undefined): TextDirection {
  return resolveLocale(locale) === "ar" ? "rtl" : "ltr";
}

/**
 * Helper to load catalog messages for a given locale.
 */
export async function getMessagesForLocale(
  locale: SupportedLocale,
): Promise<Record<string, unknown>> {
  switch (locale) {
    case "ar":
      return (await import("./messages/ar.json")).default;
    case "en":
      return (await import("./messages/en.json")).default;
    case "fr":
    default:
      return (await import("./messages/fr.json")).default;
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale) {
    try {
      const cookieStore = await cookies();
      locale = cookieStore.get("NEXT_LOCALE")?.value;
    } catch {
      // In non-request contexts or tests, fallback to default
      locale = DEFAULT_LOCALE;
    }
  }

  const resolved = resolveLocale(locale);
  const messages = await getMessagesForLocale(resolved);

  return {
    locale: resolved,
    messages,
  };
});
