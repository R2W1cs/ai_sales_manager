import * as argon2 from "argon2";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";

import { env } from "@app/shared/server";

import { shouldTrustProxy } from "../../bootstrap";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { emailService } from "../email/email.service";
import { ac, adminRole, employeeRole, ownerRole } from "./better-auth-permissions";
import { publishAuthRevocation } from "./revocation-events";

const secret = env.BETTER_AUTH_SECRET;
const baseURL = env.BETTER_AUTH_URL;
const frontendURL = (env.PUBLIC_APP_URL || env.CORS_ORIGIN || "http://localhost:3000").replace(
  /\/$/,
  "",
);

function buildTrustedOrigins(): string[] {
  const origins = new Set<string>();
  for (const candidate of [frontendURL, env.CORS_ORIGIN, env.PUBLIC_APP_URL, baseURL]) {
    if (typeof candidate === "string" && candidate.length > 0) {
      origins.add(candidate.replace(/\/$/, ""));
    }
  }
  if (env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://localhost:3001");
    origins.add("http://127.0.0.1:3000");
    origins.add("http://localhost:4000");
  }
  return [...origins];
}

function parseTrustedProxies(): string[] | undefined {
  if (!shouldTrustProxy() || typeof env.TRUSTED_PROXIES !== "string") {
    return undefined;
  }
  const entries = env.TRUSTED_PROXIES.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : undefined;
}

const useSecureCookies =
  env.COOKIE_SECURE === "true" || (env.COOKIE_SECURE !== "false" && env.NODE_ENV === "production");

async function revokeUnverifiedUserSessions(
  userId: string,
  excludeSessionId?: string,
): Promise<void> {
  const stale = await prisma.session.findMany({
    where: {
      userId,
      ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      mfaVerified: false,
    },
    select: { id: true },
  });
  if (stale.length === 0) {
    return;
  }

  await prisma.session.deleteMany({
    where: { id: { in: stale.map((s) => s.id) } },
  });
  for (const s of stale) {
    await publishAuthRevocation({
      type: "session_revoked",
      userId,
      sessionId: s.id,
    });
  }
}

const MFA_VERIFY_PATHS = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);

export const auth = betterAuth({
  appName: "AI Sales Manager",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret,
  baseURL,
  trustedOrigins: buildTrustedOrigins(),
  disabledPaths: [
    // Workspace & membership mutations route exclusively through MembersService
    // so PostgreSQL advisory locks hold across quota/sole-owner checks and writes.
    "/organization/create",
    "/organization/update",
    "/organization/delete",
    "/organization/invite-member",
    "/organization/accept-invitation",
    "/organization/reject-invitation",
    "/organization/cancel-invitation",
    "/organization/update-member-role",
    "/organization/remove-member",
    "/organization/leave",
    // Self-service MFA disablement is disabled for the pilot until recovery ops are ready.
    "/two-factor/disable",
  ],
  // Single authoritative rate limiter is enforced by AuthRateLimiterService / AuthThrottlerGuard.
  rateLimit: {
    enabled: false,
  },
  user: {
    additionalFields: {
      platformAdmin: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
        fieldName: "platform_admin",
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 24 hours
    additionalFields: {
      mfaVerified: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 3600, // 1 hour
    revokeSessionsOnPasswordReset: true,
    password: {
      hash: async (password: string): Promise<string> => hashPassword(password),
      verify: async ({ hash, password }: { hash: string; password: string }): Promise<boolean> => {
        if (hash.startsWith("$argon2")) {
          return argon2.verify(hash, password).catch(() => false);
        }
        return verifyPassword({ hash, password });
      },
    },
    async sendResetPassword(data: {
      user: { id: string; email: string; name: string };
      token: string;
      url?: string;
    }) {
      const resetLink = `${frontendURL}/reset-password?token=${encodeURIComponent(data.token)}`;
      try {
        const sent = await emailService.sendResetPasswordEmail({
          to: data.user.email,
          url: resetLink,
          name: data.user.name,
        });
        if (!sent) {
          logger.warn(
            { userId: data.user.id },
            "Password reset email not delivered (mail service unavailable or unconfigured)",
          );
        }
      } catch (err) {
        logger.error({ err, userId: data.user.id }, "Password reset email delivery failed");
      }
    },
    async onPasswordReset({ user }) {
      await publishAuthRevocation({
        type: "session_revoked",
        userId: user.id,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    async sendVerificationEmail(data: {
      user: { id: string; email: string; name: string };
      token: string;
      url?: string;
    }) {
      const verifyLink = `${frontendURL}/verify-email?token=${encodeURIComponent(data.token)}`;
      try {
        const sent = await emailService.sendVerificationEmail({
          to: data.user.email,
          url: verifyLink,
          name: data.user.name,
        });
        if (!sent) {
          logger.warn(
            { userId: data.user.id },
            "Verification email not delivered (mail service unavailable or unconfigured)",
          );
        }
      } catch (err) {
        logger.error({ err, userId: data.user.id }, "Verification email delivery failed");
      }
    },
  },
  advanced: {
    useSecureCookies,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      disableIpTracking: false,
      ...(parseTrustedProxies() ? { trustedProxies: parseTrustedProxies() } : {}),
    },
    database: {
      joins: true,
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (sessionData, authCtx) => {
          const isMfaVerified = Boolean(authCtx && MFA_VERIFY_PATHS.has(authCtx.path ?? ""));
          return {
            data: {
              ...sessionData,
              mfaVerified: isMfaVerified,
            },
          };
        },
        after: async (createdSession, authCtx) => {
          if (
            authCtx &&
            MFA_VERIFY_PATHS.has(authCtx.path ?? "") &&
            createdSession.mfaVerified === true
          ) {
            // Invalidate any pre-enrollment / password-only sessions for this user across browsers.
            await revokeUnverifiedUserSessions(createdSession.userId, createdSession.id);
          }
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // 1. Invite-only sign-up gate: requires the actual invitation ID credential matching email, status, and expiry.
      if (ctx.path === "/sign-up/email") {
        const rawInviteId =
          ctx.headers?.get("x-invitation-id") ?? ctx.request?.headers.get("x-invitation-id");
        const invitationId = typeof rawInviteId === "string" ? rawInviteId.trim() : "";

        if (!invitationId) {
          throw new APIError("FORBIDDEN", {
            code: "INVITATION_REQUIRED",
            message: "Registration is invite-only. A valid invitation credential is required.",
          });
        }

        const body = (ctx.body ?? {}) as { email?: unknown };
        const normalizedEmail =
          typeof body.email === "string" ? body.email.toLowerCase().trim() : "";

        const invitation = await prisma.invitation.findUnique({
          where: { id: invitationId },
        });

        if (
          !invitation ||
          invitation.status !== "pending" ||
          invitation.expiresAt <= new Date() ||
          invitation.email.toLowerCase().trim() !== normalizedEmail
        ) {
          throw new APIError("FORBIDDEN", {
            code: "INVALID_INVITATION",
            message: "Invalid, expired, or mismatched workspace invitation.",
          });
        }
      }

      // 2. Disable self-service MFA factor replacement once a verified factor exists.
      if (ctx.path === "/two-factor/enable") {
        const headers = ctx.headers ?? ctx.request?.headers;
        const activeSession =
          ctx.context.session ??
          (headers ? await auth.api.getSession({ headers }).catch(() => null) : null);
        const userId = activeSession?.user?.id;
        if (userId) {
          const existingVerified = await prisma.twoFactor.findFirst({
            where: { userId, verified: true },
            select: { id: true },
          });
          if (
            existingVerified ||
            (activeSession?.user as Record<string, unknown> | undefined)?.twoFactorEnabled
          ) {
            throw new APIError("FORBIDDEN", {
              code: "MFA_RESET_DISABLED",
              message: "Self-service MFA factor replacement is disabled for this pilot.",
            });
          }
        }
      }

      // 3. Force trustDevice = false on all 2FA verification endpoints.
      if (
        ctx.path === "/two-factor/verify-totp" ||
        ctx.path === "/two-factor/verify-backup-code" ||
        ctx.path === "/two-factor/verify-otp"
      ) {
        if (ctx.body && typeof ctx.body === "object") {
          (ctx.body as Record<string, unknown>).trustDevice = false;
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      // Update last_login_at on successful sign-in when a full session was issued.
      if (ctx.path === "/sign-in/email" && ctx.context.newSession?.user?.id) {
        await prisma.user
          .update({
            where: { id: ctx.context.newSession.user.id },
            data: { last_login_at: new Date() },
          })
          .catch(() => undefined);
      }

      // On initial TOTP enrollment completion, revoke pre-enrollment unverified sessions
      // while leaving already MFA-verified sessions on other devices intact.
      if (ctx.path === "/two-factor/verify-totp" && !ctx.context.newSession) {
        const activeSession = ctx.context.session;
        const userId = activeSession?.user?.id;
        const sessionId = activeSession?.session?.id;
        if (userId && sessionId && activeSession.user.twoFactorEnabled) {
          await revokeUnverifiedUserSessions(userId, sessionId);
        }
      }

      // Broadcast socket revocation on sign-out using session record ID.
      if (ctx.path === "/sign-out" && ctx.context.session?.session?.id) {
        await publishAuthRevocation({
          type: "session_revoked",
          userId: ctx.context.session.user.id,
          sessionId: ctx.context.session.session.id,
        });
      }
    }),
  },
  plugins: [
    organization({
      ac,
      roles: {
        owner: ownerRole,
        admin: adminRole,
        employee: employeeRole,
      },
      allowUserToCreateOrganization: false,
      requireEmailVerificationOnInvitation: true,
      invitationExpiresIn: 60 * 60 * 24 * 7, // 7 days
      cancelPendingInvitationsOnReInvite: true,
      disableOrganizationDeletion: true,
      async sendInvitationEmail(data) {
        const inviteLink = `${frontendURL}/invite?token=${encodeURIComponent(data.id)}`;
        try {
          const sent = await emailService.sendOrganizationInvitationEmail({
            to: data.email,
            organizationName: data.organization.name,
            inviterName: data.inviter.user.name,
            inviteLink,
            role: data.role || "employee",
          });
          if (!sent) {
            logger.warn(
              { organizationId: data.organization.id },
              "Organization invitation email not delivered",
            );
          }
        } catch (err) {
          logger.error(
            { err, organizationId: data.organization.id },
            "Failed to send organization invitation email",
          );
        }
      },
    }),
    twoFactor({
      issuer: "AI Sales Manager",
      skipVerificationOnEnable: false,
      totpOptions: {
        digits: 6,
        period: 30,
      },
      backupCodeOptions: {
        amount: 10,
        length: 10,
        storeBackupCodes: "encrypted",
      },
      twoFactorCookieMaxAge: 600,
    }) as unknown as BetterAuthPlugin,
  ],
});

export type Auth = typeof auth;
