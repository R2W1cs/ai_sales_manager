import * as crypto from "node:crypto";

import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { HttpException, HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import Redis from "ioredis";

import { env } from "@app/shared/server";

import { clientIp, requestPath, type HttpReply, type HttpRequest } from "../../platform/core/http";
import { resolveBetterAuthSession } from "../better-auth/session-helper";

export interface RateLimitOptions {
  limit?: number;
  ttl?: number;
  keyPrefix?: string;
}

export interface RateLimitBucketConfig {
  bucket: string;
  limit: number;
  ttl: number;
  includeEmail: boolean;
}

const DEFAULT_BUCKET_WINDOW_SECONDS = 60;

/**
 * Resolves the authoritative rate-limit bucket and threshold for a request path + method.
 *
 * Separate buckets prevent one auth flow (e.g. password recovery) from starving another
 * (e.g. sign-in or MFA challenge), and prevent session reads from hitting strict mutation limits.
 */
export function resolveAuthRateLimitBucket(
  method: string | undefined,
  rawPath: string | undefined,
  fallback?: { limit?: number; ttl?: number },
): RateLimitBucketConfig {
  const normalizedMethod = (method || "POST").toUpperCase();
  const path = (rawPath || "").split("?")[0] || "";

  if (!path) {
    return {
      bucket: "default",
      limit: fallback?.limit ?? 5,
      ttl: fallback?.ttl ?? DEFAULT_BUCKET_WINDOW_SECONDS,
      includeEmail: true,
    };
  }

  // Better Auth & NestJS session/metadata reads
  if (normalizedMethod === "GET") {
    if (path.endsWith("/verify-email") || path.includes("/reset-password/")) {
      return {
        bucket: "recovery_redeem",
        limit: 10,
        ttl: DEFAULT_BUCKET_WINDOW_SECONDS,
        includeEmail: false,
      };
    }
    return {
      bucket: "session_read",
      limit: 120,
      ttl: DEFAULT_BUCKET_WINDOW_SECONDS,
      includeEmail: false,
    };
  }

  // Sign-in mutation
  if (path.endsWith("/sign-in/email")) {
    return {
      bucket: "signin",
      limit: 5,
      ttl: DEFAULT_BUCKET_WINDOW_SECONDS,
      includeEmail: true,
    };
  }

  // Sign-up mutation
  if (path.endsWith("/sign-up/email")) {
    return {
      bucket: "signup",
      limit: 5,
      ttl: DEFAULT_BUCKET_WINDOW_SECONDS,
      includeEmail: true,
    };
  }

  // Password reset request & verification resend (strictest email send bucket)
  if (
    path.endsWith("/request-password-reset") ||
    path.endsWith("/forget-password") ||
    path.endsWith("/send-verification-email")
  ) {
    return {
      bucket: "recovery_send",
      limit: 3,
      ttl: DEFAULT_BUCKET_WINDOW_SECONDS,
      includeEmail: true,
    };
  }

  // Token-only password reset redemption (no email in payload)
  if (path.endsWith("/reset-password")) {
    return {
      bucket: "recovery_redeem",
      limit: 10,
      ttl: DEFAULT_BUCKET_WINDOW_SECONDS,
      includeEmail: false,
    };
  }

  // MFA challenge & enrollment mutations
  if (path.includes("/two-factor/")) {
    return {
      bucket: "mfa",
      limit: 5,
      ttl: DEFAULT_BUCKET_WINDOW_SECONDS,
      includeEmail: false,
    };
  }

  // Workspace invitation mutations
  if (path.includes("/invitations")) {
    return {
      bucket: "invite",
      limit: 10,
      ttl: DEFAULT_BUCKET_WINDOW_SECONDS,
      includeEmail: false,
    };
  }

  return {
    bucket: "default",
    limit: fallback?.limit ?? 5,
    ttl: fallback?.ttl ?? DEFAULT_BUCKET_WINDOW_SECONDS,
    includeEmail: true,
  };
}

function extractCookieValue(
  cookieHeader: string | string[] | undefined,
  targetNames: string[],
): string | null {
  const raw = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const name = trimmed.slice(0, eqIndex).trim();
    if (targetNames.includes(name)) {
      const value = trimmed.slice(eqIndex + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

function hashTwoFactorChallengeCookie(cookieHeader: string | string[] | undefined): string | null {
  const token = extractCookieValue(cookieHeader, [
    "better-auth.two_factor",
    "__Secure-better-auth.two_factor",
  ]);
  if (!token) return null;
  const digest = crypto.createHash("sha256").update(token).digest("hex").slice(0, 24);
  return `2fa:${digest}`;
}

@Injectable()
export class AuthRateLimiterService {
  private readonly logger = new Logger(AuthRateLimiterService.name);
  private redis: Redis | null = null;
  private readonly defaultLimit: number;
  private readonly defaultTtl: number;
  private readonly keyPrefix: string;

  constructor(@Optional() redisClient?: Redis, @Optional() options?: RateLimitOptions) {
    this.defaultLimit = options?.limit ?? 5;
    this.defaultTtl = options?.ttl ?? 60;
    this.keyPrefix = options?.keyPrefix ?? "rate_limit:auth:";

    if (redisClient) {
      this.redis = redisClient;
    } else {
      try {
        const redisUrl = env.REDIS_URL;
        if (redisUrl) {
          this.redis = new Redis(redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
          });
        } else if (env.REDIS_HOST && env.REDIS_PORT) {
          this.redis = new Redis({
            host: env.REDIS_HOST,
            port: env.REDIS_PORT,
            password: env.REDIS_PASSWORD,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
          });
        }
        if (this.redis) {
          this.redis.on("error", (err) => {
            this.logger.warn(`Redis rate limit connection error: ${err.message}`);
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to initialize Redis client for rate limiting: ${message}`);
        this.redis = null;
      }
    }
  }

  async consume(params: {
    ip: string;
    email?: string | null;
    actorKey?: string | null;
    bucketConfig: RateLimitBucketConfig;
  }): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
    const redis = this.redis;
    if (!redis) {
      return { allowed: true };
    }

    const { bucket, limit, ttl, includeEmail } = params.bucketConfig;
    const prefix = bucket === "default" ? this.keyPrefix : `${this.keyPrefix}${bucket}:`;
    const ipKey = `${prefix}ip:${params.ip}`;
    const normalizedEmail =
      includeEmail && typeof params.email === "string" && params.email.trim().length > 0
        ? params.email.toLowerCase().trim()
        : null;
    const emailKey = normalizedEmail ? `${prefix}email:${normalizedEmail}` : null;
    const actorKey =
      typeof params.actorKey === "string" && params.actorKey.trim().length > 0
        ? `${prefix}actor:${params.actorKey.trim()}`
        : null;
    const keysToCheck = [ipKey];
    if (emailKey) keysToCheck.push(emailKey);
    if (actorKey) keysToCheck.push(actorKey);

    try {
      const pipeline = redis.pipeline();
      for (const key of keysToCheck) {
        pipeline.incr(key);
        pipeline.ttl(key);
      }

      const results = await pipeline.exec();
      if (!results || results.length < keysToCheck.length * 2) {
        return { allowed: true };
      }

      let maxRetryAfter = 0;
      let limitBreached = false;
      const keysToExpire: string[] = [];

      for (let i = 0; i < keysToCheck.length; i++) {
        const key = keysToCheck[i];
        if (!key) continue;

        const countResult = results[i * 2];
        const ttlResult = results[i * 2 + 1];

        const count = typeof countResult?.[1] === "number" ? countResult[1] : 0;
        let remainingTtl = typeof ttlResult?.[1] === "number" ? ttlResult[1] : -1;

        if (count === 1 || remainingTtl === -1) {
          keysToExpire.push(key);
          remainingTtl = ttl;
        }

        if (count > limit) {
          limitBreached = true;
          const retryAfter = remainingTtl > 0 ? remainingTtl : ttl;
          if (retryAfter > maxRetryAfter) {
            maxRetryAfter = retryAfter;
          }
        }
      }

      if (keysToExpire.length > 0) {
        await Promise.all(keysToExpire.map((key) => redis.expire(key, ttl)));
      }

      if (limitBreached) {
        return {
          allowed: false,
          retryAfter: maxRetryAfter > 0 ? maxRetryAfter : ttl,
        };
      }

      return { allowed: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Rate limit check encountered error; failing open: ${message}`);
      return { allowed: true };
    }
  }

  get defaults() {
    return { limit: this.defaultLimit, ttl: this.defaultTtl };
  }
}

@Injectable()
export class AuthThrottlerGuard implements CanActivate {
  private readonly limiter: AuthRateLimiterService;

  constructor(
    @Optional() redisOrLimiter?: Redis | AuthRateLimiterService,
    @Optional() options?: RateLimitOptions,
  ) {
    if (redisOrLimiter instanceof AuthRateLimiterService) {
      this.limiter = redisOrLimiter;
    } else {
      this.limiter = new AuthRateLimiterService(redisOrLimiter, options);
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<HttpRequest>();
    const res = http.getResponse<HttpReply>();

    const ip = clientIp(req);
    const path = typeof req.url === "string" ? requestPath(req) : "";
    const bucketConfig = resolveAuthRateLimitBucket(req.method, path, this.limiter.defaults);
    const rawEmail = (req.body as { email?: unknown } | undefined)?.email;

    let actorKey: string | null = null;
    if (bucketConfig.bucket === "mfa" || bucketConfig.bucket === "invite") {
      const reqWithUser = req as HttpRequest & { user?: { id?: string; sub?: string } };
      let userId = reqWithUser.user?.id ?? reqWithUser.user?.sub;
      if (!userId && req.headers.cookie) {
        const session = await resolveBetterAuthSession(req.headers);
        userId = session?.user?.id;
      }

      if (userId) {
        actorKey = `user:${userId}`;
      } else if (bucketConfig.bucket === "mfa") {
        actorKey = hashTwoFactorChallengeCookie(req.headers.cookie);
      }
    }

    const decision = await this.limiter.consume({
      ip,
      email: typeof rawEmail === "string" ? rawEmail : undefined,
      actorKey,
      bucketConfig,
    });

    if (!decision.allowed) {
      if (typeof res.header === "function") {
        void res.header("Retry-After", String(decision.retryAfter));
      }

      throw new HttpException(
        {
          error: {
            code: "rate_limited",
            message: "Too many requests. Please try again later.",
            details: {
              retryAfter: decision.retryAfter,
            },
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
