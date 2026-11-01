import { createHash } from "node:crypto";

import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";

import type { AuditService } from "../../businesses";
import { PERMISSIONS_KEY } from "../../platform/security/permissions";
import { MergeController } from "./merge.controller";
import { MergeService } from "./merge.service";

describe("Customer merge", () => {
  const businessId = "11111111-1111-4111-a111-111111111111";
  const survivorId = "22222222-2222-4222-a222-222222222222";
  const duplicateId = "33333333-3333-4333-a333-333333333333";
  const actorUserId = "44444444-4444-4444-a444-444444444444";
  const idempotencyKey = "merge-request-1";
  const user = { id: actorUserId, sub: actorUserId };

  let prismaMock: any;
  let auditServiceMock: { record: jest.Mock };
  let controller: MergeController;

  const survivor = {
    id: survivorId,
    name: "Survivor",
    phone: null,
    email: "survivor@example.com",
    address: null,
    language: "fr",
    lifecycle_stage: "qualified_lead",
    merged_into_customer_id: null,
    erased_at: null,
    identities: [
      {
        id: "identity-survivor",
        platform: "instagram",
        platform_user_id: "same-user",
        phone_number: null,
        verified_at: null,
      },
    ],
    tags: [{ tag: "vip", created_by_user_id: actorUserId }],
    notes: [],
  };
  const duplicate = {
    id: duplicateId,
    name: "Duplicate",
    phone: "+21698111222",
    email: "duplicate@example.com",
    address: { city: "Tunis" },
    language: "ar",
    lifecycle_stage: "customer",
    merged_into_customer_id: null,
    erased_at: null,
    identities: [
      {
        id: "identity-collision",
        platform: "instagram",
        platform_user_id: "same-user",
        phone_number: null,
        verified_at: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "identity-moved",
        platform: "messenger",
        platform_user_id: "messenger-user",
        phone_number: "+21698111222",
        verified_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    tags: [{ tag: "priority", created_by_user_id: actorUserId }],
    notes: [{ id: "note-1" }],
  };

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(prismaMock),
      ),
      $queryRaw: jest.fn().mockResolvedValue([{ id: survivorId }, { id: duplicateId }]),
      customer: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...survivor,
            identities: survivor.identities.map((id) => ({ ...id })),
            tags: survivor.tags.map((t) => ({ ...t })),
          },
          {
            ...duplicate,
            identities: duplicate.identities.map((id) => ({ ...id })),
            tags: duplicate.tags.map((t) => ({ ...t })),
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      customerIdentity: {
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      customerTag: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      customerNote: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: "separator-note-1" }),
      },
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 2 },
          _max: { order_confirmed_at: new Date("2026-01-02T00:00:00.000Z") },
        }),
      },
      conversation: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    auditServiceMock = { record: jest.fn().mockResolvedValue({}) };
    controller = new MergeController(
      new MergeService(prismaMock, auditServiceMock as unknown as AuditService),
    );
  });

  it("requires customers.merge permission", () => {
    const handler = Reflect.get(MergeController.prototype, "merge") as object;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(["customers.merge"]);
  });

  it("atomically transfers orders, conversations, notes, and non-colliding identities while reconciling verified identity", async () => {
    const result = await controller.merge(
      businessId,
      user,
      survivorId,
      { sourceCustomerId: duplicateId },
      idempotencyKey,
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.customerIdentity.update).toHaveBeenCalledWith({
      where: { id: "identity-survivor" },
      data: { verified_at: new Date("2026-01-01T00:00:00.000Z") },
    });
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { business_id: businessId, customer_id: duplicateId },
      data: { customer_id: survivorId },
    });
    expect(prismaMock.order.aggregate).toHaveBeenCalledWith({
      where: {
        business_id: businessId,
        customer_id: survivorId,
        status: { in: ["CONFIRMED", "COMPLETED"] },
        is_test: false,
      },
      _count: { _all: true },
      _max: { order_confirmed_at: true },
    });
    expect(prismaMock.conversation.updateMany).toHaveBeenCalledWith({
      where: { business_id: businessId, customer_id: duplicateId },
      data: { customer_id: survivorId },
    });
    expect(prismaMock.customerIdentity.deleteMany).toHaveBeenCalledWith({
      where: {
        business_id: businessId,
        customer_id: duplicateId,
        id: { in: ["identity-collision"] },
      },
    });
    expect(prismaMock.customerIdentity.updateMany).toHaveBeenCalledWith({
      where: {
        business_id: businessId,
        customer_id: duplicateId,
        id: { in: ["identity-moved"] },
      },
      data: { customer_id: survivorId },
    });
    expect(result).toEqual({
      survivorId,
      duplicateId,
      ordersMoved: 3,
      conversationsMoved: 2,
      identitiesMoved: 1,
      fieldsMerged: ["phone", "address", "lifecycle_stage", "tags", "notes"],
    });
  });

  it("records before and after snapshots in the audit log inside the transaction", async () => {
    await controller.merge(
      businessId,
      user,
      survivorId,
      { sourceCustomerId: duplicateId },
      idempotencyKey,
    );

    expect(auditServiceMock.record).toHaveBeenCalledWith(
      {
        business_id: businessId,
        actor_user_id: actorUserId,
        action: "customer.merge",
        entity_type: "customer",
        entity_id: survivorId,
        payload: {
          before: {
            survivor: {
              id: survivor.id,
              name: survivor.name,
              phone: survivor.phone,
              email: survivor.email,
              address: survivor.address,
              language: survivor.language,
              lifecycle_stage: survivor.lifecycle_stage,
              tags: ["vip"],
            },
            duplicate: {
              id: duplicate.id,
              name: duplicate.name,
              phone: duplicate.phone,
              email: duplicate.email,
              address: duplicate.address,
              language: duplicate.language,
              lifecycle_stage: duplicate.lifecycle_stage,
              tags: ["priority"],
            },
          },
          after: {
            // Flat required spec fields inside after{}
            survivorId,
            duplicateId,
            ordersMoved: 3,
            conversationsMoved: 2,
            identitiesMoved: 1,
            fieldsMerged: ["phone", "address", "lifecycle_stage", "tags", "notes"],
            // Post-merge survivor state
            survivor: {
              id: survivor.id,
              name: "Survivor",
              phone: "+21698111222",
              email: "survivor@example.com",
              address: { city: "Tunis" },
              language: "fr",
              lifecycle_stage: "vip",
              tags: ["vip", "priority"],
            },
            collidingIdentitiesDiscarded: 1,
            discardedIdentityIds: ["identity-collision"],
            discardedIdentities: [
              {
                id: "identity-collision",
                platform: "instagram",
                platformUserId: "same-user",
                phoneNumber: null,
              },
            ],
          },
        },
      },
      prismaMock,
    );
  });

  it("preserves distinct platform identity on phone collision by nullifying phone and moving to survivor", async () => {
    const waSurvivor = {
      ...survivor,
      identities: [
        {
          id: "identity-wa",
          platform: "whatsapp",
          platform_user_id: "wa-111",
          phone_number: "+21698111222",
          verified_at: null,
        },
      ],
    };
    const tgDuplicate = {
      ...duplicate,
      identities: [
        {
          id: "identity-tg",
          platform: "telegram",
          platform_user_id: "tg-222",
          phone_number: "+21698111222",
          verified_at: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    };

    prismaMock.customer.findMany.mockResolvedValue([waSurvivor, tgDuplicate]);

    const result = await controller.merge(
      businessId,
      user,
      survivorId,
      { sourceCustomerId: duplicateId },
      "phone-collision-key",
    );

    expect(prismaMock.customerIdentity.update).toHaveBeenCalledWith({
      where: { id: "identity-wa" },
      data: { verified_at: new Date("2026-01-01T00:00:00.000Z") },
    });
    expect(prismaMock.customerIdentity.updateMany).toHaveBeenCalledWith({
      where: {
        business_id: businessId,
        customer_id: duplicateId,
        id: { in: ["identity-tg"] },
      },
      data: {
        customer_id: survivorId,
        phone_number: null,
      },
    });
    expect(prismaMock.customerIdentity.deleteMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["identity-tg"] } }),
      }),
    );
    expect(result.identitiesMoved).toBe(1);
  });

  it("accepts x-idempotency-key header", async () => {
    const result = await controller.merge(
      businessId,
      user,
      survivorId,
      { sourceCustomerId: duplicateId },
      undefined,
      "x-idem-key-1",
    );

    expect(result.survivorId).toBe(survivorId);
  });

  it("requires an Idempotency-Key header", async () => {
    await expect(
      controller.merge(
        businessId,
        user,
        survivorId,
        { sourceCustomerId: duplicateId },
        undefined,
        undefined,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects self-merge before opening a transaction", async () => {
    await expect(
      controller.merge(
        businessId,
        user,
        survivorId,
        { sourceCustomerId: survivorId },
        idempotencyKey,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 403 when either locked customer is outside the tenant", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: survivorId }]);

    await expect(
      controller.merge(
        businessId,
        user,
        survivorId,
        { sourceCustomerId: duplicateId },
        idempotencyKey,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an already merged duplicate and performs no consolidation writes", async () => {
    prismaMock.customer.findMany.mockResolvedValue([
      survivor,
      { ...duplicate, merged_into_customer_id: survivorId },
    ]);

    await expect(
      controller.merge(
        businessId,
        user,
        survivorId,
        { sourceCustomerId: duplicateId },
        idempotencyKey,
      ),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    expect(auditServiceMock.record).not.toHaveBeenCalled();
  });

  it("replays a completed idempotent response with tenant-scoped hash without running merge writes", async () => {
    const response = {
      survivorId,
      duplicateId,
      ordersMoved: 3,
      conversationsMoved: 2,
      identitiesMoved: 1,
      fieldsMerged: ["phone"],
    };

    const service = new MergeService(prismaMock, auditServiceMock as unknown as AuditService);
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ businessId, duplicateId, survivorId }))
      .digest("hex");

    prismaMock.idempotencyKey.findUnique.mockResolvedValue({
      request_hash: requestHash,
      response_body: response,
    });

    await expect(
      service.merge(
        businessId,
        actorUserId,
        survivorId,
        { sourceCustomerId: duplicateId },
        idempotencyKey,
      ),
    ).resolves.toEqual(response);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it("rejects malformed stored response body on idempotent replay", async () => {
    const service = new MergeService(prismaMock, auditServiceMock as unknown as AuditService);
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ businessId, duplicateId, survivorId }))
      .digest("hex");

    prismaMock.idempotencyKey.findUnique.mockResolvedValue({
      request_hash: requestHash,
      response_body: { corrupted: true },
    });

    await expect(
      service.merge(
        businessId,
        actorUserId,
        survivorId,
        { sourceCustomerId: duplicateId },
        idempotencyKey,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("preserves higher existing lifecycle stage monotonically without downgrade", async () => {
    const returningSurvivor = {
      ...survivor,
      tags: [],
      lifecycle_stage: "returning_customer",
    };
    const leadDuplicate = {
      ...duplicate,
      tags: [],
      lifecycle_stage: "qualified_lead",
    };

    prismaMock.customer.findMany.mockResolvedValue([returningSurvivor, leadDuplicate]);
    prismaMock.order.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _max: { order_confirmed_at: null },
    });

    await controller.merge(
      businessId,
      user,
      survivorId,
      { sourceCustomerId: duplicateId },
      idempotencyKey,
    );

    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: survivorId,
          business_id: businessId,
          erased_at: null,
          merged_into_customer_id: null,
        },
        data: expect.objectContaining({
          lifecycle_stage: "returning_customer",
        }),
      }),
    );
  });

  it("Post-Merge Sync (AC3): merging two customers with 1 order each promotes survivor to RETURNING_CUSTOMER", async () => {
    const singleOrderSurvivor = {
      ...survivor,
      tags: [],
      lifecycle_stage: "customer" as const,
    };
    const singleOrderDuplicate = {
      ...duplicate,
      tags: [],
      lifecycle_stage: "customer" as const,
    };

    prismaMock.customer.findMany.mockResolvedValue([singleOrderSurvivor, singleOrderDuplicate]);
    // After orders are moved, aggregate returns total of 2 confirmed orders
    prismaMock.order.aggregate.mockResolvedValue({
      _count: { _all: 2 },
      _max: { order_confirmed_at: new Date("2026-08-30T12:00:00Z") },
    });

    await controller.merge(
      businessId,
      user,
      survivorId,
      { sourceCustomerId: duplicateId },
      idempotencyKey,
    );

    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: survivorId,
          business_id: businessId,
          erased_at: null,
          merged_into_customer_id: null,
        },
        data: expect.objectContaining({
          lifecycle_stage: "returning_customer",
          confirmed_order_count: 2,
        }),
      }),
    );
  });

  it("propagates an audit failure so the transaction rolls back", async () => {
    auditServiceMock.record.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      controller.merge(
        businessId,
        user,
        survivorId,
        { sourceCustomerId: duplicateId },
        idempotencyKey,
      ),
    ).rejects.toThrow("audit unavailable");
    expect(prismaMock.idempotencyKey.update).not.toHaveBeenCalled();
  });

  it("reconciles verified_at to the earlier timestamp when duplicate was verified earlier", async () => {
    const survivorIdentity = {
      id: "identity-survivor-1",
      platform: "instagram",
      platform_user_id: "same-user",
      phone_number: null,
      verified_at: new Date("2026-06-01T00:00:00.000Z"),
    };
    const duplicateIdentity = {
      id: "identity-duplicate-1",
      platform: "instagram",
      platform_user_id: "same-user",
      phone_number: null,
      verified_at: new Date("2026-01-01T00:00:00.000Z"),
    };

    prismaMock.customer.findMany.mockResolvedValue([
      { ...survivor, identities: [survivorIdentity] },
      { ...duplicate, identities: [duplicateIdentity] },
    ]);

    await controller.merge(
      businessId,
      user,
      survivorId,
      { sourceCustomerId: duplicateId },
      "verify-reconcile-key-1",
    );

    expect(prismaMock.customerIdentity.update).toHaveBeenCalledWith({
      where: { id: "identity-survivor-1" },
      data: { verified_at: new Date("2026-01-01T00:00:00.000Z") },
    });
  });

  it("does not overwrite survivor verified_at if survivor has an earlier verification timestamp", async () => {
    const survivorIdentity = {
      id: "identity-survivor-1",
      platform: "instagram",
      platform_user_id: "same-user",
      phone_number: null,
      verified_at: new Date("2026-01-01T00:00:00.000Z"),
    };
    const duplicateIdentity = {
      id: "identity-duplicate-1",
      platform: "instagram",
      platform_user_id: "same-user",
      phone_number: null,
      verified_at: new Date("2026-06-01T00:00:00.000Z"),
    };

    prismaMock.customer.findMany.mockResolvedValue([
      { ...survivor, identities: [survivorIdentity] },
      { ...duplicate, identities: [duplicateIdentity] },
    ]);

    await controller.merge(
      businessId,
      user,
      survivorId,
      { sourceCustomerId: duplicateId },
      "verify-reconcile-key-2",
    );

    expect(prismaMock.customerIdentity.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "identity-survivor-1" },
      }),
    );
  });
});
