import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Next.js client env. Only NEXT_PUBLIC_* keys are listed so secrets cannot leak
 * into the browser bundle via this module.
 */
export const env = createEnv({
  server: {
    PORT: z.coerce
      .number()
      .int()
      .positive()
      .default(3000)
      .refine((val: number) => val === 3000, {
        message:
          "Web PORT must be 3000. Changing this port breaks CORS origins, Next.js rewrites, and ngrok webhook tunneling.",
      }),
  },
  client: {
    NEXT_PUBLIC_API_URL: z.url().default("http://localhost:4000"),
    NEXT_PUBLIC_WS_URL: z.url().default("http://localhost:4000"),
    NEXT_PUBLIC_SERVER_URL: z.url().default("http://localhost:3000"),
  },
  runtimeEnv: {
    PORT: process.env.PORT,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.NODE_ENV === "test" || process.env.SKIP_ENV_VALIDATION === "true",
  onValidationError: (issues) => {
    const lines = ["Environment validation failed:", ""];
    for (const issue of issues) {
      const path = issue.path ?? [];
      const key =
        path.length > 0
          ? path
              .map((segment) => (typeof segment === "string" ? segment : JSON.stringify(segment)))
              .join(".")
          : "client";
      lines.push(key);
      lines.push(`  - ${issue.message}`);
      lines.push("");
    }
    throw new Error(lines.join("\n").trimEnd());
  },
});
