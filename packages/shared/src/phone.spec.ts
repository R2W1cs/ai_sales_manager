import { isValidE164, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("returns null for null, undefined, or empty string", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
  });

  it("normalizes international numbers with spaces and dashes", () => {
    expect(normalizePhone("+216 98 111 222")).toBe("+21698111222");
    expect(normalizePhone("+216-98-111-222")).toBe("+21698111222");
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  it("normalizes international numbers with leading 00", () => {
    expect(normalizePhone("0021698111222")).toBe("+21698111222");
    expect(normalizePhone("00216 98 111 222")).toBe("+21698111222");
    expect(normalizePhone("0033612345678")).toBe("+33612345678");
  });

  it("normalizes 8-digit local Tunisian numbers with default country code +216", () => {
    expect(normalizePhone("98111222")).toBe("+21698111222");
    expect(normalizePhone("98 111 222")).toBe("+21698111222");
    expect(normalizePhone("20 123 456")).toBe("+21620123456");
    expect(normalizePhone("55 123 456")).toBe("+21655123456");
  });

  it("normalizes digits-only numbers already starting with country code", () => {
    expect(normalizePhone("21698111222")).toBe("+21698111222");
    expect(normalizePhone("15551234567")).toBe("+15551234567");
  });

  it("returns null for invalid country codes or unallocated structures", () => {
    expect(normalizePhone("+9991234567")).toBeNull();
    expect(normalizePhone("9991234567")).toBeNull();
    expect(normalizePhone("+0123456789")).toBeNull();
  });

  it("returns null for invalid Tunisian local number prefixes (must start with 2-9)", () => {
    expect(normalizePhone("08111222")).toBeNull();
    expect(normalizePhone("18111222")).toBeNull();
    expect(normalizePhone("+21608111222")).toBeNull();
  });

  it("returns null for invalid inputs containing letters or symbols", () => {
    expect(normalizePhone("invalid-phone")).toBeNull();
    expect(normalizePhone("+216abc98111")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });

  it("validates standard E.164 strings with isValidE164", () => {
    expect(isValidE164("+21698111222")).toBe(true);
    expect(isValidE164("+15551234567")).toBe(true);
    expect(isValidE164("+33612345678")).toBe(true);
    expect(isValidE164("+9991234567")).toBe(false);
    expect(isValidE164("+21608111222")).toBe(false);
    expect(isValidE164("98111222")).toBe(false);
    expect(isValidE164("+0123456")).toBe(false);
  });
});
