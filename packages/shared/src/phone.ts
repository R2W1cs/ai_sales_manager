/**
 * ITU-T E.164 valid country calling codes (zones 1 through 9).
 */
const VALID_COUNTRY_CODES = new Set([
  // Zone 1: North American Numbering Plan
  "1",
  // Zone 2: Africa & Atlantic/Indian Ocean
  "20",
  "27",
  "211",
  "212",
  "213",
  "216",
  "218",
  "220",
  "221",
  "222",
  "223",
  "224",
  "225",
  "226",
  "227",
  "228",
  "229",
  "230",
  "231",
  "232",
  "233",
  "234",
  "235",
  "236",
  "237",
  "238",
  "239",
  "240",
  "241",
  "242",
  "243",
  "244",
  "245",
  "246",
  "247",
  "248",
  "249",
  "250",
  "251",
  "252",
  "253",
  "254",
  "255",
  "256",
  "257",
  "258",
  "260",
  "261",
  "262",
  "263",
  "264",
  "265",
  "266",
  "267",
  "268",
  "269",
  "290",
  "291",
  "297",
  "298",
  "299",
  // Zones 3 & 4: Europe
  "30",
  "31",
  "32",
  "33",
  "34",
  "36",
  "39",
  "350",
  "351",
  "352",
  "353",
  "354",
  "355",
  "356",
  "357",
  "358",
  "359",
  "370",
  "371",
  "372",
  "373",
  "374",
  "375",
  "376",
  "377",
  "378",
  "379",
  "380",
  "381",
  "382",
  "383",
  "385",
  "386",
  "387",
  "389",
  "40",
  "41",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  // Zone 5: Americas
  "51",
  "52",
  "53",
  "54",
  "55",
  "56",
  "57",
  "58",
  "500",
  "501",
  "502",
  "503",
  "504",
  "505",
  "506",
  "507",
  "508",
  "509",
  "590",
  "591",
  "592",
  "593",
  "594",
  "595",
  "596",
  "597",
  "598",
  "599",
  // Zone 6: Southeast Asia & Oceania
  "60",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "670",
  "672",
  "673",
  "674",
  "675",
  "676",
  "677",
  "678",
  "679",
  "680",
  "681",
  "682",
  "683",
  "685",
  "686",
  "687",
  "688",
  "689",
  "690",
  "691",
  "692",
  // Zone 7: Russia & Kazakhstan
  "7",
  // Zone 8: East Asia & Special Services
  "81",
  "82",
  "84",
  "86",
  "850",
  "852",
  "853",
  "855",
  "856",
  "880",
  "886",
  // Zone 9: Central, South & Western Asia
  "90",
  "91",
  "92",
  "93",
  "94",
  "95",
  "98",
  "960",
  "961",
  "962",
  "963",
  "964",
  "965",
  "966",
  "967",
  "968",
  "970",
  "971",
  "972",
  "973",
  "974",
  "975",
  "976",
  "977",
  "992",
  "993",
  "994",
  "995",
  "996",
  "998",
]);

/**
 * Extracts and verifies the ITU-T country code from an E.164 digits string.
 */
function extractCountryCode(digits: string): string | null {
  // Check 3-digit CC first
  if (digits.length >= 4) {
    const cc3 = digits.slice(0, 3);
    if (VALID_COUNTRY_CODES.has(cc3)) return cc3;
  }
  // Check 2-digit CC
  if (digits.length >= 3) {
    const cc2 = digits.slice(0, 2);
    if (VALID_COUNTRY_CODES.has(cc2)) return cc2;
  }
  // Check 1-digit CC
  if (digits.length >= 2) {
    const cc1 = digits.slice(0, 1);
    if (VALID_COUNTRY_CODES.has(cc1)) {
      if (cc1 === "1") {
        return digits.length === 11 && /^[2-9]\d{9}$/.test(digits.slice(1)) ? "1" : null;
      }
      return cc1;
    }
  }

  return null;
}

/**
 * Normalizes phone numbers to standard E.164 format (+[country][national_number]).
 *
 * Rules:
 * - Rejects non-string, empty, or unallocated country code structures.
 * - Leading '+' or '00' indicates international format.
 * - Digits-only 8-digit numbers default to Tunisian (+216) prefix if valid.
 * - Tunisian mobile/fixed subscriber numbers must match [2-9]\d{7}.
 * - Rejects structures starting with +0, +999, invalid lengths (<7 or >15 digits).
 */
export function normalizePhone(phone: unknown, defaultCountryCode = "216"): string | null {
  if (typeof phone !== "string") {
    return null;
  }

  const trimmed = phone.trim();
  if (!trimmed) {
    return null;
  }

  // Remove common formatting characters
  let cleaned = trimmed.replace(/[\s\-().[\]]/g, "");

  // Handle leading 00 as international prefix
  if (cleaned.startsWith("00")) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  // If already starts with '+', validate digits and country code
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    if (!/^[1-9]\d{6,14}$/.test(digits)) {
      return null;
    }
    const cc = extractCountryCode(digits);
    if (!cc) return null;

    // Additional country-specific validation for Tunisia (+216)
    if (cc === "216") {
      const nationalNumber = digits.slice(3);
      if (!/^[2-9]\d{7}$/.test(nationalNumber)) {
        return null;
      }
    }

    return `+${digits}`;
  }

  // If digits only
  if (/^\d+$/.test(cleaned)) {
    // 8-digit standard Tunisian local number (e.g. 98111222)
    if (defaultCountryCode === "216" && cleaned.length === 8) {
      if (/^[2-9]\d{7}$/.test(cleaned)) {
        return `+216${cleaned}`;
      }
      return null;
    }

    // If it already starts with country code (e.g. 21698111222)
    if (defaultCountryCode === "216" && cleaned.startsWith("216") && cleaned.length === 11) {
      if (/^[2-9]\d{7}$/.test(cleaned.slice(3))) {
        return `+${cleaned}`;
      }
      return null;
    }

    // Check if it's an un-prefixed international number matching a valid country code
    const cc = extractCountryCode(cleaned);
    if (cc) {
      if (cc === "216") {
        const nationalNumber = cleaned.slice(3);
        if (!/^[2-9]\d{7}$/.test(nationalNumber)) {
          return null;
        }
      }
      return `+${cleaned}`;
    }
  }

  return null;
}

export function isValidE164(phone: string): boolean {
  if (!phone.startsWith("+")) return false;
  const digits = phone.slice(1);
  if (!/^[1-9]\d{6,14}$/.test(digits)) return false;
  const cc = extractCountryCode(digits);
  if (!cc) return false;
  if (cc === "216") {
    const nationalNumber = digits.slice(3);
    return /^[2-9]\d{7}$/.test(nationalNumber);
  }
  return true;
}
