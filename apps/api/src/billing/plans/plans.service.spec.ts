import { NotFoundException } from "@nestjs/common";

import { CANONICAL_PLANS } from "@app/shared";

import { PlansService } from "./plans.service";

describe("Billing subscription plans seed & database repository (T-BILL-01)", () => {
  let plansService: PlansService;
  let mockPrisma: any;

  const mockDbPlans = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      code: "starter",
      name: "Starter",
      limits: CANONICAL_PLANS.starter.limits,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      code: "growth",
      name: "Growth",
      limits: CANONICAL_PLANS.growth.limits,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      code: "scale",
      name: "Scale",
      limits: CANONICAL_PLANS.scale.limits,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
      plan: {
        findMany: jest.fn().mockResolvedValue(mockDbPlans),
        findUnique: jest.fn().mockImplementation(({ where }: { where: { code: string } }) => {
          const found = mockDbPlans.find((p) => p.code === where.code);
          return Promise.resolve(found ?? null);
        }),
        upsert: jest.fn().mockImplementation(({ where, create, update }: any) => {
          return Promise.resolve({
            id: "00000000-0000-4000-8000-000000000001",
            code: where.code,
            name: update?.name ?? create?.name,
            limits: update?.limits ?? create?.limits,
            created_at: new Date("2026-01-01T00:00:00.000Z"),
            updated_at: new Date("2026-01-01T00:00:00.000Z"),
          });
        }),
      },
    };

    plansService = new PlansService(mockPrisma);
  });

  describe("Plan Quotas Acceptance Criteria & Read Purity", () => {
    it("Plan Quotas: Returns 3 standard subscription tiers with correct quotas without write side-effects", async () => {
      const plans = await plansService.getPlans();

      expect(mockPrisma.plan.findMany).toHaveBeenCalledWith({
        orderBy: [{ code: "asc" }],
      });
      expect(mockPrisma.plan.upsert).not.toHaveBeenCalled();
      expect(plans).toHaveLength(3);

      const starter = plans.find((p) => p.code === "starter");
      const growth = plans.find((p) => p.code === "growth");
      const scale = plans.find((p) => p.code === "scale");

      expect(starter).toBeDefined();
      expect(growth).toBeDefined();
      expect(scale).toBeDefined();

      // Starter Invariant: 2 seats, 1 channel, 500 AI msgs
      expect(starter?.limits.seats).toBe(2);
      expect(starter?.limits.channel_accounts).toBe(1);
      expect(starter?.limits.ai_messages_per_month).toBe(500);

      // Growth Invariant: 5 seats, 3 channels, 3000 AI msgs
      expect(growth?.limits.seats).toBe(5);
      expect(growth?.limits.channel_accounts).toBe(3);
      expect(growth?.limits.ai_messages_per_month).toBe(3000);

      // Scale Invariant: 15 seats, 10 channels, 15000 AI msgs
      expect(scale?.limits.seats).toBe(15);
      expect(scale?.limits.channel_accounts).toBe(10);
      expect(scale?.limits.ai_messages_per_month).toBe(15000);
    });

    it("seedPlans explicitly seeds and repairs canonical plans using an interactive transaction", async () => {
      const seededPlans = await plansService.seedPlans();

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.plan.upsert).toHaveBeenCalledTimes(3);
      expect(seededPlans).toHaveLength(3);
    });

    it("seedPlans aborts and rolls back if an upsert within the transaction fails", async () => {
      mockPrisma.plan.upsert.mockRejectedValueOnce(new Error("Database write error"));

      await expect(plansService.seedPlans()).rejects.toThrow("Database write error");
    });

    it("onModuleInit seeds canonical plans during application startup", async () => {
      const seedSpy = jest.spyOn(plansService, "seedPlans").mockResolvedValueOnce([]);

      await plansService.onModuleInit();

      expect(seedSpy).toHaveBeenCalledTimes(1);
    });

    it("onModuleInit handles startup errors gracefully in test environments", async () => {
      jest.spyOn(plansService, "seedPlans").mockRejectedValueOnce(new Error("Connection refused"));

      await expect(plansService.onModuleInit()).resolves.toBeUndefined();
    });

    it("onModuleInit logs error and rethrows when not in test environment (fails closed)", async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = "production";
        jest
          .spyOn(plansService, "seedPlans")
          .mockRejectedValueOnce(new Error("Database unavailable"));

        await expect(plansService.onModuleInit()).rejects.toThrow("Database unavailable");
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("getPlans sorts canonical plans first, followed by custom plans sorted alphabetically by code", async () => {
      const customPlans = [
        {
          id: "55555555-5555-5555-8555-555555555555",
          code: "zeta_enterprise",
          name: "Zeta Enterprise",
          limits: CANONICAL_PLANS.scale.limits,
          created_at: new Date("2026-01-01T00:00:00.000Z"),
          updated_at: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          code: "alpha_custom",
          name: "Alpha Custom",
          limits: CANONICAL_PLANS.growth.limits,
          created_at: new Date("2026-01-01T00:00:00.000Z"),
          updated_at: new Date("2026-01-01T00:00:00.000Z"),
        },
        ...mockDbPlans,
      ];

      mockPrisma.plan.findMany.mockResolvedValueOnce(customPlans);

      const plans = await plansService.getPlans();

      expect(plans.map((p) => p.code)).toEqual([
        "starter",
        "growth",
        "scale",
        "alpha_custom",
        "zeta_enterprise",
      ]);
    });

    it("retrieves a single plan by code (case-insensitive and trimmed) without write side-effects", async () => {
      const plan = await plansService.getPlanByCode("  GROWTH  ");

      expect(mockPrisma.plan.findUnique).toHaveBeenCalledWith({
        where: { code: "growth" },
      });
      expect(mockPrisma.plan.upsert).not.toHaveBeenCalled();
      expect(plan).toBeDefined();
      expect(plan.code).toBe("growth");
      expect(plan.limits.seats).toBe(5);
      expect(plan.limits.channel_accounts).toBe(3);
      expect(plan.limits.ai_messages_per_month).toBe(3000);
    });

    it("retrieves custom non-canonical plan from DB if present", async () => {
      mockPrisma.plan.findUnique.mockResolvedValueOnce({
        id: "44444444-4444-4444-8444-444444444444",
        code: "enterprise_custom",
        name: "Enterprise Custom",
        limits: {
          seats: 50,
          channel_accounts: 25,
          ai_messages_per_month: 50000,
          max_ai_replies_per_month: 50000,
          max_conversations: null,
          monthly_ai_budget_usd: null,
        },
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
      });

      const plan = await plansService.getPlanByCode("enterprise_custom");

      expect(plan).toBeDefined();
      expect(plan.code).toBe("enterprise_custom");
      expect(plan.limits.seats).toBe(50);
      expect(mockPrisma.plan.upsert).not.toHaveBeenCalled();
    });

    it("throws 404 NotFoundException for non-existent plan code", async () => {
      mockPrisma.plan.findUnique.mockResolvedValueOnce(null);
      await expect(plansService.getPlanByCode("enterprise_ultra")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws 404 NotFoundException for inherited prototype properties (e.g. toString, valueOf)", async () => {
      mockPrisma.plan.findUnique.mockResolvedValueOnce(null);
      await expect(plansService.getPlanByCode("toString")).rejects.toThrow(NotFoundException);
      expect(mockPrisma.plan.findUnique).toHaveBeenCalledWith({
        where: { code: "tostring" },
      });
      expect(mockPrisma.plan.upsert).not.toHaveBeenCalled();
    });

    it("retrieves quota limits for a given tier without write side-effects", async () => {
      const scaleQuotas = await plansService.getPlanQuotas("scale");

      expect(scaleQuotas).toEqual({
        seats: 15,
        channel_accounts: 10,
        ai_messages_per_month: 15000,
        max_ai_replies_per_month: 15000,
        max_conversations: null,
        monthly_ai_budget_usd: null,
      });
      expect(mockPrisma.plan.upsert).not.toHaveBeenCalled();
    });
  });
});
