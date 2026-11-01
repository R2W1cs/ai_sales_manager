import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService, type HealthCheckResult } from "@nestjs/terminus";

import { HealthIndicatorsService } from "./health-indicators.service";

/**
 * Health surfaces (13 §2.10). Public, and deliberately outside `/api/v1`.
 *
 * | Path            | Meaning                                                   |
 * | --------------- | --------------------------------------------------------- |
 * | `GET /ready`    | Postgres **and** Redis reachable. ALB matcher for backend  |
 * | `GET /health/live` | Process up, no dependency checks                       |
 * | `GET /health`   | Same as live on the backend (optional)                     |
 *
 * `13` is explicit that `/health/ready` must not become a second ALB target,
 * so readiness is only exposed at `/ready`.
 */
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorsService,
  ) {}

  /**
   * Readiness: returns 200 only when Postgres and Redis both answer, otherwise
   * 503 so the ALB drains this task (18 §6).
   */
  @Get("ready")
  @HealthCheck()
  async ready(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.indicators.checkDatabase(),
      () => this.indicators.checkRedis(),
    ]);
  }

  /** Liveness: process is up. No dependency checks, so a database blip never restarts the task. */
  @Get("health/live")
  live(): { status: string } {
    return { status: "ok" };
  }

  /** Alias of liveness on the backend (13 §2.10). */
  @Get("health")
  health_(): { status: string } {
    return { status: "ok" };
  }
}
