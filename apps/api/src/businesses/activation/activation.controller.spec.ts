import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PrismaClient } from "@prisma/client";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import type { AuditService } from "../audit/audit.service";
import { ActivationController } from "./activation.controller";
import { ActivationService } from "./activation.service";

describe("Live activation gate enforcement (G1–G5 validation) (T-BIZ-05)", () => {
  let controller: ActivationController;
  let service: ActivationService;
  let auditServiceMock: {
    record: jest.Mock;
  };
  let prismaMock: {
    $transaction: jest.Mock;
    business: {
      findFirst: jest.Mock;
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
    businessOnboarding: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };

  const businessId = "11111111-1111-1111-1111-111111111111";
  const userId = "user-1111-1111-1111-111111111111";
  const mockUser = { id: userId, sub: userId };

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(prismaMock),
      ),
      business: {
        findFirst: jest.fn().mockResolvedValue({
          id: businessId,
          name: "Test Store",
          deleted_at: null,
        }),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: "prod-1" }),
      },
      businessRule: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { rule_type: "delivery" },
            { rule_type: "payment" },
            { rule_type: "returns" },
          ]),
      },
      channelAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: "chan-1" }),
      },
      businessOnboarding: {
        findUnique: jest.fn().mockResolvedValue({
          business_id: businessId,
          business_created: true,
          playground_passed: true,
          approval_trial_passed: false,
          handoff_acknowledged: true,
          ai_activated: false,
        }),
        upsert: jest.fn().mockResolvedValue({
          business_id: businessId,
          business_created: true,
          ai_activated: true,
        }),
      },
    };

    auditServiceMock = {
      record: jest.fn().mockResolvedValue({ id: "audit-1" }),
    };

    service = new ActivationService(
      prismaMock as unknown as PrismaClient,
      auditServiceMock as unknown as AuditService,
    );
    controller = new ActivationController(service);
  });

  describe("Incomplete Setup (422): Returns 422 listing unmet gates", () => {
    it("Incomplete Setup (422): All gates unmet returns 422 with G1..G5 and skips upsert", async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.businessRule.findMany.mockResolvedValue([]);
      prismaMock.channelAccount.findFirst.mockResolvedValue(null);
      prismaMock.businessOnboarding.findUnique.mockResolvedValue({
        business_id: businessId,
        playground_passed: false,
        approval_trial_passed: false,
        handoff_acknowledged: false,
        ai_activated: false,
      });

      await expect(
        controller.setLiveActivation(businessId, mockUser, { enabled: true }),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: "activation_not_ready",
            details: {
              unmet_gates: ["G1", "G2", "G3", "G4", "G5"],
            },
          },
        },
      });

      expect(prismaMock.businessOnboarding.upsert).not.toHaveBeenCalled();
      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });

    it("Incomplete Setup (422): Partial gates failure lists only unsatisfied gates", async () => {
      // G1, G2, G3 satisfied; G4 and G5 not satisfied
      prismaMock.product.findFirst.mockResolvedValue({ id: "prod-1" });
      prismaMock.businessRule.findMany.mockResolvedValue([
        { rule_type: "delivery" },
        { rule_type: "payment" },
        { rule_type: "returns" },
      ]);
      prismaMock.channelAccount.findFirst.mockResolvedValue({ id: "chan-1" });
      prismaMock.businessOnboarding.findUnique.mockResolvedValue({
        business_id: businessId,
        playground_passed: false,
        approval_trial_passed: false,
        handoff_acknowledged: false,
        ai_activated: false,
      });

      await expect(
        controller.setLiveActivation(businessId, mockUser, { enabled: true }),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: "activation_not_ready",
            details: {
              unmet_gates: ["G4", "G5"],
            },
          },
        },
      });

      expect(prismaMock.businessOnboarding.upsert).not.toHaveBeenCalled();
    });

    it("Incomplete Setup (422): Missing G1 (no in-stock active product)", async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await expect(
        controller.setLiveActivation(businessId, mockUser, { enabled: true }),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: "activation_not_ready",
            details: {
              unmet_gates: ["G1"],
            },
          },
        },
      });

      expect(prismaMock.businessOnboarding.upsert).not.toHaveBeenCalled();
    });

    it("Incomplete Setup (422): Missing G2 (missing returns rule)", async () => {
      prismaMock.businessRule.findMany.mockResolvedValue([
        { rule_type: "delivery" },
        { rule_type: "payment" },
      ]);

      await expect(
        controller.setLiveActivation(businessId, mockUser, { enabled: true }),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: "activation_not_ready",
            details: {
              unmet_gates: ["G2"],
            },
          },
        },
      });

      expect(prismaMock.businessOnboarding.upsert).not.toHaveBeenCalled();
    });

    it("Incomplete Setup (422): Missing G3 (no active channel account)", async () => {
      prismaMock.channelAccount.findFirst.mockResolvedValue(null);

      await expect(
        controller.setLiveActivation(businessId, mockUser, { enabled: true }),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: "activation_not_ready",
            details: {
              unmet_gates: ["G3"],
            },
          },
        },
      });

      expect(prismaMock.businessOnboarding.upsert).not.toHaveBeenCalled();
    });
  });

  describe("Complete Setup (200): Sets `is_live = true` and enables live inbound AI processing", () => {
    it("Complete Setup (200): G4 satisfied via playground_passed = true", async () => {
      prismaMock.businessOnboarding.findUnique.mockResolvedValue({
        business_id: businessId,
        business_created: true,
        playground_passed: true,
        approval_trial_passed: false,
        handoff_acknowledged: true,
        ai_activated: false,
      });

      const result = await controller.setLiveActivation(businessId, mockUser, {
        enabled: true,
      });

      expect(prismaMock.businessOnboarding.upsert).toHaveBeenCalledWith({
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

      expect(auditServiceMock.record).toHaveBeenCalledWith({
        business_id: businessId,
        actor_user_id: userId,
        action: "business.live_activated",
        entity_type: "business_onboarding",
        entity_id: businessId,
        payload: {
          before: { ai_activated: false },
          after: {
            ai_activated: true,
            is_live: true,
            gates: {
              g1_catalog: true,
              g2_rules: true,
              g3_channel: true,
              g4_test: true,
              g5_handoff: true,
            },
          },
        },
      });

      expect(result.businessId).toBe(businessId);
      expect(result.enabled).toBe(true);
      expect(result.isLive).toBe(true);
      expect(result.aiActivated).toBe(true);
      expect(result.unmetGates).toEqual([]);
    });

    it("Complete Setup (200): G4 satisfied via approval_trial_passed = true", async () => {
      prismaMock.businessOnboarding.findUnique.mockResolvedValue({
        business_id: businessId,
        business_created: true,
        playground_passed: false,
        approval_trial_passed: true,
        handoff_acknowledged: true,
        ai_activated: false,
      });

      const result = await controller.setLiveActivation(businessId, mockUser, {
        enabled: true,
      });

      expect(prismaMock.businessOnboarding.upsert).toHaveBeenCalledWith({
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

      expect(result.enabled).toBe(true);
      expect(result.isLive).toBe(true);
      expect(result.aiActivated).toBe(true);
      expect(result.unmetGates).toEqual([]);
    });

    it("Can deactivate live AI with enabled: false", async () => {
      // Gates might be unmet or met, deactivation should succeed regardless
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.businessOnboarding.findUnique.mockResolvedValue({
        business_id: businessId,
        playground_passed: false,
        approval_trial_passed: false,
        handoff_acknowledged: false,
        ai_activated: true,
      });

      prismaMock.businessOnboarding.upsert.mockResolvedValue({
        business_id: businessId,
        ai_activated: false,
      });

      const result = await controller.setLiveActivation(businessId, mockUser, {
        enabled: false,
      });

      expect(prismaMock.businessOnboarding.upsert).toHaveBeenCalledWith({
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

      expect(auditServiceMock.record).toHaveBeenCalledWith({
        business_id: businessId,
        actor_user_id: userId,
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

      expect(result.enabled).toBe(false);
      expect(result.isLive).toBe(false);
      expect(result.aiActivated).toBe(false);
      expect(result.unmetGates).toContain("G1");
    });
  });

  describe("Validation & Security Invariants", () => {
    it("Rejects non-boolean or invalid body with 400 validation error", async () => {
      await expect(
        controller.setLiveActivation(businessId, mockUser, { enabled: "yes" }),
      ).rejects.toThrow(BadRequestException);

      await expect(controller.setLiveActivation(businessId, mockUser, {})).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.setLiveActivation(businessId, mockUser, null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("Throws 404 if business does not exist or is soft-deleted", async () => {
      prismaMock.business.findFirst.mockResolvedValue(null);

      await expect(
        controller.setLiveActivation(businessId, mockUser, { enabled: true }),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.businessOnboarding.upsert).not.toHaveBeenCalled();
    });

    it("Guards live activation endpoint with @RequirePermission('ai.configure')", () => {
      /* oxlint-disable typescript/unbound-method */
      const permissions = Reflect.getMetadata(
        "permissions",
        ActivationController.prototype.setLiveActivation,
      );
      /* oxlint-enable typescript/unbound-method */
      expect(permissions).toEqual(["ai.configure"]);
    });

    it("PermissionsGuard integration: allows Owner/Admin with ai.configure and blocks Employee (403)", async () => {
      const reflector = new Reflector();
      const guard = new PermissionsGuard(reflector, prismaMock as unknown as PrismaClient);

      /* oxlint-disable typescript/unbound-method */
      const handler = ActivationController.prototype.setLiveActivation;
      /* oxlint-enable typescript/unbound-method */
      RequirePermission("ai.configure")(handler);

      // Context 1: Owner / Admin (has ai.configure)
      const allowedContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            membership: {
              role: {
                name: "owner",
                role_permissions: [{ permission: { code: "ai.configure" } }],
              },
            },
          }),
        }),
        getHandler: () => handler,
        getClass: () => ActivationController,
      } as unknown as ExecutionContext;

      expect(await guard.canActivate(allowedContext)).toBe(true);

      // Context 2: Employee (lacks ai.configure) -> 403 Forbidden
      const deniedContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            membership: {
              role: {
                name: "employee",
                role_permissions: [],
              },
            },
          }),
        }),
        getHandler: () => handler,
        getClass: () => ActivationController,
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(deniedContext)).rejects.toThrow(ForbiddenException);
    });
  });
});
