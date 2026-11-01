import { BadRequestException, ForbiddenException } from "@nestjs/common";

import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { PlaygroundController } from "./playground.controller";
import { PlaygroundService } from "./playground.service";
import { TEST_BUSINESS_ID, createMockPrismaClient, type MockPrismaClient } from "./test-fixtures";

describe("PlaygroundController & RBAC Security Suite", () => {
  let controller: PlaygroundController;
  let service: PlaygroundService;
  let prismaMock: MockPrismaClient;
  let orchestratorMock: { executeTurn: jest.Mock };

  beforeEach(() => {
    prismaMock = createMockPrismaClient();
    orchestratorMock = {
      executeTurn: jest.fn(),
    };
    service = new PlaygroundService(orchestratorMock as any, undefined, prismaMock as any);
    controller = new PlaygroundController(service);
  });

  describe("Controller routing & parameter handling", () => {
    it("delegates simulate call with header-passed idempotency-key", async () => {
      const simulateSpy = jest.spyOn(service, "simulate").mockResolvedValueOnce({
        response: "Simulation output",
        executionSummary: "Completed",
        explanation: "Turn processed",
        toolCalls: [],
        handoffTriggered: false,
        conversationId: "test-conv-id",
        groundingPassed: true,
      });

      const res = await controller.simulate(
        TEST_BUSINESS_ID,
        { message: "Hello AI" },
        "header-key-123",
      );

      expect(simulateSpy).toHaveBeenCalledWith(TEST_BUSINESS_ID, {
        message: "Hello AI",
        idempotencyKey: "header-key-123",
      });
      expect(res.response).toBe("Simulation output");
    });

    it("delegates listConversations call to service", async () => {
      const listSpy = jest.spyOn(service, "listPlaygroundConversations").mockResolvedValueOnce([]);

      const res = await controller.listConversations(TEST_BUSINESS_ID);
      expect(listSpy).toHaveBeenCalledWith(TEST_BUSINESS_ID);
      expect(res).toEqual([]);
    });

    it("validates maxAgeDays strictly in pruneConversations", async () => {
      const pruneSpy = jest
        .spyOn(service, "prunePlaygroundConversations")
        .mockResolvedValueOnce({ count: 2 });

      const res = await controller.pruneConversations(TEST_BUSINESS_ID, "14");
      expect(pruneSpy).toHaveBeenCalledWith(TEST_BUSINESS_ID, 14);
      expect(res.count).toBe(2);

      await expect(controller.pruneConversations(TEST_BUSINESS_ID, "invalid")).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.pruneConversations(TEST_BUSINESS_ID, "0")).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.pruneConversations(TEST_BUSINESS_ID, "366")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("Payload Validation Guardrails", () => {
    it("rejects conflicting message and scenario in simulation payload with 400", async () => {
      await expect(
        service.simulate(TEST_BUSINESS_ID, {
          message: "Free form text",
          scenario: "price",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects simulation payload exceeding 2000 characters with 400", async () => {
      await expect(
        service.simulate(TEST_BUSINESS_ID, {
          message: "a".repeat(2001),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects empty payload with 400", async () => {
      await expect(service.simulate(TEST_BUSINESS_ID, {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("RBAC Permissions Verification", () => {
    it("Employee (403): Employee role is denied ai.playground access", async () => {
      const guard = new PermissionsGuard({
        getAllAndOverride: jest.fn().mockReturnValue(["ai.playground"]),
      } as any);

      const mockContext = {
        getHandler: () => ({}),
        getClass: () => PlaygroundController,
        switchToHttp: () => ({
          getRequest: () => ({
            membership: {
              role: {
                name: "employee",
                role_permissions: [],
              },
              permissions: ["conversations.read", "conversations.reply"],
            },
          }),
        }),
      } as any;

      let error: any;
      try {
        await guard.canActivate(mockContext);
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(ForbiddenException);
    });

    it("Owner and Admin roles are granted ai.playground access", async () => {
      const guard = new PermissionsGuard({
        getAllAndOverride: jest.fn().mockReturnValue(["ai.playground"]),
      } as any);

      const ownerContext = {
        getHandler: () => ({}),
        getClass: () => PlaygroundController,
        switchToHttp: () => ({
          getRequest: () => ({
            membership: {
              role: {
                name: "owner",
                role_permissions: [],
              },
            },
          }),
        }),
      } as any;

      const adminContext = {
        getHandler: () => ({}),
        getClass: () => PlaygroundController,
        switchToHttp: () => ({
          getRequest: () => ({
            membership: {
              role: {
                name: "admin",
                role_permissions: [],
              },
            },
          }),
        }),
      } as any;

      await expect(guard.canActivate(ownerContext)).resolves.toBe(true);
      await expect(guard.canActivate(adminContext)).resolves.toBe(true);
    });
  });
});
