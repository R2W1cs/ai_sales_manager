import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { toValidationException } from "../../platform/core/errors";
import {
  type ActivationGateId,
  type OnboardingStateResponse,
  UpdateOnboardingSchema,
} from "../dto/update-onboarding.dto";

@Injectable()
export class OnboardingService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * 13 §5 GET /api/v1/businesses/:id/onboarding
   * Retrieves onboarding steps and dynamically computes readiness gates G1–G5 from live DB state.
   */
  async getOnboardingState(businessId: string): Promise<OnboardingStateResponse> {
    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        deleted_at: null,
      },
    });

    if (!business) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Business workspace not found or has been deleted",
        },
      });
    }

    let onboarding = await this.prisma.businessOnboarding.findUnique({
      where: { business_id: businessId },
    });

    onboarding ??= {
      business_id: businessId,
      business_created: true,
      channel_connected: false,
      products_imported: false,
      ai_configured: false,
      playground_passed: false,
      approval_trial_passed: false,
      handoff_acknowledged: false,
      ai_activated: false,
      updated_at: new Date(),
    };

    // 1. Gate G1 (Catalog): Live check - At least one active product with priced in-stock variant (stock > 0)
    const activeProductWithPricedStock = await this.prisma.product.findFirst({
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
    const activeRules = await this.prisma.businessRule.findMany({
      where: {
        business_id: businessId,
        enabled: true,
        rule_type: { in: ["delivery", "payment", "returns"] },
        effective_from: { lte: new Date() },
        OR: [{ effective_to: null }, { effective_to: { gt: new Date() } }],
      },
      select: { rule_type: true },
    });
    const ruleTypes = new Set(activeRules.map((r) => r.rule_type));
    const g2Met = ruleTypes.has("delivery") && ruleTypes.has("payment") && ruleTypes.has("returns");

    // 3. Gate G3 (Channel): Live check - At least one channel account in active status
    const activeChannel = await this.prisma.channelAccount.findFirst({
      where: {
        business_id: businessId,
        status: "active",
      },
      select: { id: true },
    });
    const g3Met = Boolean(activeChannel);

    // 4. Gate G4 (AI Test): Playground simulation completed or approval trial passed
    const g4Met = onboarding.playground_passed || onboarding.approval_trial_passed;

    // 5. Gate G5 (Handoff Policy Acknowledgement): Owner acknowledged human confirmation policy
    const g5Met = onboarding.handoff_acknowledged;

    // Dynamic computation of unmet gates
    const unmetGates: ActivationGateId[] = [];
    if (!g1Met) unmetGates.push("G1");
    if (!g2Met) unmetGates.push("G2");
    if (!g3Met) unmetGates.push("G3");
    if (!g4Met) unmetGates.push("G4");
    if (!g5Met) unmetGates.push("G5");

    const isReadyForLive = unmetGates.length === 0;

    // Computed completed steps
    const completedSteps: string[] = [];
    if (onboarding.business_created) completedSteps.push("step-1");
    if (g3Met) completedSteps.push("step-2");
    if (g1Met) completedSteps.push("step-3");
    if (g2Met) completedSteps.push("step-4");
    if (g4Met) completedSteps.push("step-5");
    if (g5Met && onboarding.ai_activated) completedSteps.push("step-6");

    // Compute active step based on progress or persisted settings
    const completedStepsSet = new Set(completedSteps);
    let computedCurrentStep = 1;
    for (let step = 1; step <= 6; step++) {
      if (!completedStepsSet.has(`step-${step}`)) {
        computedCurrentStep = step;
        break;
      }
    }
    if (completedSteps.length === 6) {
      computedCurrentStep = 6;
    }

    const bizSettings = (business.settings as Record<string, unknown>) || {};
    const savedStep =
      typeof bizSettings.onboarding_step === "number" ? bizSettings.onboarding_step : undefined;
    const finalCurrentStep =
      savedStep && savedStep >= 1 && savedStep <= 6 ? savedStep : computedCurrentStep;

    return {
      businessId,
      businessCreated: onboarding.business_created,
      channelConnected: g3Met,
      productsImported: g1Met,
      aiConfigured: g2Met,
      playgroundPassed: onboarding.playground_passed,
      approvalTrialPassed: onboarding.approval_trial_passed,
      handoffAcknowledged: onboarding.handoff_acknowledged,
      aiActivated: onboarding.ai_activated,
      currentStep: finalCurrentStep,
      completedSteps,
      isReadyForLive,
      aiActivationReady: isReadyForLive,
      unmetGates,
    };
  }

  /**
   * 13 §5 PATCH /api/v1/businesses/:id/onboarding
   * Client records handoff policy acknowledgment or current step view.
   * Rejects client modification of system-computed readiness flags.
   */
  async updateOnboardingState(
    businessId: string,
    rawDto: unknown,
  ): Promise<OnboardingStateResponse> {
    const parseResult = UpdateOnboardingSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw toValidationException(
        parseResult.error,
        "Invalid payload or attempt to modify protected onboarding flags",
      );
    }

    const dto = parseResult.data;

    if (dto.handoffAcknowledged !== undefined) {
      await this.prisma.businessOnboarding.upsert({
        where: { business_id: businessId },
        create: {
          business_id: businessId,
          business_created: true,
          handoff_acknowledged: dto.handoffAcknowledged,
        },
        update: {
          handoff_acknowledged: dto.handoffAcknowledged,
        },
      });
    }

    if (dto.currentStep !== undefined) {
      try {
        const currentBiz = await this.prisma.business.findUnique({
          where: { id: businessId },
          select: { settings: true },
        });
        const currentSettings = (currentBiz?.settings as Record<string, unknown>) || {};
        await this.prisma.business.update({
          where: { id: businessId },
          data: {
            settings: {
              ...currentSettings,
              onboarding_step: dto.currentStep,
            },
          },
        });
      } catch {
        // Non-fatal if settings update fails
      }
    }

    const state = await this.getOnboardingState(businessId);

    if (dto.currentStep !== undefined) {
      state.currentStep = dto.currentStep;
    }

    return state;
  }
}
