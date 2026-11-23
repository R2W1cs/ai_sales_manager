import "reflect-metadata";
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Writable } from "node:stream";
import test, { after, before, describe } from "node:test";

import { Reflector } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import * as argon2 from "argon2";
import { adminAc, memberAc, ownerAc } from "better-auth/plugins/organization/access";
import dotenv from "dotenv";
import Redis from "ioredis";
import pino from "pino";

const webRequire = createRequire(resolve(process.cwd(), "../web/package.json"));
interface TestSocketClient {
  connected: boolean;
  once(event: string, listener: (...args: unknown[]) => void): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  close(): void;
}
const { io: createSocketClient } = webRequire("socket.io-client") as {
  io: (url: string, opts: Record<string, unknown>) => TestSocketClient;
};

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env") });

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/ai_sales";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET || "local-better-auth-secret-min-32-chars-long!";
process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || "http://localhost:4000";
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || "http://localhost:3000";
process.env.ENABLE_REDIS_REVOCATION_IN_TEST = "true";
delete process.env.RESEND_API_KEY;

import { REALTIME_EVENTS } from "@app/shared";

import { runBetterAuthBackfill } from "../prisma/backfill-better-auth";
import { runCutoverSessionInvalidation } from "../prisma/cutover-invalidate-sessions";
import { reconcileMemberToBusinessMember } from "../prisma/reconcile-business-member";
import {
  ac,
  adminRole,
  auth,
  closeAuthRevocationPublisher,
  employeeRole,
  fromNodeHeaders,
  ownerRole,
  publishAuthRevocation,
} from "../src/auth";
import { BetterAuthController } from "../src/auth/better-auth/better-auth.controller";
import { emailService } from "../src/auth/email/email.service";
import {
  AuthRateLimiterService,
  AuthThrottlerGuard,
} from "../src/auth/guards/auth-throttler.guard";
import { configureApp, createHttpAdapter, nestAppOptions } from "../src/bootstrap";
import { MembersController } from "../src/businesses/members/members.controller";
import { MembersService } from "../src/businesses/members/members.service";
import { WorkspacesController } from "../src/businesses/workspace/workspaces.controller";
import { loggerOptions } from "../src/lib/logger";
import { prisma } from "../src/lib/prisma";
import { PRISMA_CLIENT } from "../src/platform/core/prisma.token";
import { CsrfGuard } from "../src/platform/security/csrf.guard";
import { PermissionsGuard } from "../src/platform/security/permissions.guard";
import { TenantGuard } from "../src/platform/security/tenant.guard";
import { RealtimeGateway } from "../src/realtime/realtime.gateway";

const TEST_ORIGIN = "http://localhost:3000";
const RUN_TAG = `rg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

function base32Decode(encoded: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = encoded.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotp(secretBase32: string, stepOffset = 0): string {
  const counter = Math.floor(Date.now() / 1000 / 30) + stepOffset;
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter), 0);
  const hmac = crypto.createHmac("sha1", base32Decode(secretBase32)).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function extractSecretFromTotpUri(uri: string): string {
  return new URL(uri).searchParams.get("secret") ?? "";
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  capture(res: Response): void {
    const setCookies =
      typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const val = pair.slice(eq + 1).trim();
      if (val === "" || raw.toLowerCase().includes("max-age=0")) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, val);
      }
    }
  }

  has(namePart: string): boolean {
    for (const key of this.cookies.keys()) {
      if (key.includes(namePart)) return true;
    }
    return false;
  }

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  sessionCookieToken(): string | null {
    for (const [k, v] of this.cookies.entries()) {
      if (k.includes("session_token")) {
        const dotIdx = v.indexOf(".");
        return dotIdx === -1 ? v : v.slice(0, dotIdx);
      }
    }
    return null;
  }
}

describe("Better Auth 1.7.27 Release Gates (Real HTTP + PostgreSQL + Redis + Socket.IO)", () => {
  let appUrl = "";
  let closeApp: () => Promise<void>;
  let redis: Redis;
  const createdUserIds: string[] = [];
  const createdBusinessIds: string[] = [];
  const createdPlanIds: string[] = [];
  const sentVerificationUrls: Map<string, string> = new Map();
  const sentResetUrls: Map<string, string> = new Map();

  let failResetMailDelivery = false;
  const origSendVerification = emailService.sendVerificationEmail.bind(emailService);
  const origSendReset = emailService.sendResetPasswordEmail.bind(emailService);

  async function clearRateLimitKeys(): Promise<void> {
    const keys = await redis.keys("rate_limit:auth:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  async function httpJson(
    path: string,
    opts: {
      method?: string;
      body?: unknown;
      jar?: CookieJar;
      headers?: Record<string, string>;
      omitOrigin?: boolean;
    } = {},
  ): Promise<{ status: number; headers: Headers; data: Record<string, unknown> }> {
    const reqHeaders: Record<string, string> = {
      Accept: "application/json",
      ...(opts.omitOrigin ? {} : { Origin: TEST_ORIGIN }),
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.jar?.header() ? { Cookie: opts.jar.header() } : {}),
      ...opts.headers,
    };

    const res = await fetch(`${appUrl}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: reqHeaders,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      redirect: "manual",
    });

    if (opts.jar) {
      opts.jar.capture(res);
    }

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = { rawText: text };
    }
    return { status: res.status, headers: res.headers, data };
  }

  before(async () => {
    try {
      redis = new Redis(envRedisUrl());

      emailService.sendVerificationEmail = async (params) => {
        sentVerificationUrls.set(params.to.toLowerCase(), params.url);
        return true;
      };
      emailService.sendResetPasswordEmail = async (params) => {
        if (failResetMailDelivery) {
          throw new Error("Simulated Resend SMTP outage");
        }
        sentResetUrls.set(params.to.toLowerCase(), params.url);
        return true;
      };

      const limiter = new AuthRateLimiterService(redis);
      Reflect.defineMetadata("design:paramtypes", [AuthRateLimiterService], AuthThrottlerGuard);
      Reflect.defineMetadata("design:paramtypes", [Reflector], PermissionsGuard);
      Reflect.defineMetadata("design:paramtypes", [MembersService], MembersController);
      Reflect.defineMetadata("design:paramtypes", [MembersService], WorkspacesController);

      const moduleRef = await Test.createTestingModule({
        controllers: [BetterAuthController, MembersController, WorkspacesController],
        providers: [
          { provide: PRISMA_CLIENT, useValue: prisma },
          { provide: AuthRateLimiterService, useValue: limiter },
          AuthThrottlerGuard,
          CsrfGuard,
          TenantGuard,
          PermissionsGuard,
          {
            provide: RealtimeGateway,
            useFactory: () => new RealtimeGateway(prisma),
          },
          {
            provide: MembersService,
            useFactory: (gw: RealtimeGateway) => new MembersService(prisma, gw),
            inject: [RealtimeGateway],
          },
        ],
      }).compile();

      const nestApp = moduleRef.createNestApplication<NestFastifyApplication>(createHttpAdapter(), {
        ...nestAppOptions(),
        logger: false,
      });
      await configureApp(nestApp);
      await nestApp.listen(0, "127.0.0.1");

      const address = nestApp.getHttpServer().address() as { port: number };
      appUrl = `http://127.0.0.1:${address.port}`;
      closeApp = async () => {
        await nestApp.close();
      };
    } catch (err) {
      console.error("Release gate setup error:", err);
      await redis?.quit().catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
      throw err;
    }
  });

  after(async () => {
    emailService.sendVerificationEmail = origSendVerification;
    emailService.sendResetPasswordEmail = origSendReset;

    try {
      await clearRateLimitKeys();
      for (const bId of createdBusinessIds) {
        await prisma.subscription.deleteMany({ where: { business_id: bId } });
        await prisma.invitation.deleteMany({ where: { organizationId: bId } });
        await prisma.member.deleteMany({ where: { organizationId: bId } });
        await prisma.businessMember.deleteMany({ where: { business_id: bId } });
        await prisma.business.deleteMany({ where: { id: bId } });
        await prisma.organization.deleteMany({ where: { id: bId } });
      }
      for (const uId of createdUserIds) {
        await prisma.session.deleteMany({ where: { userId: uId } });
        await prisma.account.deleteMany({ where: { userId: uId } });
        await prisma.twoFactor.deleteMany({ where: { userId: uId } });
        await prisma.user.deleteMany({ where: { id: uId } });
      }
      for (const pId of createdPlanIds) {
        await prisma.plan.deleteMany({ where: { id: pId } });
      }
    } finally {
      await closeAuthRevocationPublisher();
      await redis.quit().catch(() => undefined);
      await closeApp?.();
      await prisma.$disconnect();
    }
  });

  function envRedisUrl(): string {
    return process.env.REDIS_URL || "redis://localhost:6379";
  }

  async function getOrCreateGlobalRole(name: string) {
    const existing = await prisma.role.findFirst({
      where: { name, business_id: null },
    });
    if (existing) return existing;
    return prisma.role.create({
      data: { id: crypto.randomUUID(), name, description: name },
    });
  }

  async function seedPlanAndWorkspace(maxSeats = 5): Promise<{
    planId: string;
    businessId: string;
    inviterId: string;
  }> {
    const suffix = crypto.randomBytes(4).toString("hex");
    const planId = crypto.randomUUID();
    const businessId = crypto.randomUUID();
    const inviterId = crypto.randomUUID();

    await prisma.plan.create({
      data: {
        id: planId,
        code: `rg_plan_${suffix}`,
        name: `RG Plan ${suffix}`,
        limits: { seats: maxSeats, ai_messages: 1000, channels: 3 },
      },
    });
    createdPlanIds.push(planId);

    await prisma.user.create({
      data: {
        id: inviterId,
        email: `inviter_${suffix}@example.com`,
        name: "Seed Inviter",
        emailVerified: true,
        twoFactorEnabled: false,
      },
    });
    createdUserIds.push(inviterId);

    await prisma.organization.create({
      data: {
        id: businessId,
        name: `RG Business ${suffix}`,
        slug: `rg-biz-${suffix}`,
      },
    });

    await prisma.business.create({
      data: {
        id: businessId,
        name: `RG Business ${suffix}`,
        currency: "TND",
        organization_id: businessId,
      },
    });
    createdBusinessIds.push(businessId);

    await prisma.subscription.create({
      data: {
        id: crypto.randomUUID(),
        business_id: businessId,
        plan_id: planId,
        status: "active",
        period_start: new Date(Date.now() - 86_400_000),
        period_end: new Date(Date.now() + 30 * 86_400_000),
        provider: "manual",
      },
    });

    return { planId, businessId, inviterId };
  }

  test("Gate 1: Invite-only signup, email verification, mismatch refusal, and Pino secret redaction", async () => {
    await clearRateLimitKeys();
    const { businessId, inviterId } = await seedPlanAndWorkspace(5);
    const invitedEmail = `g1_user_${RUN_TAG}@example.com`;
    const wrongEmail = `g1_wrong_${RUN_TAG}@example.com`;
    const password = "ReleaseGate!Password123";

    // 1. Signup without invitation header rejected (403)
    const noInviteRes = await httpJson("/api/auth/sign-up/email", {
      body: { email: wrongEmail, name: "No Invite", password },
    });
    assert.equal(noInviteRes.status, 403);

    // Seed pending invitation for invitedEmail + expired invitation
    const pendingInvId = crypto.randomUUID();
    const expiredInvId = crypto.randomUUID();
    await prisma.invitation.createMany({
      data: [
        {
          id: pendingInvId,
          organizationId: businessId,
          email: invitedEmail,
          role: "employee",
          status: "pending",
          expiresAt: new Date(Date.now() + 3_600_000),
          inviterId,
        },
        {
          id: expiredInvId,
          organizationId: businessId,
          email: wrongEmail,
          role: "employee",
          status: "pending",
          expiresAt: new Date(Date.now() - 60_000),
          inviterId,
        },
      ],
    });

    // 2. Expired invitation & wrong email rejected (403)
    const expiredRes = await httpJson("/api/auth/sign-up/email", {
      body: { email: wrongEmail, name: "Expired", password },
      headers: { "x-invitation-id": expiredInvId },
    });
    assert.equal(expiredRes.status, 403);

    const mismatchSignupRes = await httpJson("/api/auth/sign-up/email", {
      body: { email: wrongEmail, name: "Mismatch", password },
      headers: { "x-invitation-id": pendingInvId },
    });
    assert.equal(mismatchSignupRes.status, 403);

    // 3. Valid invited signup succeeds, emits verification email, does NOT auto-sign-in
    const signupJar = new CookieJar();
    const validSignupRes = await httpJson("/api/auth/sign-up/email", {
      jar: signupJar,
      body: { email: invitedEmail, name: "Invited Rep", password },
      headers: { "x-invitation-id": pendingInvId },
    });
    assert.equal(
      validSignupRes.status,
      200,
      `Expected valid invited signup 200, got ${validSignupRes.status}: ${JSON.stringify(validSignupRes.data)}`,
    );
    assert.equal(signupJar.has("session_token"), false);

    const createdUser = await prisma.user.findUnique({ where: { email: invitedEmail } });
    assert.ok(createdUser);
    createdUserIds.push(createdUser.id);
    assert.equal(createdUser.emailVerified, false);

    // Unverified sign-in must fail (403)
    const unverifiedSignin = await httpJson("/api/auth/sign-in/email", {
      body: { email: invitedEmail, password },
    });
    assert.equal(unverifiedSignin.status, 403);

    // 4. Verify email via real Better Auth verification URL (no autoSignInAfterVerification)
    const verifyUrl = sentVerificationUrls.get(invitedEmail);
    assert.ok(verifyUrl);
    const verifyToken = new URL(verifyUrl).searchParams.get("token");
    assert.ok(verifyToken);

    const verifyJar = new CookieJar();
    const verifyRes = await httpJson(
      `/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`,
      { method: "GET", jar: verifyJar },
    );
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyJar.has("session_token"), false);

    // Replay of verification token must not create a session
    const replayVerifyRes = await httpJson(
      `/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`,
      { method: "GET", jar: verifyJar },
    );
    assert.equal(verifyJar.has("session_token"), false);
    assert.ok(replayVerifyRes.status >= 200);

    // 5. Verified sign-in -> accept invitation creates Member + BusinessMember atomically
    const repJar = new CookieJar();
    const loginRes = await httpJson("/api/auth/sign-in/email", {
      jar: repJar,
      body: { email: invitedEmail, password },
    });
    assert.equal(loginRes.status, 200);
    assert.equal(repJar.has("session_token"), true);

    const acceptRes = await httpJson(`/api/v1/invitations/${pendingInvId}/accept`, {
      method: "POST",
      jar: repJar,
    });
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.data.businessId, businessId);
    assert.equal(acceptRes.data.role, "employee");

    const memberRecord = await prisma.member.findFirst({
      where: { userId: createdUser.id, organizationId: businessId },
    });
    const bmRecord = await prisma.businessMember.findFirst({
      where: { user_id: createdUser.id, business_id: businessId, removed_at: null },
    });
    assert.ok(memberRecord);
    assert.ok(bmRecord);

    // 6. Pino secret/credential/header redaction verification
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const testLogger = pino({ redact: loggerOptions.redact }, stream);
    testLogger.info({
      headers: {
        "x-invitation-id": "secret-invite-123",
        cookie: "better-auth.session_token=secret-tok",
        authorization: "Bearer secret-jwt",
      },
      password: "SuperSecretPassword",
    });
    const logLine = chunks.join("");
    assert.equal(logLine.includes("secret-invite-123"), false);
    assert.equal(logLine.includes("secret-tok"), false);
    assert.equal(logLine.includes("SuperSecretPassword"), false);
    assert.ok(logLine.includes("[REDACTED]"));
  });

  test("Gate 2: Mandatory owner/admin session MFA, two-browser isolation, trust-device blocked, no disable/replacement", async () => {
    await clearRateLimitKeys();
    const { businessId } = await seedPlanAndWorkspace(5);
    const ownerEmail = `g2_owner_${RUN_TAG}@example.com`;
    const password = "OwnerMfa!Password123";

    const ownerUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: ownerEmail,
        name: "Gate2 Owner",
        emailVerified: true,
        twoFactorEnabled: false,
      },
    });
    createdUserIds.push(ownerUser.id);

    const hashed = await (await import("better-auth/crypto")).hashPassword(password);
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: ownerUser.id,
        providerId: "credential",
        userId: ownerUser.id,
        password: hashed,
      },
    });

    await prisma.member.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: businessId,
        userId: ownerUser.id,
        role: "owner",
      },
    });
    const ownerRoleRow = await getOrCreateGlobalRole("owner");
    await prisma.businessMember.create({
      data: {
        id: crypto.randomUUID(),
        business_id: businessId,
        user_id: ownerUser.id,
        role_id: ownerRoleRow.id,
      },
    });

    // Two browsers sign in with password while unenrolled
    const browser1 = new CookieJar();
    const browser2 = new CookieJar();

    assert.equal(
      (
        await httpJson("/api/auth/sign-in/email", {
          jar: browser1,
          body: { email: ownerEmail, password },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await httpJson("/api/auth/sign-in/email", {
          jar: browser2,
          body: { email: ownerEmail, password },
        })
      ).status,
      200,
    );

    // Unenrolled owner must be blocked (403 mfa_setup_required) from privileged workspace routes
    const preMfaRes = await httpJson(`/api/v1/businesses/${businessId}/members`, {
      method: "GET",
      jar: browser1,
      headers: { "x-business-id": businessId },
    });
    assert.equal(preMfaRes.status, 403);
    assert.equal((preMfaRes.data.error as { code?: string })?.code, "mfa_setup_required");

    // Browser 2 enables & confirms TOTP
    const enableRes = await httpJson("/api/auth/two-factor/enable", {
      jar: browser2,
      body: { password },
    });
    assert.equal(enableRes.status, 200);
    const totpURI = String(enableRes.data.totpURI ?? "");
    const backupCodes = Array.isArray(enableRes.data.backupCodes)
      ? (enableRes.data.backupCodes as string[])
      : [];
    assert.ok(totpURI.startsWith("otpauth://"));
    assert.ok(backupCodes.length >= 1);
    const secret = extractSecretFromTotpUri(totpURI);
    assert.ok(secret.length >= 16);

    // Failed TOTP & failed backup code attempts must NOT unlock MFA
    const badTotpRes = await httpJson("/api/auth/two-factor/verify-totp", {
      jar: browser2,
      body: { code: "000000", trustDevice: true },
    });
    assert.ok(badTotpRes.status >= 400);

    const badBackupRes = await httpJson("/api/auth/two-factor/verify-backup-code", {
      jar: browser2,
      body: { code: "invalid-backup-code" },
    });
    assert.ok(badBackupRes.status >= 400);

    const code = generateTotp(secret);
    const verifyTotpRes = await httpJson("/api/auth/two-factor/verify-totp", {
      jar: browser2,
      body: { code, trustDevice: true },
    });
    assert.equal(verifyTotpRes.status, 200);
    assert.equal(
      verifyTotpRes.headers.getSetCookie().some((c) => c.includes("trust_device")),
      false,
    );

    // Browser 1's pre-enrollment password-only session must NOT be unlocked (revoked!)
    const browser1AfterEnroll = await httpJson(`/api/v1/businesses/${businessId}/members`, {
      method: "GET",
      jar: browser1,
      headers: { "x-business-id": businessId },
    });
    assert.ok(browser1AfterEnroll.status === 401 || browser1AfterEnroll.status === 403);

    // Browser 2's MFA-verified session accesses privileged workspace route
    const browser2AfterEnroll = await httpJson(`/api/v1/businesses/${businessId}/members`, {
      method: "GET",
      jar: browser2,
      headers: { "x-business-id": businessId },
    });
    assert.equal(browser2AfterEnroll.status, 200);

    // Self-service MFA disable & replacement are disabled
    await clearRateLimitKeys();
    const disableRes = await httpJson("/api/auth/two-factor/disable", {
      jar: browser2,
      body: { password },
    });
    assert.equal(disableRes.status, 404);

    const replaceRes = await httpJson("/api/auth/two-factor/enable", {
      jar: browser2,
      body: { password },
    });
    assert.equal(replaceRes.status, 403);

    // Fresh sign-in with pre-existing fake/valid trust_device cookie AND trustDevice:true still triggers 2FA
    const browser3 = new CookieJar();
    const freshLogin = await httpJson("/api/auth/sign-in/email", {
      jar: browser3,
      body: { email: ownerEmail, password },
      headers: {
        Cookie: "better-auth.trust_device=forged-or-old-trust-cookie",
      },
    });
    assert.equal(freshLogin.status, 200);
    assert.equal(freshLogin.data.twoFactorRedirect, true);
    assert.equal(browser3.has("session_token"), false);

    // Complete Browser 3 challenge using backup code -> establishes MFA-verified session & preserves Browser 2
    const verifyBackupRes = await httpJson("/api/auth/two-factor/verify-backup-code", {
      jar: browser3,
      body: { code: backupCodes[0], trustDevice: true },
    });
    assert.equal(verifyBackupRes.status, 200);
    assert.equal(browser3.has("session_token"), true);
    assert.equal(
      verifyBackupRes.headers.getSetCookie().some((c) => c.includes("trust_device=")),
      false,
    );

    const browser3Privileged = await httpJson(`/api/v1/businesses/${businessId}/members`, {
      method: "GET",
      jar: browser3,
      headers: { "x-business-id": businessId },
    });
    assert.equal(browser3Privileged.status, 200);

    // Browser 4 signs in with TOTP challenge; existing MFA-verified Browser 2 & Browser 3 sessions survive
    const browser4 = new CookieJar();
    const login4 = await httpJson("/api/auth/sign-in/email", {
      jar: browser4,
      body: { email: ownerEmail, password },
    });
    assert.equal(login4.status, 200);
    assert.equal(login4.data.twoFactorRedirect, true);
    const verify4 = await httpJson("/api/auth/two-factor/verify-totp", {
      jar: browser4,
      body: { code: generateTotp(secret) },
    });
    assert.equal(verify4.status, 200);

    const browser2StillValid = await httpJson(`/api/v1/businesses/${businessId}/members`, {
      method: "GET",
      jar: browser2,
      headers: { "x-business-id": businessId },
    });
    assert.equal(browser2StillValid.status, 200);
  });

  test("Gate 3: Legacy Argon2id backfill, 1.7.27 login, password recovery + neutral failure, cutover + reconcile", async () => {
    await clearRateLimitKeys();
    const { businessId } = await seedPlanAndWorkspace(5);
    const legacyEmail = `g3_legacy_${RUN_TAG}@example.com`;
    const legacyPassword = "LegacyArgon!Password123";
    const newPassword = "RotatedStrong!Password123";
    const legacyUserId = crypto.randomUUID();

    const argonHash = await argon2.hash(legacyPassword, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    const ownerRoleRow = await getOrCreateGlobalRole("owner");

    await prisma.user.create({
      data: {
        id: legacyUserId,
        email: legacyEmail,
        name: "Legacy Owner",
        password_hash: argonHash,
        email_verified_at: new Date(),
        emailVerified: false,
      },
    });
    createdUserIds.push(legacyUserId);

    await prisma.businessMember.create({
      data: {
        id: crypto.randomUUID(),
        business_id: businessId,
        user_id: legacyUserId,
        role_id: ownerRoleRow.id,
      },
    });

    // Legacy pre-cutover session row to be wiped at cutover
    await prisma.session.create({
      data: {
        id: crypto.randomUUID(),
        token: `pre-cutover-${RUN_TAG}`,
        userId: legacyUserId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const summary = await runBetterAuthBackfill(prisma);
    assert.ok(summary.accountsCreated >= 1);

    // Cutover purges all existing sessions
    const cutoverSummary = await runCutoverSessionInvalidation(prisma);
    assert.ok(cutoverSummary.deletedSessions >= 1);

    // One-way reconciliation Member -> BusinessMember (removing BusinessMember only restores it from Member)
    await prisma.businessMember.deleteMany({
      where: { user_id: legacyUserId, business_id: businessId },
    });
    const reconcileSummary = await reconcileMemberToBusinessMember(prisma);
    assert.ok(reconcileSummary.upsertedProjections >= 1);

    // Legacy user signs in on 1.7.27 cleanly with Argon2id password
    const legacyJar = new CookieJar();
    const loginRes = await httpJson("/api/auth/sign-in/email", {
      jar: legacyJar,
      body: { email: legacyEmail, password: legacyPassword },
    });
    assert.equal(loginRes.status, 200);
    assert.equal(legacyJar.has("session_token"), true);

    // Forgot password returns neutral 200 even if email delivery fails
    failResetMailDelivery = true;
    const failedMailRes = await httpJson("/api/auth/request-password-reset", {
      body: { email: legacyEmail, redirectTo: `${TEST_ORIGIN}/reset-password` },
    });
    assert.equal(failedMailRes.status, 200);
    failResetMailDelivery = false;

    const unknownMailRes = await httpJson("/api/auth/request-password-reset", {
      body: {
        email: `nonexistent_${RUN_TAG}@example.com`,
        redirectTo: `${TEST_ORIGIN}/reset-password`,
      },
    });
    assert.equal(unknownMailRes.status, 200);

    // Real password reset succeeds, revokes prior session, and blocks token reuse
    const okResetReq = await httpJson("/api/auth/request-password-reset", {
      body: { email: legacyEmail, redirectTo: `${TEST_ORIGIN}/reset-password` },
    });
    assert.equal(okResetReq.status, 200);
    const resetUrl = sentResetUrls.get(legacyEmail);
    assert.ok(resetUrl);
    const resetToken = new URL(resetUrl).searchParams.get("token");
    assert.ok(resetToken);

    const resetRes = await httpJson("/api/auth/reset-password", {
      body: { token: resetToken, newPassword },
    });
    assert.equal(resetRes.status, 200);

    // Replay of used reset token rejected
    const replayResetRes = await httpJson("/api/auth/reset-password", {
      body: { token: resetToken, newPassword: "AnotherStrong!Password123" },
    });
    assert.ok(replayResetRes.status >= 400);

    // Prior session revoked after password reset
    const oldSessionWs = await httpJson("/api/v1/workspaces", { method: "GET", jar: legacyJar });
    assert.equal(oldSessionWs.status, 401);

    // Sign in with new password works
    const newJar = new CookieJar();
    const newLoginRes = await httpJson("/api/auth/sign-in/email", {
      jar: newJar,
      body: { email: legacyEmail, password: newPassword },
    });
    assert.equal(newLoginRes.status, 200);
  });

  test("Gate 4: Disabled BA org routes, CSRF, concurrent last-seat & last-owner locking, org permissions", async () => {
    await clearRateLimitKeys();

    // 1. All 10 disabled public Better Auth organization mutation routes return 404
    const disabledOrgPaths = [
      "/api/auth/organization/create",
      "/api/auth/organization/update",
      "/api/auth/organization/delete",
      "/api/auth/organization/invite-member",
      "/api/auth/organization/accept-invitation",
      "/api/auth/organization/reject-invitation",
      "/api/auth/organization/cancel-invitation",
      "/api/auth/organization/remove-member",
      "/api/auth/organization/update-member-role",
      "/api/auth/organization/leave",
    ];
    for (let idx = 0; idx < disabledOrgPaths.length; idx++) {
      if (idx > 0 && idx % 4 === 0) {
        await clearRateLimitKeys();
      }
      const path = disabledOrgPaths[idx]!;
      const res = await httpJson(path, { body: {} });
      assert.equal(res.status, 404, `${path} should be disabled (404)`);
    }

    // 2. Custom permissions preserve Better Auth org action sets & live .authorize() semantics
    assert.ok(ownerRole.statements.organization.includes("delete"));
    assert.ok(ownerRole.statements.member.includes("update"));
    assert.deepEqual(
      [...ownerRole.statements.organization].sort(),
      [...ownerAc.statements.organization].sort(),
    );
    assert.deepEqual(
      [...adminRole.statements.member].sort(),
      [...adminAc.statements.member].sort(),
    );
    assert.deepEqual(
      [...employeeRole.statements.member].sort(),
      [...memberAc.statements.member].sort(),
    );
    assert.equal(
      ownerRole.authorize({ organization: ["delete"], member: ["update"] }).success,
      true,
    );
    assert.equal(employeeRole.authorize({ organization: ["delete"] }).success, false);
    assert.ok(ac);

    // 3. Setup seat limit = 2 (1 owner + 1 slot left) and two concurrent acceptances + CSRF check
    const { businessId, inviterId } = await seedPlanAndWorkspace(2);
    const ownerRoleRow = await getOrCreateGlobalRole("owner");
    await prisma.member.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: businessId,
        userId: inviterId,
        role: "owner",
      },
    });
    await prisma.businessMember.create({
      data: {
        id: crypto.randomUUID(),
        business_id: businessId,
        user_id: inviterId,
        role_id: ownerRoleRow.id,
      },
    });

    // Helper creating verified user + pending invitation
    const createVerifiedInvitee = async (idx: number, role: "employee" | "owner") => {
      const email = `g4_u${idx}_${RUN_TAG}@example.com`;
      const pw = "Gate4!Password123";
      const uId = crypto.randomUUID();
      const hashed = await (await import("better-auth/crypto")).hashPassword(pw);
      await prisma.user.create({
        data: { id: uId, email, name: `G4 U${idx}`, emailVerified: true, twoFactorEnabled: false },
      });
      createdUserIds.push(uId);
      await prisma.account.create({
        data: {
          id: crypto.randomUUID(),
          accountId: uId,
          providerId: "credential",
          userId: uId,
          password: hashed,
        },
      });
      const invId = crypto.randomUUID();
      await prisma.invitation.create({
        data: {
          id: invId,
          organizationId: businessId,
          email,
          role,
          status: "pending",
          expiresAt: new Date(Date.now() + 3_600_000),
          inviterId,
        },
      });
      const jar = new CookieJar();
      const login = await httpJson("/api/auth/sign-in/email", {
        jar,
        body: { email, password: pw },
      });
      assert.equal(login.status, 200);
      return { uId, invId, jar, email };
    };

    const u1 = await createVerifiedInvitee(1, "employee");
    const u2 = await createVerifiedInvitee(2, "employee");

    // CSRF rejection checks on cookie-authenticated mutation
    const crossSiteRes = await httpJson(`/api/v1/workspaces/invitations/${u1.invId}/accept`, {
      method: "POST",
      jar: u1.jar,
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    assert.equal(crossSiteRes.status, 403);

    const evilOriginRes = await httpJson(`/api/v1/workspaces/invitations/${u1.invId}/accept`, {
      method: "POST",
      jar: u1.jar,
      headers: { Origin: "https://evil.attacker.example" },
    });
    assert.equal(evilOriginRes.status, 403);

    const missingOriginRes = await httpJson(`/api/v1/invitations/${u1.invId}/accept`, {
      method: "POST",
      jar: u1.jar,
      omitOrigin: true,
    });
    assert.equal(missingOriginRes.status, 403);

    // Concurrent last-seat acceptance: exactly 1 wins and 1 gets 403 quota_exceeded
    const [r1, r2] = await Promise.all([
      httpJson(`/api/v1/workspaces/invitations/${u1.invId}/accept`, {
        method: "POST",
        jar: u1.jar,
      }),
      httpJson(`/api/v1/workspaces/invitations/${u2.invId}/accept`, {
        method: "POST",
        jar: u2.jar,
      }),
    ]);
    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 403]);
    assert.equal(await prisma.member.count({ where: { organizationId: businessId } }), 2);

    // Concurrent sole-owner demotion guard (create a 2nd owner with MFA session and attempt concurrent self/cross removal)
    const { businessId: ownerBizId, inviterId: owner1Id } = await seedPlanAndWorkspace(5);
    const owner2Email = `g4_owner2_${RUN_TAG}@example.com`;
    const ownerPw = "OwnerTwo!Password123";
    const owner2Id = crypto.randomUUID();
    const hashedOwnerPw = await (await import("better-auth/crypto")).hashPassword(ownerPw);
    await prisma.user.create({
      data: {
        id: owner2Id,
        email: owner2Email,
        name: "Owner Two",
        emailVerified: true,
        twoFactorEnabled: false,
      },
    });
    createdUserIds.push(owner2Id);
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: owner2Id,
        providerId: "credential",
        userId: owner2Id,
        password: hashedOwnerPw,
      },
    });
    const owner1Email = `g4_owner1_${RUN_TAG}@example.com`;
    await prisma.user.update({ where: { id: owner1Id }, data: { email: owner1Email } });
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: owner1Id,
        providerId: "credential",
        userId: owner1Id,
        password: hashedOwnerPw,
      },
    });
    await prisma.member.createMany({
      data: [
        { id: crypto.randomUUID(), organizationId: ownerBizId, userId: owner1Id, role: "owner" },
        { id: crypto.randomUUID(), organizationId: ownerBizId, userId: owner2Id, role: "owner" },
      ],
    });
    await prisma.businessMember.createMany({
      data: [
        {
          id: crypto.randomUUID(),
          business_id: ownerBizId,
          user_id: owner1Id,
          role_id: ownerRoleRow.id,
        },
        {
          id: crypto.randomUUID(),
          business_id: ownerBizId,
          user_id: owner2Id,
          role_id: ownerRoleRow.id,
        },
      ],
    });

    const enrollOwner = async (email: string) => {
      const jar = new CookieJar();
      assert.equal(
        (await httpJson("/api/auth/sign-in/email", { jar, body: { email, password: ownerPw } }))
          .status,
        200,
      );
      const en = await httpJson("/api/auth/two-factor/enable", {
        jar,
        body: { password: ownerPw },
      });
      assert.equal(en.status, 200);
      const code = generateTotp(extractSecretFromTotpUri(String(en.data.totpURI)));
      assert.equal(
        (await httpJson("/api/auth/two-factor/verify-totp", { jar, body: { code } })).status,
        200,
      );
      return jar;
    };

    const o1Jar = await enrollOwner(owner1Email);
    const o2Jar = await enrollOwner(owner2Email);

    const ownerCanManage = await auth.api.hasPermission({
      headers: fromNodeHeaders({ cookie: o1Jar.header() }),
      body: {
        organizationId: ownerBizId,
        permissions: { organization: ["delete"], member: ["update"] },
      },
    });
    assert.equal(ownerCanManage?.success, true);

    const repCannotManage = await auth.api.hasPermission({
      headers: fromNodeHeaders({ cookie: u1.jar.header() }),
      body: {
        organizationId: businessId,
        permissions: { member: ["update"] },
      },
    });
    assert.equal(repCannotManage?.success, false);

    const [demote1, demote2] = await Promise.all([
      httpJson(`/api/v1/businesses/${ownerBizId}/members/${owner2Id}/role`, {
        method: "PATCH",
        jar: o1Jar,
        body: { role: "employee" },
        headers: { "x-business-id": ownerBizId },
      }),
      httpJson(`/api/v1/businesses/${ownerBizId}/members/${owner1Id}/role`, {
        method: "PATCH",
        jar: o2Jar,
        body: { role: "employee" },
        headers: { "x-business-id": ownerBizId },
      }),
    ]);
    const demoteStatuses = [demote1.status, demote2.status].sort((a, b) => a - b);
    // One concurrent call wins (200), the second loses permissions / hits sole-owner guard (403).
    assert.deepEqual(demoteStatuses, [200, 403]);
    assert.equal(
      await prisma.member.count({ where: { organizationId: ownerBizId, role: "owner" } }),
      1,
    );

    // Remaining sole owner cannot demote themselves (explicit 403 sole-owner guard)
    const survivingOwnerJar = demote1.status === 200 ? o1Jar : o2Jar;
    const survivingOwnerId = demote1.status === 200 ? owner1Id : owner2Id;
    const soleOwnerDemote = await httpJson(
      `/api/v1/businesses/${ownerBizId}/members/${survivingOwnerId}/role`,
      {
        method: "PATCH",
        jar: survivingOwnerJar,
        body: { role: "employee" },
        headers: { "x-business-id": ownerBizId },
      },
    );
    assert.equal(soleOwnerDemote.status, 403);
  });

  test("Gate 5: Socket.IO already-connected client receives zero events during subscriber drop & after revocation", async () => {
    const { businessId } = await seedPlanAndWorkspace(5);
    const repEmail = `g5_rep_${RUN_TAG}@example.com`;
    const repPw = "SocketRep!Password123";
    const repId = crypto.randomUUID();
    const hashed = await (await import("better-auth/crypto")).hashPassword(repPw);

    await prisma.user.create({
      data: {
        id: repId,
        email: repEmail,
        name: "Socket Rep",
        emailVerified: true,
        twoFactorEnabled: false,
      },
    });
    createdUserIds.push(repId);
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: repId,
        providerId: "credential",
        userId: repId,
        password: hashed,
      },
    });
    const empRole = await getOrCreateGlobalRole("employee");
    await prisma.member.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: businessId,
        userId: repId,
        role: "employee",
      },
    });
    await prisma.businessMember.create({
      data: {
        id: crypto.randomUUID(),
        business_id: businessId,
        user_id: repId,
        role_id: empRole.id,
      },
    });

    const jar = new CookieJar();
    assert.equal(
      (
        await httpJson("/api/auth/sign-in/email", {
          jar,
          body: { email: repEmail, password: repPw },
        })
      ).status,
      200,
    );
    const cookieHeader = jar.header();

    const httpServer = createServer();
    const replicaB = new RealtimeGateway(prisma);
    replicaB.attach(httpServer);
    replicaB.onApplicationBootstrap();

    await new Promise<void>((resolveListen) => {
      httpServer.listen(0, "127.0.0.1", () => resolveListen());
    });
    const port = (httpServer.address() as { port: number }).port;

    const receivedPayloads: unknown[] = [];
    const client = createSocketClient(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      extraHeaders: { cookie: cookieHeader },
      auth: { businessId },
    });

    client.on(REALTIME_EVENTS.NOTIFICATION_NEW, (payload: unknown) => {
      receivedPayloads.push(payload);
    });

    await new Promise<void>((resolveConnect, rejectConnect) => {
      client.once("connect", () => resolveConnect());
      client.once("connect_error", (err) => rejectConnect(err));
    });
    // Allow async handleConnection room joins and Redis subscription ready state
    await new Promise((r) => setTimeout(r, 150));

    try {
      // Healthy baseline event arrives
      replicaB.emitToTenant(businessId, REALTIME_EVENTS.NOTIFICATION_NEW, { id: "healthy-1" });
      await new Promise((r) => setTimeout(r, 80));
      const baselineCount = receivedPayloads.length;
      assert.ok(baselineCount >= 1);
      assert.ok(receivedPayloads.every((p) => (p as { id?: string }).id === "healthy-1"));

      // Simulate Redis Pub/Sub subscriber drop + remove membership & session in DB
      replicaB.handleSubscriberDrop();
      await publishAuthRevocation({ type: "member_removed", userId: repId, businessId });
      await prisma.member.deleteMany({ where: { userId: repId, organizationId: businessId } });
      await prisma.session.deleteMany({ where: { userId: repId } });

      // Protected event during drop must NOT reach client
      replicaB.emitToTenant(businessId, REALTIME_EVENTS.NOTIFICATION_NEW, { id: "dropped-2" });
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(receivedPayloads.length, baselineCount);

      // Reconnect subscriber -> stale socket revalidates against Postgres and is disconnected
      await replicaB.handleSubscriberRestored();
      await new Promise((r) => setTimeout(r, 120));
      assert.equal(client.connected, false);

      replicaB.emitToTenant(businessId, REALTIME_EVENTS.NOTIFICATION_NEW, { id: "revoked-3" });
      await new Promise((r) => setTimeout(r, 60));
      assert.equal(receivedPayloads.length, baselineCount);
    } finally {
      client.close();
      replicaB.onModuleDestroy();
      await new Promise<void>((resolveClose) => httpServer.close(() => resolveClose()));
    }
  });

  test("Gate 6: Single rate limiter enforces exact configured boundaries per bucket", async () => {
    await clearRateLimitKeys();

    // 1. recovery_send: 3/60s -> 4th gets 429
    for (let i = 1; i <= 3; i++) {
      const r = await httpJson("/api/auth/request-password-reset", {
        body: { email: `rl_rec_${RUN_TAG}@example.com` },
      });
      assert.notEqual(r.status, 429, `recovery_send request ${i} should not 429`);
    }
    const recBlocked = await httpJson("/api/auth/request-password-reset", {
      body: { email: `rl_rec_${RUN_TAG}@example.com` },
    });
    assert.equal(recBlocked.status, 429);
    assert.ok(recBlocked.headers.get("retry-after"));

    // 2. signin (5/60s) & signup (5/60s) & mfa (5/60s) operate independently per bucket
    for (let i = 1; i <= 5; i++) {
      const r = await httpJson("/api/auth/sign-in/email", {
        body: { email: `rl_si_${RUN_TAG}@example.com`, password: "WrongPassword123!" },
      });
      assert.notEqual(r.status, 429, `signin request ${i} should not 429`);
    }
    assert.equal(
      (
        await httpJson("/api/auth/sign-in/email", {
          body: { email: `rl_si_${RUN_TAG}@example.com`, password: "WrongPassword123!" },
        })
      ).status,
      429,
    );

    for (let i = 1; i <= 5; i++) {
      const r = await httpJson("/api/auth/sign-up/email", {
        body: { email: `rl_su_${RUN_TAG}@example.com`, name: "X", password: "Password123!" },
      });
      assert.notEqual(r.status, 429, `signup request ${i} should not 429`);
    }
    assert.equal(
      (
        await httpJson("/api/auth/sign-up/email", {
          body: { email: `rl_su_${RUN_TAG}@example.com`, name: "X", password: "Password123!" },
        })
      ).status,
      429,
    );

    for (let i = 1; i <= 5; i++) {
      const r = await httpJson("/api/auth/two-factor/verify-totp", { body: { code: "123456" } });
      assert.notEqual(r.status, 429, `mfa request ${i} should not 429`);
    }
    assert.equal(
      (await httpJson("/api/auth/two-factor/verify-totp", { body: { code: "123456" } })).status,
      429,
    );

    // 3. recovery_redeem: 10/60s -> 11th gets 429
    for (let i = 1; i <= 10; i++) {
      const r = await httpJson("/api/auth/reset-password", {
        body: { token: `invalid-${i}`, newPassword: "Strong!Password123" },
      });
      assert.notEqual(r.status, 429, `recovery_redeem request ${i} should not 429`);
    }
    assert.equal(
      (
        await httpJson("/api/auth/reset-password", {
          body: { token: "invalid-11", newPassword: "Strong!Password123" },
        })
      ).status,
      429,
    );

    // 4. invite: 10/60s -> 11th gets 429
    for (let i = 1; i <= 10; i++) {
      const r = await httpJson("/api/v1/workspaces/invitations/non-existent/accept", {
        method: "POST",
      });
      assert.notEqual(r.status, 429, `invite request ${i} should not 429`);
    }
    assert.equal(
      (
        await httpJson("/api/v1/workspaces/invitations/non-existent/accept", {
          method: "POST",
        })
      ).status,
      429,
    );

    // 5. session_read: 120/60s -> 121st gets 429 (covers GET /api/v1/workspaces as well)
    for (let i = 1; i <= 119; i++) {
      const r = await httpJson("/api/auth/get-session", { method: "GET" });
      assert.notEqual(r.status, 429, `session_read request ${i} should not 429`);
    }
    const ws120 = await httpJson("/api/v1/workspaces", { method: "GET" });
    assert.notEqual(ws120.status, 429, "120th session_read on GET /api/v1/workspaces allowed");
    assert.equal((await httpJson("/api/v1/workspaces", { method: "GET" })).status, 429);
  });
});
