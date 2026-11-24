#!/usr/bin/env node
/**
 * Verify production Meta webhook HMAC + ACK latency (target p95 < 500ms).
 *
 * Signs a minimal page messaging payload with META_APP_SECRET and POSTs to
 * /api/v1/webhooks/meta. Prints per-request latency and a simple p95.
 *
 * Usage:
 *   META_APP_SECRET=xxx PUBLIC_API_URL=https://api.example.com node scripts/meta/verify-webhook-hmac.mjs
 *   node scripts/meta/verify-webhook-hmac.mjs --rounds 20
 */
import crypto from "node:crypto";

function arg(name, fallback = "") {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

const base = (
  process.env.PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000"
).replace(/\/$/, "");
const secret = process.env.META_APP_SECRET;
const rounds = Math.max(1, Number(arg("rounds", "11")) || 11);
const pageId = arg("page-id", process.env.META_TEST_PAGE_ID || "0");

if (!secret) {
  console.error("Set META_APP_SECRET before running.");
  process.exit(1);
}

const url = `${base}/api/v1/webhooks/meta`;
const latencies = [];

for (let i = 0; i < rounds; i++) {
  const payload = {
    object: "page",
    entry: [
      {
        id: pageId,
        time: Math.floor(Date.now() / 1000),
        messaging: [
          {
            sender: { id: `probe_sender_${i}` },
            recipient: { id: pageId },
            timestamp: Date.now(),
            message: {
              mid: `probe_mid_${Date.now()}_${i}`,
              text: "hmac latency probe (safe to ignore)",
            },
          },
        ],
      },
    ],
  };
  const raw = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const started = performance.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": `sha256=${sig}`,
    },
    body: raw,
  });
  const ms = performance.now() - started;
  latencies.push(ms);
  const body = await res.text();
  if (res.status === 401) {
    console.error(`FAIL HMAC rejected (401) in ${ms.toFixed(1)}ms — check META_APP_SECRET`);
    console.error(body);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`FAIL HTTP ${res.status} in ${ms.toFixed(1)}ms`);
    console.error(body);
    process.exit(1);
  }
  console.log(`ok round=${i + 1}/${rounds} status=${res.status} latency_ms=${ms.toFixed(1)}`);
}

latencies.sort((a, b) => a - b);
const p95 = latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)];
const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

console.log(`\nOK HMAC accepted at ${url}`);
console.log(`rounds=${rounds} avg_ms=${avg.toFixed(1)} p95_ms=${p95.toFixed(1)} (target < 500)`);
if (p95 >= 500) {
  console.error("FAIL p95 latency >= 500ms");
  process.exit(2);
}
