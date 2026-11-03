#!/usr/bin/env node
/**
 * Lightweight HTTP benchmark for the API.
 *
 * Dependency-free: uses Node's built-in fetch and a fixed pool of workers.
 * Reports p50/p95/p99 latency, throughput and error rate per endpoint.
 *
 * This measures; it does not assert. Do not quote a performance number that
 * did not come out of an actual run against a comparable environment — the
 * Express/Fastify comparison in the migration notes is deliberately absent
 * because it was never measured on production-like hardware.
 *
 * Usage:
 *   node scripts/bench-http.mjs
 *   node scripts/bench-http.mjs --url http://127.0.0.1:3001 --duration 15 --concurrency 64
 *   node scripts/bench-http.mjs --json > bench.json
 *
 * Start the API first:
 *   pnpm --filter @app/api build && pnpm --filter @app/api start
 */

const args = process.argv.slice(2);

function flag(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = args[index + 1];
  return value === undefined || value.startsWith("--") ? true : value;
}

const BASE_URL = String(flag("url", process.env.BENCH_URL ?? "http://127.0.0.1:4000")).replace(
  /\/$/,
  "",
);
const DURATION_SECONDS = Number(flag("duration", 10));
const CONCURRENCY = Number(flag("concurrency", 32));
const WARMUP_SECONDS = Number(flag("warmup", 2));
const AS_JSON = flag("json", false) === true;
const ORIGIN = String(flag("origin", "http://localhost:3000"));

/** Representative surfaces: a trivial JSON route, an auth/session read, and a 404. */
const SCENARIOS = [
  {
    name: "root (plain response)",
    path: "/",
    init: { method: "GET" },
    expect: [200],
  },
  {
    name: "auth session (Better Auth handler)",
    path: "/api/auth/get-session",
    init: { method: "GET", headers: { origin: ORIGIN } },
    // 200 with a null session, or 401 depending on configuration. 429 is also
    // correct here: `AuthThrottlerGuard` limits auth traffic to 5/min per IP
    // (NFR-SEC-09), so a benchmark from one host is throttled by design. To
    // measure raw handler cost instead, point REDIS_URL at an empty instance
    // or raise the limit for the run.
    expect: [200, 401, 429],
  },
  {
    name: "cors preflight",
    path: "/api/v1/businesses",
    init: {
      method: "OPTIONS",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,x-business-id",
      },
    },
    expect: [200, 204],
  },
  {
    name: "protected route (unauthenticated 401 path)",
    path: "/api/v1/businesses/00000000-0000-0000-0000-000000000000",
    init: { method: "GET" },
    expect: [401, 403],
  },
];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function runScenario(scenario) {
  const url = `${BASE_URL}${scenario.path}`;
  const latencies = [];
  const statusCounts = new Map();
  let errors = 0;

  const deadline = Date.now() + DURATION_SECONDS * 1000;
  const warmupUntil = Date.now() + WARMUP_SECONDS * 1000;

  async function worker() {
    while (Date.now() < deadline) {
      const startedAt = process.hrtime.bigint();
      try {
        const response = await fetch(url, { ...scenario.init, redirect: "manual" });
        // Drain so the socket can be reused.
        await response.arrayBuffer();
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

        if (Date.now() >= warmupUntil) {
          latencies.push(elapsedMs);
          statusCounts.set(response.status, (statusCounts.get(response.status) ?? 0) + 1);
          if (!scenario.expect.includes(response.status)) errors += 1;
        }
      } catch {
        if (Date.now() >= warmupUntil) errors += 1;
      }
    }
  }

  const measuredFrom = Date.now() + WARMUP_SECONDS * 1000;
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const measuredSeconds = Math.max(0.001, (Date.now() - measuredFrom) / 1000);

  latencies.sort((a, b) => a - b);

  return {
    scenario: scenario.name,
    path: scenario.path,
    method: scenario.init.method,
    requests: latencies.length,
    errors,
    errorRate: latencies.length + errors === 0 ? 0 : errors / (latencies.length + errors),
    rps: latencies.length / measuredSeconds,
    latencyMs: {
      min: latencies[0] ?? 0,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies[latencies.length - 1] ?? 0,
    },
    statuses: Object.fromEntries([...statusCounts.entries()].sort((a, b) => a[0] - b[0])),
  };
}

async function assertReachable() {
  try {
    const response = await fetch(`${BASE_URL}/`, { method: "GET" });
    await response.arrayBuffer();
  } catch (error) {
    console.error(`Cannot reach ${BASE_URL}. Is the API running?`);
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
  }
}

function formatRow(result) {
  const { latencyMs: l } = result;
  return [
    result.scenario.padEnd(42),
    String(result.requests).padStart(8),
    result.rps.toFixed(0).padStart(8),
    l.p50.toFixed(2).padStart(9),
    l.p95.toFixed(2).padStart(9),
    l.p99.toFixed(2).padStart(9),
    `${(result.errorRate * 100).toFixed(2)}%`.padStart(9),
  ].join(" ");
}

async function main() {
  await assertReachable();

  const results = [];
  for (const scenario of SCENARIOS) {
    results.push(await runScenario(scenario));
  }

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        {
          baseUrl: BASE_URL,
          concurrency: CONCURRENCY,
          durationSeconds: DURATION_SECONDS,
          warmupSeconds: WARMUP_SECONDS,
          node: process.version,
          measuredAt: new Date().toISOString(),
          results,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    `\n${BASE_URL}  concurrency=${CONCURRENCY}  duration=${DURATION_SECONDS}s  node=${process.version}\n`,
  );
  console.log(
    [
      "scenario".padEnd(42),
      "reqs".padStart(8),
      "rps".padStart(8),
      "p50 ms".padStart(9),
      "p95 ms".padStart(9),
      "p99 ms".padStart(9),
      "errors".padStart(9),
    ].join(" "),
  );
  console.log("-".repeat(98));
  for (const result of results) {
    console.log(formatRow(result));
  }

  const failed = results.filter((r) => r.errorRate > 0);
  if (failed.length > 0) {
    console.log("\nUnexpected statuses:");
    for (const result of failed) {
      console.log(`  ${result.scenario}: ${JSON.stringify(result.statuses)}`);
    }
  }
  console.log(
    "\nNumbers describe this machine and this configuration only. Compare adapters by\nrunning the same command against both builds on the same host.\n",
  );
}

await main();
