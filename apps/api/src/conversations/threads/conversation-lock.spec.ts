import type Redis from "ioredis";

import { ConversationLockException, ConversationLockService } from "./conversation-lock.service";

class InMemoryMockRedis {
  public store = new Map<string, { value: string; expiresAt: number }>();
  public evalCalls: { script: string; keys: string[]; args: string[] }[] = [];
  public setCalls: { key: string; value: string; ttlMs: number; mode?: string }[] = [];

  async set(
    key: string,
    value: string,
    pxArg?: string,
    ttlMs?: number,
    nxArg?: string,
  ): Promise<"OK" | null> {
    await Promise.resolve();
    this.cleanExpired();
    this.setCalls.push({ key, value, ttlMs: ttlMs ?? 0, mode: nxArg });

    if (nxArg === "NX" && this.store.has(key)) {
      return null;
    }

    const ttl = pxArg === "PX" && typeof ttlMs === "number" ? ttlMs : 20_000;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    await Promise.resolve();
    this.cleanExpired();
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  async exists(key: string): Promise<number> {
    await Promise.resolve();
    this.cleanExpired();
    return this.store.has(key) ? 1 : 0;
  }

  async eval(script: string, numKeys: number, ...args: string[]): Promise<number> {
    await Promise.resolve();
    this.cleanExpired();
    const keys = args.slice(0, numKeys);
    const scriptArgs = args.slice(numKeys);
    this.evalCalls.push({ script, keys, args: scriptArgs });

    const key = keys[0];
    const entry = key ? this.store.get(key) : undefined;

    // Release Lua script: if get == token then del
    if (script.includes("del")) {
      const expectedToken = scriptArgs[0];
      if (entry && key && entry.value === expectedToken) {
        this.store.delete(key);
        return 1;
      }
      return 0;
    }

    // Extend Lua script: if get == token then pexpire
    if (script.includes("pexpire")) {
      const expectedToken = scriptArgs[0];
      const newTtlMs = Number(scriptArgs[1]);
      if (entry && key && entry.value === expectedToken) {
        entry.expiresAt = Date.now() + newTtlMs;
        this.store.set(key, entry);
        return 1;
      }
      return 0;
    }

    return 0;
  }

  async quit(): Promise<"OK"> {
    await Promise.resolve();
    this.store.clear();
    return "OK";
  }

  public cleanExpired(now = Date.now()): void {
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  public advanceTime(ms: number): void {
    const targetNow = Date.now() + ms;
    this.cleanExpired(targetNow);
  }
}

describe("Redis distributed conversation lock for AI/human turns (T-CONV-04)", () => {
  let mockRedis: InMemoryMockRedis;
  let service: ConversationLockService;

  const businessId = "biz-100";
  const convId = "conv-200";

  beforeEach(() => {
    mockRedis = new InMemoryMockRedis();
    service = new ConversationLockService(mockRedis as unknown as Redis);
  });

  describe("Key naming & formats", () => {
    it("generates correct lock key format conv:lock:{business_id}:{conversation_id}", () => {
      const key = service.getLockKey("b123", "c456");
      expect(key).toBe("conv:lock:b123:c456");
    });

    it("generates turn processing key conversation:{id}:processing per 14 §6", () => {
      const key = service.getTurnProcessingKey("c456");
      expect(key).toBe("conversation:c456:processing");
    });
  });

  describe("Concurrency Safety", () => {
    it("Concurrency Safety: Concurrent executions on same conversation are serialized.", async () => {
      const executionTimeline: { worker: string; stage: "start" | "end"; timestamp: number }[] = [];

      const worker1 = service.withLock(
        businessId,
        convId,
        async () => {
          executionTimeline.push({ worker: "W1", stage: "start", timestamp: Date.now() });
          await new Promise((r) => setTimeout(r, 60));
          executionTimeline.push({ worker: "W1", stage: "end", timestamp: Date.now() });
          return "W1-result";
        },
        { retryAttempts: 50, retryDelayMs: 15 },
      );

      const worker2 = service.withLock(
        businessId,
        convId,
        async () => {
          executionTimeline.push({ worker: "W2", stage: "start", timestamp: Date.now() });
          await new Promise((r) => setTimeout(r, 30));
          executionTimeline.push({ worker: "W2", stage: "end", timestamp: Date.now() });
          return "W2-result";
        },
        { retryAttempts: 50, retryDelayMs: 15 },
      );

      const [res1, res2] = await Promise.all([worker1, worker2]);

      expect(res1).toBe("W1-result");
      expect(res2).toBe("W2-result");

      // Verify strict non-overlapping serialization:
      // Worker 1 starts, then Worker 1 ends, then Worker 2 starts, then Worker 2 ends
      expect(executionTimeline).toHaveLength(4);
      const [t0, t1, t2, t3] = executionTimeline;
      expect(t0?.worker).toBe("W1");
      expect(t0?.stage).toBe("start");
      expect(t1?.worker).toBe("W1");
      expect(t1?.stage).toBe("end");
      expect(t2?.worker).toBe("W2");
      expect(t2?.stage).toBe("start");
      expect(t3?.worker).toBe("W2");
      expect(t3?.stage).toBe("end");
    });

    it("allows independent conversations to execute concurrently in parallel", async () => {
      const startTimes: Record<string, number> = {};

      const task1 = service.withLock(businessId, "conv-A", async () => {
        startTimes["conv-A"] = Date.now();
        await new Promise((r) => setTimeout(r, 40));
        return "A";
      });

      const task2 = service.withLock(businessId, "conv-B", async () => {
        startTimes["conv-B"] = Date.now();
        await new Promise((r) => setTimeout(r, 40));
        return "B";
      });

      const [resA, resB] = await Promise.all([task1, task2]);

      expect(resA).toBe("A");
      expect(resB).toBe("B");
      const startTimeA = startTimes["conv-A"] ?? 0;
      const startTimeB = startTimes["conv-B"] ?? 0;
      expect(Math.abs(startTimeA - startTimeB)).toBeLessThan(35);
    });

    it("throws ConversationLockException when lock cannot be acquired within retry timeout", async () => {
      // Hold lock manually
      await service.acquireLock(businessId, convId, { ttlMs: 10_000 });

      // Attempt with small retry
      await expect(
        service.withLock(
          businessId,
          convId,
          async () => {
            await Promise.resolve();
            return "should-not-run";
          },
          { retryAttempts: 2, retryDelayMs: 10 },
        ),
      ).rejects.toThrow(ConversationLockException);
    });
  });

  describe("Guaranteed Release", () => {
    it("releases the lock in finally block when handler completes successfully", async () => {
      const lockKey = service.getLockKey(businessId, convId);

      const result = await service.withLock(businessId, convId, async () => {
        const locked = await service.isLocked(businessId, convId);
        expect(locked).toBe(true);
        return 42;
      });

      expect(result).toBe(42);
      expect(mockRedis.store.has(lockKey)).toBe(false);
      const isLockedAfter = await service.isLocked(businessId, convId);
      expect(isLockedAfter).toBe(false);
    });

    it("releases the lock in finally block even when handler throws unhandled error", async () => {
      const lockKey = service.getLockKey(businessId, convId);

      await expect(
        service.withLock(businessId, convId, async () => {
          await Promise.resolve();
          throw new Error("Simulated LLM pipeline crash");
        }),
      ).rejects.toThrow("Simulated LLM pipeline crash");

      // Lock MUST be released
      expect(mockRedis.store.has(lockKey)).toBe(false);
      expect(await service.isLocked(businessId, convId)).toBe(false);
    });
  });

  describe("TTL Expiration & Token Fencing", () => {
    it("TTL Expiration: Locks auto-expire safely if worker crashes.", async () => {
      const lockKey = service.getLockKey(businessId, convId);

      // Worker 1 acquires lock with short TTL (40ms) and simulates a crash (no release)
      const handle1 = await service.acquireLock(businessId, convId, {
        ttlMs: 40,
        autoRenew: false,
      });
      expect(handle1).not.toBeNull();
      expect(mockRedis.store.has(lockKey)).toBe(true);

      // Simulate TTL expiration in Redis
      const existingEntry = mockRedis.store.get(lockKey);
      if (existingEntry) {
        existingEntry.expiresAt = Date.now() - 1;
      }

      // Worker 2 should be able to acquire lock now that it has expired
      const handle2 = await service.acquireLock(businessId, convId, {
        ttlMs: 5_000,
        autoRenew: false,
      });
      expect(handle2).not.toBeNull();
      if (handle1 && handle2) {
        expect(handle2.token).not.toBe(handle1.token);

        // When the crashed Worker 1 wakes up and attempts late release, it must NOT delete Worker 2's lock
        const releasedByStaleWorker = await service.releaseLock(handle1);
        expect(releasedByStaleWorker).toBe(false);

        // Worker 2's lock is still intact
        expect(mockRedis.store.has(lockKey)).toBe(true);
        const currentToken = await mockRedis.get(lockKey);
        expect(currentToken).toBe(handle2.token);

        // Worker 2 releases cleanly
        const releasedByActiveWorker = await service.releaseLock(handle2);
        expect(releasedByActiveWorker).toBe(true);
      }
      expect(mockRedis.store.has(lockKey)).toBe(false);
    });
  });

  describe("Lock Auto-Renewal (Heartbeat)", () => {
    it("automatically extends lock TTL at renewal intervals", async () => {
      const handle = await service.acquireLock(businessId, convId, {
        ttlMs: 200,
        autoRenew: true,
        renewIntervalMs: 50,
      });

      expect(handle).not.toBeNull();
      expect(handle?.renewTimer).toBeDefined();

      // Wait for at least one renewal cycle
      await new Promise((r) => setTimeout(r, 120));

      const extendCalls = mockRedis.evalCalls.filter((c) => c.script.includes("pexpire"));
      expect(extendCalls.length).toBeGreaterThanOrEqual(1);

      if (handle) {
        await service.releaseLock(handle);
      }
      expect(handle?.renewTimer).toBeUndefined();
    });
  });

  describe("Token Validation & State Checks", () => {
    it("validateToken verifies active token ownership accurately", async () => {
      const handle = await service.acquireLock(businessId, convId, {
        ttlMs: 5_000,
        autoRenew: false,
      });

      if (handle) {
        expect(await service.validateToken(businessId, convId, handle.token)).toBe(true);
        expect(await service.validateToken(businessId, convId, "wrong-uuid-token")).toBe(false);

        await service.releaseLock(handle);
        expect(await service.validateToken(businessId, convId, handle.token)).toBe(false);
      }
    });
  });

  describe("Fail-Safe & Missing Redis handling", () => {
    it("handles null Redis client gracefully", async () => {
      const disconnectedService = new ConversationLockService(undefined);
      // Forced null redis client simulation
      (disconnectedService as unknown as { redis: null }).redis = null;

      const handle = await disconnectedService.acquireLock(businessId, convId);
      expect(handle).toBeNull();

      const isLocked = await disconnectedService.isLocked(businessId, convId);
      expect(isLocked).toBe(false);

      const isReleased = await disconnectedService.releaseLock({ key: "k", token: "t" });
      expect(isReleased).toBe(false);
    });

    it("handles Redis command errors without unhandled rejections", async () => {
      const brokenRedis = {
        set: jest.fn().mockRejectedValue(new Error("Redis connection dropped")),
        get: jest.fn().mockRejectedValue(new Error("Redis connection dropped")),
        exists: jest.fn().mockRejectedValue(new Error("Redis connection dropped")),
        eval: jest.fn().mockRejectedValue(new Error("Redis connection dropped")),
      };

      const errorService = new ConversationLockService(brokenRedis as unknown as Redis);

      const handle = await errorService.acquireLock(businessId, convId, { retryAttempts: 0 });
      expect(handle).toBeNull();

      const isLocked = await errorService.isLocked(businessId, convId);
      expect(isLocked).toBe(false);

      const isValid = await errorService.validateToken(businessId, convId, "token");
      expect(isValid).toBe(false);

      const released = await errorService.releaseLock({ key: "k", token: "t" });
      expect(released).toBe(false);
    });
  });
});
