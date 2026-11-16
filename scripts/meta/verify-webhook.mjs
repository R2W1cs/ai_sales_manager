#!/usr/bin/env node
/**
 * Verify Meta webhook endpoint is reachable and challenge-responds.
 *
 * Usage:
 *   META_WEBHOOK_SECRET=xxx PUBLIC_API_URL=https://api.example.com node scripts/meta/verify-webhook.mjs
 */
const base = (
  process.env.PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000"
).replace(/\/$/, "");
const secret = process.env.META_WEBHOOK_SECRET || process.env.WEBHOOK_VERIFY_TOKEN;
const challenge = `asm_verify_${Date.now()}`;

if (!secret) {
  console.error("Set META_WEBHOOK_SECRET (verify token) before running.");
  process.exit(1);
}

const url = new URL(`${base}/api/v1/webhooks/meta`);
url.searchParams.set("hub.mode", "subscribe");
url.searchParams.set("hub.verify_token", secret);
url.searchParams.set("hub.challenge", challenge);

const res = await fetch(url);
const body = await res.text();

if (!res.ok) {
  console.error(`FAIL HTTP ${res.status}: ${body}`);
  process.exit(1);
}

if (body.trim() !== challenge) {
  console.error(`FAIL challenge mismatch. got=${JSON.stringify(body)}`);
  process.exit(1);
}

console.log(`OK webhook verify at ${url.origin}${url.pathname}`);
