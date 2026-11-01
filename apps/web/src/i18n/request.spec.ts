/**
 * Automated TDD Test Suite for T-WEB-05 — Internationalization Catalogs & RTL layout (Arabic/French/English)
 * Generated from backlog card acceptance criteria.
 */

/// <reference types="jest" />

import arMessages from "./messages/ar.json";
import enMessages from "./messages/en.json";
import frMessages from "./messages/fr.json";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getLocaleDirection,
  getMessagesForLocale,
  isValidLocale,
  resolveLocale,
} from "./request";

describe("Internationalization Catalogs & RTL layout (Arabic/French/English) (T-WEB-05)", () => {
  describe("Acceptance Criteria: Locale Switch", () => {
    it("Locale Switch: Switching language changes all UI text seamlessly.", async () => {
      // 1. Verify all 3 supported locales are registered
      expect(SUPPORTED_LOCALES).toEqual(["fr", "ar", "en"]);
      expect(DEFAULT_LOCALE).toBe("fr");

      // 2. Verify locale resolution handles various locale tags correctly
      expect(resolveLocale("fr")).toBe("fr");
      expect(resolveLocale("fr-TN")).toBe("fr");
      expect(resolveLocale("FR")).toBe("fr");

      expect(resolveLocale("ar")).toBe("ar");
      expect(resolveLocale("ar-TN")).toBe("ar");
      expect(resolveLocale("AR")).toBe("ar");

      expect(resolveLocale("en")).toBe("en");
      expect(resolveLocale("en-US")).toBe("en");
      expect(resolveLocale("EN")).toBe("en");

      // 3. Verify closed-set validation with isValidLocale
      expect(isValidLocale("fr")).toBe(true);
      expect(isValidLocale("ar")).toBe(true);
      expect(isValidLocale("en")).toBe(true);
      expect(isValidLocale("fr-TN")).toBe(false);
      expect(isValidLocale("es")).toBe(false);
      expect(isValidLocale(null)).toBe(false);
      expect(isValidLocale(123)).toBe(false);

      // 4. Verify fallback behavior for null/undefined/unknown/malicious locales
      expect(resolveLocale(null)).toBe("fr");
      expect(resolveLocale(undefined)).toBe("fr");
      expect(resolveLocale("es")).toBe("fr");
      expect(resolveLocale("de")).toBe("fr");
      expect(resolveLocale("")).toBe("fr");
      expect(resolveLocale("../../etc/passwd")).toBe("fr");
      expect(resolveLocale("<script>alert(1)</script>")).toBe("fr");
      expect(resolveLocale("archive")).toBe("fr");
      expect(resolveLocale("french")).toBe("fr");

      // 5. Verify messages load distinctly per locale
      const fr = await getMessagesForLocale("fr");
      const ar = await getMessagesForLocale("ar");
      const en = await getMessagesForLocale("en");

      expect(fr).toBeDefined();
      expect(ar).toBeDefined();
      expect(en).toBeDefined();

      // Ensure that switching between catalogs produces distinct, localized text
      const frCommon = fr.common as Record<string, string>;
      const arCommon = ar.common as Record<string, string>;
      const enCommon = en.common as Record<string, string>;

      expect(frCommon.save).toBe("Enregistrer");
      expect(arCommon.save).toBe("حفظ");
      expect(enCommon.save).toBe("Save");

      expect(frCommon.cancel).toBe("Annuler");
      expect(arCommon.cancel).toBe("إلغاء");
      expect(enCommon.cancel).toBe("Cancel");
    });
  });

  describe("Acceptance Criteria: RTL Direction", () => {
    it("RTL Direction: Switching to Arabic applies `dir='rtl'`.", () => {
      // Arabic locale must enforce RTL direction
      expect(getLocaleDirection("ar")).toBe("rtl");
      expect(getLocaleDirection("ar-TN")).toBe("rtl");
      expect(getLocaleDirection("AR")).toBe("rtl");

      // French and English locales must enforce LTR direction
      expect(getLocaleDirection("fr")).toBe("ltr");
      expect(getLocaleDirection("fr-TN")).toBe("ltr");
      expect(getLocaleDirection("en")).toBe("ltr");
      expect(getLocaleDirection("en-US")).toBe("ltr");

      // Default/fallback must be LTR (French)
      expect(getLocaleDirection(null)).toBe("ltr");
      expect(getLocaleDirection(undefined)).toBe("ltr");
      expect(getLocaleDirection("unknown")).toBe("ltr");
    });
  });

  describe("Translation Catalog Parity & Completeness", () => {
    function getAllKeys(obj: Record<string, unknown>, prefix = ""): string[] {
      return Object.entries(obj).flatMap(([key, value]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          return getAllKeys(value as Record<string, unknown>, fullKey);
        }
        return [fullKey];
      });
    }

    it("ensures fr.json, ar.json, and en.json have identical translation key sets", () => {
      const frKeys = getAllKeys(frMessages as Record<string, unknown>).sort();
      const arKeys = getAllKeys(arMessages as Record<string, unknown>).sort();
      const enKeys = getAllKeys(enMessages as Record<string, unknown>).sort();

      expect(frKeys.length).toBeGreaterThan(50);

      // Check missing keys in Arabic
      const missingInAr = frKeys.filter((k) => !arKeys.includes(k));
      expect(missingInAr).toEqual([]);

      // Check extra keys in Arabic
      const extraInAr = arKeys.filter((k) => !frKeys.includes(k));
      expect(extraInAr).toEqual([]);

      // Check missing keys in English
      const missingInEn = frKeys.filter((k) => !enKeys.includes(k));
      expect(missingInEn).toEqual([]);

      // Check extra keys in English
      const extraInEn = enKeys.filter((k) => !frKeys.includes(k));
      expect(extraInEn).toEqual([]);
    });

    it("ensures no translation values are empty or whitespace-only", () => {
      const catalogs = [
        { name: "fr", messages: frMessages },
        { name: "ar", messages: arMessages },
        { name: "en", messages: enMessages },
      ];

      for (const { messages } of catalogs) {
        const keys = getAllKeys(messages as Record<string, unknown>);
        for (const key of keys) {
          const parts = key.split(".");
          let current: unknown = messages;
          for (const p of parts) {
            current = (current as Record<string, unknown>)[p];
          }
          expect(typeof current).toBe("string");
          expect((current as string).trim().length).toBeGreaterThan(0);
        }
      }
    });

    it("ensures all core namespaces exist with expected MVP domains", () => {
      const requiredNamespaces = [
        "common",
        "nav",
        "auth",
        "roles",
        "inbox",
        "onboarding",
        "orders",
        "channels",
        "kpis",
        "languages",
      ];

      for (const ns of requiredNamespaces) {
        expect(frMessages).toHaveProperty(ns);
        expect(arMessages).toHaveProperty(ns);
        expect(enMessages).toHaveProperty(ns);
      }
    });

    it("validates authentic Tunisian commercial context in Arabic catalog", () => {
      // Tunisian Dinar / Currency
      expect(arMessages.onboarding.currency).toContain("دينار تونسي");
      // Cash On Delivery
      expect(arMessages.onboarding.cashOnDelivery).toContain("الدفع عند الاستلام");
      // 24 Governorates
      expect(arMessages.onboarding.allGovernorates).toContain("24");
      // Local support footer
      expect(arMessages.common.localSupport).toContain("طُوِّر في تونس");
    });
  });
});
