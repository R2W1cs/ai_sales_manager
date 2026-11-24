#!/usr/bin/env node
/**
 * Ops helper for INPDP / Law 2004-63 shopper deletion requests.
 * Calls POST /api/v1/customers/:id/erase (does not hard-delete orders).
 *
 * Usage:
 *   pnpm privacy:erase -- --api http://127.0.0.1:4000 --business <uuid> --customer <uuid> --token <jwt>
 */
function arg(name, fallback = "") {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

const api = (arg("api") || process.env.PUBLIC_API_URL || "http://127.0.0.1:4000").replace(
  /\/$/,
  "",
);
const businessId = arg("business") || process.env.BUSINESS_ID;
const customerId = arg("customer") || process.env.CUSTOMER_ID;
const token = arg("token") || process.env.ACCESS_TOKEN;

if (!businessId || !customerId || !token) {
  console.error(
    "Required: --business <uuid> --customer <uuid> --token <jwt> (or BUSINESS_ID / CUSTOMER_ID / ACCESS_TOKEN)",
  );
  process.exit(1);
}

const url = `${api}/api/v1/customers/${customerId}/erase`;
const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "X-Business-Id": businessId,
    Accept: "application/json",
  },
});

if (res.status === 204) {
  console.log(`OK erased customer ${customerId} for business ${businessId}`);
  process.exit(0);
}

const body = await res.text();
console.error(`FAIL ${res.status} ${url}`);
console.error(body);
process.exit(1);
