#!/usr/bin/env node
/**
 * Smoke-check that the authenticated API exposes the purchase-handoff surfaces.
 * Does not replace a live Instagram DM proof — use META_LIVE_LOOP.md for that.
 *
 * Usage (API running, owner session cookie or bearer if configured):
 *   PUBLIC_API_URL=http://127.0.0.1:4000 node scripts/meta/e2e-handoff-smoke.mjs
 */
const base = (process.env.PUBLIC_API_URL || "http://127.0.0.1:4000").replace(/\/$/, "");

async function check(path, opts = {}) {
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: {
      Accept: "application/json",
      ...(opts.headers || {}),
    },
  });
  return { path, status: res.status, ok: res.ok };
}

const results = [];
results.push(await check("/ready"));
results.push(await check("/health"));
results.push(
  await check("/api/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x"),
);

console.log("Handoff smoke (infra):");
for (const r of results) {
  console.log(`  ${r.status}\t${r.path}`);
}

const ready = results[0]?.ok;
if (!ready) {
  console.error("API /ready is not OK — deploy/fix the stack before Meta live tests.");
  process.exit(1);
}

console.log("\nNext: complete the live IG checklist in docs/30_execution/META_LIVE_LOOP.md");
console.log("Confirm path once authenticated: POST /api/v1/conversations/:id/confirm-order");
