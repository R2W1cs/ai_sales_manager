import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { FlagsController } from "./flags.controller";
import { FlagsService } from "./flags.service";

describe("Feature flags API (`GET/PATCH /businesses/:id/flags`) (T-BIZ-06)", () => {
  let controller: FlagsController;
  let service: FlagsService;
  let prismaMock: {
    business: {
      findFirst: jest.Mock;
    };
    featureFlag: {
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
  };

  const businessId = "11111111-1111-1111-1111-111111111111";
  const otherBusinessId = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    prismaMock = {
      business: {
        findFirst: jest.fn(),
      },
      featureFlag: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    };

    service = new FlagsService(prismaMock as unknown as PrismaClient);
    controller = new FlagsController(service);
  });

  describe("GET /businesses/:id/flags", () => {
    it("Resolves feature flags with platform defaults and business overrides.", async () => {
      prismaMock.business.findFirst.mockResolvedValue({
        id: businessId,
        name: "Test Store",
        deleted_at: null,
      });

      // 1. Platform defaults: voice_agent=true
      // 2. Business override: whatsapp_enabled=true
      prismaMock.featureFlag.findMany.mockImplementation(
        ({ where }: { where: { business_id: string | null } }) => {
          if (where.business_id === null) {
            return Promise.resolve([{ feature: "voice_agent", enabled: true }]);
          }
          if (where.business_id === businessId) {
            return Promise.resolve([{ feature: "whatsapp_enabled", enabled: true }]);
          }
          return Promise.resolve([]);
        },
      );

      const result = await controller.getFeatureFlagsByBusinessId(businessId, businessId);

      expect(result.flags).toEqual({
        whatsapp_enabled: true,
        voice_agent: true,
        advanced_analytics: false,
        vip_auto_handoff: false,
        ai_shadow_mode: false,
      });
    });

    it("Direct endpoint GET /feature-flags returns resolved flags for tenant.", async () => {
      prismaMock.business.findFirst.mockResolvedValue({
        id: businessId,
        name: "Test Store",
        deleted_at: null,
      });

      prismaMock.featureFlag.findMany.mockResolvedValue([]);

      const result = await controller.getFeatureFlags(businessId);

      expect(result.flags.whatsapp_enabled).toBe(false);
    });

    it("Cross-Tenant Isolation: Requesting flags for other business ID throws 403 Forbidden.", async () => {
      await expect(
        controller.getFeatureFlagsByBusinessId(businessId, otherBusinessId),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.business.findFirst).not.toHaveBeenCalled();
    });

    it("Not Found: Requesting flags for deleted or non-existent business throws 404.", async () => {
      prismaMock.business.findFirst.mockResolvedValue(null);

      await expect(controller.getFeatureFlagsByBusinessId(businessId, businessId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("PATCH /businesses/:id/flags", () => {
    it("Toggle Flag: Owner enables `whatsapp_enabled` flag via body.", async () => {
      prismaMock.business.findFirst.mockResolvedValue({
        id: businessId,
        name: "Test Store",
        deleted_at: null,
      });

      prismaMock.featureFlag.upsert.mockResolvedValue({
        id: "flag-1",
        business_id: businessId,
        feature: "whatsapp_enabled",
        enabled: true,
      });

      prismaMock.featureFlag.findMany.mockImplementation(
        ({ where }: { where: { business_id: string | null } }) => {
          if (where.business_id === null) {
            return Promise.resolve([]);
          }
          if (where.business_id === businessId) {
            return Promise.resolve([{ feature: "whatsapp_enabled", enabled: true }]);
          }
          return Promise.resolve([]);
        },
      );

      const result = await controller.updateFeatureFlag(businessId, businessId, {
        key: "whatsapp_enabled",
        enabled: true,
      });

      expect(prismaMock.featureFlag.upsert).toHaveBeenCalledWith({
        where: {
          business_id_feature: {
            business_id: businessId,
            feature: "whatsapp_enabled",
          },
        },
        create: {
          business_id: businessId,
          feature: "whatsapp_enabled",
          enabled: true,
        },
        update: {
          enabled: true,
        },
      });

      expect(result.flags.whatsapp_enabled).toBe(true);
    });

    it("Toggle Flag: Updates flag via /feature-flags/:feature endpoint.", async () => {
      prismaMock.business.findFirst.mockResolvedValue({
        id: businessId,
        name: "Test Store",
        deleted_at: null,
      });

      prismaMock.featureFlag.upsert.mockResolvedValue({
        id: "flag-1",
        business_id: businessId,
        feature: "voice_agent",
        enabled: true,
      });

      prismaMock.featureFlag.findMany.mockResolvedValue([
        { feature: "voice_agent", enabled: true },
      ]);

      const result = await controller.updateFeatureFlagByPath(businessId, "voice_agent", {
        enabled: true,
      });

      expect(result.flags.voice_agent).toBe(true);
    });

    it("Unknown Key (400): Passing unrecognized flag key returns 400 Bad Request.", async () => {
      await expect(
        controller.updateFeatureFlag(businessId, businessId, {
          key: "unknown_arbitrary_flag",
          enabled: true,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.updateFeatureFlag(businessId, businessId, {
          key: "whatsapp_enabled",
          // missing enabled
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.updateFeatureFlag(businessId, businessId, {
          key: "whatsapp_enabled",
          enabled: "not_a_boolean",
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.updateFeatureFlag(businessId, businessId, {
          key: "whatsapp_enabled",
          enabled: true,
          extraField: "invalid",
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.featureFlag.upsert).not.toHaveBeenCalled();
    });

    it("Cross-Tenant Isolation: PATCH to other business ID throws 403 Forbidden.", async () => {
      await expect(
        controller.updateFeatureFlag(businessId, otherBusinessId, {
          key: "whatsapp_enabled",
          enabled: true,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.featureFlag.upsert).not.toHaveBeenCalled();
    });

    it("RBAC Rigor: PATCH /businesses/:id/flags is guarded by @RequirePermission('flags.write')", () => {
      /* oxlint-disable typescript/unbound-method */
      const permissions = Reflect.getMetadata(
        "permissions",
        FlagsController.prototype.updateFeatureFlag,
      );
      /* oxlint-enable typescript/unbound-method */
      expect(permissions).toEqual(["flags.write"]);
    });
  });
});
