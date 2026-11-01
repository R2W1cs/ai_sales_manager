import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";

import type { AuditService } from "../../businesses";
import { PERMISSIONS_KEY } from "../../platform/security/permissions";
import type { UpdateCustomerDto } from "../dto/update-customer.dto";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

describe("CustomersController", () => {
  const businessId = "11111111-1111-4111-a111-111111111111";
  const customerId = "22222222-2222-4222-a222-222222222222";
  let prismaMock: {
    $transaction: jest.Mock;
    customer: { findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    customerIdentity: { findFirst: jest.Mock; update: jest.Mock };
    customerTag: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock };
    customerNote: { create: jest.Mock };
  };
  let auditServiceMock: { record: jest.Mock };
  let controller: CustomersController;

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(prismaMock),
      ),
      customer: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      customerIdentity: {
        findFirst: jest.fn().mockResolvedValue({
          id: "33333333-3333-4333-a333-333333333333",
        }),
        update: jest.fn(),
      },
      customerTag: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      customerNote: {
        create: jest.fn().mockResolvedValue({ id: "77777777-7777-4777-a777-777777777777" }),
      },
    };
    auditServiceMock = { record: jest.fn() };
    controller = new CustomersController(
      new CustomersService(
        prismaMock as unknown as PrismaClient,
        auditServiceMock as unknown as AuditService,
      ),
    );
  });

  it("requires inbox.read permission", () => {
    const handler = Reflect.get(CustomersController.prototype, "getCustomer") as object;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(["inbox.read"]);
  });

  it("returns a unified tenant-scoped profile with identities and order history", async () => {
    const now = new Date();
    const rawProfile = {
      id: customerId,
      business_id: businessId,
      name: "Aymen Ben Amor",
      phone: "+21698111222",
      email: "aymen@example.com",
      address: { city: "Tunis", country: "TN" },
      language: "ar",
      preferences: { preferred_payment: "cod" },
      lifecycle_stage: "qualified_lead",
      confirmed_order_count: 1,
      last_confirmed_order_at: now,
      merged_into_customer_id: null,
      erased_at: null,
      is_test: false,
      created_at: now,
      updated_at: now,
      tags: [{ tag: "priority" }, { tag: "vip" }],
      notes: [
        {
          id: "66666666-6666-4666-a666-666666666666",
          business_id: businessId,
          customer_id: customerId,
          author_user_id: "55555555-5555-4555-a555-555555555555",
          body: "Follow up on delivery",
          created_at: now,
        },
      ],
      identities: [
        {
          id: "33333333-3333-4333-a333-333333333333",
          business_id: businessId,
          customer_id: customerId,
          platform: "instagram",
          platform_user_id: "ig-1",
          phone_number: "+21698111222",
          verified_at: now,
          created_at: now,
        },
      ],
      orders: [
        {
          id: "44444444-4444-4444-a444-444444444444",
          business_id: businessId,
          customer_id: customerId,
          status: "PENDING_CONFIRMATION",
          payment_status: "NOT_COMPLETED",
          currency: "TND",
          subtotal: new Prisma.Decimal("120.000"),
          delivery_fee: new Prisma.Decimal("7.000"),
          total: new Prisma.Decimal("127.000"),
          created_at: now,
        },
      ],
    };
    prismaMock.customer.findFirst.mockResolvedValue(rawProfile);

    const result = await controller.getCustomer(businessId, customerId);
    expect(result.id).toBe(customerId);
    expect(result.businessId).toBe(businessId);
    expect(result.name).toBe("Aymen Ben Amor");
    expect(result.tags).toEqual(["priority", "vip"]);
    expect(result.notes).toEqual([
      expect.objectContaining({
        body: "Follow up on delivery",
        authorUserId: "55555555-5555-4555-a555-555555555555",
      }),
    ]);
    expect(result.identities).toHaveLength(1);
    expect(result.identities[0]?.platform).toBe("instagram");
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]?.total).toBe("127.000");

    expect(prismaMock.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: customerId,
          business_id: businessId,
          erased_at: null,
        },
        include: expect.objectContaining({
          notes: expect.objectContaining({ take: 100 }),
          orders: expect.objectContaining({ take: 50 }),
        }),
      }),
    );
  });

  it("follows merged_into_customer_id to return root active customer profile", async () => {
    const rootCustomerId = "33333333-3333-4333-a333-333333333333";
    const now = new Date();
    const mergedProfile = {
      id: customerId,
      business_id: businessId,
      name: "Old Customer",
      phone: null,
      email: null,
      address: null,
      language: null,
      preferences: null,
      lifecycle_stage: "unknown_visitor",
      confirmed_order_count: 0,
      last_confirmed_order_at: null,
      merged_into_customer_id: rootCustomerId,
      erased_at: null,
      is_test: false,
      created_at: now,
      updated_at: now,
      tags: [],
      notes: [],
      identities: [],
      orders: [],
    };
    const rootProfile = {
      id: rootCustomerId,
      business_id: businessId,
      name: "Unified Customer",
      phone: "+21698111222",
      email: null,
      address: null,
      language: null,
      preferences: null,
      lifecycle_stage: "customer",
      confirmed_order_count: 1,
      last_confirmed_order_at: now,
      merged_into_customer_id: null,
      erased_at: null,
      is_test: false,
      created_at: now,
      updated_at: now,
      tags: [{ tag: "vip" }],
      notes: [],
      identities: [],
      orders: [],
    };

    prismaMock.customer.findFirst
      .mockResolvedValueOnce(mergedProfile)
      .mockResolvedValueOnce(rootProfile);

    const result = await controller.getCustomer(businessId, customerId);
    expect(result.id).toBe(rootCustomerId);
    expect(result.name).toBe("Unified Customer");
  });

  it("throws BadRequestException when cyclic merge pointers are encountered", async () => {
    const rootCustomerId = "33333333-3333-4333-a333-333333333333";
    const now = new Date();
    const cust1 = {
      id: customerId,
      business_id: businessId,
      name: "Cust 1",
      phone: null,
      email: null,
      address: null,
      language: null,
      preferences: null,
      lifecycle_stage: "unknown_visitor",
      confirmed_order_count: 0,
      last_confirmed_order_at: null,
      merged_into_customer_id: rootCustomerId,
      erased_at: null,
      is_test: false,
      created_at: now,
      updated_at: now,
      tags: [],
      notes: [],
      identities: [],
      orders: [],
    };
    const cust2 = {
      id: rootCustomerId,
      business_id: businessId,
      name: "Cust 2",
      phone: null,
      email: null,
      address: null,
      language: null,
      preferences: null,
      lifecycle_stage: "unknown_visitor",
      confirmed_order_count: 0,
      last_confirmed_order_at: null,
      merged_into_customer_id: customerId,
      erased_at: null,
      is_test: false,
      created_at: now,
      updated_at: now,
      tags: [],
      notes: [],
      identities: [],
      orders: [],
    };

    prismaMock.customer.findFirst.mockResolvedValueOnce(cust1).mockResolvedValueOnce(cust2);

    await expect(controller.getCustomer(businessId, customerId)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("returns 404 instead of exposing another tenant's customer", async () => {
    prismaMock.customer.findFirst.mockResolvedValue(null);

    await expect(controller.getCustomer(businessId, customerId)).rejects.toThrow(NotFoundException);
  });

  describe("PATCH /customers/:id", () => {
    const user = {
      id: "55555555-5555-4555-a555-555555555555",
      sub: "55555555-5555-4555-a555-555555555555",
    };

    const makeProfile = () => {
      const now = new Date("2026-01-01T00:00:00.000Z");
      return {
        id: customerId,
        business_id: businessId,
        name: "Updated Customer",
        phone: "+21698111222",
        email: null,
        address: null,
        language: null,
        preferences: null,
        lifecycle_stage: "qualified_lead",
        confirmed_order_count: 0,
        last_confirmed_order_at: null,
        merged_into_customer_id: null,
        erased_at: null,
        is_test: false,
        created_at: now,
        updated_at: now,
        tags: [],
        notes: [],
        identities: [],
        orders: [],
      };
    };

    it("requires customers.write permission", () => {
      const handler = Reflect.get(CustomersController.prototype, "updateCustomer") as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(["customers.write"]);
    });

    it("atomically updates profile fields, replaces tags, enables VIP, and creates a staff note", async () => {
      prismaMock.customer.findFirst.mockImplementation(
        ({ where }: { where: { id?: string | { not?: string } } }) => {
          if (typeof where.id === "object" && "not" in where.id) {
            return Promise.resolve(null); // No phone collision
          }
          return Promise.resolve(makeProfile());
        },
      );
      prismaMock.customerTag.findMany.mockResolvedValue([
        { id: "tag-1", tag: "old-tag" },
        { id: "tag-2", tag: "vip" },
      ]);

      const result = await controller.updateCustomer(businessId, user, customerId, {
        name: " Updated Customer ",
        phone: "+216 99 123 456",
        tags: ["priority", "priority", "vip"],
        isVip: true,
        notes: " Called about delivery ",
      });

      expect(result.name).toBe("Updated Customer");
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.customer.findFirst).toHaveBeenCalledWith({
        where: {
          id: customerId,
          erased_at: null,
        },
        select: {
          id: true,
          business_id: true,
          name: true,
          phone: true,
          merged_into_customer_id: true,
        },
      });
      expect(prismaMock.customer.updateMany).toHaveBeenCalledWith({
        where: {
          id: customerId,
          business_id: businessId,
          erased_at: null,
          merged_into_customer_id: null,
        },
        data: {
          name: "Updated Customer",
          phone: "+21699123456",
          updated_at: expect.any(Date),
        },
      });
      expect(prismaMock.customerTag.deleteMany).toHaveBeenCalledWith({
        where: {
          business_id: businessId,
          customer_id: customerId,
          id: { in: ["tag-1"] },
        },
      });
      expect(prismaMock.customerTag.createMany).toHaveBeenCalledWith({
        data: [
          {
            business_id: businessId,
            customer_id: customerId,
            tag: "priority",
            created_by_user_id: user.id,
          },
        ],
        skipDuplicates: true,
      });
      expect(prismaMock.customerNote.create).toHaveBeenCalledWith({
        data: {
          business_id: businessId,
          customer_id: customerId,
          author_user_id: user.id,
          body: "Called about delivery",
        },
        select: { id: true },
      });
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        {
          business_id: businessId,
          actor_user_id: user.id,
          action: "customer.updated",
          entity_type: "customer",
          entity_id: customerId,
          payload: {
            before: {
              name: "U*** C***",
              phone: "+216***222",
              tags: ["old-tag", "vip"],
              is_vip: true,
            },
            after: {
              name: "U*** C***",
              phone: "+216***456",
              tags: ["priority", "vip"],
              is_vip: true,
              note_id: "77777777-7777-4777-a777-777777777777",
            },
          },
        },
        prismaMock,
      );
    });

    it("correctly deletes legacy-cased tags by row id", async () => {
      prismaMock.customer.findFirst.mockImplementation(
        ({ where }: { where: { id?: string | { not?: string } } }) => {
          if (typeof where.id === "object" && "not" in where.id) {
            return Promise.resolve(null); // No phone collision
          }
          return Promise.resolve(makeProfile());
        },
      );
      prismaMock.customerTag.findMany.mockResolvedValue([
        { id: "legacy-tag-id-1", tag: "VIP" },
        { id: "legacy-tag-id-2", tag: "Priority" },
      ]);

      await controller.updateCustomer(businessId, user, customerId, {
        tags: ["wholesale"],
      });

      expect(prismaMock.customerTag.deleteMany).toHaveBeenCalledWith({
        where: {
          business_id: businessId,
          customer_id: customerId,
          id: { in: ["legacy-tag-id-1", "legacy-tag-id-2"] },
        },
      });
      expect(prismaMock.customerTag.createMany).toHaveBeenCalledWith({
        data: [
          {
            business_id: businessId,
            customer_id: customerId,
            tag: "wholesale",
            created_by_user_id: user.id,
          },
        ],
        skipDuplicates: true,
      });
    });

    it("removes only the vip tag when isVip is false and tags are omitted", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(makeProfile());
      prismaMock.customerTag.findMany.mockResolvedValue([
        { id: "tag-vip", tag: "vip" },
        { id: "tag-priority", tag: "priority" },
      ]);

      await controller.updateCustomer(businessId, user, customerId, { isVip: false });

      expect(prismaMock.customerTag.deleteMany).toHaveBeenCalledWith({
        where: {
          business_id: businessId,
          customer_id: customerId,
          id: { in: ["tag-vip"] },
        },
      });
      expect(prismaMock.customerTag.createMany).not.toHaveBeenCalled();
    });

    it("throws ConflictException when concurrent modification occurs", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(makeProfile());
      prismaMock.customer.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        controller.updateCustomer(businessId, user, customerId, { name: "New Name" }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects requests providing both note and notes simultaneously", async () => {
      await expect(
        controller.updateCustomer(businessId, user, customerId, {
          note: "Note A",
          notes: "Note B",
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.updateCustomer(businessId, user, customerId, {
          note: "Same Note",
          notes: "Same Note",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("propagates error and rolls back when transaction operation fails", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(makeProfile());
      prismaMock.customerNote.create.mockRejectedValue(new Error("Database connection lost"));

      await expect(
        controller.updateCustomer(businessId, user, customerId, { note: "New note" }),
      ).rejects.toThrow("Database connection lost");
    });

    it("propagates error when audit recording fails inside transaction", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(makeProfile());
      auditServiceMock.record.mockRejectedValue(new Error("Audit recording failed"));

      await expect(
        controller.updateCustomer(businessId, user, customerId, { name: "New Name" }),
      ).rejects.toThrow("Audit recording failed");
    });

    it("returns 404 and performs no writes for missing customer", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(null);

      await expect(
        controller.updateCustomer(businessId, user, customerId, { isVip: true }),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.customer.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.customerTag.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.customerNote.create).not.toHaveBeenCalled();
      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });

    it("returns 403 Forbidden and performs no writes for another tenant's customer", async () => {
      prismaMock.customer.findFirst.mockResolvedValue({
        id: customerId,
        business_id: "00000000-0000-0000-0000-000000000999",
        name: "Other Tenant Customer",
        phone: null,
        merged_into_customer_id: null,
      });

      await expect(
        controller.updateCustomer(businessId, user, customerId, { isVip: true }),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.customer.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.customerTag.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.customerNote.create).not.toHaveBeenCalled();
      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });

    it("returns 409 ConflictException when attempting to update a merged customer", async () => {
      prismaMock.customer.findFirst.mockResolvedValue({
        id: customerId,
        business_id: businessId,
        name: "Old Customer",
        phone: null,
        merged_into_customer_id: "88888888-8888-4888-a888-888888888888",
      });

      await expect(
        controller.updateCustomer(businessId, user, customerId, { name: "New Name" }),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.customer.updateMany).not.toHaveBeenCalled();
      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });

    it("returns 409 ConflictException when phone is already in use by another customer", async () => {
      prismaMock.customer.findFirst
        .mockResolvedValueOnce({
          id: customerId,
          business_id: businessId,
          name: "Customer",
          phone: "+21698111222",
          merged_into_customer_id: null,
        })
        .mockResolvedValueOnce({
          id: "99999999-9999-4999-a999-999999999999",
        });

      await expect(
        controller.updateCustomer(businessId, user, customerId, { phone: "+21699123456" }),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.customer.updateMany).not.toHaveBeenCalled();
      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });

    it("rejects conflicting isVip and tags values", async () => {
      await expect(
        controller.updateCustomer(businessId, user, customerId, {
          tags: ["priority"],
          isVip: true,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.updateCustomer(businessId, user, customerId, {
          tags: ["vip", "priority"],
          isVip: false,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("rejects empty or unknown update payloads", async () => {
      await expect(controller.updateCustomer(businessId, user, customerId, {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        controller.updateCustomer(businessId, user, customerId, {
          email: "not-allowed@example.com",
        } as unknown as UpdateCustomerDto),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });
});
