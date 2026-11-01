/**
 * Health surface contract (13 §2.10, 18 §6, 18 §13).
 *
 * `/ready` is the ALB matcher for the backend, so it must return 200 only when
 * Postgres *and* Redis answer, and 503 otherwise. Liveness must never depend on
 * either, or a database blip would cycle every task.
 */
import { TerminusModule } from "@nestjs/terminus";

jest.mock("../../src/lib/queue.js", () => ({ connection: {} }));
jest.mock("../../src/lib/queue", () => ({ connection: {} }));

import { PRISMA_CLIENT } from "../../src/platform/core/prisma.token";
import { HealthIndicatorsService } from "../../src/platform/health/health-indicators.service";
import { HealthController } from "../../src/platform/health/health.controller";
import { startHttpApp, type HttpTestApp } from "./harness";

interface ProbeState {
  dbOk: boolean;
  redisOk: boolean;
}

/** Stands in for the Redis client the indicator lazily builds. */
function stubIndicators(state: ProbeState) {
  return {
    provide: HealthIndicatorsService,
    inject: [],
    useFactory: () => {
      // Reuse the real result shape by delegating to a minimal session object.
      const session = (key: string) => ({
        up: () => ({ [key]: { status: "up" } }),
        down: (data?: Record<string, unknown>) => ({
          [key]: { status: "down", ...data },
        }),
      });
      return {
        checkDatabase: () =>
          Promise.resolve(
            state.dbOk
              ? session("database").up()
              : session("database").down({ message: "connection refused" }),
          ),
        checkRedis: () =>
          Promise.resolve(
            state.redisOk
              ? session("redis").up()
              : session("redis").down({ message: "connection refused" }),
          ),
      };
    },
  };
}

describe("health surfaces", () => {
  describe("liveness", () => {
    let harness: HttpTestApp;

    beforeAll(async () => {
      harness = await startHttpApp({
        imports: [TerminusModule],
        controllers: [HealthController],
        providers: [
          { provide: PRISMA_CLIENT, useValue: {} },
          stubIndicators({ dbOk: true, redisOk: true }),
        ],
      });
    });

    afterAll(async () => {
      await harness.close();
    });

    it("GET /health/live is 200 and checks no dependencies", async () => {
      const response = await harness.fetch("/health/live");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "ok" });
    });

    it("GET /health mirrors liveness on the backend", async () => {
      const response = await harness.fetch("/health");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "ok" });
    });

    it("does not expose /health/ready as a second readiness target", async () => {
      // 13 §2.10 forbids it, so the ALB cannot be pointed at the wrong path.
      const response = await harness.fetch("/health/ready");
      expect(response.status).toBe(404);
    });
  });

  describe("readiness when dependencies are healthy", () => {
    let harness: HttpTestApp;

    beforeAll(async () => {
      harness = await startHttpApp({
        imports: [TerminusModule],
        controllers: [HealthController],
        providers: [
          { provide: PRISMA_CLIENT, useValue: {} },
          stubIndicators({ dbOk: true, redisOk: true }),
        ],
      });
    });

    afterAll(async () => {
      await harness.close();
    });

    it("GET /ready is 200 and reports both dependencies up", async () => {
      const response = await harness.fetch("/ready");
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        status: string;
        info?: Record<string, { status: string }>;
      };
      expect(body.status).toBe("ok");
      expect(body.info?.database?.status).toBe("up");
      expect(body.info?.redis?.status).toBe("up");
    });
  });

  describe("readiness when Postgres is unreachable", () => {
    let harness: HttpTestApp;

    beforeAll(async () => {
      harness = await startHttpApp({
        imports: [TerminusModule],
        controllers: [HealthController],
        providers: [
          { provide: PRISMA_CLIENT, useValue: {} },
          stubIndicators({ dbOk: false, redisOk: true }),
        ],
      });
    });

    afterAll(async () => {
      await harness.close();
    });

    it("GET /ready is 503 so the ALB drains the task", async () => {
      const response = await harness.fetch("/ready");
      expect(response.status).toBe(503);

      const body = (await response.json()) as {
        status: string;
        error?: Record<string, { status: string }>;
      };
      expect(body.status).toBe("error");
      expect(body.error?.database?.status).toBe("down");
    });
  });

  describe("readiness when Redis is unreachable", () => {
    let harness: HttpTestApp;

    beforeAll(async () => {
      harness = await startHttpApp({
        imports: [TerminusModule],
        controllers: [HealthController],
        providers: [
          { provide: PRISMA_CLIENT, useValue: {} },
          stubIndicators({ dbOk: true, redisOk: false }),
        ],
      });
    });

    afterAll(async () => {
      await harness.close();
    });

    it("GET /ready is 503 — Postgres alone is not ready (18 §13)", async () => {
      const response = await harness.fetch("/ready");
      expect(response.status).toBe(503);

      const body = (await response.json()) as {
        error?: Record<string, { status: string }>;
      };
      expect(body.error?.redis?.status).toBe("down");
    });
  });
});
