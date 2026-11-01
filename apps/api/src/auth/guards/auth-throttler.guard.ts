import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { HttpException, HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import Redis from "ioredis";

import { env } from "@app/shared/server";

import { clientIp, type HttpReply, type HttpRequest } from "../../platform/core/http";

export interface RateLimitOptions {
  limit?: number;
  ttl?: number;
  keyPrefix?: string;
}

@Injectable()
export class AuthThrottlerGuard implements CanActivate {
  private readonly logger = new Logger(AuthThrottlerGuard.name);
  private redis: Redis | null = null;
  private readonly limit: number;
  private readonly ttl: number;
  private readonly keyPrefix: string;

  constructor(@Optional() redisClient?: Redis, @Optional() options?: RateLimitOptions) {
    this.limit = options?.limit ?? 5;
    this.ttl = options?.ttl ?? 60;
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

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<HttpRequest>();
    const res = http.getResponse<HttpReply>();

    const ip = this.resolveClientIp(req);
    const ipKey = `${this.keyPrefix}ip:${ip}`;

    const rawEmail = (req.body as { email?: unknown } | undefined)?.email;
    const emailKey =
      typeof rawEmail === "string" && rawEmail.trim().length > 0
        ? `${this.keyPrefix}email:${rawEmail.toLowerCase().trim()}`
        : null;

    try {
      const redis = this.redis;
      if (!redis) {
        return true;
      }

      const keysToCheck = emailKey ? [ipKey, emailKey] : [ipKey];
      const pipeline = redis.pipeline();

      for (const key of keysToCheck) {
        pipeline.incr(key);
        pipeline.ttl(key);
      }

      const results = await pipeline.exec();
      if (!results || results.length < keysToCheck.length * 2) {
        return true;
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
          remainingTtl = this.ttl;
        }

        if (count > this.limit) {
          limitBreached = true;
          const retryAfter = remainingTtl > 0 ? remainingTtl : this.ttl;
          if (retryAfter > maxRetryAfter) {
            maxRetryAfter = retryAfter;
          }
        }
      }

      if (keysToExpire.length > 0) {
        await Promise.all(keysToExpire.map((key) => redis.expire(key, this.ttl)));
      }

      if (limitBreached) {
        const retryAfter = maxRetryAfter > 0 ? maxRetryAfter : this.ttl;
        if (typeof res.header === "function") {
          void res.header("Retry-After", String(retryAfter));
        }

        throw new HttpException(
          {
            error: {
              code: "rate_limited",
              message: "Too many requests. Please try again later.",
              details: {
                retryAfter,
              },
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Rate limit check encountered error; failing open: ${message}`);
      return true;
    }
  }

  private resolveClientIp(req: HttpRequest): string {
    // `request.ip` already resolves X-Forwarded-For because the adapter runs
    // with `trustProxy` enabled (18 §1).
    return clientIp(req);
  }
}
