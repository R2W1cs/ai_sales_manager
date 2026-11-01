import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

import dotenv from "dotenv";

if (existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
}
if (existsSync(".env")) {
  dotenv.config({ path: ".env" });
}

const port = process.env.PORT || "3000";

if (String(port) !== "3000") {
  console.error(`\n❌ [PORT CONFIGURATION ERROR]`);
  console.error(`   Web PORT must be 3000 (received ${port}).`);
  console.error(
    `   Setting a different port breaks CORS origins, Next.js proxy rewrites, and ngrok webhook tunneling.`,
  );
  console.error(`   Please set PORT=3000 in apps/web/.env\n`);
  process.exit(1);
}

const args = ["dev", "-p", "3000", ...process.argv.slice(2)];

const child = spawn("next", args, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
});

process.on("SIGTERM", () => {
  child.kill("SIGTERM");
});
