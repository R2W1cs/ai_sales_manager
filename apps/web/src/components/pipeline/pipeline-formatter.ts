export function resolvePipelineCurrency(rawCurrency?: string | null, fallback = "DT"): string {
  if (!rawCurrency || rawCurrency === "TND") {
    return fallback;
  }
  return rawCurrency;
}

export function formatPipelineMoney(
  valueInMillimes: number,
  currency: string = "DT",
  locale: string = "fr-FR",
): string {
  const resolvedCurrency = resolvePipelineCurrency(currency);
  if (!valueInMillimes || isNaN(valueInMillimes) || valueInMillimes <= 0) {
    return `0 ${resolvedCurrency}`;
  }
  const dinars = valueInMillimes / 1000;
  const formatted =
    dinars % 1 === 0
      ? dinars.toLocaleString(locale)
      : dinars.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return `${formatted} ${resolvedCurrency}`;
}

const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function formatPipelineTime(
  isoDate: string | Date | null | undefined,
  locale: string = "fr-FR",
  timeZone: string = "Africa/Tunis",
): string | null {
  if (!isoDate) return null;
  const dateObj = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
  if (isNaN(dateObj.getTime())) return null;

  const cacheKey = `${locale}_${timeZone}`;
  let formatter = timeFormatterCache.get(cacheKey);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      });
      timeFormatterCache.set(cacheKey, formatter);
    } catch {
      // Fallback
    }
  }

  if (formatter) {
    try {
      return formatter.format(dateObj);
    } catch {
      // Fallback
    }
  }

  const hours = String(dateObj.getHours()).padStart(2, "0");
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
