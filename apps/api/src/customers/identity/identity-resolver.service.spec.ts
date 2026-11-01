import { BadRequestException } from "@nestjs/common";
import { Prisma, type Customer, type PrismaClient } from "@prisma/client";

import { IdentityResolverService } from "./identity-resolver.service";

describe("IdentityResolverService", () => {
  const businessA = "11111111-1111-4111-a111-111111111111";
  const businessB = "22222222-2222-4222-a222-222222222222";
  const phone = "+21698111222";

  const makeCustomer = (
    id: string,
    businessId: string,
    overrides: Partial<Customer> = {},
  ): Customer => ({
    id,
    business_id: businessId,
    name: null,
    phone,
    email: null,
    address: null,
    language: null,
    preferences: null,
    lifecycle_stage: "unknown_visitor",
    confirmed_order_count: 0,
    last_confirmed_order_at: null,
    merged_into_customer_id: null,
    erased_at: null,
    is_test: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  function createPrismaMock() {
    const customers: Customer[] = [];
    const identities: {
      id: string;
      business_id: string;
      customer_id: string;
      platform: string;
      platform_user_id: string;
      phone_number: string | null;
      verified_at: Date | null;
    }[] = [];

    const tx = {
      customerIdentity: {
        findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
          const identity = identities.find((candidate) => {
            if (candidate.business_id !== where.business_id) return false;
            if (where.platform && candidate.platform !== where.platform) return false;
            if (where.platform_user_id && candidate.platform_user_id !== where.platform_user_id) {
              return false;
            }
            if (where.phone_number && candidate.phone_number !== where.phone_number) return false;
            if (where.verified_at && !candidate.verified_at) return false;
            return true;
          });
          if (!identity) return null;
          return {
            ...identity,
            customer: customers.find((customer) => customer.id === identity.customer_id),
          };
        }),
        create: jest.fn(({ data }: { data: Omit<(typeof identities)[number], "id"> }) => {
          const created = { id: `identity-${identities.length + 1}`, ...data };
          identities.push(created);
          return created;
        }),
        update: jest.fn(
          ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const existing = identities.find((i) => i.id === where.id);
            if (existing) {
              Object.assign(existing, data);
              return existing;
            }
            return null;
          },
        ),
      },
      customer: {
        findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
          customers.find((customer) => {
            if (customer.business_id !== where.business_id) return false;
            if (where.id && customer.id !== where.id) return false;
            if (where.phone && customer.phone !== where.phone) return false;
            if (where.erased_at === null && customer.erased_at !== null) return false;
            return true;
          }),
        ),
        create: jest.fn(({ data }: { data: { business_id: string; phone: string | null } }) => {
          const customer = makeCustomer(`customer-${customers.length + 1}`, data.business_id, {
            phone: data.phone,
          });
          customers.push(customer);
          return customer;
        }),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id_business_id: { id: string; business_id: string } };
            data: Record<string, unknown>;
          }) => {
            const existing = customers.find(
              (c) =>
                c.id === where.id_business_id.id &&
                c.business_id === where.id_business_id.business_id,
            );
            if (existing) {
              Object.assign(existing, data);
              return existing;
            }
            return null;
          },
        ),
      },
    };

    return {
      customers,
      identities,
      tx,
      prisma: {
        $transaction: jest.fn((callback: (client: typeof tx) => Promise<Customer>) => callback(tx)),
      } as unknown as PrismaClient,
    };
  }

  it("links Instagram and WhatsApp identities with different phone formatting to one customer", async () => {
    const mock = createPrismaMock();
    const resolver = new IdentityResolverService(mock.prisma);

    const instagram = await resolver.resolveCustomer(
      businessA,
      "instagram",
      "ig-user",
      " +216 98 111 222 ",
    );
    const whatsapp = await resolver.resolveCustomer(businessA, "whatsapp", "wa-user", "98111222");

    expect(whatsapp.id).toBe(instagram.id);
    expect(mock.customers).toHaveLength(1);
    expect(mock.identities).toHaveLength(2);
    expect(mock.identities.map((identity) => identity.customer_id)).toEqual([
      instagram.id,
      instagram.id,
    ]);
  });

  it("resolves a repeated platform identity without creating another link", async () => {
    const mock = createPrismaMock();
    const resolver = new IdentityResolverService(mock.prisma);

    const first = await resolver.resolveCustomer(businessA, "instagram", "ig-user", phone);
    const repeated = await resolver.resolveCustomer(businessA, "instagram", "ig-user", null);

    expect(repeated.id).toBe(first.id);
    expect(mock.identities).toHaveLength(1);
  });

  it("follows merged_into_customer_id pointer when identity points to a merged customer", async () => {
    const mock = createPrismaMock();
    const targetCustomer = makeCustomer("customer-target", businessA, { phone: "+21698111222" });
    const oldCustomer = makeCustomer("customer-old", businessA, {
      merged_into_customer_id: targetCustomer.id,
    });
    mock.customers.push(targetCustomer, oldCustomer);

    mock.identities.push({
      id: "identity-1",
      business_id: businessA,
      customer_id: oldCustomer.id,
      platform: "instagram",
      platform_user_id: "ig-user",
      phone_number: "+21698111222",
      verified_at: new Date(),
    });

    const resolver = new IdentityResolverService(mock.prisma);
    const resolved = await resolver.resolveCustomer(businessA, "instagram", "ig-user");

    expect(resolved.id).toBe(targetCustomer.id);
    expect(mock.identities[0]?.customer_id).toBe(targetCustomer.id);
  });

  it("handles concurrent P2002 race condition on identity creation gracefully", async () => {
    const mock = createPrismaMock();
    const resolver = new IdentityResolverService(mock.prisma);

    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (business_id,platform,platform_user_id)",
      { code: "P2002", clientVersion: "5.0.0" },
    );

    mock.tx.customerIdentity.create.mockImplementationOnce(() => {
      // Another worker just created the identity
      const existingCust = makeCustomer("customer-concurrent", businessA);
      mock.customers.push(existingCust);
      mock.identities.push({
        id: "id-concurrent",
        business_id: businessA,
        customer_id: existingCust.id,
        platform: "instagram",
        platform_user_id: "ig-concurrent",
        phone_number: "+21698111222",
        verified_at: new Date(),
      });
      throw p2002Error;
    });

    const resolved = await resolver.resolveCustomer(businessA, "instagram", "ig-concurrent", phone);
    expect(resolved.id).toBe("customer-concurrent");
  });

  it("throws BadRequestException on invalid channel type", async () => {
    const mock = createPrismaMock();
    const resolver = new IdentityResolverService(mock.prisma);

    await expect(
      resolver.resolveCustomer(businessA, "telegram" as any, "user-123"),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when cyclic merge pointers are detected", async () => {
    const mock = createPrismaMock();
    const cust1 = makeCustomer("cust-1", businessA, { merged_into_customer_id: "cust-2" });
    const cust2 = makeCustomer("cust-2", businessA, { merged_into_customer_id: "cust-1" });
    mock.customers.push(cust1, cust2);

    mock.identities.push({
      id: "identity-1",
      business_id: businessA,
      customer_id: cust1.id,
      platform: "instagram",
      platform_user_id: "ig-user",
      phone_number: "+21698111222",
      verified_at: new Date(),
    });

    const resolver = new IdentityResolverService(mock.prisma);
    await expect(resolver.resolveCustomer(businessA, "instagram", "ig-user")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("throws BadRequestException on invalid UUID businessId", async () => {
    const mock = createPrismaMock();
    const resolver = new IdentityResolverService(mock.prisma);

    await expect(resolver.resolveCustomer("not-a-uuid", "instagram", "ig-user")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("throws BadRequestException on empty or whitespace externalId", async () => {
    const mock = createPrismaMock();
    const resolver = new IdentityResolverService(mock.prisma);

    await expect(resolver.resolveCustomer(businessA, "instagram", "   ")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("throws BadRequestException on invalid phone format", async () => {
    const mock = createPrismaMock();
    const resolver = new IdentityResolverService(mock.prisma);

    await expect(
      resolver.resolveCustomer(businessA, "instagram", "ig-user", "invalid-phone"),
    ).rejects.toThrow(BadRequestException);
  });

  it("never links matching phone numbers across tenants", async () => {
    const mock = createPrismaMock();
    const resolver = new IdentityResolverService(mock.prisma);

    const tenantA = await resolver.resolveCustomer(businessA, "instagram", "ig-user", phone);
    const tenantB = await resolver.resolveCustomer(businessB, "whatsapp", "wa-user", phone);

    expect(tenantB.id).not.toBe(tenantA.id);
    expect(mock.customers).toHaveLength(2);
    expect(mock.tx.customerIdentity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ business_id: businessB }) }),
    );
  });

  it("does not auto-merge two unverified callers with the same phone", async () => {
    const mock = createPrismaMock();
    const resolver = new IdentityResolverService(mock.prisma);

    const ig1 = await resolver.resolveCustomer(businessA, "instagram", "ig-user-1", phone);
    const ig2 = await resolver.resolveCustomer(businessA, "instagram", "ig-user-2", phone);

    expect(ig1.id).not.toBe(ig2.id);
    expect(mock.customers).toHaveLength(2);
    expect(ig1.phone).toBeNull();
    expect(ig2.phone).toBeNull();
  });

  it("throws BadRequestException when encountering a broken merge pointer", async () => {
    const mock = createPrismaMock();
    const brokenCust = makeCustomer("cust-broken", businessA, {
      merged_into_customer_id: "non-existent-parent",
    });
    mock.customers.push(brokenCust);
    mock.identities.push({
      id: "id-1",
      business_id: businessA,
      customer_id: brokenCust.id,
      platform: "instagram",
      platform_user_id: "ig-user",
      phone_number: "+21698111222",
      verified_at: new Date(),
    });

    const resolver = new IdentityResolverService(mock.prisma);
    await expect(resolver.resolveCustomer(businessA, "instagram", "ig-user")).rejects.toThrow(
      BadRequestException,
    );
  });
});
