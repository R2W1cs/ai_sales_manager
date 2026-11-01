import { Injectable, Logger, NotFoundException, type OnModuleInit, Optional } from "@nestjs/common";

import {
  CANONICAL_PLANS,
  PlanLimitsSchema,
  PlanResponseSchema,
  type PlanDto,
  type PlanLimits,
} from "@app/shared";

import { prisma as defaultPrisma } from "../../lib/prisma";
import { InjectPrisma, type PrismaClient } from "../../platform/core/prisma.token";

@Injectable()
export class PlansService implements OnModuleInit {
  private readonly logger = new Logger(PlansService.name);
  private readonly prisma: PrismaClient;

  constructor(@Optional() @InjectPrisma() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Initializes and ensures canonical plan tiers are seeded on application startup.
   * Fails closed in production/staging if database seeding encounters an error.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.seedPlans();
    } catch (err) {
      if (process.env.NODE_ENV === "test") {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to seed canonical plans during test bootstrap: ${errorMessage}`);
        return;
      }
      this.logger.error(
        "Failed to seed canonical subscription plans during application startup",
        err,
      );
      throw err;
    }
  }

  /**
   * Seeds/upserts standard canonical subscription tiers (Starter, Growth, Scale)
   * into the database to guarantee availability and quota accuracy.
   * Executes inside an atomic interactive transaction.
   */
  async seedPlans(): Promise<PlanDto[]> {
    const plansToSeed = Object.values(CANONICAL_PLANS);

    const records = await this.prisma.$transaction(async (tx) => {
      return Promise.all(
        plansToSeed.map((plan) => {
          const validatedLimits = PlanLimitsSchema.parse(plan.limits);
          return tx.plan.upsert({
            where: { code: plan.code },
            update: {
              name: plan.name,
              limits: validatedLimits,
            },
            create: {
              code: plan.code,
              name: plan.name,
              limits: validatedLimits,
            },
          });
        }),
      );
    });

    return records.map((record) => this.mapToDto(record));
  }

  /**
   * Lists all available subscription plans with their quota allocations.
   * Pure read-only operation. Returns all plans from the database,
   * sorted canonically: starter, growth, scale, then custom plans deterministically.
   */
  async getPlans(): Promise<PlanDto[]> {
    const records = await this.prisma.plan.findMany({
      orderBy: [{ code: "asc" }],
    });

    // Order canonical plans: starter, growth, scale, then custom deterministically
    const tierOrder: Record<string, number> = {
      starter: 1,
      growth: 2,
      scale: 3,
    };

    return records
      .map((r) => this.mapToDto(r))
      .sort((a, b) => {
        const rankA = tierOrder[a.code] ?? 99;
        const rankB = tierOrder[b.code] ?? 99;
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        return a.code.localeCompare(b.code);
      });
  }

  /**
   * Retrieves a specific plan by its unique code.
   * Pure read-only operation with strict lookup and 404 handling.
   */
  async getPlanByCode(code: string): Promise<PlanDto> {
    const normalizedCode = code.trim().toLowerCase();

    const record = await this.prisma.plan.findUnique({
      where: { code: normalizedCode },
    });

    if (record) {
      return this.mapToDto(record);
    }

    throw new NotFoundException({
      error: {
        code: "not_found",
        message: `Subscription plan '${code}' not found`,
      },
    });
  }

  /**
   * Retrieves quota limits for a given plan code.
   */
  async getPlanQuotas(code: string): Promise<PlanLimits> {
    const plan = await this.getPlanByCode(code);
    return plan.limits;
  }

  private mapToDto(record: {
    id: string;
    code: string;
    name: string;
    limits: unknown;
    created_at: Date;
    updated_at: Date;
  }): PlanDto {
    const parsedLimits = PlanLimitsSchema.parse(record.limits);
    const dto: PlanDto = {
      id: record.id,
      code: record.code,
      name: record.name,
      limits: parsedLimits,
      createdAt: record.created_at.toISOString(),
      updatedAt: record.updated_at.toISOString(),
    };
    return PlanResponseSchema.parse(dto);
  }
}
