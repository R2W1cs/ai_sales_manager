import type { BillingUsageResponse } from "@app/shared";

import { PERMISSIONS_KEY } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { TenantGuard } from "../../platform/security/tenant.guard";
import { BillingController } from "./billing.controller";

describe("BillingController (GET /api/v1/billing/usage)", () => {
  const mockBusinessId = "11111111-1111-4111-8111-111111111111";

  let controller: BillingController;
  let mockQuotaService: any;

  const mockUsageResponse: BillingUsageResponse = {
    cycleStart: "2026-08-31T23:00:00.000Z",
    cycleEnd: "2026-09-30T22:59:59.000Z",
    planCode: "starter",
    limits: {
      aiMessages: 500,
      seats: 2,
      channels: 1,
    },
    current: {
      aiMessages: 120,
      seats: 1,
      channels: 1,
    },
    percentUsed: 24,
    aiPaused: false,
  };

  beforeEach(() => {
    mockQuotaService = {
      getUsage: jest.fn().mockResolvedValue(mockUsageResponse),
      checkQuotaGate: jest.fn(),
      enforceAiQuotaGate: jest.fn(),
    };

    controller = new BillingController(mockQuotaService);
  });

  it("returns billing usage summary with limits and current utilization", async () => {
    const response = await controller.getUsage(mockBusinessId);

    expect(response).toEqual(mockUsageResponse);
    expect(mockQuotaService.getUsage).toHaveBeenCalledWith(mockBusinessId);
    expect(response.percentUsed).toBe(24);
    expect(response.aiPaused).toBe(false);
  });

  it("attaches @RequirePermission('usage.read') guard metadata to handler", () => {
    const handler = Reflect.get(BillingController.prototype, "getUsage") as object;
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler);

    expect(permissions).toEqual(["usage.read"]);
  });

  it("binds TenantGuard and PermissionsGuard at controller class level", () => {
    const guards = Reflect.getMetadata("__guards__", BillingController);
    expect(guards).toEqual([TenantGuard, PermissionsGuard]);
  });
});
