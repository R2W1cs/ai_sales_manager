import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { extractBearerToken, extractRefreshToken, isSecureCookie, parseCookies } from "./refresh";

describe("AuthController", () => {
  let controller: AuthController;
  let authServiceMock: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    me: jest.Mock;
    acceptInvitation: jest.Mock;
  };
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    authServiceMock = {
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      me: jest.fn(),
      acceptInvitation: jest.fn(),
    };
    controller = new AuthController(authServiceMock as unknown as AuthService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("refresh helpers", () => {
    it("parses cookie header correctly", () => {
      expect(parseCookies(undefined)).toEqual({});
      expect(parseCookies("")).toEqual({});
      expect(parseCookies("aisales_refresh=token123; other=abc")).toEqual({
        aisales_refresh: "token123",
        other: "abc",
      });
      expect(parseCookies("encoded=hello%20world")).toEqual({
        encoded: "hello world",
      });
    });

    it("extracts refresh token from req.cookies or cookie header", () => {
      const reqWithCookies = {
        cookies: { aisales_refresh: "token-from-cookies" },
        headers: {},
      } as any;
      expect(extractRefreshToken(reqWithCookies)).toBe("token-from-cookies");

      const reqWithHeader = {
        headers: { cookie: "other=1; aisales_refresh=token-from-header" },
      } as any;
      expect(extractRefreshToken(reqWithHeader)).toBe("token-from-header");

      const reqEmpty = { headers: {} } as any;
      expect(extractRefreshToken(reqEmpty)).toBeUndefined();
    });

    it("extracts bearer token from Authorization header", () => {
      expect(extractBearerToken(undefined)).toBeUndefined();
      expect(extractBearerToken("")).toBeUndefined();
      expect(extractBearerToken("Basic abc")).toBeUndefined();
      expect(extractBearerToken("Bearer")).toBeUndefined();
      expect(extractBearerToken("Bearer token123")).toBe("token123");
      expect(extractBearerToken("bearer token456")).toBe("token456");
    });
  });

  describe("isSecureCookie", () => {
    it("returns false for plain HTTP PUBLIC_API_URL even in production", () => {
      process.env.NODE_ENV = "production";
      process.env.PUBLIC_API_URL = "http://localhost:3001";
      expect(isSecureCookie()).toBe(false);
    });

    it("returns true for HTTPS PUBLIC_API_URL", () => {
      process.env.PUBLIC_API_URL = "https://api.aisales.com";
      expect(isSecureCookie()).toBe(true);
    });

    it("respects COOKIE_SECURE override when set", () => {
      process.env.COOKIE_SECURE = "true";
      process.env.PUBLIC_API_URL = "http://localhost:3001";
      expect(isSecureCookie()).toBe(true);

      process.env.COOKIE_SECURE = "false";
      process.env.PUBLIC_API_URL = "https://api.aisales.com";
      expect(isSecureCookie()).toBe(false);
    });

    it("detects secure connection from request.protocol or x-forwarded-proto", () => {
      delete process.env.PUBLIC_API_URL;
      delete process.env.COOKIE_SECURE;
      process.env.NODE_ENV = "test";

      const reqWithSecure = { protocol: "https", headers: {} } as any;
      expect(isSecureCookie(reqWithSecure)).toBe(true);

      const reqWithForwarded = {
        protocol: "http",
        headers: { "x-forwarded-proto": "https" },
      } as any;
      expect(isSecureCookie(reqWithForwarded)).toBe(true);

      const plainReq = { protocol: "http", headers: {} } as any;
      expect(isSecureCookie(plainReq)).toBe(false);
    });

    it("returns false in production when COOKIE_SECURE and PUBLIC_API_URL are unset and req is plain HTTP", () => {
      delete process.env.PUBLIC_API_URL;
      delete process.env.COOKIE_SECURE;
      process.env.NODE_ENV = "production";

      const plainReq = { protocol: "http", headers: {} } as any;
      expect(isSecureCookie(plainReq)).toBe(false);

      const reqWithHttps = {
        protocol: "http",
        headers: { "x-forwarded-proto": "https" },
      } as any;
      expect(isSecureCookie(reqWithHttps)).toBe(true);
    });
  });

  describe("register", () => {
    it("registers a user and sets the aisales_refresh cookie", async () => {
      const mockSession = {
        user: {
          id: "user-1",
          email: "test@example.com",
          name: "Test User",
          emailVerifiedAt: null,
          createdAt: new Date(),
        },
        memberships: [],
        accessToken: "mock-access-jwt",
        tokenType: "Bearer" as const,
        expiresIn: 900,
      };
      authServiceMock.register.mockResolvedValue({
        session: mockSession,
        refreshToken: "mock-refresh-jwt",
      });

      const mockReq = {
        ip: "127.0.0.1",
        headers: { "user-agent": "jest-agent" },
      } as any;

      const mockRes = {
        setCookie: jest.fn(),
      } as any;

      const result = await controller.register(
        {
          email: "test@example.com",
          password: "password123",
          name: "Test User",
        },
        mockReq,
        mockRes,
      );

      expect(authServiceMock.register).toHaveBeenCalledWith(
        {
          email: "test@example.com",
          password: "password123",
          name: "Test User",
        },
        { ip: "127.0.0.1", userAgent: "jest-agent" },
      );

      expect(mockRes.setCookie).toHaveBeenCalledWith("aisales_refresh", "mock-refresh-jwt", {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/api/v1/auth",
        maxAge: 14 * 24 * 60 * 60,
      });

      expect(result).toBe(mockSession);
    });

    it("propagates 409 conflict when user already exists with duplicate email", async () => {
      authServiceMock.register.mockRejectedValue(
        new ConflictException({
          error: {
            code: "conflict",
            message: "User with this email already exists",
          },
        }),
      );

      const mockReq = {
        ip: "127.0.0.1",
        headers: {},
      } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      await expect(
        controller.register(
          {
            email: "duplicate@example.com",
            password: "password123",
            name: "Existing User",
          },
          mockReq,
          mockRes,
        ),
      ).rejects.toThrow(ConflictException);

      try {
        await controller.register(
          {
            email: "duplicate@example.com",
            password: "password123",
            name: "Existing User",
          },
          mockReq,
          mockRes,
        );
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

    it("propagates 400 validation error when password is shorter than 10 characters", async () => {
      authServiceMock.register.mockRejectedValue(
        new BadRequestException({
          error: {
            code: "validation_error",
            message: "Password must be at least 10 characters",
            details: { fields: { password: ["Password must be at least 10 characters"] } },
          },
        }),
      );

      const mockReq = {
        ip: "127.0.0.1",
        headers: {},
      } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      await expect(
        controller.register(
          {
            email: "test@example.com",
            password: "short9ch",
            name: "Test User",
          },
          mockReq,
          mockRes,
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        await controller.register(
          {
            email: "test@example.com",
            password: "short9ch",
            name: "Test User",
          },
          mockReq,
          mockRes,
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.getResponse()).toEqual({
          error: {
            code: "validation_error",
            message: "Password must be at least 10 characters",
            details: { fields: { password: ["Password must be at least 10 characters"] } },
          },
        });
      }
    });

    it("propagates 409 conflict on case-insensitive duplicate email collision (FR-AUTH-010)", async () => {
      authServiceMock.register.mockRejectedValue(
        new ConflictException({
          error: {
            code: "conflict",
            message: "User with this email already exists",
          },
        }),
      );

      const mockReq = {
        ip: "127.0.0.1",
        headers: {},
      } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      await expect(
        controller.register(
          {
            email: "DUPLICATE@EXAMPLE.COM",
            password: "password123",
            name: "Upper Case User",
          },
          mockReq,
          mockRes,
        ),
      ).rejects.toThrow(ConflictException);

      expect(authServiceMock.register).toHaveBeenCalledWith(
        {
          email: "DUPLICATE@EXAMPLE.COM",
          password: "password123",
          name: "Upper Case User",
        },
        { ip: "127.0.0.1", userAgent: undefined },
      );
    });
  });

  describe("login", () => {
    it("logs in a user and sets the aisales_refresh cookie", async () => {
      const mockSession = {
        user: {
          id: "user-1",
          email: "test@example.com",
          name: "Test User",
          emailVerifiedAt: null,
          createdAt: new Date(),
        },
        memberships: [],
        accessToken: "mock-access-jwt",
        tokenType: "Bearer" as const,
        expiresIn: 900,
      };
      authServiceMock.login.mockResolvedValue({
        session: mockSession,
        refreshToken: "mock-refresh-jwt",
      });

      const mockReq = {
        ip: "127.0.0.1",
        headers: { "user-agent": "jest-agent" },
      } as any;

      const mockRes = {
        setCookie: jest.fn(),
      } as any;

      const result = await controller.login(
        {
          email: "test@example.com",
          password: "password123",
        },
        mockReq,
        mockRes,
      );

      expect(authServiceMock.login).toHaveBeenCalledWith(
        {
          email: "test@example.com",
          password: "password123",
        },
        { ip: "127.0.0.1", userAgent: "jest-agent" },
      );

      expect(mockRes.setCookie).toHaveBeenCalledWith("aisales_refresh", "mock-refresh-jwt", {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/api/v1/auth",
        maxAge: 14 * 24 * 60 * 60,
      });

      expect(result).toBe(mockSession);
    });

    it("propagates 401 unauthorized with uniform error copy on unknown email", async () => {
      authServiceMock.login.mockRejectedValue(
        new UnauthorizedException({
          error: {
            code: "unauthorized",
            message: "Invalid email or password",
          },
        }),
      );

      const mockReq = { ip: "127.0.0.1", headers: {} } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      await expect(
        controller.login(
          {
            email: "unknown@example.com",
            password: "somePassword123",
          },
          mockReq,
          mockRes,
        ),
      ).rejects.toThrow(UnauthorizedException);

      try {
        await controller.login(
          {
            email: "unknown@example.com",
            password: "somePassword123",
          },
          mockReq,
          mockRes,
        );
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

    it("propagates 401 unauthorized with identical error copy on invalid password", async () => {
      authServiceMock.login.mockRejectedValue(
        new UnauthorizedException({
          error: {
            code: "unauthorized",
            message: "Invalid email or password",
          },
        }),
      );

      const mockReq = { ip: "127.0.0.1", headers: {} } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      await expect(
        controller.login(
          {
            email: "existing@example.com",
            password: "wrongPassword123",
          },
          mockReq,
          mockRes,
        ),
      ).rejects.toThrow(UnauthorizedException);

      try {
        await controller.login(
          {
            email: "existing@example.com",
            password: "wrongPassword123",
          },
          mockReq,
          mockRes,
        );
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

    it("propagates 400 validation error on malformed login request", async () => {
      authServiceMock.login.mockRejectedValue(
        new BadRequestException({
          error: {
            code: "validation_error",
            message: "Invalid email",
          },
        }),
      );

      const mockReq = { ip: "127.0.0.1", headers: {} } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      await expect(
        controller.login(
          {
            email: "invalid-email",
            password: "password123",
          },
          mockReq,
          mockRes,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("refresh", () => {
    it("rotates refresh token and sets new cookie", async () => {
      const mockSession = {
        user: {
          id: "user-1",
          email: "test@example.com",
          name: "Test User",
          emailVerifiedAt: null,
          createdAt: new Date(),
        },
        memberships: [],
        accessToken: "new-access-jwt",
        tokenType: "Bearer" as const,
        expiresIn: 900,
      };
      authServiceMock.refresh.mockResolvedValue({
        session: mockSession,
        refreshToken: "new-refresh-jwt",
      });

      const mockReq = {
        ip: "127.0.0.1",
        headers: {
          cookie: "aisales_refresh=old-refresh-jwt",
          "user-agent": "jest-agent",
        },
      } as any;

      const mockRes = {
        setCookie: jest.fn(),
        clearCookie: jest.fn(),
      } as any;

      const result = await controller.refresh(mockReq, mockRes);

      expect(authServiceMock.refresh).toHaveBeenCalledWith("old-refresh-jwt", {
        ip: "127.0.0.1",
        userAgent: "jest-agent",
      });

      expect(mockRes.setCookie).toHaveBeenCalledWith("aisales_refresh", "new-refresh-jwt", {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/api/v1/auth",
        maxAge: 14 * 24 * 60 * 60,
      });

      expect(result).toBe(mockSession);
    });

    it("clears refresh cookie and rethrows error on failed refresh", async () => {
      authServiceMock.refresh.mockRejectedValue(
        new UnauthorizedException({
          error: { code: "unauthorized", message: "Invalid refresh token" },
        }),
      );

      const mockReq = {
        ip: "127.0.0.1",
        headers: {
          cookie: "aisales_refresh=invalid-jwt",
        },
      } as any;

      const mockRes = {
        setCookie: jest.fn(),
        clearCookie: jest.fn(),
      } as any;

      await expect(controller.refresh(mockReq, mockRes)).rejects.toThrow(UnauthorizedException);

      expect(mockRes.clearCookie).toHaveBeenCalledWith("aisales_refresh", {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/api/v1/auth",
        maxAge: 0,
      });
    });
  });

  describe("logout", () => {
    it("revokes token family, clears cookie, and returns 204", async () => {
      authServiceMock.logout.mockResolvedValue(undefined);

      const mockReq = {
        headers: {
          authorization: "Bearer access-token-123",
          cookie: "aisales_refresh=refresh-token-123",
        },
      } as any;

      const mockRes = {
        clearCookie: jest.fn(),
      } as any;

      await controller.logout(mockReq, mockRes);

      expect(authServiceMock.logout).toHaveBeenCalledWith(
        "refresh-token-123",
        "access-token-123",
        undefined,
        mockReq.headers,
      );

      expect(mockRes.clearCookie).toHaveBeenCalledWith("aisales_refresh", {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/api/v1/auth",
        maxAge: 0,
      });
      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        "better-auth.session_token",
        expect.any(Object),
      );
    });
  });

  describe("me", () => {
    it("returns session for valid access token in Authorization header", async () => {
      const mockSession = {
        user: {
          id: "user-1",
          email: "test@example.com",
          name: "Test User",
          emailVerifiedAt: null,
          createdAt: new Date(),
        },
        memberships: [
          {
            businessId: "biz-1",
            role: "owner" as const,
            joinedAt: new Date(),
            lastActiveAt: new Date(),
          },
        ],
        tokenType: "Bearer" as const,
        expiresIn: 900,
      };
      authServiceMock.me.mockResolvedValue(mockSession);

      const mockReq = {
        headers: {
          authorization: "Bearer valid-access-jwt",
        },
      } as any;

      const result = await controller.me(mockReq);

      expect(authServiceMock.me).toHaveBeenCalledWith("valid-access-jwt");
      expect(result).toBe(mockSession);
    });

    it("delegates to service when Authorization header is missing", async () => {
      authServiceMock.me.mockRejectedValue(
        new UnauthorizedException({
          error: { code: "unauthorized", message: "Missing access token" },
        }),
      );

      const mockReq = {
        headers: {},
      } as any;

      await expect(controller.me(mockReq)).rejects.toThrow(UnauthorizedException);
      expect(authServiceMock.me).toHaveBeenCalledWith(undefined);
    });
  });

  describe("Invariants: FR-AUTH-001–005 / 010 (duplicate 409, login 401 same copy, min password 10)", () => {
    let integrationController: AuthController;
    let integrationAuthService: AuthService;
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
      };
      integrationAuthService = new AuthService(prismaMock as unknown as PrismaClient);
      integrationController = new AuthController(integrationAuthService);
    });

    describe("Invariant 1: Duplicate registration returns 409 conflict (FR-AUTH-001, FR-AUTH-010)", () => {
      it("rejects registration when email already exists with 409 ConflictException", async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: "existing-user-uuid",
          email: "existing@example.com",
        });

        const mockReq = { ip: "127.0.0.1", headers: {} } as any;
        const mockRes = { setCookie: jest.fn() } as any;

        try {
          await integrationController.register(
            {
              email: "existing@example.com",
              password: "validPassword123",
              name: "Existing User",
            },
            mockReq,
            mockRes,
          );
          fail("Expected register to throw ConflictException");
        } catch (err: any) {
          expect(err).toBeInstanceOf(ConflictException);
          expect(err.getStatus()).toBe(409);
          expect(err.getResponse()).toEqual({
            error: {
              code: "conflict",
              message: "User with this email already exists",
            },
          });
        }
      });

      it("enforces case-insensitive duplicate email rejection with 409 ConflictException (FR-AUTH-010)", async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: "existing-user-uuid",
          email: "existing@example.com",
        });

        const mockReq = { ip: "127.0.0.1", headers: {} } as any;
        const mockRes = { setCookie: jest.fn() } as any;

        try {
          await integrationController.register(
            {
              email: "EXISTING@EXAMPLE.COM",
              password: "validPassword123",
              name: "Uppercase Existing User",
            },
            mockReq,
            mockRes,
          );
          fail("Expected register to throw ConflictException");
        } catch (err: any) {
          expect(err).toBeInstanceOf(ConflictException);
          expect(err.getStatus()).toBe(409);
          expect(err.getResponse()).toEqual({
            error: {
              code: "conflict",
              message: "User with this email already exists",
            },
          });
        }

        expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
          where: { email: "existing@example.com" },
        });
      });

      it("handles database unique violation race condition (P2002) with 409 ConflictException", async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);
        prismaMock.user.create.mockRejectedValue({ code: "P2002" });

        const mockReq = { ip: "127.0.0.1", headers: {} } as any;
        const mockRes = { setCookie: jest.fn() } as any;

        try {
          await integrationController.register(
            {
              email: "race@example.com",
              password: "validPassword123",
              name: "Race Condition User",
            },
            mockReq,
            mockRes,
          );
          fail("Expected register to throw ConflictException on P2002");
        } catch (err: any) {
          expect(err).toBeInstanceOf(ConflictException);
          expect(err.getStatus()).toBe(409);
          expect(err.getResponse()).toEqual({
            error: {
              code: "conflict",
              message: "User with this email already exists",
            },
          });
        }
      });
    });

    describe("Invariant 2: Login returns 401 with exact same copy for unknown email and wrong password (FR-AUTH-003)", () => {
      it("returns identical 401 response copy whether user is unknown or password is wrong", async () => {
        const validPasswordHash = await argon2.hash("correctPassword123", {
          type: argon2.argon2id,
        });

        const mockReq = { ip: "127.0.0.1", headers: {} } as any;
        const mockRes = { setCookie: jest.fn() } as any;

        // Case A: Unknown email
        prismaMock.user.findUnique.mockResolvedValueOnce(null);
        let unknownEmailErrorResponse: any;
        try {
          await integrationController.login(
            {
              email: "nonexistent@example.com",
              password: "somePassword123",
            },
            mockReq,
            mockRes,
          );
          fail("Expected login with unknown email to throw UnauthorizedException");
        } catch (err: any) {
          expect(err).toBeInstanceOf(UnauthorizedException);
          expect(err.getStatus()).toBe(401);
          unknownEmailErrorResponse = err.getResponse();
        }

        // Case B: Existing user but wrong password
        prismaMock.user.findUnique.mockResolvedValueOnce({
          id: "user-uuid-1",
          email: "existing@example.com",
          name: "Existing User",
          password_hash: validPasswordHash,
          email_verified_at: null,
          created_at: new Date(),
          memberships: [],
        });

        let wrongPasswordErrorResponse: any;
        try {
          await integrationController.login(
            {
              email: "existing@example.com",
              password: "wrongPassword123",
            },
            mockReq,
            mockRes,
          );
          fail("Expected login with wrong password to throw UnauthorizedException");
        } catch (err: any) {
          expect(err).toBeInstanceOf(UnauthorizedException);
          expect(err.getStatus()).toBe(401);
          wrongPasswordErrorResponse = err.getResponse();
        }

        // Verify that responses are byte-for-byte identical (no user enumeration)
        expect(unknownEmailErrorResponse).toEqual({
          error: {
            code: "unauthorized",
            message: "Invalid email or password",
          },
        });
        expect(wrongPasswordErrorResponse).toEqual({
          error: {
            code: "unauthorized",
            message: "Invalid email or password",
          },
        });
        expect(wrongPasswordErrorResponse).toEqual(unknownEmailErrorResponse);
      });
    });

    describe("Invariant 3: Password minimum length 10 is enforced (FR-AUTH-001, 13 §4)", () => {
      it("rejects password with 9 characters with 400 validation_error", async () => {
        const mockReq = { ip: "127.0.0.1", headers: {} } as any;
        const mockRes = { setCookie: jest.fn() } as any;

        try {
          await integrationController.register(
            {
              email: "test@example.com",
              password: "123456789", // 9 chars - under min 10
              name: "Test User",
            },
            mockReq,
            mockRes,
          );
          fail("Expected register to throw BadRequestException for short password");
        } catch (err: any) {
          expect(err).toBeInstanceOf(BadRequestException);
          expect(err.getStatus()).toBe(400);
          const response = err.getResponse();
          expect(response.error.code).toBe("validation_error");
          expect(response.error.message).toContain("10");
        }
      });

      it("accepts password with exactly 10 characters", async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);
        prismaMock.user.create.mockImplementation((args: any) => ({
          id: "new-user-uuid",
          email: args.data.email,
          name: args.data.name,
          password_hash: args.data.password_hash,
          email_verified_at: null,
          created_at: new Date(),
        }));
        prismaMock.refreshToken.create.mockResolvedValue({});

        const mockReq = {
          ip: "127.0.0.1",
          headers: { "user-agent": "jest-agent" },
        } as any;
        const mockRes = { setCookie: jest.fn() } as any;

        const session = await integrationController.register(
          {
            email: "test@example.com",
            password: "1234567890", // exactly 10 chars
            name: "Ten Chars User",
          },
          mockReq,
          mockRes,
        );

        expect(session).toBeDefined();
        expect(session.user.email).toBe("test@example.com");
        expect(mockRes.setCookie).toHaveBeenCalledWith(
          "aisales_refresh",
          expect.any(String),
          expect.any(Object),
        );
      });
    });
  });

  describe("acceptInvitation (POST /auth/invitations/accept)", () => {
    it("Happy Path: accepts valid invitation, sets refresh cookie, and returns session JWT", async () => {
      const mockSession = {
        user: {
          id: "user-new",
          email: "invited@example.com",
          name: "Invited User",
          emailVerifiedAt: null,
          createdAt: new Date(),
        },
        memberships: [
          {
            businessId: "biz-1",
            role: "employee" as const,
            joinedAt: new Date(),
            lastActiveAt: null,
          },
        ],
        accessToken: "new-access-jwt",
        tokenType: "Bearer" as const,
        expiresIn: 900,
      };
      authServiceMock.acceptInvitation.mockResolvedValue({
        session: mockSession,
        refreshToken: "new-refresh-jwt",
      });

      const mockReq = {
        ip: "127.0.0.1",
        headers: { "user-agent": "jest-agent" },
      } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      const result = await controller.acceptInvitation(
        { token: "valid-invite-token", name: "Invited User", password: "securePass123" },
        mockReq,
        mockRes,
      );

      expect(authServiceMock.acceptInvitation).toHaveBeenCalledWith(
        { token: "valid-invite-token", name: "Invited User", password: "securePass123" },
        { ip: "127.0.0.1", userAgent: "jest-agent" },
      );
      expect(mockRes.setCookie).toHaveBeenCalledWith("aisales_refresh", "new-refresh-jwt", {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/api/v1/auth",
        maxAge: 14 * 24 * 60 * 60,
      });
      expect(result).toBe(mockSession);
    });

    it("Expired Token (404): propagates NotFoundException from service", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      authServiceMock.acceptInvitation.mockRejectedValue(
        new NotFoundException({
          error: { code: "not_found", message: "Invitation token not found or has expired" },
        }),
      );

      const mockReq = { ip: "127.0.0.1", headers: {} } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      await expect(
        controller.acceptInvitation({ token: "expired-token" }, mockReq, mockRes),
      ).rejects.toThrow(NotFoundException);
    });

    it("Duplicate Acceptance (409): propagates ConflictException from service", async () => {
      authServiceMock.acceptInvitation.mockRejectedValue(
        new ConflictException({
          error: { code: "conflict", message: "This invitation has already been accepted" },
        }),
      );

      const mockReq = { ip: "127.0.0.1", headers: {} } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      await expect(
        controller.acceptInvitation({ token: "used-token" }, mockReq, mockRes),
      ).rejects.toThrow(ConflictException);
    });

    it("New User Onboarding: propagates 400 when name/password missing for new user", async () => {
      authServiceMock.acceptInvitation.mockRejectedValue(
        new BadRequestException({
          error: {
            code: "validation_error",
            message: "Name and password are required for new user registration",
            details: { fields: { password: ["Password is required for new users"] } },
          },
        }),
      );

      const mockReq = { ip: "127.0.0.1", headers: {} } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      await expect(
        controller.acceptInvitation(
          { token: "valid-token" }, // Missing name and password for new user
          mockReq,
          mockRes,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("Invariants: acceptInvitation integration (T-AUTH-03)", () => {
    let integrationController: AuthController;
    let integrationAuthService: AuthService;
    let prismaMock: {
      $transaction: jest.Mock;
      user: {
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        findUniqueOrThrow: jest.Mock;
      };
      refreshToken: {
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
      };
      invitation: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
      businessMember: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    };

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const pastDate = new Date(Date.now() - 1);

    const buildInvitation = (overrides: Record<string, unknown> = {}) => ({
      id: "inv-1",
      business_id: "biz-1",
      organizationId: "biz-1",
      email: "invited@example.com",
      role_id: "role-employee",
      role: "employee",
      invited_by_user_id: "owner-user",
      token_hash: "hashed-token",
      expiresAt: futureDate,
      expires_at: futureDate,
      accepted_at: null,
      status: "pending",
      createdAt: new Date(),
      created_at: new Date(),
      business: { id: "biz-1", name: "Test Biz", deleted_at: null },
      role_rel: { id: "role-employee", name: "employee" },
      ...overrides,
    });

    beforeEach(() => {
      prismaMock = {
        $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
          return callback(prismaMock);
        }),
        user: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          findUniqueOrThrow: jest.fn(),
        },
        refreshToken: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
        invitation: {
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
        businessMember: {
          findUnique: jest.fn(),
          create: jest.fn().mockResolvedValue({}),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      integrationAuthService = new AuthService(prismaMock as unknown as PrismaClient);
      integrationController = new AuthController(integrationAuthService);
    });

    it("Happy Path: new user + valid token creates user, membership, marks invitation accepted_at", async () => {
      const newUser = {
        id: "new-user-uuid",
        email: "invited@example.com",
        name: "Invited Person",
        password_hash: "hashed",
        email_verified_at: null,
        created_at: new Date(),
      };

      prismaMock.invitation.findFirst.mockResolvedValue(buildInvitation());
      prismaMock.user.findUnique
        .mockResolvedValueOnce(null) // no existing user
        .mockResolvedValueOnce(null); // inside transaction — not called again
      prismaMock.user.create.mockResolvedValue(newUser);
      prismaMock.businessMember.findUnique.mockResolvedValue(null);
      prismaMock.refreshToken.create.mockResolvedValue({});
      prismaMock.user.findUniqueOrThrow.mockResolvedValue({
        ...newUser,
        memberships: [
          {
            business_id: "biz-1",
            role: { name: "employee" },
            joined_at: new Date(),
            last_active_at: null,
          },
        ],
      });

      const mockReq = { ip: "127.0.0.1", headers: { "user-agent": "jest" } } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      const session = await integrationController.acceptInvitation(
        { token: "raw-token", name: "Invited Person", password: "securePass123" },
        mockReq,
        mockRes,
      );

      expect(session.user.email).toBe("invited@example.com");
      expect(session.memberships).toHaveLength(1);
      expect(session.memberships[0]?.role).toBe("employee");
      expect(prismaMock.invitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accepted_at: expect.any(Date) }),
        }),
      );
      expect(mockRes.setCookie).toHaveBeenCalledWith(
        "aisales_refresh",
        expect.any(String),
        expect.any(Object),
      );
    });

    it("Expired Token (404): invitation.expires_at in the past returns NotFoundException", async () => {
      prismaMock.invitation.findFirst.mockResolvedValue(
        buildInvitation({ expiresAt: pastDate, expires_at: pastDate }),
      );

      const mockReq = { ip: "127.0.0.1", headers: {} } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      const { NotFoundException } = await import("@nestjs/common");
      await expect(
        integrationController.acceptInvitation({ token: "raw-token" }, mockReq, mockRes),
      ).rejects.toThrow(NotFoundException);
    });

    it("Not Found (404): null invitation row returns NotFoundException", async () => {
      prismaMock.invitation.findFirst.mockResolvedValue(null);

      const mockReq = { ip: "127.0.0.1", headers: {} } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      const { NotFoundException } = await import("@nestjs/common");
      await expect(
        integrationController.acceptInvitation({ token: "bad-token" }, mockReq, mockRes),
      ).rejects.toThrow(NotFoundException);
    });

    it("Duplicate Acceptance (409): accepted_at already set returns ConflictException", async () => {
      prismaMock.invitation.findFirst.mockResolvedValue(
        buildInvitation({ accepted_at: new Date(Date.now() - 60000) }),
      );

      const mockReq = { ip: "127.0.0.1", headers: {} } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      await expect(
        integrationController.acceptInvitation({ token: "used-token" }, mockReq, mockRes),
      ).rejects.toThrow(ConflictException);
    });

    it("Role integrity: membership role is taken from invitation, not caller-supplied", async () => {
      const newUser = {
        id: "user-2",
        email: "invited@example.com",
        name: "Person",
        email_verified_at: null,
        created_at: new Date(),
      };

      // Invitation has role_id="role-employee"; caller cannot override
      prismaMock.invitation.findFirst.mockResolvedValue(
        buildInvitation({ role_id: "role-employee" }),
      );
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValue(newUser);
      prismaMock.businessMember.findUnique.mockResolvedValue(null);
      prismaMock.refreshToken.create.mockResolvedValue({});
      prismaMock.user.findUniqueOrThrow.mockResolvedValue({
        ...newUser,
        memberships: [
          {
            business_id: "biz-1",
            role: { name: "employee" },
            joined_at: new Date(),
            last_active_at: null,
          },
        ],
      });

      const mockReq = { ip: "127.0.0.1", headers: {} } as any;
      const mockRes = { setCookie: jest.fn() } as any;

      await integrationController.acceptInvitation(
        { token: "raw-token", name: "Person", password: "securePass123" },
        mockReq,
        mockRes,
      );

      // businessMember.create must use role_id from the invitation
      expect(prismaMock.businessMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role_id: "role-employee" }),
        }),
      );
    });
  });
});
