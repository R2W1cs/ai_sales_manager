import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";

describe("Onboarding completion & state management (`/businesses/:id/onboarding`) (T-BIZ-04)", () => {
  let controller: OnboardingController;
  let service: OnboardingService;
  let prismaMock: {
    business: {
      findFirst: jest.Mock;
    };
    businessOnboarding: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    product: {
      findFirst: jest.Mock;
    };
    businessRule: {
      findMany: jest.Mock;
    };
    channelAccount: {
      findFirst: jest.Mock;
    };
  };

  const businessId = "11111111-1111-1111-1111-111111111111";
  const otherBusinessId = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    prismaMock = {
      business: {
        findFirst: jest.fn(),
      },
      businessOnboarding: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      product: {
        findFirst: jest.fn(),
      },
      businessRule: {
        findMany: jest.fn(),
      },
      channelAccount: {
        findFirst: jest.fn(),
      },
    };

    service = new OnboardingService(prismaMock as unknown as PrismaClient);
    controller = new OnboardingController(service);
  });

  describe("GET /businesses/:id/onboarding", () => {
    it("Gate Calculation: Correctly lists unmet gates when store is incomplete.", async () => {
      // Business exists
      prismaMock.business.findFirst.mockResolvedValue({
        id: businessId,
        name: "Test Store",
        deleted_at: null,
      });

      // Default onboarding flags (only business created is true)
      prismaMock.businessOnboarding.findUnique.mockResolvedValue({
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
      });

      // G1: No priced in-stock active product
      prismaMock.product.findFirst.mockResolvedValue(null);

      // G2: Only delivery and payment rules present (missing returns)
      prismaMock.businessRule.findMany.mockResolvedValue([
        { rule_type: "delivery" },
        { rule_type: "payment" },
      ]);

      // G3: No active channel account
      prismaMock.channelAccount.findFirst.mockResolvedValue(null);

      const result = await controller.getOnboardingState(businessId, businessId);

      expect(result.businessId).toBe(businessId);
      expect(result.businessCreated).toBe(true);
      expect(result.channelConnected).toBe(false);
      expect(result.productsImported).toBe(false);
      expect(result.aiConfigured).toBe(false);
      expect(result.playgroundPassed).toBe(false);
      expect(result.approvalTrialPassed).toBe(false);
      expect(result.handoffAcknowledged).toBe(false);
      expect(result.aiActivated).toBe(false);
      expect(result.isReadyForLive).toBe(false);
      expect(result.aiActivationReady).toBe(false);
      expect(result.unmetGates).toEqual(["G1", "G2", "G3", "G4", "G5"]);
      expect(result.completedSteps).toEqual(["step-1"]);
      expect(result.currentStep).toBe(2);
    });

    it("Gate Calculation: Computes isReadyForLive=true and empty unmetGates when all conditions satisfied.", async () => {
      prismaMock.business.findFirst.mockResolvedValue({
        id: businessId,
        name: "Complete Store",
        deleted_at: null,
      });

      prismaMock.businessOnboarding.findUnique.mockResolvedValue({
        business_id: businessId,
        business_created: true,
        channel_connected: true,
        products_imported: true,
        ai_configured: true,
        playground_passed: true,
        approval_trial_passed: false,
        handoff_acknowledged: true,
        ai_activated: true,
        updated_at: new Date(),
      });

      // G1 satisfied
      prismaMock.product.findFirst.mockResolvedValue({ id: "prod-1" });

      // G2 satisfied
      prismaMock.businessRule.findMany.mockResolvedValue([
        { rule_type: "delivery" },
        { rule_type: "payment" },
        { rule_type: "returns" },
      ]);

      // G3 satisfied
      prismaMock.channelAccount.findFirst.mockResolvedValue({ id: "chan-1" });

      const result = await controller.getOnboardingState(businessId, businessId);

      expect(result.isReadyForLive).toBe(true);
      expect(result.aiActivationReady).toBe(true);
      expect(result.unmetGates).toEqual([]);
      expect(result.completedSteps).toEqual([
        "step-1",
        "step-2",
        "step-3",
        "step-4",
        "step-5",
        "step-6",
      ]);
      expect(result.currentStep).toBe(6);
    });

    it("Cross-Tenant Isolation: Accessing other business ID throws 403 Forbidden.", async () => {
      await expect(controller.getOnboardingState(businessId, otherBusinessId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prismaMock.business.findFirst).not.toHaveBeenCalled();
    });

    it("Not Found: Requesting onboarding for non-existent business throws 404.", async () => {
      prismaMock.business.findFirst.mockResolvedValue(null);

      await expect(controller.getOnboardingState(businessId, businessId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("PATCH /businesses/:id/onboarding", () => {
    it("Acknowledgment: Client can record handoff policy acknowledgment.", async () => {
      prismaMock.business.findFirst.mockResolvedValue({
        id: businessId,
        name: "Test Store",
        deleted_at: null,
      });

      prismaMock.businessOnboarding.upsert.mockResolvedValue({
        business_id: businessId,
        business_created: true,
        handoff_acknowledged: true,
      });

      // Mock subsequent getOnboardingState
      prismaMock.businessOnboarding.findUnique.mockResolvedValue({
        business_id: businessId,
        business_created: true,
        channel_connected: true,
        products_imported: true,
        ai_configured: true,
        playground_passed: true,
        approval_trial_passed: false,
        handoff_acknowledged: true,
        ai_activated: false,
        updated_at: new Date(),
      });
      prismaMock.product.findFirst.mockResolvedValue({ id: "prod-1" });
      prismaMock.businessRule.findMany.mockResolvedValue([
        { rule_type: "delivery" },
        { rule_type: "payment" },
        { rule_type: "returns" },
      ]);
      prismaMock.channelAccount.findFirst.mockResolvedValue({ id: "chan-1" });

      const result = await controller.updateOnboardingState(businessId, businessId, {
        handoffAcknowledged: true,
      });

      expect(prismaMock.businessOnboarding.upsert).toHaveBeenCalledWith({
        where: { business_id: businessId },
        create: {
          business_id: businessId,
          business_created: true,
          handoff_acknowledged: true,
        },
        update: {
          handoff_acknowledged: true,
        },
      });

      expect(result.handoffAcknowledged).toBe(true);
      expect(result.unmetGates).not.toContain("G5");
      expect(result.isReadyForLive).toBe(true);
    });

    it("Step Navigation: Client can update currentStep navigation indicator.", async () => {
      prismaMock.business.findFirst.mockResolvedValue({
        id: businessId,
        name: "Test Store",
        deleted_at: null,
      });

      prismaMock.businessOnboarding.findUnique.mockResolvedValue({
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
      });
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.businessRule.findMany.mockResolvedValue([]);
      prismaMock.channelAccount.findFirst.mockResolvedValue(null);

      const result = await controller.updateOnboardingState(businessId, businessId, {
        currentStep: 4,
      });

      expect(result.currentStep).toBe(4);
      expect(prismaMock.businessOnboarding.upsert).not.toHaveBeenCalled();
    });

    it("Anti-Tamper: Client cannot artificially mark gates complete via PATCH.", async () => {
      // 1. Attempting to PATCH aiActivated: true directly
      await expect(
        controller.updateOnboardingState(businessId, businessId, {
          aiActivated: true,
        }),
      ).rejects.toThrow(BadRequestException);

      // 2. Attempting to PATCH playgroundPassed: true directly
      await expect(
        controller.updateOnboardingState(businessId, businessId, {
          playgroundPassed: true,
        }),
      ).rejects.toThrow(BadRequestException);

      // 3. Attempting to PATCH productsImported: true directly
      await expect(
        controller.updateOnboardingState(businessId, businessId, {
          productsImported: true,
        }),
      ).rejects.toThrow(BadRequestException);

      // 4. Attempting to PATCH channelConnected: true directly
      await expect(
        controller.updateOnboardingState(businessId, businessId, {
          channelConnected: true,
        }),
      ).rejects.toThrow(BadRequestException);

      // 5. Attempting to PATCH arbitrary/unknown fields
      await expect(
        controller.updateOnboardingState(businessId, businessId, {
          isReadyForLive: true,
          unmetGates: [],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.businessOnboarding.upsert).not.toHaveBeenCalled();
    });

    it("Cross-Tenant Isolation: PATCH to other business ID throws 403 Forbidden.", async () => {
      await expect(
        controller.updateOnboardingState(businessId, otherBusinessId, {
          handoffAcknowledged: true,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.businessOnboarding.upsert).not.toHaveBeenCalled();
    });

    it("RBAC Rigor: PATCH /businesses/:id/onboarding is guarded by @RequirePermission('business.write')", () => {
      /* oxlint-disable typescript/unbound-method */
      const permissions = Reflect.getMetadata(
        "permissions",
        OnboardingController.prototype.updateOnboardingState,
      );
      /* oxlint-enable typescript/unbound-method */
      expect(permissions).toEqual(["business.write"]);
    });
  });
});
