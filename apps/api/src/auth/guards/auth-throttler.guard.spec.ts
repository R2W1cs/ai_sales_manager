import type { ExecutionContext } from "@nestjs/common";
import { HttpException, HttpStatus } from "@nestjs/common";

import { AuthThrottlerGuard } from "./auth-throttler.guard";

describe("Auth rate limiting / throttles 5/min (T-AUTH-04)", () => {
  let mockRedis: {
    pipeline: jest.Mock;
    expire: jest.Mock;
    on: jest.Mock;
  };
  let mockPipeline: {
    incr: jest.Mock;
    ttl: jest.Mock;
    exec: jest.Mock;
  };
  let guard: AuthThrottlerGuard;

  const createMockContext = (
    ip = "192.168.1.1",
    body: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ) => {
    const req = {
      ip,
      body,
      headers,
      socket: { remoteAddress: ip },
    };
    const res = {
      header: jest.fn(),
    };
    return {
      context: {
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => res,
        }),
      } as unknown as ExecutionContext,
      req,
      res,
    };
  };

  beforeEach(() => {
    mockPipeline = {
      incr: jest.fn().mockReturnThis(),
      ttl: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };
    mockRedis = {
      pipeline: jest.fn().mockReturnValue(mockPipeline),
      expire: jest.fn().mockResolvedValue(1),
      on: jest.fn(),
    };
    guard = new AuthThrottlerGuard(mockRedis as any, { limit: 5, ttl: 60 });
  });

  it("Normal Traffic: 5 requests within 1 minute succeed normally.", async () => {
    for (let count = 1; count <= 5; count++) {
      mockPipeline.exec.mockResolvedValueOnce([
        [null, count],
        [null, 60 - count],
      ]);

      const { context, res } = createMockContext("10.0.0.1");
      const canActivate = await guard.canActivate(context);

      expect(canActivate).toBe(true);
      expect(res.header).not.toHaveBeenCalled();
    }

    expect(mockRedis.pipeline).toHaveBeenCalledTimes(5);
    expect(mockPipeline.incr).toHaveBeenCalledWith("rate_limit:auth:ip:10.0.0.1");
  });

  it("Rate Limit Breach (429): 6th request returns 429 Too Many Requests with code: rate_limited.", async () => {
    mockPipeline.exec.mockResolvedValueOnce([
      [null, 6],
      [null, 45],
    ]);

    const { context, res } = createMockContext("10.0.0.1");

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

    try {
      mockPipeline.exec.mockResolvedValueOnce([
        [null, 6],
        [null, 45],
      ]);
      await guard.canActivate(context);
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err.getResponse()).toEqual({
        error: {
          code: "rate_limited",
          message: "Too many requests. Please try again later.",
          details: {
            retryAfter: 45,
          },
        },
      });
      expect(res.header).toHaveBeenCalledWith("Retry-After", "45");
    }
  });

  it("Rate Limit Breach on Email: 6th request for same email returns 429 even from different IPs.", async () => {
    mockPipeline.exec.mockResolvedValueOnce([
      [null, 1], // IP count = 1
      [null, 60], // IP TTL
      [null, 6], // Email count = 6 (> 5)
      [null, 40], // Email TTL = 40
    ]);

    const { context, res } = createMockContext("10.0.0.99", { email: "target@example.com" });

    try {
      await guard.canActivate(context);
      fail("Expected guard to throw 429 for email breach");
    } catch (err: any) {
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err.getResponse()).toEqual({
        error: {
          code: "rate_limited",
          message: "Too many requests. Please try again later.",
          details: {
            retryAfter: 40,
          },
        },
      });
      expect(res.header).toHaveBeenCalledWith("Retry-After", "40");
    }

    expect(mockPipeline.incr).toHaveBeenCalledWith("rate_limit:auth:ip:10.0.0.99");
    expect(mockPipeline.incr).toHaveBeenCalledWith("rate_limit:auth:email:target@example.com");
  });

  it("Header Invariant: Response includes `Retry-After` integer header indicating remaining seconds.", async () => {
    mockPipeline.exec.mockResolvedValueOnce([
      [null, 7],
      [null, 32],
    ]);

    const { context, res } = createMockContext("10.0.0.2");

    try {
      await guard.canActivate(context);
      fail("Expected guard to throw HttpException 429");
    } catch (err: any) {
      expect(err.getStatus()).toBe(429);
      expect(res.header).toHaveBeenCalledWith("Retry-After", "32");
    }
  });

  it("Fail Safe: If Redis is temporarily unreachable or throws, fails open with warning log", async () => {
    mockPipeline.exec.mockRejectedValueOnce(new Error("Redis connection refused"));

    const { context } = createMockContext("10.0.0.3");
    const canActivate = await guard.canActivate(context);

    // Fail open: traffic is allowed through
    expect(canActivate).toBe(true);
  });

  it("uses the proxy-resolved client IP rather than the raw header", async () => {
    mockPipeline.exec.mockResolvedValueOnce([
      [null, 1],
      [null, 60],
    ]);

    // The adapter runs with `trustProxy`, so Fastify has already parsed
    // X-Forwarded-For into `request.ip` before any guard sees the request.
    const { context } = createMockContext(
      "203.0.113.195",
      {},
      {
        "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
      },
    );

    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(mockPipeline.incr).toHaveBeenCalledWith("rate_limit:auth:ip:203.0.113.195");
  });

  it("ignores a spoofed X-Forwarded-For that the proxy did not vouch for", async () => {
    mockPipeline.exec.mockResolvedValueOnce([
      [null, 1],
      [null, 60],
    ]);

    // Without a trusted proxy Fastify leaves `request.ip` as the socket peer.
    // Honouring the header here would let a caller rotate fake IPs to defeat
    // the auth rate limit (NFR-SEC-09).
    const { context } = createMockContext("198.51.100.7", {}, { "x-forwarded-for": "1.2.3.4" });

    await guard.canActivate(context);

    expect(mockPipeline.incr).toHaveBeenCalledWith("rate_limit:auth:ip:198.51.100.7");
    expect(mockPipeline.incr).not.toHaveBeenCalledWith("rate_limit:auth:ip:1.2.3.4");
  });

  it("sets TTL on first request when count is 1", async () => {
    mockPipeline.exec.mockResolvedValueOnce([
      [null, 1],
      [null, -1],
    ]);

    const { context } = createMockContext("10.0.0.4");
    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(mockRedis.expire).toHaveBeenCalledWith("rate_limit:auth:ip:10.0.0.4", 60);
  });
});
