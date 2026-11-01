import * as crypto from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { BusinessesController } from "./businesses.controller";
import { BusinessesService } from "./businesses.service";

describe("Business workspace creation (`POST /businesses`) + seed agent, ai_settings, rules, onboarding (T-BIZ-01)", () => {
  let controller: BusinessesController;
  let service: BusinessesService;
  let prismaMock: {
    $transaction: jest.Mock;
    role: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    business: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    businessMember: {
      create: jest.Mock;
    };
    aiAgent: {
      create: jest.Mock;
    };
    aiSettings: {
      create: jest.Mock;
    };
    businessRule: {
      createMany: jest.Mock;
    };
    businessOnboarding: {
      create: jest.Mock;
    };
    idempotencyKey: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    organization: {
      upsert: jest.Mock;
    };
    member: {
      upsert: jest.Mock;
    };
  };

  const AUTH_SECRET = "default-access-secret-min-32-chars-long";
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, BETTER_AUTH_SECRET: AUTH_SECRET };

    prismaMock = {
      $transaction: jest.fn(
        async (
          callback: ((tx: unknown) => Promise<unknown>) | Promise<unknown>[],
        ): Promise<unknown> => {
          if (typeof callback === "function") {
            return callback(prismaMock);
          }
          return Promise.all(callback);
        },
      ),
      role: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      business: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      businessMember: {
        create: jest.fn(),
      },
      aiAgent: {
        create: jest.fn(),
      },
      aiSettings: {
        create: jest.fn(),
      },
      businessRule: {
        createMany: jest.fn(),
      },
      businessOnboarding: {
        create: jest.fn(),
      },
      idempotencyKey: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      organization: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      member: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    service = new BusinessesService(prismaMock as unknown as PrismaClient);
    controller = new BusinessesController(service);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createValidAuthHeader = (userId = "11111111-1111-1111-1111-111111111111") => {
    const encHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    );
    const encPayload = Buffer.from(
      JSON.stringify({
        sub: userId,
        typ: "access",
        iss: "aisales",
        aud: "access",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ).toString("base64url");
    const signature = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(`${encHeader}.${encPayload}`)
      .digest("base64url");
    return `Bearer ${encHeader}.${encPayload}.${signature}`;
  };

  it("Happy Path (201): Creates business and seeds all 6 entities atomically.", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const businessId = "22222222-2222-2222-2222-222222222222";
    const roleId = "33333333-3333-3333-3333-333333333333";
    const agentId = "44444444-4444-4444-4444-444444444444";
    const createdAt = new Date("2026-08-19T00:00:00Z");

    prismaMock.idempotencyKey.findFirst.mockResolvedValue(null);
    prismaMock.role.findFirst.mockResolvedValue({ id: roleId, name: "owner" });
    prismaMock.business.create.mockResolvedValue({
      id: businessId,
      name: "Mon Atelier Mode",
      industry: "fashion",
      country: "TN",
      default_language: "fr",
      timezone: "Africa/Tunis",
      currency: "TND",
      settings: {},
      created_at: createdAt,
    });
    prismaMock.businessMember.create.mockResolvedValue({
      id: "mem-1",
      business_id: businessId,
      user_id: userId,
      role_id: roleId,
      joined_at: createdAt,
      role: { name: "owner" },
    });
    prismaMock.aiAgent.create.mockResolvedValue({
      id: agentId,
      business_id: businessId,
      name: "Sales Assistant",
      language: "fr",
      confidence_threshold: "0.65",
      enabled: true,
    });
    prismaMock.aiSettings.create.mockResolvedValue({});
    prismaMock.businessRule.createMany.mockResolvedValue({ count: 3 });
    prismaMock.businessOnboarding.create.mockResolvedValue({
      business_id: businessId,
      business_created: true,
      channel_connected: false,
      products_imported: false,
      ai_configured: false,
      playground_passed: false,
      approval_trial_passed: false,
      handoff_acknowledged: false,
      ai_activated: false,
    });
    prismaMock.idempotencyKey.create.mockResolvedValue({});

    const req = {
      headers: { authorization: createValidAuthHeader(userId) },
    } as any;

    const body = {
      name: "Mon Atelier Mode",
      currency: "TND",
      timezone: "Africa/Tunis",
    };

    const result = await controller.createBusiness(
      body,
      req,
      "55555555-5555-5555-5555-555555555555",
    );

    // Verify $transaction was called
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    // 1. Business created
    expect(prismaMock.business.create).toHaveBeenCalledWith({
      data: {
        name: "Mon Atelier Mode",
        industry: "fashion",
        country: "TN",
        default_language: "fr",
        timezone: "Africa/Tunis",
        currency: "TND",
        settings: {},
      },
    });

    // 2. Member assigned as OWNER
    expect(prismaMock.businessMember.create).toHaveBeenCalledWith({
      data: {
        business_id: businessId,
        user_id: userId,
        role_id: roleId,
        joined_at: expect.any(Date),
      },
      include: { role: true },
    });

    // 3. AI Agent seeded
    expect(prismaMock.aiAgent.create).toHaveBeenCalledWith({
      data: {
        business_id: businessId,
        name: "Sales Assistant",
        language: "fr",
        confidence_threshold: 0.65,
        enabled: true,
      },
    });

    // 4. AI Settings seeded with approval_required
    expect(prismaMock.aiSettings.create).toHaveBeenCalledWith({
      data: {
        business_id: businessId,
        model_primary: "gemini-3.5-flash",
        model_fallback: "gpt-5.6-terra",
        max_tokens: 400,
        temperature: 0.4,
        rag_top_k: 5,
        include_product_images_in_context: false,
        blocked_topics: [],
        reply_mode: "approval_required",
        lead_hot_min: 80,
        lead_warm_min: 50,
        reservation_ttl_minutes: 30,
        inactivity_close_days: 30,
      },
    });

    // 5. Starter rules seeded (delivery, payment, returns)
    expect(prismaMock.businessRule.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          business_id: businessId,
          rule_type: "delivery",
          enabled: true,
        }),
        expect.objectContaining({
          business_id: businessId,
          rule_type: "payment",
          enabled: true,
        }),
        expect.objectContaining({
          business_id: businessId,
          rule_type: "returns",
          enabled: true,
        }),
      ]),
    });

    // 6. Onboarding tracker seeded
    expect(prismaMock.businessOnboarding.create).toHaveBeenCalledWith({
      data: {
        business_id: businessId,
        business_created: true,
        channel_connected: false,
        products_imported: false,
        ai_configured: false,
        playground_passed: false,
        approval_trial_passed: false,
        handoff_acknowledged: false,
        ai_activated: false,
      },
    });

    // Result structure verification
    expect(result).toEqual({
      business: {
        id: businessId,
        name: "Mon Atelier Mode",
        industry: "fashion",
        country: "TN",
        defaultLanguage: "fr",
        timezone: "Africa/Tunis",
        currency: "TND",
        createdAt,
      },
      membership: {
        businessId,
        role: "owner",
        joinedAt: createdAt,
      },
      aiAgent: {
        id: agentId,
        name: "Sales Assistant",
        language: "fr",
        confidenceThreshold: 0.65,
        enabled: true,
      },
      onboarding: {
        businessCreated: true,
        channelConnected: false,
        productsImported: false,
        aiConfigured: false,
        playgroundPassed: false,
        approvalTrialPassed: false,
        handoffAcknowledged: false,
        aiActivated: false,
      },
    });
  });

  it("Idempotency Key: Repeated call with same idempotency key returns cached response without duplicate creation.", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const idempotencyKey = "key-uuid-123";
    const body = { name: "Store A" };

    const cachedResponse = {
      business: { id: "biz-1", name: "Store A" },
      membership: { businessId: "biz-1", role: "owner" },
      aiAgent: { id: "agent-1", name: "Sales Assistant" },
      onboarding: { businessCreated: true },
    };

    const requestHash = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");

    prismaMock.idempotencyKey.findFirst.mockResolvedValue({
      key: idempotencyKey,
      request_hash: requestHash,
      response_status: 201,
      response_body: cachedResponse,
    });

    const req = {
      headers: { authorization: createValidAuthHeader(userId) },
    } as any;

    const result = await controller.createBusiness(body, req, idempotencyKey);

    expect(result).toEqual(cachedResponse);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.business.create).not.toHaveBeenCalled();
  });

  it("Idempotency Key Conflict: Repeated call with same idempotency key and different body throws 409 conflict.", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const idempotencyKey = "key-uuid-123";

    prismaMock.idempotencyKey.findFirst.mockResolvedValue({
      key: idempotencyKey,
      request_hash: "different-hash",
      response_status: 201,
      response_body: {},
    });

    const req = {
      headers: { authorization: createValidAuthHeader(userId) },
    } as any;

    await expect(
      controller.createBusiness({ name: "Store B" }, req, idempotencyKey),
    ).rejects.toThrow(ConflictException);
  });

  it("Owner Role: Authenticated caller is granted OWNER role.", async () => {
    const userId = "user-abc-123";
    const roleId = "role-owner-id";
    const businessId = "biz-xyz";

    prismaMock.idempotencyKey.findFirst.mockResolvedValue(null);
    prismaMock.role.findFirst.mockResolvedValue({ id: roleId, name: "owner" });
    prismaMock.business.create.mockResolvedValue({
      id: businessId,
      name: "Boutique",
      industry: "fashion",
      country: "TN",
      default_language: "fr",
      timezone: "Africa/Tunis",
      currency: "TND",
      settings: {},
      created_at: new Date(),
    });
    prismaMock.businessMember.create.mockResolvedValue({
      id: "mem-id",
      business_id: businessId,
      user_id: userId,
      role_id: roleId,
      joined_at: new Date(),
      role: { name: "owner" },
    });
    prismaMock.aiAgent.create.mockResolvedValue({
      id: "agent-id",
      business_id: businessId,
      name: "Sales Assistant",
      language: "fr",
      confidence_threshold: "0.65",
      enabled: true,
    });
    prismaMock.aiSettings.create.mockResolvedValue({});
    prismaMock.businessRule.createMany.mockResolvedValue({ count: 3 });
    prismaMock.businessOnboarding.create.mockResolvedValue({
      business_id: businessId,
      business_created: true,
    });

    const req = {
      headers: { authorization: createValidAuthHeader(userId) },
    } as any;

    const result = await controller.createBusiness(
      { name: "Boutique" },
      req,
      "idempotency-key-test-1",
    );

    expect(result.membership.role).toBe("owner");
    expect(result.membership.businessId).toBe(businessId);
  });

  it("Idempotency-Key Required (400): Missing Idempotency-Key header returns 400 validation_error", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const req = {
      headers: { authorization: createValidAuthHeader(userId) },
    } as any;

    await expect(controller.createBusiness({ name: "Store" }, req, undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("Transaction Rollback: Any database error during seeding rolls back the entire business creation.", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";

    prismaMock.idempotencyKey.findFirst.mockResolvedValue(null);
    prismaMock.role.findFirst.mockResolvedValue({ id: "r1", name: "owner" });
    prismaMock.business.create.mockResolvedValue({
      id: "biz-1",
      name: "Store",
      industry: "fashion",
      country: "TN",
      default_language: "fr",
      timezone: "Africa/Tunis",
      currency: "TND",
      settings: {},
      created_at: new Date(),
    });
    // Simulate failure during member or agent insertion
    prismaMock.businessMember.create.mockRejectedValue(
      new Error("Foreign key constraint violation"),
    );

    const req = {
      headers: { authorization: createValidAuthHeader(userId) },
    } as any;

    await expect(
      controller.createBusiness({ name: "Store" }, req, "idempotency-key-test-2"),
    ).rejects.toThrow("Foreign key constraint violation");
  });

  it("Auth: Missing Authorization header throws 401 Unauthorized", async () => {
    const req = { headers: {} } as any;

    await expect(
      controller.createBusiness({ name: "Store" }, req, "idempotency-key-test-3"),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("Auth: Invalid access token throws 401 Unauthorized", async () => {
    const req = {
      headers: {
        authorization: "Bearer invalid-tampered-token",
      },
    } as any;

    await expect(
      controller.createBusiness({ name: "Store" }, req, "idempotency-key-test-4"),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("Validation: Missing business name throws 400 Bad Request", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const req = {
      headers: { authorization: createValidAuthHeader(userId) },
    } as any;

    await expect(
      controller.createBusiness({ name: "" } as any, req, "idempotency-key-test-5"),
    ).rejects.toThrow(BadRequestException);
  });
});

describe("Business profile management API (`GET/PATCH /businesses/:id`) (T-BIZ-02)", () => {
  let controller: BusinessesController;
  let service: BusinessesService;
  let prismaMock: {
    business: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  const businessId = "11111111-1111-1111-1111-111111111111";
  const otherBusinessId = "22222222-2222-2222-2222-222222222222";
  const createdAt = new Date("2026-08-19T00:00:00Z");
  const updatedAt = new Date("2026-08-19T01:00:00Z");

  beforeEach(() => {
    prismaMock = {
      business: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new BusinessesService(prismaMock as unknown as PrismaClient);
    controller = new BusinessesController(service);
  });

  describe("GET /businesses/:id", () => {
    it("Profile Retrieval (200): Returns business profile details.", async () => {
      prismaMock.business.findFirst.mockResolvedValue({
        id: businessId,
        name: "Mon Atelier Mode",
        industry: "fashion",
        country: "TN",
        default_language: "fr",
        timezone: "Africa/Tunis",
        currency: "TND",
        settings: {},
        created_at: createdAt,
        updated_at: updatedAt,
      });

      const result = await controller.getBusiness(businessId, businessId);

      expect(prismaMock.business.findFirst).toHaveBeenCalledWith({
        where: {
          id: businessId,
          deleted_at: null,
        },
      });
      expect(result).toEqual({
        id: businessId,
        name: "Mon Atelier Mode",
        industry: "fashion",
        country: "TN",
        defaultLanguage: "fr",
        timezone: "Africa/Tunis",
        currency: "TND",
        createdAt,
        updatedAt,
      });
    });

    it("Cross-Tenant Block: Accessing other business ID returns 403 Forbidden.", async () => {
      await expect(controller.getBusiness(businessId, otherBusinessId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prismaMock.business.findFirst).not.toHaveBeenCalled();
    });

    it("Not Found (404): Non-existent or deleted business returns 404.", async () => {
      prismaMock.business.findFirst.mockResolvedValue(null);

      await expect(controller.getBusiness(businessId, businessId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("PATCH /businesses/:id", () => {
    it("Profile Update (200): Authorized role updates name, timezone, currency, and language.", async () => {
      prismaMock.business.findFirst.mockResolvedValue({
        id: businessId,
        name: "Old Name",
        industry: "fashion",
        country: "TN",
        default_language: "fr",
        timezone: "Africa/Tunis",
        currency: "TND",
        created_at: createdAt,
        updated_at: createdAt,
      });

      prismaMock.business.update.mockResolvedValue({
        id: businessId,
        name: "New Store Name",
        industry: "electronics",
        country: "TN",
        default_language: "ar",
        timezone: "Asia/Dubai",
        currency: "AED",
        created_at: createdAt,
        updated_at: updatedAt,
      });

      const updatePayload = {
        name: "New Store Name",
        industry: "electronics",
        defaultLanguage: "ar" as const,
        timezone: "Asia/Dubai",
        currency: "AED",
      };

      const result = await controller.updateBusiness(businessId, businessId, updatePayload);

      expect(prismaMock.business.update).toHaveBeenCalledWith({
        where: { id: businessId },
        data: {
          name: "New Store Name",
          industry: "electronics",
          default_language: "ar",
          timezone: "Asia/Dubai",
          currency: "AED",
        },
      });

      expect(result).toEqual({
        id: businessId,
        name: "New Store Name",
        industry: "electronics",
        country: "TN",
        defaultLanguage: "ar",
        timezone: "Asia/Dubai",
        currency: "AED",
        createdAt,
        updatedAt,
      });
    });

    it("Cross-Tenant Block: Accessing other business ID returns 403 Forbidden.", async () => {
      await expect(
        controller.updateBusiness(businessId, otherBusinessId, { name: "Hacked Name" }),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.business.update).not.toHaveBeenCalled();
    });

    it("Negative Invariant: Reject unknown keys or modifying onboarding status flags.", async () => {
      await expect(
        controller.updateBusiness(businessId, businessId, {
          name: "Valid Name",
          aiActivated: true,
        } as any),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.updateBusiness(businessId, businessId, {
          name: "Valid Name",
          onboarding: { businessCreated: true },
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.business.update).not.toHaveBeenCalled();
    });

    it("Not Found (404): Updating non-existent business returns 404.", async () => {
      prismaMock.business.findFirst.mockResolvedValue(null);

      await expect(
        controller.updateBusiness(businessId, businessId, { name: "New Name" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("RBAC Rigor: PATCH /businesses/:id is guarded by @RequirePermission('business.write')", () => {
      /* oxlint-disable typescript/unbound-method */
      const permissions = Reflect.getMetadata(
        "permissions",
        BusinessesController.prototype.updateBusiness,
      );
      /* oxlint-enable typescript/unbound-method */
      expect(permissions).toEqual(["business.write"]);
    });
  });
});
