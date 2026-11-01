import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { Customer, LifecycleStage, Prisma, PrismaClient } from "@prisma/client";

import type { CustomerLifecycleClassification } from "@app/shared";

import { prisma as defaultPrisma } from "../../lib/prisma";
import { assertUuid } from "../../platform/core/errors";
import { InjectPrisma } from "../../platform/core/prisma.token";

export const CHURN_THRESHOLD_DAYS = 90;

export type DbClient = Prisma.TransactionClient | PrismaClient;

export interface ClassifyStageOptions {
  confirmedOrderCount: number;
  lastConfirmedOrderAt?: Date | null;
  now?: Date;
  hasVipTag?: boolean;
  currentStage?: LifecycleStage | null;
}

export interface ClassificationResult {
  classification: CustomerLifecycleClassification;
  dbStage: LifecycleStage;
  isChurnRisk: boolean;
  daysSinceLastOrder: number | null;
}

export interface RecomputeLifecycleResult extends ClassificationResult {
  customerId: string;
  businessId: string;
  confirmedOrderCount: number;
  lastConfirmedOrderAt: Date | null;
  customer?: Customer;
}

@Injectable()
export class LifecycleService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() @InjectPrisma() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Deterministically classifies customer lifecycle stage and database representation.
   *
   * Rules:
   *  - 0 confirmed orders -> PROSPECT (db: unknown_visitor / current prospect stage)
   *  - 1 confirmed order -> FIRST_TIME_BUYER (db: customer)
   *  - >= 2 confirmed orders -> RETURNING_CUSTOMER (db: returning_customer)
   *  - > 90 days without confirmed orders -> CHURN_RISK
   *  - VIP tag / VIP stage -> dbStage = "vip"
   */
  classifyStage(options: ClassifyStageOptions): ClassificationResult {
    const {
      confirmedOrderCount,
      lastConfirmedOrderAt,
      now = new Date(),
      hasVipTag = false,
      currentStage = "unknown_visitor",
    } = options;

    let daysSinceLastOrder: number | null = null;
    let isChurnRisk = false;

    if (lastConfirmedOrderAt) {
      const orderDate = new Date(lastConfirmedOrderAt);
      const diffMs = now.getTime() - orderDate.getTime();
      daysSinceLastOrder = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      if (daysSinceLastOrder > CHURN_THRESHOLD_DAYS) {
        isChurnRisk = true;
      }
    }

    const isVip = hasVipTag || currentStage === "vip";

    let classification: CustomerLifecycleClassification;
    let dbStage: LifecycleStage;

    if (confirmedOrderCount === 0) {
      classification = "PROSPECT";
      if (isVip) {
        dbStage = "vip";
      } else if (
        currentStage === "interested" ||
        currentStage === "qualified_lead" ||
        currentStage === "order_pending"
      ) {
        dbStage = currentStage;
      } else {
        dbStage = "unknown_visitor";
      }
    } else if (confirmedOrderCount === 1) {
      if (isChurnRisk) {
        classification = "CHURN_RISK";
      } else {
        classification = "FIRST_TIME_BUYER";
      }
      dbStage = isVip ? "vip" : "customer";
    } else {
      // confirmedOrderCount >= 2
      if (isChurnRisk) {
        classification = "CHURN_RISK";
      } else {
        classification = "RETURNING_CUSTOMER";
      }
      dbStage = isVip ? "vip" : "returning_customer";
    }

    return {
      classification,
      dbStage,
      isChurnRisk,
      daysSinceLastOrder,
    };
  }

  /**
   * Recalculates lifecycle stage for a single customer directly from verified order history and recency.
   * Multi-tenant safe with strict business_id boundary.
   */
  async recomputeStage(
    businessId: string,
    customerId: string,
    tx?: DbClient,
    now = new Date(),
  ): Promise<RecomputeLifecycleResult> {
    assertUuid(businessId, "businessId");
    assertUuid(customerId, "customerId");

    if (tx) {
      return this.executeRecompute(businessId, customerId, tx, now);
    }

    return this.prisma.$transaction(async (innerTx) => {
      return this.executeRecompute(businessId, customerId, innerTx, now);
    });
  }

  private async executeRecompute(
    businessId: string,
    customerId: string,
    client: DbClient,
    now: Date,
  ): Promise<RecomputeLifecycleResult> {
    const customer = await client.customer.findFirst({
      where: {
        id: customerId,
        business_id: businessId,
        erased_at: null,
        merged_into_customer_id: null,
      },
      include: {
        tags: {
          select: { tag: true },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException({
        error: {
          code: "customer_not_found",
          message: `Customer ${customerId} not found`,
        },
      });
    }

    // Query confirmed and completed orders deterministically (excluding test orders)
    const orderMetrics = await client.order.aggregate({
      where: {
        business_id: businessId,
        customer_id: customerId,
        status: { in: ["CONFIRMED", "COMPLETED"] },
        is_test: false,
      },
      _count: { _all: true },
      _max: { order_confirmed_at: true },
    });

    const confirmedOrderCount = orderMetrics._count._all;
    const lastConfirmedOrderAt = orderMetrics._max.order_confirmed_at;

    // Only check tags here; classifyStage already handles currentStage === "vip" internally
    const hasVipTag = customer.tags.some((t) => t.tag.toLowerCase() === "vip");

    const { classification, dbStage, isChurnRisk, daysSinceLastOrder } = this.classifyStage({
      confirmedOrderCount,
      lastConfirmedOrderAt,
      now,
      hasVipTag,
      currentStage: customer.lifecycle_stage,
    });

    const updateResult = await client.customer.updateMany({
      where: {
        id: customerId,
        business_id: businessId,
        erased_at: null,
        merged_into_customer_id: null,
      },
      data: {
        confirmed_order_count: confirmedOrderCount,
        last_confirmed_order_at: lastConfirmedOrderAt,
        lifecycle_stage: dbStage,
      },
    });

    if (updateResult.count === 0) {
      throw new NotFoundException({
        error: {
          code: "customer_not_found",
          message: `Customer ${customerId} was erased, merged, or not found`,
        },
      });
    }

    const updatedCustomer = {
      ...customer,
      confirmed_order_count: confirmedOrderCount,
      last_confirmed_order_at: lastConfirmedOrderAt,
      lifecycle_stage: dbStage,
    };

    return {
      customerId,
      businessId,
      classification,
      dbStage,
      confirmedOrderCount,
      lastConfirmedOrderAt,
      isChurnRisk,
      daysSinceLastOrder,
      customer: updatedCustomer,
    };
  }
}
