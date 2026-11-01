import { CANONICAL_PLANS } from "@app/shared";

import { PlansController } from "./plans.controller";
import { PlansService } from "./plans.service";

describe("PlansController (GET /api/v1/billing/plans)", () => {
  let controller: PlansController;
  let service: PlansService;
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

    service = new PlansService(mockPrisma);
    controller = new PlansController(service);
  });

  it("GET /api/v1/billing/plans returns list of available plan tiers", async () => {
    const response = await controller.getPlans();

    expect(response).toHaveLength(3);
    expect(response.map((p) => p.code)).toEqual(["starter", "growth", "scale"]);
  });

  it("GET /api/v1/billing/plans/:code returns tier details and quotas", async () => {
    const response = await controller.getPlanByCode("growth");

    expect(response).toBeDefined();
    expect(response.code).toBe("growth");
    expect(response.limits.seats).toBe(5);
    expect(response.limits.channel_accounts).toBe(3);
    expect(response.limits.ai_messages_per_month).toBe(3000);
  });
});
