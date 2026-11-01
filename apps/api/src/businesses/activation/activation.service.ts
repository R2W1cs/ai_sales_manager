import {
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from "@nestjs/common";

import { prisma } from "../../lib/prisma";
import { InjectPrisma, type PrismaClient } from "../../platform/core/prisma.token";
import { AuditService } from "../audit/audit.service";
import type { ActivationGateId } from "../dto/update-onboarding.dto";

export interface LiveActivationResponse {
  businessId: string;
  enabled: boolean;
  isLive: boolean;
  aiActivated: boolean;
  unmetGates: ActivationGateId[];
}

export interface GateVerificationResult {
  g1Met: boolean;
  g2Met: boolean;
  g3Met: boolean;
  g4Met: boolean;
  g5Met: boolean;
  unmetGates: ActivationGateId[];
  isReadyForLive: boolean;
}

@Injectable()
export class ActivationService {
  private readonly prisma: PrismaClient;

  constructor(
    @Optional() @InjectPrisma() prismaClient?: PrismaClient,
    @Optional() private readonly auditService?: AuditService,
  ) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * Helper to run queries inside a Prisma transaction if available.
   */
  private async runInTx<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    if (typeof this.prisma.$transaction === "function") {
      return this.prisma.$transaction((tx: unknown) => fn(tx as PrismaClient));
    }
    return fn(this.prisma);
  }

  /**
   * Independently queries the database to verify gates G1–G5 against live data.
   */
  private async verifyGatesInTx(
    tx: PrismaClient,
    businessId: string,
  ): Promise<GateVerificationResult> {
    // 1. Gate G1 (Catalog): Live check - At least one active product with priced in-stock variant (stock > 0)
    const activeProductWithPricedStock = await tx.product.findFirst({
      where: {
        business_id: businessId,
        status: "active",
        variants: {
          some: {
            price: { gt: 0 },
            stock: { gt: 0 },
          },
        },
      },
      select: { id: true },
    });
    const g1Met = Boolean(activeProductWithPricedStock);

    // 2. Gate G2 (Business Rules): Live check - Delivery, payment, and returns policies present and enabled
    const now = new Date();
    const activeRules = await tx.businessRule.findMany({
      where: {
        business_id: businessId,
        enabled: true,
        rule_type: { in: ["delivery", "payment", "returns"] },
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gt: now } }],
      },
      select: { rule_type: true },
    });
    const ruleTypes = new Set(activeRules.map((r) => r.rule_type));
    const g2Met = ruleTypes.has("delivery") && ruleTypes.has("payment") && ruleTypes.has("returns");

    // 3. Gate G3 (Channel): Live check - At least one channel account in active status
    const activeChannel = await tx.channelAccount.findFirst({
      where: {
        business_id: businessId,
        status: "active",
      },
      select: { id: true },
    });
    const g3Met = Boolean(activeChannel);

    // 4. Gate G4 & G5: Query business_onboarding
    const onboarding = await tx.businessOnboarding.findUnique({
      where: { business_id: businessId },
    });

    const g4Met = Boolean(onboarding?.playground_passed || onboarding?.approval_trial_passed);
    const g5Met = Boolean(onboarding?.handoff_acknowledged);

    const unmetGates: ActivationGateId[] = [];
    if (!g1Met) unmetGates.push("G1");
    if (!g2Met) unmetGates.push("G2");
    if (!g3Met) unmetGates.push("G3");
    if (!g4Met) unmetGates.push("G4");
    if (!g5Met) unmetGates.push("G5");

    const isReadyForLive = unmetGates.length === 0;

    return {
      g1Met,
      g2Met,
      g3Met,
      g4Met,
      g5Met,
      unmetGates,
      isReadyForLive,
    };
  }

  /**
   * 13 §10.1 PATCH /api/v1/integrations/live
   * Body: { enabled: boolean }
   * Strict enforcement: if enabled=true and any gate is missing, returns 422 Unprocessable Entity with error envelope.
   * If enabled=true and all gates met, updates business_onboarding.ai_activated = true atomically within a transaction.
   * If enabled=false, updates business_onboarding.ai_activated = false.
   */
  async setLiveActivation(
    businessId: string,
    enabled: boolean,
    actorUserId?: string,
  ): Promise<LiveActivationResponse> {
    return this.runInTx(async (tx) => {
      // 1. Verify workspace exists and is not soft-deleted
      const business = await tx.business.findFirst({
        where: {
          id: businessId,
          deleted_at: null,
        },
        select: { id: true },
      });

      if (!business) {
        throw new NotFoundException({
          error: {
            code: "not_found",
            message: "Business workspace not found or has been deleted",
          },
        });
      }

      // 2. Independently verify gates G1–G5 against live DB state
      const { g1Met, g2Met, g3Met, g4Met, g5Met, unmetGates, isReadyForLive } =
        await this.verifyGatesInTx(tx, businessId);

      if (enabled) {
        if (!isReadyForLive || unmetGates.length > 0) {
          throw new UnprocessableEntityException({
            error: {
              code: "activation_not_ready",
              message: "Cannot activate live AI: one or more activation gates are not satisfied",
              details: {
                unmet_gates: unmetGates,
              },
            },
          });
        }

        await tx.businessOnboarding.upsert({
          where: { business_id: businessId },
          create: {
            business_id: businessId,
            business_created: true,
            ai_activated: true,
          },
          update: {
            ai_activated: true,
          },
        });

        if (this.auditService) {
          await this.auditService.record({
            business_id: businessId,
            actor_user_id: actorUserId ?? null,
            action: "business.live_activated",
            entity_type: "business_onboarding",
            entity_id: businessId,
            payload: {
              before: { ai_activated: false },
              after: {
                ai_activated: true,
                is_live: true,
                gates: {
                  g1_catalog: g1Met,
                  g2_rules: g2Met,
                  g3_channel: g3Met,
                  g4_test: g4Met,
                  g5_handoff: g5Met,
                },
              },
            },
          });
        }

        return {
          businessId,
          enabled: true,
          isLive: true,
          aiActivated: true,
          unmetGates: [],
        };
      }

      // enabled === false: deactivate live AI
      await tx.businessOnboarding.upsert({
        where: { business_id: businessId },
        create: {
          business_id: businessId,
          business_created: true,
          ai_activated: false,
        },
        update: {
          ai_activated: false,
        },
      });

      if (this.auditService) {
        await this.auditService.record({
          business_id: businessId,
          actor_user_id: actorUserId ?? null,
          action: "business.live_deactivated",
          entity_type: "business_onboarding",
          entity_id: businessId,
          payload: {
            before: { ai_activated: true },
            after: {
              ai_activated: false,
              is_live: false,
            },
          },
        });
      }

      return {
        businessId,
        enabled: false,
        isLive: false,
        aiActivated: false,
        unmetGates,
      };
    });
  }
}
