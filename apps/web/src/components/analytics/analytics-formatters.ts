import type { AnalyticsPeriod } from "@app/shared";

/**
 * Format raw millimes value into localized dinar number string without currency symbol.
 */
export function formatGmvNumber(
  valueInMillimes: number | null | undefined,
  locale: string = "fr-FR",
): string {
  if (valueInMillimes === null || valueInMillimes === undefined || isNaN(valueInMillimes)) {
    return "0";
  }
  const dinars = valueInMillimes / 1000;
  return dinars % 1 === 0
    ? dinars.toLocaleString(locale)
    : dinars.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

/**
 * Format raw millimes value into localized dinar string with localized currency symbol (DT or د.ت).
 */
export function formatGmvMoney(
  valueInMillimes: number | null | undefined,
  locale: string = "fr-FR",
): string {
  const numberStr = formatGmvNumber(valueInMillimes, locale);
  const currencyUnit = locale.startsWith("ar") ? "د.ت" : "DT";
  return `${numberStr} ${currencyUnit}`;
}

/**
 * Format percentage delta with sign and directional flag.
 */
export function formatDeltaPercent(delta: number | null | undefined): {
  text: string;
  direction: "up" | "down" | "neutral";
} {
  if (delta === null || delta === undefined || isNaN(delta)) {
    return { text: "—", direction: "neutral" };
  }
  const percent = Number((delta * 100).toFixed(1));
  if (percent > 0) {
    return { text: `+${percent}%`, direction: "up" };
  }
  if (percent < 0) {
    return { text: `${percent}%`, direction: "down" };
  }
  return { text: "0%", direction: "neutral" };
}

/**
 * Format percentage point delta with sign and directional flag.
 */
export function formatDeltaPoints(delta: number | null | undefined): {
  text: string;
  direction: "up" | "down" | "neutral";
} {
  if (delta === null || delta === undefined || isNaN(delta)) {
    return { text: "—", direction: "neutral" };
  }
  const pts = Number((delta * 100).toFixed(1));
  if (pts > 0) {
    return { text: `+${pts} pts`, direction: "up" };
  }
  if (pts < 0) {
    return { text: `${pts} pts`, direction: "down" };
  }
  return { text: "0 pts", direction: "neutral" };
}

/**
 * Format ISO date string into short month + day for chart axis labels.
 */
export function formatDateLabel(dateStr: string, locale: string = "fr-FR"): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return dateStr;
  }
}

/**
 * Determine X-axis tick sampling interval based on the selected period.
 */
export function getPeriodDateStep(period: AnalyticsPeriod = "30d"): number {
  if (period === "90d") return 14;
  if (period === "30d") return 6;
  return 1;
}
