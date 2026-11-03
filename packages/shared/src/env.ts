import { z } from "zod";

const nonempty = z.string().min(1);
const secret32 = z.string().min(32);
const envFlag = z.enum(["true", "false"]);

/**
 * Empty env values (PORT=, AI_GATEWAY_API_KEY=) are treated as unset so defaults apply.
 */
export function emptyStringAsUndefined(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(input)) {
    normalized[key] = value === "" ? undefined : value;
  }
  return normalized;
}

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),

    DATABASE_URL: z.url(),
    PGVECTOR_DATABASE_URL: z.url().optional(),

    REDIS_URL: z.url(),
    REDIS_HOST: nonempty.optional(),
    REDIS_PORT: z.coerce.number().int().positive().optional(),
    REDIS_PASSWORD: nonempty.optional(),

    BETTER_AUTH_SECRET: secret32.default("local-better-auth-secret-min-32-chars-long!"),
    BETTER_AUTH_URL: z.url().default("http://localhost:4000"),
    RESEND_API_KEY: nonempty.optional(),
    EMAIL_FROM: nonempty.default("AI Sales <noreply@ai-sales.app>"),

    ENCRYPTION_KEY: secret32.optional(),

    CORS_ORIGIN: z.url().default("http://localhost:3000"),
    PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
    PUBLIC_API_URL: z.url().default("http://localhost:4000"),
    WEBHOOK_PUBLIC_URL: z.url().optional(),
    COOKIE_SECURE: envFlag.optional(),

    /**
     * Trust `X-Forwarded-*` headers. Enable only when the API sits behind a
     * proxy that overwrites them (the ALB does).
     *
     * Defaults to enabled in production and disabled elsewhere: with no proxy
     * in front, a caller could forge `X-Forwarded-For` and rotate the value to
     * defeat the auth rate limit (NFR-SEC-09).
     */
    TRUST_PROXY: envFlag.optional(),

    AI_GATEWAY_API_KEY: nonempty.optional(),
    VERCEL_OIDC_TOKEN: nonempty.optional(),

    /** Groq OpenAI-compatible API (preferred when set). */
    GROQ_API_KEY: nonempty.optional(),
    GROQ_BASE_URL: z.url().default("https://api.groq.com/openai/v1"),
    GROQ_MODEL: nonempty.default("openai/gpt-oss-120b"),

    /** OpenAI-compatible OrcaRouter (used when Groq is unset). */
    ORCA_API_KEY: nonempty.optional(),
    ORCA_BASE_URL: z.url().default("https://api.orcarouter.ai/v1"),
    /** Chat model id for OrcaRouter (e.g. orcarouter/auto, tencent/hy4-preview-free). */
    ORCA_MODEL: nonempty.default("orcarouter/auto"),

    META_APP_ID: nonempty.optional(),
    META_APP_SECRET: nonempty.optional(),
    META_GRAPH_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/, 'Expected Graph API version like "v23.0"')
      .default("v23.0"),
    META_WEBHOOK_SECRET: nonempty.optional(),
    META_OAUTH_REDIRECT_URI: z.url().optional(),
    META_WA_PHONE_NUMBER_ID: nonempty.optional(),
    WHATSAPP_ENABLED: envFlag.optional(),

    AWS_REGION: nonempty.default("eu-west-3"),
    S3_ENDPOINT: z.url().optional(),
    S3_BUCKET: nonempty,
    S3_ACCESS_KEY_ID: nonempty.optional(),
    S3_SECRET_ACCESS_KEY: nonempty.optional(),

    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    PINO_PRETTY: envFlag.optional(),
  })
  .check((ctx) => {
    if (ctx.value.PORT !== 4000) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["PORT"],
        message: `API PORT must be 4000 (received ${ctx.value.PORT}). Changing this port breaks CORS origins, Next.js rewrites, and ngrok webhook tunneling.`,
      });
    }

    if (ctx.value.NODE_ENV !== "production") {
      return;
    }

    if (ctx.value.S3_ACCESS_KEY_ID && !ctx.value.S3_SECRET_ACCESS_KEY) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["S3_SECRET_ACCESS_KEY"],
        message: "Required when S3_ACCESS_KEY_ID is set",
      });
    }

    if (ctx.value.S3_SECRET_ACCESS_KEY && !ctx.value.S3_ACCESS_KEY_ID) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["S3_ACCESS_KEY_ID"],
        message: "Required when S3_SECRET_ACCESS_KEY is set",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const clientEnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    NEXT_PUBLIC_API_URL: z.url().default("http://localhost:4000"),
    NEXT_PUBLIC_WS_URL: z.url().default("http://localhost:4000"),
    NEXT_PUBLIC_SERVER_URL: z.url().default("http://localhost:3000"),
  })
  .superRefine((data, ctx) => {
    if (data.PORT !== 3000) {
      ctx.addIssue({
        code: "custom",
        path: ["PORT"],
        message: `Web PORT must be 3000 (received ${data.PORT}). Changing this port breaks CORS origins, Next.js rewrites, and ngrok webhook tunneling.`,
      });
    }
  });

export type ClientEnv = z.infer<typeof clientEnvSchema>;

export function formatEnvError(error: z.ZodError): string {
  const lines: string[] = ["Environment validation failed:", ""];
  const grouped = new Map<string, string[]>();

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "env";
    const messages = grouped.get(key) ?? [];
    messages.push(issue.message);
    grouped.set(key, messages);
  }

  for (const [key, messages] of grouped) {
    lines.push(key);
    for (const message of messages) {
      lines.push(`  - ${message}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function shouldSkipValidation(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): boolean {
  return input.SKIP_ENV_VALIDATION === "true" || input.NODE_ENV === "test";
}

/**
 * Validate server environment. In `test` (and when SKIP_ENV_VALIDATION=true),
 * returns a live proxy over process.env so existing tests can still mutate it.
 */
export function parseServerEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
  options?: { skip?: boolean },
): ServerEnv {
  const skip = options?.skip ?? shouldSkipValidation(input);
  if (skip) {
    return new Proxy({} as ServerEnv, {
      get(_target, prop: string | symbol) {
        if (typeof prop !== "string") {
          return undefined;
        }
        return process.env[prop];
      },
    });
  }

  const result = serverEnvSchema.safeParse(emptyStringAsUndefined(input));
  if (!result.success) {
    throw new Error(formatEnvError(result.error));
  }
  return result.data;
}

export function parseClientEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
  options?: { skip?: boolean },
): ClientEnv {
  const skip = options?.skip ?? shouldSkipValidation(input);
  if (skip) {
    return new Proxy({} as ClientEnv, {
      get(_target, prop: string | symbol) {
        if (typeof prop !== "string") {
          return undefined;
        }
        return process.env[prop];
      },
    });
  }

  const result = clientEnvSchema.safeParse(emptyStringAsUndefined(input));
  if (!result.success) {
    throw new Error(formatEnvError(result.error));
  }
  return result.data;
}
