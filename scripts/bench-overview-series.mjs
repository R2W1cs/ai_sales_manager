import { readFileSync } from "node:fs";
/**
 * Compare the operator overview series query before and after aggregation.
 * Reads DATABASE_URL from the first argument (an env file). Prints timings only.
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const pg = require("pg");

const envFile = process.argv[2];
if (!envFile) {
  console.error("usage: node scripts/bench-overview-series.mjs <env-file>");
  process.exit(1);
}
const envText = readFileSync(envFile, "utf8");
const match = envText.match(/^DATABASE_URL=(.*)$/m);
if (!match?.[1]) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const connectionString = match[1].trim().replace(/^["']|["']$/g, "");

const since = new Date();
since.setHours(0, 0, 0, 0);
since.setDate(since.getDate() - 13);

async function time(client, label, queries) {
  const samples = [];
  let rows = 0;
  let bytes = 0;
  for (let i = 0; i < 40; i += 1) {
    const heapBefore = process.memoryUsage().heapUsed;
    const start = process.hrtime.bigint();
    const results = await Promise.all(
      queries.map((query) => client.query(query.text, query.values)),
    );
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    const heapDelta = process.memoryUsage().heapUsed - heapBefore;
    if (i >= 5) samples.push({ elapsedMs, heapDelta });
    rows = results.reduce((sum, result) => sum + (result.rowCount ?? 0), 0);
    bytes = results.reduce(
      (sum, result) => sum + Buffer.byteLength(JSON.stringify(result.rows)),
      0,
    );
  }
  samples.sort((a, b) => a.elapsedMs - b.elapsedMs);
  const pick = (p) => samples[Math.min(samples.length - 1, Math.floor(p * (samples.length - 1)))];
  const meanHeap = Math.round(
    samples.reduce((sum, item) => sum + item.heapDelta, 0) / samples.length,
  );
  return {
    label,
    rows,
    payloadBytes: bytes,
    n: samples.length,
    p50Ms: Number(pick(0.5).elapsedMs.toFixed(2)),
    p95Ms: Number(pick(0.95).elapsedMs.toFixed(2)),
    meanHeapDeltaBytes: meanHeap,
  };
}

const pool = new pg.Pool({ connectionString, max: 2 });
await pool.query("SELECT 1");
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const before = await time(pool, "row scan, two findMany", [
  { text: "SELECT created_at FROM messages WHERE created_at >= $1", values: [since] },
  { text: "SELECT created_at FROM ai_usage WHERE created_at >= $1", values: [since] },
]);
const after = await time(pool, "grouped local day, two queries", [
  {
    text: `SELECT to_char(created_at AT TIME ZONE $2, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
           FROM messages WHERE created_at >= $1 GROUP BY 1`,
    values: [since, timeZone],
  },
  {
    text: `SELECT to_char(created_at AT TIME ZONE $2, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
           FROM ai_usage WHERE created_at >= $1 GROUP BY 1`,
    values: [since, timeZone],
  },
]);
await pool.end();
console.log(JSON.stringify({ since: since.toISOString(), timeZone, before, after }, null, 2));
