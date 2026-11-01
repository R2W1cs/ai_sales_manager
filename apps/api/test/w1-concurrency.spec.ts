import { ConflictException, ForbiddenException } from "@nestjs/common";

import { MembersService } from "../src/businesses/members/members.service";
import { BusinessesService } from "../src/businesses/workspace/businesses.service";
import { createMockPrisma, TEST_BETTER_AUTH_SECRET } from "./test-helpers";

describe("Wave 1 Concurrency & Idempotency Suite (W1-CONCURRENCY)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BETTER_AUTH_SECRET: TEST_BETTER_AUTH_SECRET,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("1. Idempotency Key Concurrency (T-BIZ-01/a)", () => {
    test("Multiple concurrent createBusiness calls with the same Idempotency-Key return identical response", async () => {
      const { prisma, state } = createMockPrisma();
      const service = new BusinessesService(prisma);

      const userId = "concurrent-user-1";
      state.users.push({
        id: userId,
        email: "concurrent@test.com",
        name: "Concurrent User",
        password_hash: "hash",
        email_verified_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const idempotencyKey = "idemp-key-concurrency-999";
      const payload = {
        name: "Parallel Workshop",
        currency: "TND",
        timezone: "Africa/Tunis",
      };

      // 1. First call initializes and caches response
      const firstRes = await service.createBusiness(userId, payload, idempotencyKey);
      expect(firstRes.business.id).toBeDefined();

      // 2. Parallel subsequent requests return cached response
      const parallelResults = await Promise.all([
        service.createBusiness(userId, payload, idempotencyKey),
        service.createBusiness(userId, payload, idempotencyKey),
        service.createBusiness(userId, payload, idempotencyKey),
      ]);

      for (const res of parallelResults) {
        expect(res.business.id).toBe(firstRes.business.id);
        expect(res.business.name).toBe("Parallel Workshop");
      }

      // Assert only 1 business created in DB state
      const businessesCreated = state.businesses.filter((b) => b.name === "Parallel Workshop");
      expect(businessesCreated.length).toBe(1);
    });

    test("Repeated call with same Idempotency-Key and different body throws 409 conflict", async () => {
      const { prisma, state } = createMockPrisma();
      const service = new BusinessesService(prisma);

      const userId = "conflict-user-2";
      state.users.push({
        id: userId,
        email: "conflict@test.com",
        name: "Conflict User",
        password_hash: "hash",
        email_verified_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const idempotencyKey = "idemp-conflict-key-111";

      // 1. First call
      await service.createBusiness(
        userId,
        { name: "Original Name", currency: "TND" },
        idempotencyKey,
      );

      // 2. Second call with DIFFERENT payload but SAME idempotency key -> 409
      await expect(
        service.createBusiness(userId, { name: "Tampered Name", currency: "EUR" }, idempotencyKey),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("2. Sole Owner Protection Under Race Conditions (T-BIZ-03/c)", () => {
    test("Concurrent removal/demotion requests on sole owner are safely rejected", async () => {
      const { prisma, state } = createMockPrisma();
      const membersService = new MembersService(prisma);

      const ownerId = "race-owner-id";
      const bizId = "race-biz-id";

      state.users.push({
        id: ownerId,
        email: "raceowner@test.com",
        name: "Race Owner",
        password_hash: "hash",
        email_verified_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      state.businesses.push({
        id: bizId,
        name: "Race Store",
        currency: "TND",
        timezone: "Africa/Tunis",
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      });

      state.businessMembers.push({
        id: "mem-race-owner",
        business_id: bizId,
        user_id: ownerId,
        role_id: "role-owner-id",
        removed_at: null,
        created_at: new Date(),
        role: { id: "role-owner-id", name: "owner" },
      });

      // Fire concurrent requests to remove and demote the sole owner
      const attempts = await Promise.allSettled([
        membersService.removeMember(bizId, ownerId),
        membersService.updateMemberRole(bizId, ownerId, { role: "admin" }),
        membersService.removeMember(bizId, ownerId),
      ]);

      for (const attempt of attempts) {
        expect(attempt.status).toBe("rejected");
        if (attempt.status === "rejected") {
          expect(attempt.reason).toBeInstanceOf(ForbiddenException);
        }
      }

      // Assert owner is still active in DB
      const ownerMember = state.businessMembers.find(
        (m) => m.business_id === bizId && m.user_id === ownerId && m.removed_at === null,
      );
      expect(ownerMember).toBeDefined();
    });
  });
});
