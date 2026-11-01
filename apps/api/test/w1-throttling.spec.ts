/* oxlint-disable typescript/require-await, typescript/no-unnecessary-type-assertion */
import type { ExecutionContext } from "@nestjs/common";
import { HttpException, HttpStatus } from "@nestjs/common";
import type Redis from "ioredis";

import { AuthThrottlerGuard } from "../src/auth/guards/auth-throttler.guard";

describe("Wave 1 Rate Limiting & Throttling Suite (W1-THROTTLING)", () => {
  let mockRedis: any;
  let inMemoryStore: Map<string, number>;
  let ttlStore: Map<string, number>;

  beforeEach(() => {
    inMemoryStore = new Map();
    ttlStore = new Map();

    mockRedis = {
      pipeline: jest.fn(() => {
        const operations: (() => [null, unknown])[] = [];

        const pipe: {
          incr: (key: string) => typeof pipe;
          ttl: (key: string) => typeof pipe;
          exec: () => Promise<[null, unknown][]>;
        } = {
          incr: jest.fn((key: string) => {
            operations.push(() => {
              const current = (inMemoryStore.get(key) ?? 0) + 1;
              inMemoryStore.set(key, current);
              return [null, current];
            });
            return pipe;
          }),
          ttl: jest.fn((key: string) => {
            operations.push(() => {
              const currentTtl = ttlStore.get(key) ?? 60;
              return [null, currentTtl];
            });
            return pipe;
          }),
          exec: jest.fn(async () => {
            return operations.map((op) => op());
          }),
        };

        return pipe;
      }),
      expire: jest.fn(async (key: string, seconds: number) => {
        ttlStore.set(key, seconds);
        return 1;
      }),
      on: jest.fn(),
    };
  });

  function createMockContext(
    ip: string,
    email?: string,
  ): {
    ctx: ExecutionContext;
    headers: Record<string, string>;
  } {
    const headers: Record<string, string> = {};
    const mockReq = {
      headers: { "x-forwarded-for": ip },
      body: email ? { email } : {},
      ip,
      socket: { remoteAddress: ip },
    };
    const mockRes = {
      // Fastify's reply exposes `header()`, not Express's `setHeader()`.
      header: jest.fn((key: string, val: string) => {
        headers[key] = val;
      }),
    };

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => mockReq,
        getResponse: () => mockRes,
      }),
    } as unknown as ExecutionContext;

    return { ctx, headers };
  }

  test("Allows exactly 5 requests within the 60s window per IP and email", async () => {
    const guard = new AuthThrottlerGuard(mockRedis as unknown as Redis, {
      limit: 5,
      ttl: 60,
    });

    const ip = "192.168.1.50";
    const email = "owner@test.com";

    for (let i = 1; i <= 5; i++) {
      const { ctx } = createMockContext(ip, email);
      const allowed = await guard.canActivate(ctx);
      expect(allowed).toBe(true);
    }
  });

  test("Rejects the 6th request with HTTP 429 and Retry-After header", async () => {
    const guard = new AuthThrottlerGuard(mockRedis as unknown as Redis, {
      limit: 5,
      ttl: 60,
    });

    const ip = "192.168.1.51";
    const email = "throttled@test.com";

    // 5 allowed
    for (let i = 1; i <= 5; i++) {
      const { ctx } = createMockContext(ip, email);
      await guard.canActivate(ctx);
    }

    // 6th rejected
    const { ctx, headers } = createMockContext(ip, email);
    let thrownError: any;

    try {
      await guard.canActivate(ctx);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HttpException);
    expect(thrownError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(thrownError.getResponse()).toEqual({
      error: {
        code: "rate_limited",
        message: "Too many requests. Please try again later.",
        details: {
          retryAfter: expect.any(Number),
        },
      },
    });
    expect(headers["Retry-After"]).toBeDefined();
  });

  test("Different IPs have independent rate limit buckets", async () => {
    const guard = new AuthThrottlerGuard(mockRedis as unknown as Redis, {
      limit: 5,
      ttl: 60,
    });

    const ipA = "10.0.0.1";
    const ipB = "10.0.0.2";

    // Exhaust quota for IP A
    for (let i = 1; i <= 5; i++) {
      const { ctx } = createMockContext(ipA);
      await guard.canActivate(ctx);
    }

    // 6th for IP A blocked
    const { ctx: ctxA } = createMockContext(ipA);
    await expect(guard.canActivate(ctxA)).rejects.toThrow(HttpException);

    // 1st for IP B is still allowed
    const { ctx: ctxB } = createMockContext(ipB);
    const allowed = await guard.canActivate(ctxB);
    expect(allowed).toBe(true);
  });

  test("Different emails on same IP are individually throttled by email key", async () => {
    const guard = new AuthThrottlerGuard(mockRedis as unknown as Redis, {
      limit: 5,
      ttl: 60,
    });

    const ip = "172.16.0.1";
    const emailA = "user_a@test.com";

    // 5 attempts on email A
    for (let i = 1; i <= 5; i++) {
      const { ctx } = createMockContext(ip, emailA);
      await guard.canActivate(ctx);
    }

    // 6th attempt on email A blocked
    const { ctx: ctxA } = createMockContext(ip, emailA);
    await expect(guard.canActivate(ctxA)).rejects.toThrow(HttpException);
  });

  test("Fails open gracefully when Redis connection fails", async () => {
    const brokenRedis: any = {
      pipeline: () => {
        throw new Error("Redis connection refused");
      },
      on: jest.fn(),
    };

    const guard = new AuthThrottlerGuard(brokenRedis as unknown as Redis);
    const { ctx } = createMockContext("127.0.0.1", "test@test.com");

    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);
  });
});
