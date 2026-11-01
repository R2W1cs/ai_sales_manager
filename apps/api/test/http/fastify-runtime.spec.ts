/**
 * Fastify runtime contract suite.
 *
 * Covers the behaviour that differs between the Express and Fastify adapters
 * and that the migration had to change. Each case here maps to a concrete
 * defect that the previous unit specs could not see, because they hand-mocked
 * Express-shaped `req`/`res` objects.
 */
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";

jest.mock("../../src/lib/queue.js", () => ({ connection: {} }));
jest.mock("../../src/lib/queue", () => ({ connection: {} }));

/**
 * `TenantGuard` declares `@Optional() prismaClient?: PrismaClient` but imports
 * the type with `import type`, so the decorator metadata is erased and DI can
 * never satisfy it — the guard always falls back to this module singleton.
 * Mocking the module is therefore the only working seam.
 */
jest.mock("../../src/lib/prisma", () => {
  const business = { id: "allowed-business", deleted_at: null };
  const membership = {
    business_id: "allowed-business",
    user_id: "user-1",
    removed_at: null,
    business,
    role: { name: "owner", role_permissions: [] },
  };
  return {
    prisma: {
      businessMember: {
        findFirst: ({ where }: { where: { business_id?: string } }) =>
          Promise.resolve(where.business_id === "allowed-business" ? membership : null),
        findMany: () => Promise.resolve([membership]),
      },
    },
  };
});

import { AppController } from "../../src/app.controller";
import { AppService } from "../../src/app.service";
import { BetterAuthController } from "../../src/auth/better-auth/better-auth.controller";
import { signJwt } from "../../src/auth/core/auth.service";
import {
  getClearCookieOptions,
  getRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
} from "../../src/auth/core/refresh";
import { AuthThrottlerGuard } from "../../src/auth/guards/auth-throttler.guard";
import type { HttpReply, HttpRequest } from "../../src/platform/core/http";
import { TenantGuard } from "../../src/platform/security/tenant.guard";
import { findCookie, startHttpApp, type HttpTestApp } from "./harness";

const FOURTEEN_DAYS_SECONDS = 14 * 24 * 60 * 60;
const TEST_SECRET = "test-access-secret-min-32-chars-long-xyz";

@Controller("__fastify")
class FastifyProbeController {
  @Post("cookie")
  @HttpCode(HttpStatus.OK)
  setCookie(@Req() req: HttpRequest, @Res({ passthrough: true }) res: HttpReply): { ok: boolean } {
    res.setCookie(REFRESH_COOKIE_NAME, "refresh-token-value", getRefreshCookieOptions(req));
    return { ok: true };
  }

  @Post("cookie/clear")
  @HttpCode(HttpStatus.OK)
  clearCookie(
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: HttpReply,
  ): { ok: boolean } {
    res.clearCookie(REFRESH_COOKIE_NAME, getClearCookieOptions(req));
    return { ok: true };
  }

  @Get("cookie/read")
  readCookie(@Req() req: HttpRequest): { refresh: string | undefined } {
    // Provided by @fastify/cookie; undefined if the plugin is not registered.
    return { refresh: req.cookies[REFRESH_COOKIE_NAME] };
  }

  @Get("redirect")
  async redirect(@Res() res: HttpReply): Promise<void> {
    await res.redirect("https://app.example.com/integrations?meta=ok", HttpStatus.FOUND);
  }

  @Get("tenant/:id")
  @UseGuards(TenantGuard)
  tenantScoped(@Param("id") id: string): { id: string } {
    return { id };
  }

  @Get("businesses/:id")
  @UseGuards(TenantGuard)
  businessScoped(@Param("id") id: string): { id: string } {
    return { id };
  }
}

describe("Fastify runtime contract", () => {
  let harness: HttpTestApp;
  let accessToken: string;
  const previousSecret = process.env.BETTER_AUTH_SECRET;

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET = TEST_SECRET;
    accessToken = signJwt({ sub: "user-1", typ: "access" }, TEST_SECRET, {
      expiresInSeconds: 900,
    });
    harness = await startHttpApp(
      {
        controllers: [AppController, FastifyProbeController, BetterAuthController],
        providers: [AppService, TenantGuard],
      },
      (builder) => builder.overrideGuard(AuthThrottlerGuard).useValue({ canActivate: () => true }),
    );
  });

  afterAll(async () => {
    await harness.close();
    if (previousSecret === undefined) {
      delete process.env.BETTER_AUTH_SECRET;
    } else {
      process.env.BETTER_AUTH_SECRET = previousSecret;
    }
  });

  describe("cookies (@fastify/cookie)", () => {
    it("emits Max-Age in seconds, not milliseconds", async () => {
      // Express's res.cookie took milliseconds and divided by 1000.
      // @fastify/cookie forwards maxAge straight to Set-Cookie, so reusing the
      // millisecond constant produced a cookie lasting ~38 years.
      const response = await harness.fetch("/__fastify/cookie", { method: "POST" });
      const cookie = findCookie(response, REFRESH_COOKIE_NAME);

      expect(cookie).toBeDefined();
      expect(cookie?.value).toBe("refresh-token-value");
      expect(Number(cookie?.attributes["max-age"])).toBe(FOURTEEN_DAYS_SECONDS);
      expect(Number(cookie?.attributes["max-age"])).toBeLessThan(FOURTEEN_DAYS_SECONDS * 1000);
    });

    it("marks the refresh cookie HttpOnly, Lax and path-scoped", async () => {
      const response = await harness.fetch("/__fastify/cookie", { method: "POST" });
      const cookie = findCookie(response, REFRESH_COOKIE_NAME);

      expect(cookie?.attributes).toMatchObject({
        path: "/api/v1/auth",
        samesite: "Lax",
      });
      expect(Object.keys(cookie?.attributes ?? {})).toContain("httponly");
    });

    it("clears the cookie with Max-Age=0", async () => {
      const response = await harness.fetch("/__fastify/cookie/clear", { method: "POST" });
      const cookie = findCookie(response, REFRESH_COOKIE_NAME);

      expect(cookie?.value).toBe("");
      expect(cookie?.attributes["max-age"]).toBe("0");
    });

    it("parses inbound cookies onto request.cookies", async () => {
      const response = await harness.fetch("/__fastify/cookie/read", {
        headers: { cookie: `${REFRESH_COOKIE_NAME}=inbound-value` },
      });

      await expect(response.json()).resolves.toEqual({ refresh: "inbound-value" });
    });
  });

  describe("redirects", () => {
    it("returns 302 with the target in Location", async () => {
      // Fastify's signature is redirect(url, code). Calling it Express-style as
      // redirect(302, url) throws and emits `Location: 302`.
      const response = await harness.fetch("/__fastify/redirect");

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("https://app.example.com/integrations?meta=ok");
    });
  });

  describe("security headers (@fastify/helmet)", () => {
    it("sets default hardening headers without inventing a CSP", async () => {
      const response = await harness.fetch("/");

      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
      // 17 §10: no CSP for a JSON API.
      expect(response.headers.get("content-security-policy")).toBeNull();
    });
  });

  describe("request correlation", () => {
    it("echoes a supplied X-Request-Id", async () => {
      const requestId = "11111111-2222-3333-4444-555555555555";
      const response = await harness.fetch("/", { headers: { "x-request-id": requestId } });
      expect(response.headers.get("x-request-id")).toBe(requestId);
    });

    it("generates a request id when none is supplied", async () => {
      const response = await harness.fetch("/");
      expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe("Better Auth catch-all route", () => {
    it("routes nested auth paths into the Better Auth handler", async () => {
      // The mocked Better Auth handler replies {"status":"ok"}; the assertion
      // that matters is that the wildcard resolves rather than 404ing.
      const response = await harness.fetch("/api/auth/get-session");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "ok" });
    });

    it("routes POST sign-in through the same handler", async () => {
      const response = await harness.fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.co", password: "supersecret1" }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe("tenant isolation on path parameters (13 §2.4, 17 §4)", () => {
    const authorizedHeaders = (): Record<string, string> => ({
      "x-business-id": "allowed-business",
      authorization: `Bearer ${accessToken}`,
    });

    it("allows a path id matching the resolved tenant", async () => {
      const response = await harness.fetch("/__fastify/tenant/allowed-business", {
        headers: authorizedHeaders(),
      });
      expect(response.status).toBe(200);
    });

    it("rejects a cross-tenant business id in the header with 403", async () => {
      const response = await harness.fetch("/__fastify/tenant/allowed-business", {
        headers: { "x-business-id": "other-business", authorization: `Bearer ${accessToken}` },
      });

      expect(response.status).toBe(403);
      const body = (await response.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe("forbidden");
    });

    it("rejects an unauthenticated request with 401", async () => {
      const response = await harness.fetch("/__fastify/tenant/allowed-business");
      expect(response.status).toBe(401);
    });

    it("rejects a path id that does not match the resolved tenant", async () => {
      // 17 §4 rule 2. This check reads the request path, which Fastify does not
      // expose as `request.path`; reading the undefined property made the
      // regex match an empty string and disabled the check silently.
      const response = await harness.fetch("/__fastify/businesses/other-business", {
        headers: authorizedHeaders(),
      });

      expect(response.status).toBe(403);
      const body = (await response.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe("forbidden");
    });

    it("ignores the query string when matching the request path", async () => {
      const response = await harness.fetch("/__fastify/tenant/allowed-business?businesses/x=1", {
        headers: authorizedHeaders(),
      });
      expect(response.status).toBe(200);
    });
  });
});
