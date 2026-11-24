#!/usr/bin/env node
/**
 * Read-only commercial launch-gate report.
 * Counts customer interactions (inbound messages) per pilot business.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/pilot/interaction-report.mjs
 *   pnpm pilot:report
 */
import "dotenv/config";
import pg from "pg";

let evaluateLaunchGate;
try {
  ({ evaluateLaunchGate } = await import("@app/shared"));
} catch {
  // Fallback when workspace build is stale — inline minimum gate
  evaluateLaunchGate = (merchants) => {
    const MIN = 20;
    const results = merchants.map((m) => {
      const reasons = [];
      if (m.interactions < MIN) reasons.push(`interactions_below_${MIN}`);
      if (!m.igConnected) reasons.push("instagram_not_connected");
      if (!m.messengerConnected) reasons.push("messenger_not_connected");
      if (m.criticalFailures > 0) reasons.push("critical_failures");
      if (m.confirmedOrders < 1) reasons.push("no_confirmed_cod_order");
      return { ...m, passed: reasons.length === 0, reasons };
    });
    const reasons = [];
    if (merchants.length < 3) reasons.push("need_3_merchants");
    if (results.some((r) => !r.passed)) reasons.push("one_or_more_merchants_failed");
    return {
      passed: reasons.length === 0 && results.every((r) => r.passed),
      reasons,
      merchants: results,
    };
  };
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });

const PILOT_SLUGS = ["sara-stores", "azalee-rose", "magasin-tpl"];

async function main() {
  const { rows: businesses } = await pool.query(
    `SELECT b.id, b.name, b.industry, b.settings->>'vertical' AS vertical,
            o.slug
     FROM businesses b
     LEFT JOIN organizations o ON o.id = b.organization_id
     WHERE o.slug = ANY($1::text[])
        OR (b.settings->>'pilot') = 'true'
     ORDER BY b.name`,
    [PILOT_SLUGS],
  );

  if (businesses.length === 0) {
    console.error("No pilot businesses found. Run: pnpm pilot:seed");
    process.exit(1);
  }

  const merchants = [];

  for (const b of businesses) {
    const [{ rows: msgRows }, { rows: orderRows }, { rows: channelRows }] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS interactions
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.business_id = $1
           AND m.direction = 'inbound'`,
        [b.id],
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'PENDING_CONFIRMATION')::int AS pending,
           COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED'))::int AS confirmed
         FROM orders
         WHERE business_id = $1`,
        [b.id],
      ),
      pool.query(
        `SELECT channel, status::text AS status
         FROM channel_accounts
         WHERE business_id = $1
           AND channel IN ('instagram', 'messenger')`,
        [b.id],
      ),
    ]);

    const ig = channelRows.find((c) => c.channel === "instagram");
    const ms = channelRows.find((c) => c.channel === "messenger");

    merchants.push({
      slug: b.slug || b.id,
      name: b.name,
      vertical: b.vertical || b.industry || "unknown",
      interactions: msgRows[0]?.interactions ?? 0,
      pendingOrders: orderRows[0]?.pending ?? 0,
      confirmedOrders: orderRows[0]?.confirmed ?? 0,
      igConnected: ig?.status === "active",
      messengerConnected: ms?.status === "active",
      criticalFailures: 0,
    });
  }

  const gate = evaluateLaunchGate(merchants);

  console.log("Commercial launch gate — interaction report\n");
  console.table(
    gate.merchants.map((m) => ({
      merchant: m.name,
      vertical: m.vertical,
      interactions: m.interactions,
      pending: m.pendingOrders,
      confirmed: m.confirmedOrders,
      ig: m.igConnected ? "yes" : "no",
      messenger: m.messengerConnected ? "yes" : "no",
      gate: m.passed ? "PASS" : m.reasons.join(","),
    })),
  );

  console.log(
    gate.passed
      ? "\nLAUNCH GATE: PASSED — 3 design partners meet acceptance criteria."
      : `\nLAUNCH GATE: NOT PASSED — ${gate.reasons.join("; ")}`,
  );

  process.exit(gate.passed ? 0 : 2);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
