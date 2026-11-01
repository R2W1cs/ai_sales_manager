import { Injectable } from "@nestjs/common";
import { HealthIndicatorService, type HealthIndicatorResult } from "@nestjs/terminus";
import Redis from "ioredis";

import { env } from "@app/shared/server";

import { logger } from "../../lib/logger";
import { prisma as defaultPrisma } from "../../lib/prisma";
import { InjectPrisma, type PrismaClient } from "../core/prisma.token";

/** Readiness probes must not hang the ALB check (interval 30s, timeout 5s per 18 §6). */
const PROBE_TIMEOUT_MS = 3000;

function withTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_resolve, reject) =>
      setTimeout(
        () => reject(new Error(`${label} probe timed out after ${PROBE_TIMEOUT_MS}ms`)),
        PROBE_TIMEOUT_MS,
      ).unref(),
    ),
  ]);
}

/**
 * Readiness dependencies for `GET /ready` (13 §2.10): Postgres and Redis.
 *
 * Failures are reported as `down` with a message, never thrown, so the health
 * check returns a structured 503 rather than a stack trace. Probe errors are
 * logged without connection strings or credentials.
 */
@Injectable()
export class HealthIndicatorsService {
  private redis: Redis | null = null;

  private readonly prisma: PrismaClient;

  constructor(
    private readonly healthIndicator: HealthIndicatorService,
    @InjectPrisma() prismaClient?: PrismaClient,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  async checkDatabase(): Promise<HealthIndicatorResult<"database">> {
    const indicator = this.healthIndicator.check("database");
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, "database");
      return indicator.up();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown error";
      logger.warn({ probe: "database" }, "Readiness probe failed");
      return indicator.down({ message });
    }
  }

  async checkRedis(): Promise<HealthIndicatorResult<"redis">> {
    const indicator = this.healthIndicator.check("redis");
    try {
      const client = this.getRedis();
      if (!client) {
        return indicator.down({ message: "Redis is not configured" });
      }
      // The client is created with `lazyConnect`, so the first probe has to
      // open the connection. Without this, `enableOfflineQueue: false` rejects
      // PING with "Stream isn't writeable" and readiness never recovers.
      await withTimeout(this.ensureConnected(client), "redis connect");
      await withTimeout(client.ping(), "redis");
      return indicator.up();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown error";
      logger.warn({ probe: "redis" }, "Readiness probe failed");
      return indicator.down({ message });
    }
  }

  /** Opens the lazy connection, tolerating concurrent probes. */
  private async ensureConnected(client: Redis): Promise<void> {
    if (client.status === "ready") return;
    if (client.status === "connecting" || client.status === "connect") {
      await new Promise<void>((resolve, reject) => {
        client.once("ready", resolve);
        client.once("error", reject);
      });
      return;
    }
    await client.connect();
  }

  /** Lazily created so a missing Redis URL does not break process start-up. */
  private getRedis(): Redis | null {
    if (this.redis) return this.redis;

    if (typeof env.REDIS_URL === "string" && env.REDIS_URL.length > 0) {
      this.redis = new Redis(env.REDIS_URL, {
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
    } else {
      return null;
    }

    this.redis.on("error", (err: Error) => {
      logger.warn({ err: err.message }, "Health check Redis connection error");
    });
    return this.redis;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }
    await Promise.resolve();
  }
}
