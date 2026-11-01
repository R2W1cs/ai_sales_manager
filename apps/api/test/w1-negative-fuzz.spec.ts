import { BadRequestException, ConflictException } from "@nestjs/common";

import { AuthService } from "../src/auth/core/auth.service";
import { BusinessesService } from "../src/businesses/workspace/businesses.service";
import { createMockPrisma, TEST_BETTER_AUTH_SECRET } from "./test-helpers";

describe("Wave 1 Negative, Boundary & Fuzz Testing Suite (W1-NEGATIVE-FUZZ)", () => {
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

  describe("1. Password Policy Boundaries (FR-AUTH-002 / 13 §4)", () => {
    test("Rejects password with 9 characters (below minimum 10)", async () => {
      const { prisma } = createMockPrisma();
      const authService = new AuthService(prisma);

      await expect(
        authService.register({
          email: "sub10@test.com",
          password: "123456789", // 9 chars
          name: "Sub 10 User",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    test("Accepts password with exactly 10 characters", async () => {
      const { prisma } = createMockPrisma();
      const authService = new AuthService(prisma);

      const res = await authService.register({
        email: "exact10@test.com",
        password: "1234567890", // 10 chars
        name: "Exact 10 User",
      });

      expect(res.session.user.email).toBe("exact10@test.com");
    });

    test("Accepts password with exactly 128 characters", async () => {
      const { prisma } = createMockPrisma();
      const authService = new AuthService(prisma);

      const maxPassword = "A".repeat(128);

      const res = await authService.register({
        email: "max128@test.com",
        password: maxPassword,
        name: "Max 128 User",
      });

      expect(res.session.user.email).toBe("max128@test.com");
    });

    test("Rejects password with 129 characters (above maximum 128)", async () => {
      const { prisma } = createMockPrisma();
      const authService = new AuthService(prisma);

      const overMaxPassword = "A".repeat(129);

      await expect(
        authService.register({
          email: "over128@test.com",
          password: overMaxPassword,
          name: "Over Max User",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    test("Supports UTF-8, symbols, and emoji in passwords", async () => {
      const { prisma } = createMockPrisma();
      const authService = new AuthService(prisma);

      const complexPassword = "MotDePasse🔒123!_Tunisie";

      const res = await authService.register({
        email: "unicode@test.com",
        password: complexPassword,
        name: "Unicode User",
      });

      expect(res.session.user.email).toBe("unicode@test.com");

      // Verify login succeeds with the exact same complex password
      const loginRes = await authService.login({
        email: "unicode@test.com",
        password: complexPassword,
      });

      expect(loginRes.session.user.id).toBe(res.session.user.id);
    });
  });

  describe("2. Email Canonicalization & Case Collision Resistance", () => {
    test("Rejects duplicate registration with different casing (case-insensitive collision)", async () => {
      const { prisma } = createMockPrisma();
      const authService = new AuthService(prisma);

      await authService.register({
        email: "merchant@domain.tn",
        password: "ValidPassword123!",
        name: "First User",
      });

      // Attempt second registration with uppercase email
      await expect(
        authService.register({
          email: "MERCHANT@DOMAIN.TN",
          password: "ValidPassword123!",
          name: "Second User",
        }),
      ).rejects.toThrow(ConflictException);
    });

    test("Authenticates successfully with mixed-case and uppercase email", async () => {
      const { prisma } = createMockPrisma();
      const authService = new AuthService(prisma);

      const regRes = await authService.register({
        email: "mixedcase@domain.tn",
        password: "ValidPassword123!",
        name: "Mixed User",
      });

      expect(regRes.session.user.email).toBe("mixedcase@domain.tn");

      const loginRes = await authService.login({
        email: "MIXEDCASE@DOMAIN.TN",
        password: "ValidPassword123!",
      });

      expect(loginRes.session.user.id).toBe(regRes.session.user.id);
    });
  });

  describe("3. Payload Fuzzing & SQL/XSS Injection Resistance", () => {
    test("Safely handles SQL Injection strings in registration fields", async () => {
      const { prisma, state } = createMockPrisma();
      const authService = new AuthService(prisma);

      const maliciousName = "'; DROP TABLE users; --";
      const sqlEmail = "sqli@test.com";

      const res = await authService.register({
        email: sqlEmail,
        password: "ValidPassword123!",
        name: maliciousName,
      });

      expect(res.session.user.name).toBe(maliciousName);
      const user = state.users.find((u) => u.email === sqlEmail);
      expect(user?.name).toBe(maliciousName);
    });

    test("Safely handles XSS payloads in business name", async () => {
      const { prisma } = createMockPrisma();
      const service = new BusinessesService(prisma);

      const xssPayload = "<script>alert('xss')</script>";

      const res = await service.createBusiness("user-xss-1", {
        name: xssPayload,
        currency: "TND",
      });

      expect(res.business.name).toBe(xssPayload);
    });

    test("Rejects empty and whitespace-only business names with 400 Bad Request", async () => {
      const { prisma } = createMockPrisma();
      const service = new BusinessesService(prisma);

      await expect(
        service.createBusiness("user-1", {
          name: "    ",
          currency: "TND",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
