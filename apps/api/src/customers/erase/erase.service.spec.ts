import { NotFoundException } from "@nestjs/common";

import { EraseService } from "./erase.service";

describe("EraseService (17 §8.3)", () => {
  const businessId = "11111111-1111-4111-8111-111111111111";
  const actorId = "22222222-2222-4222-8222-222222222222";
  const customerId = "33333333-3333-4333-8333-333333333333";

  function buildPrisma(overrides: Record<string, unknown> = {}) {
    const tx = {
      customer: {
        update: jest.fn().mockResolvedValue({}),
      },
      customerIdentity: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      customerNote: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      customerTag: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      message: {
        findMany: jest.fn().mockResolvedValue([{ id: "msg-1" }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      conversationNote: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      messageAttachment: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "ord-1",
            customer_snapshot: { name: "Ali", phone: "+21698111222" },
            delivery_address: { city: "Tunis" },
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    return {
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: customerId, erased_at: null }),
      },
      conversation: {
        findMany: jest.fn().mockResolvedValue([{ id: "conv-1" }]),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([{ id: "msg-1" }]),
      },
      messageAttachment: {
        findMany: jest.fn().mockResolvedValue([{ id: "att-1", s3_key: "biz/att-1" }]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
      __tx: tx,
      ...overrides,
    };
  }

  it("anonymizes customer and redacts messages on erase", async () => {
    const prisma = buildPrisma();
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new EraseService(prisma as never, audit as never);

    await service.eraseCustomer(businessId, actorId, customerId);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.__tx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Deleted customer",
          phone: null,
          email: null,
        }),
      }),
    );
    expect(prisma.__tx.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { content: "[redacted]" } }),
    );
    expect(prisma.__tx.customerIdentity.deleteMany).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "customer.erase", entity_id: customerId }),
      expect.anything(),
    );
  });

  it("is idempotent when erased_at is already set", async () => {
    const prisma = buildPrisma({
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: customerId, erased_at: new Date() }),
      },
    });
    const service = new EraseService(prisma as never);
    await service.eraseCustomer(businessId, actorId, customerId);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("throws NotFound when customer is missing", async () => {
    const prisma = buildPrisma({
      customer: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = new EraseService(prisma as never);
    await expect(service.eraseCustomer(businessId, actorId, customerId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
