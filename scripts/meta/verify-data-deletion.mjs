#!/usr/bin/env node
/**
 * Smoke-test Meta Data Deletion Callback (signed_request → confirmation_code).
 *
 * Usage:
 *   META_APP_SECRET=xxx PUBLIC_API_URL=https://api.example.com node scripts/meta/verify-data-deletion.mjs
 */
import crypto from "node:crypto";

const base = (
  process.env.PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000"
).replace(/\/$/, "");
const secret = process.env.META_APP_SECRET;
const userId = process.env.META_TEST_USER_ID || "meta_probe_user";

if (!secret) {
  console.error("Set META_APP_SECRET before running.");
  process.exit(1);
}

function createSignedRequest(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${sig}.${encodedPayload}`;
}

const signed = createSignedRequest({
  user_id: userId,
  algorithm: "HMAC-SHA256",
  issued_at: Math.floor(Date.now() / 1000),
});

const url = `${base}/api/v1/webhooks/meta/data-deletion`;
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ signed_request: signed }),
});
const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`FAIL HTTP ${res.status}`, body);
  process.exit(1);
}

if (!body.confirmation_code || !body.url) {
  console.error("FAIL missing confirmation_code/url", body);
  process.exit(1);
}

const statusUrl = `${base}/api/v1/webhooks/meta/data-deletion-status?code=${body.confirmation_code}`;
const statusRes = await fetch(statusUrl);
const statusBody = await statusRes.json();

console.log(`OK data-deletion callback at ${url}`);
console.log(`confirmation_code=${body.confirmation_code}`);
console.log(`status_page=${body.url}`);
console.log(`status_api=${statusBody.status}`);
