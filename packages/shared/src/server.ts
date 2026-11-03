import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

import { parseServerEnv } from "./env";

// Load .env from process.cwd() and search upwards for monorepo root .env
if (process.env.NODE_ENV !== "test") {
  try {
    dotenv.config();
    const cwd = process.cwd();
    const candidates = [
      path.resolve(cwd, ".env"),
      path.resolve(cwd, "../.env"),
      path.resolve(cwd, "../../.env"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        dotenv.config({ path: candidate });
      }
    }
  } catch {
    // Ignore in bundled environments
  }
}

export const env = parseServerEnv(process.env);

export type { ServerEnv } from "./env";
export { emptyStringAsUndefined, formatEnvError, parseServerEnv, serverEnvSchema } from "./env";
