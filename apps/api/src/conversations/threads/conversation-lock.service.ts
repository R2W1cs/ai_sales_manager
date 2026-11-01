import { randomUUID } from "node:crypto";

import {
  ConflictException,
  Injectable,
  Logger,
  type OnModuleDestroy,
  Optional,
} from "@nestjs/common";
import Redis from "ioredis";

import { env } from "@app/shared/server";

export interface LockOptions {
  /**
   * Lock expiration TTL in milliseconds.
   * Default: 20_000 (20 seconds).
   */
  ttlMs?: number;

  /**
   * Number of retry attempts when lock cannot be acquired immediately.
   * Default: 0 for direct acquireLock, 60 for withLock.
   */
  retryAttempts?: number;

  /**
   * Delay between retry attempts in milliseconds.
   * Default: 50 ms.
   */
  retryDelayMs?: number;

  /**
   * Whether to automatically renew the lock heartbeat periodically until released.
   * Default: true.
   */
  autoRenew?: boolean;

  /**
   * Interval in milliseconds between renewal heartbeats.
   * Default: Math.floor(ttlMs / 2).
   */
  renewIntervalMs?: number;
}

export interface LockHandle {
  key: string;
  token: string;
  ttlMs: number;
  businessId?: string;
  convId?: string;
  renewTimer?: NodeJS.Timeout;
}

/**
 * Thrown when a conversation lock cannot be acquired within the configured retries/timeout.
 * HTTP 409 Conflict.
 */
export class ConversationLockException extends ConflictException {
  constructor(
    public readonly businessId: string,
    public readonly convId: string,
    message?: string,
  ) {
    super({
      error: {
        code: "conversation_locked",
        message:
          message ??
          `Could not acquire exclusive lock for conversation ${convId} (business ${businessId}). Concurrent turn in progress.`,
      },
    });
  }
}

/**
 * Atomic Lua script to release lock ONLY if token matches.
 * Prevents stale worker from deleting a subsequent worker's lock.
 */
const RELEASE_LUA_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Atomic Lua script to renew lock TTL ONLY if token matches.
 */
const EXTEND_LUA_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

@Injectable()
export class ConversationLockService implements OnModuleDestroy {
  private readonly logger = new Logger(ConversationLockService.name);
  private redis: Redis | null = null;
  private readonly isOwnedClient: boolean;

  constructor(@Optional() redisClient?: Redis) {
    if (redisClient) {
      this.redis = redisClient;
      this.isOwnedClient = false;
    } else {
      this.isOwnedClient = true;
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
            this.logger.warn(`Redis conversation lock connection error: ${err.message}`);
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to initialize Redis client for ConversationLockService: ${message}`,
        );
        this.redis = null;
      }
    }
  }

  /**
   * Generates the canonical Redis lock key for a conversation.
   * Format: conv:lock:{business_id}:{conversation_id}
   */
  getLockKey(businessId: string, convId: string): string {
    return `conv:lock:${businessId}:${convId}`;
  }

  /**
   * Generates the shared processing lock key per 14 §6.
   * Format: conversation:{id}:processing
   */
  getTurnProcessingKey(convId: string): string {
    return `conversation:${convId}:processing`;
  }

  /**
   * Executes a handler within a distributed lock boundary.
   * Guarantees release in a finally block even on errors.
   */
  async withLock<T>(
    businessId: string,
    convId: string,
    handler: (token: string) => Promise<T> | T,
    options?: LockOptions,
  ): Promise<T> {
    const mergedOptions: LockOptions = {
      ttlMs: 20_000,
      retryAttempts: 60,
      retryDelayMs: 50,
      autoRenew: true,
      renewIntervalMs: 10_000,
      ...options,
    };

    const handle = await this.acquireLock(businessId, convId, mergedOptions);
    if (!handle) {
      throw new ConversationLockException(
        businessId,
        convId,
        `Failed to acquire lock for conversation ${convId} within timeout (${
          (mergedOptions.retryAttempts ?? 0) * (mergedOptions.retryDelayMs ?? 50)
        }ms)`,
      );
    }

    try {
      return await handler(handle.token);
    } finally {
      await this.releaseLock(handle);
    }
  }

  /**
   * Attempts to acquire a distributed lock for a conversation.
   * Returns a LockHandle if acquired, or null if acquisition failed.
   */
  async acquireLock(
    businessId: string,
    convId: string,
    options?: LockOptions,
  ): Promise<LockHandle | null> {
    const key = this.getLockKey(businessId, convId);
    const ttlMs = options?.ttlMs ?? 20_000;
    const retryAttempts = options?.retryAttempts ?? 0;
    const retryDelayMs = options?.retryDelayMs ?? 50;
    const autoRenew = options?.autoRenew ?? true;
    const renewIntervalMs = options?.renewIntervalMs ?? Math.floor(ttlMs / 2);

    const token = randomUUID();

    let attempts = 0;
    while (attempts <= retryAttempts) {
      const acquired = await this.trySetLock(key, token, ttlMs);
      if (acquired) {
        const handle: LockHandle = {
          key,
          token,
          ttlMs,
          businessId,
          convId,
        };

        if (autoRenew && renewIntervalMs > 0) {
          const timer = setInterval(() => {
            this.extendLock(key, token, ttlMs)
              .then((extended) => {
                if (!extended) {
                  this.logger.warn(`Failed to auto-renew lock for ${key}; clearing timer`);
                  clearInterval(timer);
                  if (handle.renewTimer === timer) {
                    handle.renewTimer = undefined;
                  }
                }
              })
              .catch((err: unknown) => {
                this.logger.warn(
                  `Error during lock auto-renewal for ${key}: ${
                    err instanceof Error ? err.message : String(err)
                  }`,
                );
                clearInterval(timer);
                if (handle.renewTimer === timer) {
                  handle.renewTimer = undefined;
                }
              });
          }, renewIntervalMs);

          timer.unref();
          handle.renewTimer = timer;
        }

        return handle;
      }

      attempts++;
      if (attempts <= retryAttempts) {
        await this.sleep(retryDelayMs);
      }
    }

    return null;
  }

  /**
   * Releases a distributed lock using atomic compare-and-delete.
   * Cancels renewal timer if active.
   */
  async releaseLock(handleOrParams: LockHandle | { key: string; token: string }): Promise<boolean> {
    if ("renewTimer" in handleOrParams && handleOrParams.renewTimer) {
      clearInterval(handleOrParams.renewTimer);
      handleOrParams.renewTimer = undefined;
    }

    const { key, token } = handleOrParams;
    if (!this.redis) {
      return false;
    }

    try {
      const res = await this.redis.eval(RELEASE_LUA_SCRIPT, 1, key, token);
      return Number(res) === 1;
    } catch (err) {
      this.logger.warn(
        `Failed to release lock for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * Extends the TTL of an active lock using atomic compare-and-pexpire.
   */
  async extendLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    if (!this.redis) {
      return false;
    }
    try {
      const res = await this.redis.eval(EXTEND_LUA_SCRIPT, 1, key, token, String(ttlMs));
      return Number(res) === 1;
    } catch (err) {
      this.logger.warn(
        `Failed to extend lock for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * Validates whether a given token still holds the active lock.
   */
  async validateToken(businessId: string, convId: string, token: string): Promise<boolean> {
    const key = this.getLockKey(businessId, convId);
    if (!this.redis) {
      return false;
    }
    try {
      const currentToken = await this.redis.get(key);
      return currentToken === token;
    } catch (err) {
      this.logger.warn(
        `Failed to validate lock token for ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  /**
   * Checks whether a lock key currently exists in Redis.
   */
  async isLocked(businessId: string, convId: string): Promise<boolean> {
    const key = this.getLockKey(businessId, convId);
    if (!this.redis) {
      return false;
    }
    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (err) {
      this.logger.warn(
        `Failed to check lock existence for ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  private async trySetLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    if (!this.redis) {
      return false;
    }
    try {
      const res = await this.redis.set(key, token, "PX", ttlMs, "NX");
      return res === "OK";
    } catch (err) {
      this.logger.warn(
        `Redis SET NX failed for key ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isOwnedClient && this.redis) {
      try {
        await this.redis.quit();
      } catch {
        // ignore connection teardown error
      }
    }
  }
}
