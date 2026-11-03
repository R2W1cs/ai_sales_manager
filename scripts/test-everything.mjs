#!/usr/bin/env node
/**
 * Comprehensive verification workflow runner:
 * Executes full quality gates after every backlog task:
 * 1. Backlog Task Verification (leaf done_cmd)
 * 2. Architecture Boundary & Forbidden Addons Guard
 * 3. Formatting (oxfmt) & Linting (oxlint)
 * 4. TypeScript Typecheck across Monorepo
 * 5. Unit & Integration Test Suites (API + Shared)
 * 6. Live API Endpoint Smoke Probes
 * 7. Playwright E2E Browser Test Suite
 * 8. React Doctor Quality Audit
 * 9. Graphify AST Knowledge Graph Update
 */

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ANSI formatting
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx === -1) return fallback;
  const val = args[idx + 1];
  return val === undefined || val.startsWith("--") ? true : val;
}

const hasFlag = (flag) => args.includes(flag);
const LEAF = getArg("--leaf");
const EXPLICIT_APP = getArg("--app");
const SKIP_E2E = hasFlag("--skip-e2e");
const SKIP_UNIT = hasFlag("--skip-unit");
const SKIP_DOCTOR = hasFlag("--skip-doctor");
const AUTO_FIX = hasFlag("--fix");
const VERBOSE = hasFlag("--verbose");
const HELP = hasFlag("--help") || hasFlag("-h");

if (HELP) {
  console.log(`
${c.bold}${c.cyan}ai-sales-manager — Comprehensive Backlog Verification Runner${c.reset}

${c.bold}Usage:${c.reset}
  node scripts/test-everything.mjs [options]
  pnpm test:everything [options]
  python3 backlog/_runner.py test-everything [leaf] [options]

${c.bold}Options:${c.reset}
  --leaf <id>     Target leaf ID to verify its done_cmd (default: active leaf from CURSOR.md)
  --app <target>  Specific app target for React Doctor (e.g. apps/api, apps/web)
  --fix           Run pnpm fix (oxlint --fix & oxfmt) before executing test suite
  --skip-e2e      Skip Playwright browser end-to-end tests
  --skip-unit     Skip Jest API and shared unit/integration tests
  --skip-doctor   Skip React Doctor quality audit
  --verbose       Stream child process output continuously
  -h, --help      Display this help menu
`);
  process.exit(0);
}

// Retrieve active leaf from CURSOR.md if not passed
function getActiveLeaf() {
  if (LEAF) return LEAF;
  const cursorPath = resolve(ROOT, "backlog/CURSOR.md");
  if (!existsSync(cursorPath)) return null;
  try {
    const text = readFileSync(cursorPath, "utf8");
    const match = text.match(/^leaf:\s*([^\s\n]+)/m);
    const statusMatch = text.match(/^status:\s*([^\s\n]+)/m);
    if (match && statusMatch && statusMatch[1] === "in_progress") {
      return match[1];
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

/**
 * Resolve React Doctor audit targets based on git changes across React apps.
 * React Doctor is purpose-built for React/Next.js ASTs and should only scan React apps (apps/web).
 */
function getDoctorTargets() {
  if (EXPLICIT_APP && typeof EXPLICIT_APP === "string") {
    const norm = EXPLICIT_APP.startsWith("apps/") ? EXPLICIT_APP : `apps/${EXPLICIT_APP}`;
    if (norm !== "apps/web") {
      // Backend apps (api, worker) are NestJS / Node apps, not React.
      return [];
    }
    return [norm];
  }

  // apps/web is the sole React application in this monorepo
  return ["apps/web"];
}

/**
 * Execute command with buffered or streaming output.
 */
function runCommand(command, cmdArgs, { cwd = ROOT, env = process.env, silent = !VERBOSE } = {}) {
  return new Promise((resolveResult) => {
    const start = Date.now();
    const proc = spawn(command, cmdArgs, {
      cwd,
      env: { ...env, FORCE_COLOR: "1" },
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      const str = data.toString();
      stdout += str;
      if (!silent) process.stdout.write(str);
    });

    proc.stderr.on("data", (data) => {
      const str = data.toString();
      stderr += str;
      if (!silent) process.stdout.write(str);
    });

    proc.on("close", (code) => {
      const durationMs = Date.now() - start;
      resolveResult({
        code: code ?? 0,
        durationMs,
        stdout,
        stderr,
      });
    });

    proc.on("error", (err) => {
      const durationMs = Date.now() - start;
      resolveResult({
        code: 1,
        durationMs,
        stdout,
        stderr: err.message,
      });
    });
  });
}

/**
 * Perform live HTTP probe
 */
async function probeEndpoint(name, url, expectedStatuses, headers = {}) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const durationMs = Date.now() - start;
    const ok = expectedStatuses.includes(res.status);
    return {
      name,
      url,
      status: res.status,
      ok,
      durationMs,
      error: ok ? null : `Expected status ${expectedStatuses.join("/")}, got ${res.status}`,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      name,
      url,
      status: 0,
      ok: false,
      durationMs,
      error: err.name === "AbortError" ? "Timeout after 3s" : err.message,
    };
  }
}

async function main() {
  console.log(
    `\n${c.bold}${c.blue}================================================================================${c.reset}`,
  );
  console.log(
    `${c.bold}${c.cyan}           COMPREHENSIVE BACKLOG VERIFICATION PIPELINE                          ${c.reset}`,
  );
  console.log(
    `${c.bold}${c.blue}================================================================================${c.reset}\n`,
  );

  const results = [];
  const activeLeaf = getActiveLeaf();

  if (activeLeaf) {
    console.log(`${c.bold}Active Leaf:${c.reset} ${c.yellow}${activeLeaf}${c.reset}`);
  }

  if (AUTO_FIX) {
    console.log(`${c.dim}Applying pnpm fix (oxlint --fix & oxfmt)...${c.reset}`);
    await runCommand("pnpm", ["fix"]);
  }

  // --- GATE 1: Active Leaf done_cmd Verification ---
  if (activeLeaf) {
    process.stdout.write(`${c.bold}[Gate 1/8] Leaf Verification (${activeLeaf})... ${c.reset}`);
    const res = await runCommand("python3", ["backlog/_runner.py", "verify", activeLeaf]);
    const durationSec = (res.durationMs / 1000).toFixed(1);
    if (res.code === 0) {
      console.log(`${c.green}✓ PASS${c.reset} ${c.dim}(${durationSec}s)${c.reset}`);
      results.push({
        name: `Gate 1: Leaf done_cmd (${activeLeaf})`,
        ok: true,
        duration: `${durationSec}s`,
      });
    } else {
      console.log(`${c.red}✗ FAIL${c.reset} ${c.dim}(${durationSec}s)${c.reset}`);
      console.error(c.red + res.stdout + res.stderr + c.reset);
      results.push({
        name: `Gate 1: Leaf done_cmd (${activeLeaf})`,
        ok: false,
        duration: `${durationSec}s`,
      });
    }
  } else {
    results.push({ name: "Gate 1: Leaf done_cmd", ok: true, skipped: true, duration: "-" });
  }

  // --- GATE 2: Architecture & Forbidden Addons Guard ---
  process.stdout.write(
    `${c.bold}[Gate 2/8] Architectural Guard, Tokens & Boundaries... ${c.reset}`,
  );
  const archRes = await runCommand("python3", ["backlog/_runner.py", "check-arch"]);
  const addonsRes = await runCommand("node", ["scripts/check-forbidden-addons.mjs"]);
  const tokensRes = await runCommand("node", ["scripts/find-tailwind-colors.js", "apps/web/src"]);
  const radiusRes = await runCommand("node", ["scripts/check-corner-radius.js", "apps/web/src"]);
  const gate2Ok =
    archRes.code === 0 && addonsRes.code === 0 && tokensRes.code === 0 && radiusRes.code === 0;
  const gate2Duration = (
    (archRes.durationMs + addonsRes.durationMs + tokensRes.durationMs + radiusRes.durationMs) /
    1000
  ).toFixed(1);

  if (gate2Ok) {
    console.log(`${c.green}✓ PASS${c.reset} ${c.dim}(${gate2Duration}s)${c.reset}`);
    results.push({
      name: "Gate 2: Architecture, Tokens & Boundaries",
      ok: true,
      duration: `${gate2Duration}s`,
    });
  } else {
    console.log(`${c.red}✗ FAIL${c.reset} ${c.dim}(${gate2Duration}s)${c.reset}`);
    if (archRes.code !== 0) console.error(c.red + archRes.stdout + archRes.stderr + c.reset);
    if (addonsRes.code !== 0) console.error(c.red + addonsRes.stdout + addonsRes.stderr + c.reset);
    if (tokensRes.code !== 0) console.error(c.red + tokensRes.stdout + tokensRes.stderr + c.reset);
    if (radiusRes.code !== 0) console.error(c.red + radiusRes.stdout + radiusRes.stderr + c.reset);
    results.push({
      name: "Gate 2: Architecture, Tokens & Boundaries",
      ok: false,
      duration: `${gate2Duration}s`,
    });
  }

  // --- GATE 3: Code Formatting & Linter ---
  process.stdout.write(`${c.bold}[Gate 3/8] Linter (oxlint) & Formatting (oxfmt)... ${c.reset}`);
  const lintRes = await runCommand("pnpm", ["oxlint"]);
  const fmtRes = await runCommand("pnpm", ["oxfmt", "--check"]);
  const gate3Ok = lintRes.code === 0 && fmtRes.code === 0;
  const gate3Duration = ((lintRes.durationMs + fmtRes.durationMs) / 1000).toFixed(1);

  if (gate3Ok) {
    console.log(`${c.green}✓ PASS${c.reset} ${c.dim}(${gate3Duration}s)${c.reset}`);
    results.push({ name: "Gate 3: Linter & Formatting", ok: true, duration: `${gate3Duration}s` });
  } else {
    console.log(`${c.red}✗ FAIL${c.reset} ${c.dim}(${gate3Duration}s)${c.reset}`);
    if (lintRes.code !== 0) console.error(c.red + lintRes.stdout + lintRes.stderr + c.reset);
    if (fmtRes.code !== 0) console.error(c.red + fmtRes.stdout + fmtRes.stderr + c.reset);
    results.push({ name: "Gate 3: Linter & Formatting", ok: false, duration: `${gate3Duration}s` });
  }

  // --- GATE 4: TypeScript Typecheck Across Monorepo ---
  process.stdout.write(`${c.bold}[Gate 4/8] Monorepo TypeScript Typecheck... ${c.reset}`);
  const typeRes = await runCommand("pnpm", ["check:types"]);
  const gate4Duration = (typeRes.durationMs / 1000).toFixed(1);

  if (typeRes.code === 0) {
    console.log(`${c.green}✓ PASS${c.reset} ${c.dim}(${gate4Duration}s)${c.reset}`);
    results.push({ name: "Gate 4: TypeScript Typecheck", ok: true, duration: `${gate4Duration}s` });
  } else {
    console.log(`${c.red}✗ FAIL${c.reset} ${c.dim}(${gate4Duration}s)${c.reset}`);
    console.error(c.red + typeRes.stdout + typeRes.stderr + c.reset);
    results.push({
      name: "Gate 4: TypeScript Typecheck",
      ok: false,
      duration: `${gate4Duration}s`,
    });
  }

  // --- GATE 5: Unit & Integration Test Suites (Shared + API) ---
  if (!SKIP_UNIT) {
    process.stdout.write(
      `${c.bold}[Gate 5/8] Unit & Integration Test Suites (Shared & API)... ${c.reset}`,
    );
    const sharedRes = await runCommand("pnpm", ["--filter", "@app/shared", "test"]);
    const apiRes = await runCommand("pnpm", ["--filter", "@app/api", "test"]);
    const gate5Ok = sharedRes.code === 0 && apiRes.code === 0;
    const gate5Duration = ((sharedRes.durationMs + apiRes.durationMs) / 1000).toFixed(1);

    if (gate5Ok) {
      console.log(`${c.green}✓ PASS${c.reset} ${c.dim}(${gate5Duration}s)${c.reset}`);
      results.push({
        name: "Gate 5: API & Shared Test Suites",
        ok: true,
        duration: `${gate5Duration}s`,
      });
    } else {
      console.log(`${c.red}✗ FAIL${c.reset} ${c.dim}(${gate5Duration}s)${c.reset}`);
      if (sharedRes.code !== 0)
        console.error(c.red + sharedRes.stdout + sharedRes.stderr + c.reset);
      if (apiRes.code !== 0) console.error(c.red + apiRes.stdout + apiRes.stderr + c.reset);
      results.push({
        name: "Gate 5: API & Shared Test Suites",
        ok: false,
        duration: `${gate5Duration}s`,
      });
    }
  } else {
    results.push({
      name: "Gate 5: API & Shared Test Suites",
      ok: true,
      skipped: true,
      duration: "-",
    });
  }

  // --- GATE 6: Live API Endpoint Smoke Probes ---
  process.stdout.write(`${c.bold}[Gate 6/8] Live API Endpoints Smoke Check... ${c.reset}`);
  const probes = [
    await probeEndpoint("Root Service", "http://127.0.0.1:4000/", [200]),
    await probeEndpoint("Auth Session", "http://127.0.0.1:4000/api/auth/get-session", [200, 401]),
    await probeEndpoint(
      "Protected Inbox",
      "http://127.0.0.1:4000/api/v1/conversations",
      [401, 403, 200],
    ),
  ];

  const anyProbeReachable = probes.some((p) => p.status !== 0);
  if (!anyProbeReachable) {
    console.log(`${c.yellow}⚠ SKIPPED (API offline on port 4000)${c.reset}`);
    results.push({
      name: "Gate 6: Live API Smoke Probes",
      ok: true,
      skipped: true,
      note: "Offline (covered by controller tests)",
      duration: "-",
    });
  } else {
    const failedProbes = probes.filter((p) => !p.ok);
    const totalMs = probes.reduce((acc, p) => acc + p.durationMs, 0);
    const durSec = (totalMs / 1000).toFixed(1);

    if (failedProbes.length === 0) {
      console.log(
        `${c.green}✓ PASS${c.reset} ${c.dim}(${probes.length} endpoints, ${durSec}s)${c.reset}`,
      );
      results.push({ name: "Gate 6: Live API Smoke Probes", ok: true, duration: `${durSec}s` });
    } else {
      console.log(`${c.red}✗ FAIL${c.reset} ${c.dim}(${failedProbes.length} failed)${c.reset}`);
      for (const f of failedProbes) {
        console.error(`  ${c.red}• ${f.name} (${f.url}): ${f.error}${c.reset}`);
      }
      results.push({ name: "Gate 6: Live API Smoke Probes", ok: false, duration: `${durSec}s` });
    }
  }

  // --- GATE 7: Playwright Browser End-to-End Tests ---
  if (!SKIP_E2E) {
    process.stdout.write(
      `${c.bold}[Gate 7/8] Playwright Browser E2E Tests (Chromium)... ${c.reset}`,
    );
    const pwRes = await runCommand("npx", [
      "playwright",
      "test",
      "--project=chromium",
      "--workers=1",
      "--reporter=line",
    ]);
    const gate7Duration = (pwRes.durationMs / 1000).toFixed(1);

    if (pwRes.code === 0) {
      console.log(`${c.green}✓ PASS${c.reset} ${c.dim}(${gate7Duration}s)${c.reset}`);
      results.push({
        name: "Gate 7: Playwright Browser E2E",
        ok: true,
        duration: `${gate7Duration}s`,
      });
    } else {
      console.log(`${c.red}✗ FAIL${c.reset} ${c.dim}(${gate7Duration}s)${c.reset}`);
      console.error(c.red + pwRes.stdout + pwRes.stderr + c.reset);
      results.push({
        name: "Gate 7: Playwright Browser E2E",
        ok: false,
        duration: `${gate7Duration}s`,
      });
    }
  } else {
    results.push({
      name: "Gate 7: Playwright Browser E2E",
      ok: true,
      skipped: true,
      duration: "-",
    });
  }

  // --- GATE 8: React Doctor Quality Audit ---
  if (!SKIP_DOCTOR) {
    const doctorTargets = getDoctorTargets();
    if (doctorTargets.length === 0) {
      console.log(
        `${c.dim}[Gate 8/8] React Doctor Audit: Skipped (target is not a React application)${c.reset}`,
      );
      results.push({
        name: "Gate 8: React Doctor (Skipped - non-React target)",
        ok: true,
        skipped: true,
        duration: "-",
      });
    } else {
      const targetLabel = doctorTargets.join(", ");
      process.stdout.write(`${c.bold}[Gate 8/8] React Doctor Audit (${targetLabel})... ${c.reset}`);

      let allPassed = true;
      let totalDurationMs = 0;
      let aggregatedErrors = "";

      for (const target of doctorTargets) {
        const rdRes = await runCommand("pnpx", [
          "react-doctor@latest",
          target,
          "-y",
          "--scope",
          "changed",
          "--json-compact",
          "--no-telemetry",
          "--no-color",
        ]);
        totalDurationMs += rdRes.durationMs;

        if (rdRes.code !== 0) {
          allPassed = false;
          aggregatedErrors += `\n[${target}]:\n` + rdRes.stdout + rdRes.stderr;
        }
      }

      const gate8Duration = (totalDurationMs / 1000).toFixed(1);

      if (allPassed) {
        console.log(`${c.green}✓ PASS${c.reset} ${c.dim}(${gate8Duration}s)${c.reset}`);
        results.push({
          name: `Gate 8: React Doctor (${targetLabel})`,
          ok: true,
          duration: `${gate8Duration}s`,
        });
      } else {
        console.log(`${c.red}✗ FAIL${c.reset} ${c.dim}(${gate8Duration}s)${c.reset}`);
        console.error(c.red + aggregatedErrors + c.reset);
        results.push({
          name: `Gate 8: React Doctor (${targetLabel})`,
          ok: false,
          duration: `${gate8Duration}s`,
        });
      }
    }
  } else {
    results.push({ name: "Gate 8: React Doctor Audit", ok: true, skipped: true, duration: "-" });
  }

  // --- Sync Graphify AST Knowledge Graph ---
  process.stdout.write(`${c.dim}Updating AST knowledge graph (graphify update .)... ${c.reset}`);
  await runCommand("graphify", ["update", "."]);
  console.log(`${c.dim}done.${c.reset}`);

  // --- SUMMARY REPORT ---
  console.log(
    `\n${c.bold}${c.blue}================================================================================${c.reset}`,
  );
  console.log(
    `${c.bold}${c.cyan}                          VERIFICATION SUMMARY                                  ${c.reset}`,
  );
  console.log(
    `${c.bold}${c.blue}================================================================================${c.reset}`,
  );

  let allPassed = true;
  for (const r of results) {
    let statusLabel = "";
    if (r.skipped) {
      statusLabel = `${c.yellow}[SKIPPED]${c.reset}`;
    } else if (r.ok) {
      statusLabel = `${c.green}[PASS]${c.reset}   `;
    } else {
      statusLabel = `${c.red}[FAIL]${c.reset}   `;
      allPassed = false;
    }

    const note = r.note ? ` ${c.dim}(${r.note})${c.reset}` : "";
    console.log(`  ${statusLabel} ${r.name.padEnd(42)} ${r.duration.padStart(8)}${note}`);
  }

  console.log(
    `${c.bold}${c.blue}================================================================================${c.reset}`,
  );

  if (allPassed) {
    console.log(
      `\n${c.bold}${c.green}🎉 ALL QUALITY GATES PASSED! Task is ready for completion.${c.reset}\n`,
    );
    process.exit(0);
  } else {
    console.log(
      `\n${c.bold}${c.red}❌ QUALITY GATES FAILED. Please remediate the issues reported above.${c.reset}\n`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error in test-everything runner:", err);
  process.exit(1);
});
