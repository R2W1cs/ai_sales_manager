import {
  emptyStringAsUndefined,
  formatEnvError,
  parseClientEnv,
  parseServerEnv,
  serverEnvSchema,
} from "./env";

const validServerEnv = {
  NODE_ENV: "development",
  PORT: "4000",
  DATABASE_URL: "postgresql://postgres:password@localhost:5432/ai_sales",
  REDIS_URL: "redis://localhost:6379",
  BETTER_AUTH_SECRET: "local-better-auth-secret-min-32-chars-long!",
  BETTER_AUTH_URL: "http://localhost:4000",
  CORS_ORIGIN: "http://localhost:3000",
  PUBLIC_APP_URL: "http://localhost:3000",
  PUBLIC_API_URL: "http://localhost:4000",
  S3_BUCKET: "ai-sales-assets",
  AWS_REGION: "eu-west-3",
} as const;

describe("parseServerEnv", () => {
  it("accepts a valid configuration and coerces PORT", () => {
    const env = parseServerEnv(validServerEnv, { skip: false });
    expect(env.PORT).toBe(4000);
    expect(env.DATABASE_URL).toBe(validServerEnv.DATABASE_URL);
    expect(env.REDIS_URL).toBe(validServerEnv.REDIS_URL);
    expect(env.BETTER_AUTH_SECRET).toBe(validServerEnv.BETTER_AUTH_SECRET);
    expect(env.BETTER_AUTH_URL).toBe(validServerEnv.BETTER_AUTH_URL);
    expect(env.META_GRAPH_VERSION).toBe("v23.0");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("fails when server PORT is not 4000", () => {
    expect(() => parseServerEnv({ ...validServerEnv, PORT: "5000" }, { skip: false })).toThrow(
      /API PORT must be 4000/,
    );
  });

  it("rejects BETTER_AUTH_SECRET shorter than 32 characters", () => {
    expect(() =>
      parseServerEnv({ ...validServerEnv, BETTER_AUTH_SECRET: "short" }, { skip: false }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("fails when a required variable is missing", () => {
    const { DATABASE_URL: _omitted, ...rest } = validServerEnv;
    expect(() => parseServerEnv(rest, { skip: false })).toThrow(/DATABASE_URL/);
    expect(() => parseServerEnv(rest, { skip: false })).toThrow(/Environment validation failed/);
  });

  it("fails on a malformed URL", () => {
    expect(() =>
      parseServerEnv({ ...validServerEnv, REDIS_URL: "not-a-url" }, { skip: false }),
    ).toThrow(/REDIS_URL/);
  });

  it("fails on an invalid enum", () => {
    expect(() =>
      parseServerEnv({ ...validServerEnv, NODE_ENV: "staging" }, { skip: false }),
    ).toThrow(/NODE_ENV/);
  });

  it("fails on an invalid number", () => {
    expect(() => parseServerEnv({ ...validServerEnv, PORT: "abc" }, { skip: false })).toThrow(
      /PORT/,
    );
  });

  it("treats optional AI Gateway credentials as optional", () => {
    const env = parseServerEnv(validServerEnv, { skip: false });
    expect(env.AI_GATEWAY_API_KEY).toBeUndefined();
    expect(env.VERCEL_OIDC_TOKEN).toBeUndefined();
  });

  it("rejects secrets shorter than 32 characters", () => {
    expect(() =>
      parseServerEnv({ ...validServerEnv, BETTER_AUTH_SECRET: "too-short" }, { skip: false }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("does not include secret values in the error message", () => {
    const secret = "super-secret-value-that-must-not-leak!!";
    try {
      parseServerEnv(
        { ...validServerEnv, DATABASE_URL: "not-a-url", BETTER_AUTH_SECRET: secret },
        { skip: false },
      );
      throw new Error("expected parseServerEnv to throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secret);
      expect(message).toContain("DATABASE_URL");
    }
  });

  it("requires paired S3 keys in production", () => {
    expect(() =>
      parseServerEnv(
        {
          ...validServerEnv,
          NODE_ENV: "production",
          S3_ACCESS_KEY_ID: "minioadmin",
        },
        { skip: false },
      ),
    ).toThrow(/S3_SECRET_ACCESS_KEY/);
  });

  it("allows production without S3 keys (IAM task role)", () => {
    const env = parseServerEnv({ ...validServerEnv, NODE_ENV: "production" }, { skip: false });
    expect(env.S3_ACCESS_KEY_ID).toBeUndefined();
  });

  it("reads live process.env when skip is true so tests can mutate values", () => {
    const previous = process.env.WHATSAPP_ENABLED;
    try {
      process.env.WHATSAPP_ENABLED = "false";
      const env = parseServerEnv(process.env, { skip: true });
      process.env.WHATSAPP_ENABLED = "true";
      expect(env.WHATSAPP_ENABLED).toBe("true");
    } finally {
      if (previous === undefined) {
        delete process.env.WHATSAPP_ENABLED;
      } else {
        process.env.WHATSAPP_ENABLED = previous;
      }
    }
  });
});

describe("parseClientEnv", () => {
  it("accepts public Next.js URLs", () => {
    const env = parseClientEnv(
      {
        NEXT_PUBLIC_API_URL: "https://api.example.com",
        NEXT_PUBLIC_WS_URL: "https://api.example.com",
      },
      { skip: false },
    );
    expect(env.NEXT_PUBLIC_API_URL).toBe("https://api.example.com");
    expect(env.NEXT_PUBLIC_WS_URL).toBe("https://api.example.com");
  });

  it("does not accept server secrets on the client schema", () => {
    const env = parseClientEnv(
      {
        NEXT_PUBLIC_API_URL: "http://localhost:3001",
        DATABASE_URL: "postgresql://postgres:password@localhost:5432/ai_sales",
        BETTER_AUTH_SECRET: "local-better-auth-secret-min-32-chars-long!",
      },
      { skip: false },
    );
    expect(env).toEqual({
      PORT: 3000,
      NEXT_PUBLIC_API_URL: "http://localhost:3001",
      NEXT_PUBLIC_WS_URL: "http://localhost:4000",
      NEXT_PUBLIC_SERVER_URL: "http://localhost:3000",
    });
    expect("DATABASE_URL" in env).toBe(false);
    expect("BETTER_AUTH_SECRET" in env).toBe(false);
  });

  it("fails on a malformed public URL", () => {
    expect(() => parseClientEnv({ NEXT_PUBLIC_API_URL: "not-a-url" }, { skip: false })).toThrow(
      /NEXT_PUBLIC_API_URL/,
    );
  });

  it("fails when client PORT is not 3000", () => {
    expect(() => parseClientEnv({ PORT: "5000" }, { skip: false })).toThrow(
      /Web PORT must be 3000/,
    );
  });
});

describe("formatEnvError", () => {
  it("groups issues by variable without dumping values", () => {
    const result = serverEnvSchema.safeParse(
      emptyStringAsUndefined({
        NODE_ENV: "staging",
        PORT: "nope",
        DATABASE_URL: "bad",
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    const formatted = formatEnvError(result.error);
    expect(formatted.startsWith("Environment validation failed:")).toBe(true);
    expect(formatted).toContain("NODE_ENV");
    expect(formatted).toContain("PORT");
    expect(formatted).toContain("DATABASE_URL");
    expect(formatted).not.toContain("nope");
  });
});
