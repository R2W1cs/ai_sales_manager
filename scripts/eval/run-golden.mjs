#!/usr/bin/env node
/**
 * Root wrapper for the Tunisian golden-eval benchmark.
 * Writes apps/api/test/golden-eval/eval-report.json with pass/fail gates.
 *
 * Usage: pnpm eval:golden   (or node scripts/eval/run-golden.mjs)
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const result = spawnSync("pnpm", ["--filter", "@app/api", "eval:golden"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    // Keep offline / deterministic scoring in CI
    GROQ_API_KEY: "",
    ORCA_API_KEY: "",
    AI_GATEWAY_API_KEY: "",
  },
});

process.exit(result.status ?? 1);
