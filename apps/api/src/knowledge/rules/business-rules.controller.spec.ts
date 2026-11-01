import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { PERMISSIONS_KEY } from "../../platform/security/permissions";
import { BusinessRulesController } from "./business-rules.controller";
import { BusinessRulesService } from "./business-rules.service";

/**
 * Automated TDD Test Suite for T-KNOW-01 — Business rules versioning & validation API (`/business-rules`)
 */
describe("Business rules versioning & validation API (`/business-rules`) (T-KNOW-01)", () => {
  let controller: BusinessRulesController;
  let prismaMock: {
    businessRule: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const businessId = "11111111-1111-4111-a111-111111111111";
  const ruleId1 = "22222222-2222-4222-a222-222222222222";
  const ruleId2 = "33333333-3333-4333-a333-333333333333";
  const t0 = new Date("2026-08-20T00:00:00Z");
  const t1 = new Date("2026-08-20T01:00:00Z");
  const t2 = new Date("2026-08-20T02:00:00Z");

  beforeEach(() => {
    prismaMock = {
      businessRule: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => {
        return cb(prismaMock);
      }),
    };

    controller = new BusinessRulesController(
      new BusinessRulesService(prismaMock as unknown as PrismaClient),
    );
  });

  describe("1. Acceptance Criteria: Versioning & Immutability", () => {
    it("Versioning: Updating rule creates version 2 and sets `effective_to` on version 1.", async () => {
      // Setup: Existing rule version 1 (14 days return policy)
      const existingVersion1 = {
        id: ruleId1,
        business_id: businessId,
        rule_type: "returns",
        payload: { window_days: 14, conditions: "unworn, tags on" },
        priority: 100,
        enabled: true,
        effective_from: t0,
        effective_to: null,
        created_at: t0,
      };

      // New version 2 (30 days)
      const newVersion2 = {
        id: ruleId2,
        business_id: businessId,
        rule_type: "returns",
        payload: { window_days: 30, conditions: "unworn, tags on, receipt required" },
        priority: 100,
        enabled: true,
        effective_from: t1,
        effective_to: null,
        created_at: t1,
      };

      // Transaction: findMany (active rules to close), updateMany (close v1), create (v2), count
      prismaMock.businessRule.findMany.mockResolvedValueOnce([existingVersion1]);
      prismaMock.businessRule.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.businessRule.create.mockResolvedValueOnce(newVersion2);
      prismaMock.businessRule.count.mockResolvedValueOnce(2); // 2 versions now exist

      const result = await controller.createRule(businessId, {
        ruleType: "returns",
        payload: { window_days: 30, conditions: "unworn, tags on, receipt required" },
      });

      // New version 2 returned
      expect(result.version).toBe(2);
      expect(result.ruleType).toBe("returns");
      expect(result.effectiveTo).toBeNull();

      // Prior version closed (updateMany called with business_id + rule_type scope)
      expect(prismaMock.businessRule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            business_id: businessId,
            rule_type: "returns",
          }),
          data: expect.objectContaining({ effective_to: expect.any(Date) }),
        }),
      );

      // The close timestamp must be wall-clock NOW, not the new rule's effectiveFrom
      const updateManyCall = prismaMock.businessRule.updateMany.mock.calls[0][0] as {
        data: { effective_to: Date };
      };
      const closeAt = updateManyCall.data.effective_to;
      expect(closeAt).not.toEqual(newVersion2.effective_from);
      expect(closeAt.getTime()).toBeGreaterThanOrEqual(t0.getTime());
    });

    it("Immutability: PATCH is refused when `payload` is included (strict schema rejects unknown keys).", async () => {
      await expect(
        controller.updateRule(businessId, ruleId1, { payload: { zones: [] } } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("2. Acceptance Criteria: Payload Schema Validation (§14.8)", () => {
    it("Invalid delivery payload (negative fee) → 400 Bad Request.", async () => {
      await expect(
        controller.createRule(businessId, {
          ruleType: "delivery",
          payload: { zones: [{ name: "Local", fee: -5, currency: "USD", eta_hours: 2 }] },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Invalid delivery payload (zero eta_hours) → 400 Bad Request.", async () => {
      await expect(
        controller.createRule(businessId, {
          ruleType: "delivery",
          payload: { zones: [{ name: "Local", fee: 5, currency: "USD", eta_hours: 0 }] },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Invalid payment payload (method missing required fields) → 400 Bad Request.", async () => {
      await expect(
        controller.createRule(businessId, {
          ruleType: "payment",
          // method object missing 'code' and 'label' — schema requires both
          payload: { methods: [{ type: "card" }] },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Invalid returns payload (negative window_days) → 400 Bad Request.", async () => {
      await expect(
        controller.createRule(businessId, {
          ruleType: "returns",
          payload: { window_days: -1, conditions: "ok" },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Invalid discount payload (max_percent > 100) → 400 Bad Request.", async () => {
      await expect(
        controller.createRule(businessId, {
          ruleType: "discount",
          payload: { ai_may_offer: true, max_percent: 110 },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Invalid min_order payload (negative amount) → 400 Bad Request.", async () => {
      await expect(
        controller.createRule(businessId, {
          ruleType: "min_order",
          payload: { amount: -1, currency: "USD" },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Missing ruleType field → 400 Bad Request.", async () => {
      await expect(
        controller.createRule(businessId, { payload: { window_days: 14 } } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("3. Acceptance Criteria: Active Rules Fetch (timestamp resolution)", () => {
    it("Active Rules Fetch: listRules resolves rules active as of the given timestamp.", async () => {
      // Only v1 is active at t0.5 (between t0 and t1)
      const v1Delivery = {
        id: ruleId1,
        business_id: businessId,
        rule_type: "delivery",
        payload: { zones: [{ name: "Local", fee: 5, currency: "USD", eta_hours: 2 }] },
        priority: 100,
        enabled: true,
        effective_from: t0,
        effective_to: t1,
        created_at: t0,
      };

      const queryTimeBeforeT1 = new Date(t0.getTime() + 1800_000); // t0 + 30 min

      // findMany for filtered rules + findMany for version metadata
      prismaMock.businessRule.findMany
        .mockResolvedValueOnce([v1Delivery]) // filtered result
        .mockResolvedValueOnce([{ id: ruleId1, rule_type: "delivery", created_at: t0 }]); // meta

      // Default: grouped response (card §3)
      const result = (await controller.listRules(businessId, {
        effectiveAt: queryTimeBeforeT1,
      })) as Record<string, { id: string; version: number }>;

      expect(result.delivery).toBeDefined();
      expect(result.delivery?.id).toBe(ruleId1);
      expect(result.delivery?.version).toBe(1);
    });

    it("Active Rules Fetch: ?flat=true returns a flat array.", async () => {
      const v1Delivery = {
        id: ruleId1,
        business_id: businessId,
        rule_type: "delivery",
        payload: { zones: [{ name: "Local", fee: 5, currency: "USD", eta_hours: 2 }] },
        priority: 100,
        enabled: true,
        effective_from: t0,
        effective_to: null,
        created_at: t0,
      };

      prismaMock.businessRule.findMany
        .mockResolvedValueOnce([v1Delivery])
        .mockResolvedValueOnce([{ id: ruleId1, rule_type: "delivery", created_at: t0 }]);

      const result = await controller.listRules(businessId, { flat: true });

      expect(Array.isArray(result)).toBe(true);
      expect((result as { id: string }[])[0]?.id).toBe(ruleId1);
    });

    it("Active Rules Fetch: ?history=true returns a flat array of all versions.", async () => {
      const allVersions = [
        {
          id: ruleId1,
          business_id: businessId,
          rule_type: "delivery",
          payload: {},
          priority: 100,
          enabled: false,
          effective_from: t0,
          effective_to: t1,
          created_at: t0,
        },
        {
          id: ruleId2,
          business_id: businessId,
          rule_type: "delivery",
          payload: {},
          priority: 100,
          enabled: true,
          effective_from: t1,
          effective_to: null,
          created_at: t1,
        },
      ];

      prismaMock.businessRule.findMany.mockResolvedValueOnce(allVersions).mockResolvedValueOnce([
        { id: ruleId1, rule_type: "delivery", created_at: t0 },
        { id: ruleId2, rule_type: "delivery", created_at: t1 },
      ]);

      const result = await controller.listRules(businessId, { history: true });

      expect(Array.isArray(result)).toBe(true);
      expect((result as { id: string }[]).length).toBe(2);
    });
  });

  describe("4. PATCH /business-rules/:id", () => {
    it("PATCH disables a rule (sets enabled=false).", async () => {
      const existingRule = {
        id: ruleId1,
        business_id: businessId,
        rule_type: "delivery",
        payload: {},
        priority: 100,
        enabled: true,
        effective_from: t0,
        effective_to: null,
        created_at: t0,
      };

      // updateMany (Standard 1 — includes business_id in WHERE) then refetch
      prismaMock.businessRule.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.businessRule.findFirst.mockResolvedValueOnce({
        ...existingRule,
        enabled: false,
      });
      prismaMock.businessRule.count.mockResolvedValueOnce(1);

      const result = await controller.updateRule(businessId, ruleId1, { enabled: false });

      expect(result.enabled).toBe(false);
      expect(prismaMock.businessRule.updateMany).toHaveBeenCalledWith({
        where: { id: ruleId1, business_id: businessId },
        data: { enabled: false },
      });
    });

    it("PATCH sets effective_to date.", async () => {
      const existingRule = {
        id: ruleId1,
        business_id: businessId,
        rule_type: "delivery",
        payload: {},
        priority: 100,
        enabled: true,
        effective_from: t0,
        effective_to: null,
        created_at: t0,
      };

      prismaMock.businessRule.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.businessRule.findFirst.mockResolvedValueOnce({
        ...existingRule,
        effective_to: t2,
      });
      prismaMock.businessRule.count.mockResolvedValueOnce(1);

      const result = await controller.updateRule(businessId, ruleId1, { effectiveTo: t2 });

      expect((result.effectiveTo as Date).getTime()).toBe(t2.getTime());
    });

    it("PATCH 404: non-existent rule (updateMany returns count=0).", async () => {
      prismaMock.businessRule.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(controller.updateRule(businessId, ruleId1, { enabled: false })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("PATCH rejects payload mutation with 400 Bad Request (strict schema).", async () => {
      await expect(
        controller.updateRule(businessId, ruleId1, { payload: { zones: [] } } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("5. RBAC metadata", () => {
    it("All endpoints carry @RequirePermission('ai.configure') metadata.", () => {
      const proto = BusinessRulesController.prototype;

      const handlers = ["listRules", "createRule", "updateRule"] as const;
      for (const method of handlers) {
        const handler = Reflect.get(proto, method) as object;
        const perms = Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[] | undefined;
        expect(perms).toContain("ai.configure");
      }
    });
  });
});
