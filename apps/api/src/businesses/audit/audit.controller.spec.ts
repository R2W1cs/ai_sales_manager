import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { ROLE_PERMISSIONS, hasPermission } from "../../platform/security/permissions";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";

describe("Audit logging service & events repository (`/businesses/:id/audit-logs`) (T-BIZ-07)", () => {
  let controller: AuditController;
  let service: AuditService;
  let prismaMock: {
    auditLog: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const businessId = "11111111-1111-1111-1111-111111111111";
  const otherBusinessId = "22222222-2222-2222-2222-222222222222";
  const userId = "33333333-3333-3333-3333-333333333333";

  beforeEach(() => {
    prismaMock = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new AuditService(prismaMock as unknown as PrismaClient);
    controller = new AuditController(service);
  });

  describe("AuditService.record", () => {
    it("Audit Record: Sensitive action creates immutable log entry with actor context.", async () => {
      const mockCreatedRow = {
        id: "44444444-4444-4444-4444-444444444444",
        business_id: businessId,
        actor_user_id: userId,
        action: "member.role_change",
        entity_type: "membership",
        entity_id: "55555555-5555-5555-5555-555555555555",
        payload: {
          before: { role: "employee" },
          after: { role: "admin" },
          reason: "Promotion to team admin",
        },
        created_at: new Date("2026-08-19T12:00:00.000Z"),
        actor_user: {
          id: userId,
          name: "Owner User",
          email: "owner@example.com",
        },
      };

      prismaMock.auditLog.create.mockResolvedValue(mockCreatedRow);

      const result = await service.record({
        business_id: businessId,
        actor_user_id: userId,
        action: "member.role_change",
        entity_type: "membership",
        entity_id: "55555555-5555-5555-5555-555555555555",
        payload: {
          before: { role: "employee" },
          after: { role: "admin" },
          reason: "Promotion to team admin",
        },
      });

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          business_id: businessId,
          actor_user_id: userId,
          action: "member.role_change",
          entity_type: "membership",
          entity_id: "55555555-5555-5555-5555-555555555555",
          payload: {
            before: { role: "employee" },
            after: { role: "admin" },
            reason: "Promotion to team admin",
          },
        },
        include: {
          actor_user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      expect(result.id).toBe(mockCreatedRow.id);
      expect(result.payload).toEqual(mockCreatedRow.payload);
      expect(result.actor?.email).toBe("owner@example.com");
    });

    it("Immutability Guard: Audit service has no update or delete methods.", () => {
      const untypedService = service as unknown as Record<string, unknown>;
      expect(untypedService.update).toBeUndefined();
      expect(untypedService.delete).toBeUndefined();
      expect(untypedService.remove).toBeUndefined();
    });

    it("Separation of Concerns: Throws ForbiddenException if AI autonomous trace is recorded as audit log.", async () => {
      await expect(
        service.record({
          business_id: businessId,
          action: "ai.autonomous.order_placed",
          entity_type: "ai_action",
          entity_id: "66666666-6666-6666-6666-666666666666",
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });

    it("Validation: Missing required parameters throws BadRequestException.", async () => {
      await expect(
        service.record({
          business_id: "",
          action: "member.invite",
          entity_type: "member",
          entity_id: "77777777-7777-7777-7777-777777777777",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Validation: Invalid AuditPayloadSchema throws BadRequestException.", async () => {
      await expect(
        service.record({
          business_id: businessId,
          action: "member.invite",
          entity_type: "member",
          entity_id: "77777777-7777-7777-7777-777777777777",
          payload: {
            before: "not-an-object" as unknown as Record<string, unknown>,
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("AuditController & RBAC Guardrails", () => {
    it("Employee Access (403): Employee role does not have audit.read permission.", () => {
      const employeePermissions = ROLE_PERMISSIONS.employee;
      const ownerPermissions = ROLE_PERMISSIONS.owner;
      const adminPermissions = ROLE_PERMISSIONS.admin;

      expect(hasPermission(employeePermissions, "audit.read")).toBe(false);
      expect(hasPermission(ownerPermissions, "audit.read")).toBe(true);
      expect(hasPermission(adminPermissions, "audit.read")).toBe(true);
    });

    it("GET /businesses/:id/audit-logs returns cursor-paginated logs.", async () => {
      const mockLog1 = {
        id: "11111111-0000-0000-0000-000000000001",
        business_id: businessId,
        actor_user_id: userId,
        action: "member.invite",
        entity_type: "member",
        entity_id: "22222222-0000-0000-0000-000000000001",
        payload: { reason: "Invited new manager" },
        created_at: new Date("2026-08-19T14:00:00.000Z"),
        actor_user: { id: userId, name: "Admin", email: "admin@example.com" },
      };
      const mockLog2 = {
        id: "11111111-0000-0000-0000-000000000002",
        business_id: businessId,
        actor_user_id: userId,
        action: "order.cancel",
        entity_type: "order",
        entity_id: "22222222-0000-0000-0000-000000000002",
        payload: { reason: "Customer requested cancellation" },
        created_at: new Date("2026-08-19T13:00:00.000Z"),
        actor_user: { id: userId, name: "Admin", email: "admin@example.com" },
      };

      prismaMock.auditLog.findMany.mockResolvedValue([mockLog1, mockLog2]);

      const response = await controller.getAuditLogsByBusinessId(businessId, businessId, {
        limit: 2,
      });

      expect(response.data).toHaveLength(2);
      expect(response.next_cursor).toBeNull();
      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith({
        where: { business_id: businessId },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 3,
        include: {
          actor_user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    });

    it("Generates next_cursor when results exceed limit.", async () => {
      const mockLog1 = {
        id: "11111111-0000-0000-0000-000000000001",
        business_id: businessId,
        actor_user_id: userId,
        action: "member.invite",
        entity_type: "member",
        entity_id: "22222222-0000-0000-0000-000000000001",
        payload: null,
        created_at: new Date("2026-08-19T14:00:00.000Z"),
        actor_user: null,
      };
      const mockLog2 = {
        id: "11111111-0000-0000-0000-000000000002",
        business_id: businessId,
        actor_user_id: userId,
        action: "order.cancel",
        entity_type: "order",
        entity_id: "22222222-0000-0000-0000-000000000002",
        payload: null,
        created_at: new Date("2026-08-19T13:00:00.000Z"),
        actor_user: null,
      };

      prismaMock.auditLog.findMany.mockResolvedValue([mockLog1, mockLog2]);

      const response = await controller.getAuditLogsByBusinessId(businessId, businessId, {
        limit: 1,
      });

      expect(response.data).toHaveLength(1);
      expect(response.next_cursor).toBeTruthy();

      const nextCursor = response.next_cursor ?? "";
      const decoded = JSON.parse(Buffer.from(nextCursor, "base64url").toString("utf-8"));
      expect(decoded).toEqual({
        t: mockLog1.created_at.toISOString(),
        id: mockLog1.id,
      });
    });

    it("Parses cursor and applies time-ordered filters.", async () => {
      prismaMock.auditLog.findMany.mockResolvedValue([]);

      const cursorObj = {
        t: "2026-08-19T14:00:00.000Z",
        id: "11111111-0000-0000-0000-000000000001",
      };
      const cursorStr = Buffer.from(JSON.stringify(cursorObj)).toString("base64url");

      await controller.getAuditLogs(businessId, {
        cursor: cursorStr,
        action: "customer.erase",
        from: "2026-08-01",
        to: "2026-08-19",
      });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            business_id: businessId,
            action: "customer.erase",
            created_at: {
              gte: new Date("2026-08-01"),
              lte: new Date("2026-08-19T23:59:59.999Z"),
            },
            AND: [
              {
                OR: [
                  { created_at: { lt: new Date(cursorObj.t) } },
                  {
                    created_at: new Date(cursorObj.t),
                    id: { lt: cursorObj.id },
                  },
                ],
              },
            ],
          }),
        }),
      );
    });

    it("Rejects invalid cursor with BadRequestException.", async () => {
      await expect(
        controller.getAuditLogs(businessId, {
          cursor: "invalid-non-base64-json-not-cursor",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Cross-Tenant Isolation: Mismatching path businessId throws ForbiddenException.", async () => {
      await expect(
        controller.getAuditLogsByBusinessId(businessId, otherBusinessId),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
    });
  });
});
