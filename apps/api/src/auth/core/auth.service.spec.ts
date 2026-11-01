import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

import { env } from "@app/shared/server";

import { AuthService, hashToken, signJwt, verifyJwt } from "./auth.service";

const testAccessSecret = env.BETTER_AUTH_SECRET;
const testRefreshSecret = env.BETTER_AUTH_SECRET;

describe("AuthService", () => {
  let service: AuthService;
  let prismaMock: {
    $transaction: jest.Mock;
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    session: {
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(() => {
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
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      session: {
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    service = new AuthService(prismaMock as unknown as PrismaClient);
  });

  describe("register", () => {
    it("successfully registers user and creates Argon2 hash + tokens", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockImplementation((args: any) => ({
        id: "11111111-1111-1111-1111-111111111111",
        email: args.data.email,
        name: args.data.name,
        password_hash: args.data.password_hash,
        email_verified_at: null,
        created_at: new Date(),
      }));
      prismaMock.refreshToken.create.mockResolvedValue({});

      const result = await service.register({
        email: "Test@Example.com",
        password: "password123",
        name: "Test User",
      });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
      });

      expect(prismaMock.user.create).toHaveBeenCalled();
      const createCall = prismaMock.user.create.mock.calls[0][0];
      expect(createCall.data.email).toBe("test@example.com");
      expect(createCall.data.name).toBe("Test User");

      // Verify Argon2 hash
      const isArgon2Valid = await argon2.verify(createCall.data.password_hash, "password123");
      expect(isArgon2Valid).toBe(true);

      // Verify session response
      expect(result.session.user.email).toBe("test@example.com");
      expect(result.session.user.name).toBe("Test User");
      expect(result.session.memberships).toEqual([]);
      expect(result.session.tokenType).toBe("Bearer");
      expect(result.session.expiresIn).toBe(900);
      expect(typeof result.session.accessToken).toBe("string");

      // Verify access token claims
      const accessPayload = verifyJwt(result.session.accessToken ?? "", testAccessSecret);
      expect(accessPayload.sub).toBe("11111111-1111-1111-1111-111111111111");
      expect(accessPayload.typ).toBe("access");
      expect(accessPayload.iss).toBe("aisales");
      expect(accessPayload.aud).toBe("access");

      // Verify refresh token
      expect(typeof result.refreshToken).toBe("string");
      const refreshPayload = verifyJwt(result.refreshToken, testRefreshSecret);
      expect(refreshPayload.sub).toBe("11111111-1111-1111-1111-111111111111");
      expect(refreshPayload.typ).toBe("refresh");
      expect(refreshPayload.iss).toBe("aisales");
      expect(refreshPayload.aud).toBe("refresh");
      expect(refreshPayload.fam).toBeDefined();

      // Verify refresh token DB row created
      expect(prismaMock.refreshToken.create).toHaveBeenCalled();
      const rfCall = prismaMock.refreshToken.create.mock.calls[0][0];
      expect(rfCall.data.user_id).toBe("11111111-1111-1111-1111-111111111111");
      expect(rfCall.data.family_id).toBe(refreshPayload.fam);
    });

    it("rejects duplicate email with 409 conflict", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: "existing-id",
        email: "test@example.com",
      });

      await expect(
        service.register({
          email: "test@example.com",
          password: "password123",
          name: "Test User",
        }),
      ).rejects.toThrow(ConflictException);

      try {
        await service.register({
          email: "test@example.com",
          password: "password123",
          name: "Test User",
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(409);
        expect(err.getResponse()).toEqual({
          error: {
            code: "conflict",
            message: "User with this email already exists",
          },
        });
      }
    });

    it("handles concurrent register race condition (Prisma P2002) with 409 conflict", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockRejectedValue({ code: "P2002" });

      await expect(
        service.register({
          email: "test@example.com",
          password: "password123",
          name: "Test User",
        }),
      ).rejects.toThrow(ConflictException);

      try {
        await service.register({
          email: "test@example.com",
          password: "password123",
          name: "Test User",
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(409);
        expect(err.getResponse()).toEqual({
          error: {
            code: "conflict",
            message: "User with this email already exists",
          },
        });
      }
    });

    it("rolls back atomically if refresh token creation fails during registration", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: "11111111-1111-1111-1111-111111111111",
        email: "test@example.com",
        name: "Test User",
        password_hash: "hash",
        email_verified_at: null,
        created_at: new Date(),
      });
      prismaMock.refreshToken.create.mockRejectedValue(new Error("DB Connection Error"));

      await expect(
        service.register({
          email: "test@example.com",
          password: "password123",
          name: "Test User",
        }),
      ).rejects.toThrow("DB Connection Error");

      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it("rejects whitespace-only name with 400 validation_error", async () => {
      await expect(
        service.register({
          email: "test@example.com",
          password: "password123",
          name: "   ",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects password shorter than 10 characters with 400 validation_error", async () => {
      await expect(
        service.register({
          email: "test@example.com",
          password: "short",
          name: "Test User",
        }),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.register({
          email: "test@example.com",
          password: "short",
          name: "Test User",
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        const res = err.getResponse();
        expect(res.error.code).toBe("validation_error");
        expect(res.error.message).toContain("10");
      }
    });

    it("rejects invalid email address with 400 validation_error", async () => {
      await expect(
        service.register({
          email: "not-an-email",
          password: "password123",
          name: "Test User",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("login", () => {
    it("successfully logs in with valid credentials and Argon2 verification", async () => {
      const passwordHash = await argon2.hash("validPassword123", { type: argon2.argon2id });
      prismaMock.user.findUnique.mockResolvedValue({
        id: "user-uuid-1",
        email: "test@example.com",
        name: "Test User",
        password_hash: passwordHash,
        email_verified_at: new Date(),
        created_at: new Date(),
        memberships: [
          {
            business_id: "biz-uuid-1",
            joined_at: new Date(),
            last_active_at: new Date(),
            role: { name: "owner" },
          },
        ],
      });
      prismaMock.user.update.mockResolvedValue({});
      prismaMock.refreshToken.create.mockResolvedValue({});

      const result = await service.login({
        email: "test@example.com",
        password: "validPassword123",
      });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user-uuid-1" },
        data: { last_login_at: expect.any(Date) },
      });

      expect(result.session.user.id).toBe("user-uuid-1");
      expect(result.session.memberships).toHaveLength(1);
      expect(result.session.memberships[0]?.role).toBe("owner");
      expect(result.session.memberships[0]?.businessId).toBe("biz-uuid-1");
      expect(typeof result.session.accessToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");
    });

    it("rejects unbounded password (> 128 chars) with 400 validation_error", async () => {
      await expect(
        service.login({
          email: "test@example.com",
          password: "a".repeat(129),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects unknown email with 401 unauthorized and uniform error copy", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      try {
        await service.login({
          email: "unknown@example.com",
          password: "somePassword123",
        });
        fail("Should have thrown UnauthorizedException");
      } catch (err: any) {
        expect(err.getStatus()).toBe(401);
        expect(err.getResponse()).toEqual({
          error: {
            code: "unauthorized",
            message: "Invalid email or password",
          },
        });
      }
    });

    it("rejects wrong password with 401 unauthorized and the EXACT same error body as unknown user", async () => {
      const passwordHash = await argon2.hash("correctPassword123", { type: argon2.argon2id });
      prismaMock.user.findUnique.mockResolvedValue({
        id: "user-uuid-1",
        email: "test@example.com",
        name: "Test User",
        password_hash: passwordHash,
        email_verified_at: null,
        created_at: new Date(),
        memberships: [],
      });

      let unknownEmailResponse: unknown = undefined;
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      try {
        await service.login({ email: "unknown@example.com", password: "wrongPassword" });
      } catch (err: any) {
        unknownEmailResponse = err.getResponse();
      }

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: "user-uuid-1",
        email: "test@example.com",
        name: "Test User",
        password_hash: passwordHash,
        email_verified_at: null,
        created_at: new Date(),
        memberships: [],
      });

      let wrongPasswordResponse: unknown = undefined;
      try {
        await service.login({ email: "test@example.com", password: "wrongPassword" });
      } catch (err: any) {
        wrongPasswordResponse = err.getResponse();
      }

      expect(wrongPasswordResponse).toBeDefined();
      expect(unknownEmailResponse).toBeDefined();
      if (wrongPasswordResponse && unknownEmailResponse) {
        expect(wrongPasswordResponse).toEqual(unknownEmailResponse);
      }
      expect(wrongPasswordResponse).toEqual({
        error: {
          code: "unauthorized",
          message: "Invalid email or password",
        },
      });
    });

    it("handles invalid/malformed stored hash gracefully with 401 unauthorized", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: "user-uuid-1",
        email: "test@example.com",
        name: "Test User",
        password_hash: "$invalid_argon2_hash$corrupt",
        email_verified_at: null,
        created_at: new Date(),
        memberships: [],
      });

      let thrownError: any;
      try {
        await service.login({
          email: "test@example.com",
          password: "anyPassword123",
        });
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(UnauthorizedException);
      expect(thrownError.getStatus()).toBe(401);
      expect(thrownError.getResponse()).toEqual({
        error: {
          code: "unauthorized",
          message: "Invalid email or password",
        },
      });
    });
  });

  describe("refresh", () => {
    it("successfully rotates refresh token and returns new session and refresh token", async () => {
      const familyId = "fam-uuid-1";
      const oldTokenId = "old-token-uuid-1";
      const userId = "user-uuid-1";

      const validRefreshJwt = signJwt(
        { sub: userId, typ: "refresh", fam: familyId, jti: oldTokenId },
        testRefreshSecret,
        { expiresInSeconds: 14 * 24 * 60 * 60, issuer: "aisales", audience: "refresh" },
      );

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: oldTokenId,
        user_id: userId,
        token_hash: hashToken(validRefreshJwt),
        family_id: familyId,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revoked_at: null,
      });

      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.refreshToken.create.mockResolvedValue({});
      prismaMock.user.findUnique.mockResolvedValue({
        id: userId,
        email: "test@example.com",
        name: "Test User",
        email_verified_at: null,
        created_at: new Date(),
        memberships: [
          {
            business_id: "biz-uuid-1",
            joined_at: new Date(),
            last_active_at: null,
            role: { name: "admin" },
          },
        ],
      });

      const result = await service.refresh(validRefreshJwt, {
        ip: "127.0.0.1",
        userAgent: "jest-agent",
      });

      expect(prismaMock.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token_hash: hashToken(validRefreshJwt) },
      });

      // Old token atomically revoked
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: oldTokenId, revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      });

      // New token created in same family
      expect(prismaMock.refreshToken.create).toHaveBeenCalled();
      const createCall = prismaMock.refreshToken.create.mock.calls[0][0];
      expect(createCall.data.user_id).toBe(userId);
      expect(createCall.data.family_id).toBe(familyId);
      expect(createCall.data.ip).toBe("127.0.0.1");
      expect(createCall.data.user_agent).toBe("jest-agent");

      // Verify returned session
      expect(result.session.user.id).toBe(userId);
      expect(result.session.memberships).toHaveLength(1);
      expect(result.session.memberships[0]?.role).toBe("admin");
      expect(typeof result.session.accessToken).toBe("string");

      // Verify access token claims
      const accessPayload = verifyJwt(result.session.accessToken ?? "", testAccessSecret);
      expect(accessPayload.sub).toBe(userId);
      expect(accessPayload.typ).toBe("access");

      // Verify new refresh token claims
      const newRefreshPayload = verifyJwt(result.refreshToken, testRefreshSecret);
      expect(newRefreshPayload.sub).toBe(userId);
      expect(newRefreshPayload.typ).toBe("refresh");
      expect(newRefreshPayload.fam).toBe(familyId);
      expect(newRefreshPayload.jti).not.toBe(oldTokenId);
    });

    it("throws 401 unauthorized when refresh token is undefined or empty", async () => {
      await expect(service.refresh(undefined)).rejects.toThrow(UnauthorizedException);
      await expect(service.refresh("")).rejects.toThrow(UnauthorizedException);
    });

    it("throws 401 unauthorized when refresh token has invalid JWT structure or signature", async () => {
      await expect(service.refresh("invalid.jwt.token")).rejects.toThrow(UnauthorizedException);

      const fakeSecretJwt = signJwt(
        { sub: "u1", typ: "refresh", fam: "f1", jti: "j1" },
        "wrong-secret-that-does-not-match",
        { expiresInSeconds: 3600, issuer: "aisales", audience: "refresh" },
      );
      await expect(service.refresh(fakeSecretJwt)).rejects.toThrow(UnauthorizedException);
    });

    it("throws 401 unauthorized when token typ is not 'refresh'", async () => {
      const accessJwt = signJwt({ sub: "u1", typ: "access" }, testRefreshSecret, {
        expiresInSeconds: 3600,
        issuer: "aisales",
        audience: "refresh",
      });
      await expect(service.refresh(accessJwt)).rejects.toThrow(UnauthorizedException);
    });

    it("throws 401 unauthorized when refresh token is not found in database", async () => {
      const validRefreshJwt = signJwt(
        { sub: "u1", typ: "refresh", fam: "f1", jti: "j1" },
        testRefreshSecret,
        { expiresInSeconds: 3600, issuer: "aisales", audience: "refresh" },
      );

      prismaMock.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh(validRefreshJwt)).rejects.toThrow(UnauthorizedException);
    });

    it("throws 401 unauthorized when refresh token row is expired in database", async () => {
      const validRefreshJwt = signJwt(
        { sub: "u1", typ: "refresh", fam: "f1", jti: "j1" },
        testRefreshSecret,
        { expiresInSeconds: 3600, issuer: "aisales", audience: "refresh" },
      );

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: "j1",
        user_id: "u1",
        token_hash: hashToken(validRefreshJwt),
        family_id: "f1",
        expires_at: new Date(Date.now() - 1000), // expired
        revoked_at: null,
      });

      await expect(service.refresh(validRefreshJwt)).rejects.toThrow(UnauthorizedException);
    });

    it("detects reuse of revoked token, revokes entire family, and throws 401 unauthorized (17 §3.4)", async () => {
      const familyId = "compromised-family-123";
      const validRefreshJwt = signJwt(
        { sub: "u1", typ: "refresh", fam: familyId, jti: "j1" },
        testRefreshSecret,
        { expiresInSeconds: 3600, issuer: "aisales", audience: "refresh" },
      );

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: "j1",
        user_id: "u1",
        token_hash: hashToken(validRefreshJwt),
        family_id: familyId,
        expires_at: new Date(Date.now() + 3600 * 1000),
        revoked_at: new Date(Date.now() - 60000), // Already revoked!
      });

      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await expect(service.refresh(validRefreshJwt)).rejects.toThrow(UnauthorizedException);

      // Entire family is revoked
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          family_id: familyId,
          revoked_at: null,
        },
        data: {
          revoked_at: expect.any(Date),
        },
      });
    });

    it("throws 401 unauthorized and revokes entire family if token was revoked concurrently in transaction", async () => {
      const familyId = "race-family-123";
      const tokenId = "race-token-123";
      const validRefreshJwt = signJwt(
        { sub: "u1", typ: "refresh", fam: familyId, jti: tokenId },
        testRefreshSecret,
        { expiresInSeconds: 3600, issuer: "aisales", audience: "refresh" },
      );

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: tokenId,
        user_id: "u1",
        token_hash: hashToken(validRefreshJwt),
        family_id: familyId,
        expires_at: new Date(Date.now() + 3600 * 1000),
        revoked_at: null, // Appeared unrevoked during initial find
      });

      // Atomic update inside transaction fails because another request revoked it first (count: 0)
      prismaMock.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      await expect(service.refresh(validRefreshJwt)).rejects.toThrow(UnauthorizedException);

      // Verify it tried to atomically revoke the single token first
      expect(prismaMock.refreshToken.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: tokenId, revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      });

      // Verify it then revoked the whole family due to reuse
      expect(prismaMock.refreshToken.updateMany).toHaveBeenNthCalledWith(2, {
        where: { family_id: familyId, revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      });
    });

    it("throws 401 unauthorized if user was deleted", async () => {
      const validRefreshJwt = signJwt(
        { sub: "deleted-user-1", typ: "refresh", fam: "f1", jti: "j1" },
        testRefreshSecret,
        { expiresInSeconds: 3600, issuer: "aisales", audience: "refresh" },
      );

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: "j1",
        user_id: "deleted-user-1",
        token_hash: hashToken(validRefreshJwt),
        family_id: "f1",
        expires_at: new Date(Date.now() + 3600 * 1000),
        revoked_at: null,
      });
      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.refreshToken.create.mockResolvedValue({});
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.refresh(validRefreshJwt)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("logout", () => {
    it("revokes active refresh family when valid refresh token is passed", async () => {
      const rawRefreshJwt = signJwt(
        { sub: "u1", typ: "refresh", fam: "fam-to-logout", jti: "j1" },
        testRefreshSecret,
        { expiresInSeconds: 3600, issuer: "aisales", audience: "refresh" },
      );

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: "j1",
        family_id: "fam-to-logout",
        token_hash: hashToken(rawRefreshJwt),
      });
      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout(rawRefreshJwt);

      expect(prismaMock.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token_hash: hashToken(rawRefreshJwt) },
      });

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          family_id: "fam-to-logout",
          revoked_at: null,
        },
        data: {
          revoked_at: expect.any(Date),
        },
      });
    });

    it("handles logout gracefully when refresh token is missing or not found", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.logout(undefined)).resolves.toBeUndefined();
      await expect(service.logout("unknown-token")).resolves.toBeUndefined();
    });

    it("deletes session and revokes Better Auth session when sessionToken is provided", async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: "s1",
        userId: "user-456",
        token: "session-token-abc",
      });
      prismaMock.session.deleteMany.mockResolvedValue({ count: 1 });

      await service.logout(undefined, undefined, "session-token-abc");

      expect(prismaMock.session.findUnique).toHaveBeenCalledWith({
        where: { token: "session-token-abc" },
      });
      expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
        where: { token: "session-token-abc" },
      });
      expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-456" },
      });
    });
  });

  describe("me", () => {
    it("returns current user profile and active memberships when access token is valid", async () => {
      const userId = "user-123";
      const validAccessJwt = signJwt({ sub: userId, typ: "access" }, testAccessSecret, {
        expiresInSeconds: 900,
        issuer: "aisales",
        audience: "access",
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: userId,
        email: "me@example.com",
        name: "Me User",
        email_verified_at: new Date(),
        created_at: new Date(),
        memberships: [
          {
            business_id: "biz-1",
            joined_at: new Date(),
            last_active_at: new Date(),
            role: { name: "owner" },
          },
        ],
      });

      const session = await service.me(validAccessJwt);

      expect(session.user.id).toBe(userId);
      expect(session.user.email).toBe("me@example.com");
      expect(session.memberships).toHaveLength(1);
      expect(session.memberships[0]?.role).toBe("owner");
      expect(session.accessToken).toBeUndefined(); // /auth/me does not return a new accessToken
      expect(session.tokenType).toBe("Bearer");
      expect(session.expiresIn).toBe(900);
    });

    it("throws 401 unauthorized when access token is missing", async () => {
      await expect(service.me(undefined)).rejects.toThrow(UnauthorizedException);
      await expect(service.me("")).rejects.toThrow(UnauthorizedException);
    });

    it("throws 401 unauthorized when access token has invalid signature or is expired", async () => {
      await expect(service.me("invalid.access.token")).rejects.toThrow(UnauthorizedException);

      const expiredJwt = signJwt({ sub: "u1", typ: "access" }, testAccessSecret, {
        expiresInSeconds: -100,
        issuer: "aisales",
        audience: "access",
      });
      await expect(service.me(expiredJwt)).rejects.toThrow(UnauthorizedException);
    });

    it("throws 401 unauthorized when token typ is 'refresh' instead of 'access'", async () => {
      const refreshJwt = signJwt({ sub: "u1", typ: "refresh" }, testAccessSecret, {
        expiresInSeconds: 900,
        issuer: "aisales",
        audience: "access",
      });
      await expect(service.me(refreshJwt)).rejects.toThrow(UnauthorizedException);
    });

    it("throws 401 unauthorized when user is not found in database", async () => {
      const validAccessJwt = signJwt({ sub: "nonexistent-user", typ: "access" }, testAccessSecret, {
        expiresInSeconds: 900,
        issuer: "aisales",
        audience: "access",
      });

      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.me(validAccessJwt)).rejects.toThrow(UnauthorizedException);
    });
  });
});
