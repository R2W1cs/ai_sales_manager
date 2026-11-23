import { UnauthorizedException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { env } from "@app/shared/server";

import { prisma } from "../../lib/prisma";
import { extractBearerToken, verifyAccessToken } from "../../platform/security/jwt";
import { auth } from "./better-auth";
import { fromNodeHeaders } from "./fastify-adapter";

export type BetterAuthSessionResult = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/**
 * Resolves the Better Auth session from inbound HTTP headers without throwing.
 */
export async function resolveBetterAuthSession(
  headers: Record<string, string | string[] | undefined>,
): Promise<BetterAuthSessionResult | null> {
  return auth.api
    .getSession({
      headers: fromNodeHeaders(headers),
    })
    .catch(() => null);
}

/**
 * Resolves the active Better Auth session or throws a canonical 401 UnauthorizedException.
 */
export async function requireBetterAuthSession(
  headers: Record<string, string | string[] | undefined>,
  message = "Authentication required",
): Promise<BetterAuthSessionResult> {
  const session = await resolveBetterAuthSession(headers);
  if (!session?.user?.id) {
    throw new UnauthorizedException({
      error: {
        code: "unauthorized",
        message,
      },
    });
  }
  return session;
}

/**
 * Resolves the authenticated user ID from session or test-environment Bearer token.
 */
export async function resolveAuthenticatedUserId(
  headers: Record<string, string | string[] | undefined>,
  secret = env.BETTER_AUTH_SECRET,
): Promise<string | undefined> {
  const session = await resolveBetterAuthSession(headers);
  if (session?.user?.id) {
    return session.user.id;
  }
  if (env.NODE_ENV === "test") {
    const rawAccessToken = extractBearerToken(
      Array.isArray(headers.authorization) ? headers.authorization[0] : headers.authorization,
    );
    if (rawAccessToken) {
      try {
        return verifyAccessToken(rawAccessToken, secret).sub;
      } catch {
        throw new UnauthorizedException({
          error: {
            code: "unauthorized",
            message: "Invalid or expired access token",
          },
        });
      }
    }
  }
  return undefined;
}

/**
 * Auth-domain boundary service for querying user credentials and profiles.
 */
export async function findAuthUserById(
  userId: string,
  client: { user?: PrismaClient["user"] } = prisma,
) {
  if (!client.user || typeof client.user.findUnique !== "function") {
    return null;
  }
  return client.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      email_verified_at: true,
      createdAt: true,
      platform_admin: true,
      twoFactorEnabled: true,
    },
  });
}

/**
 * Auth-domain boundary service for inspecting session validity and MFA state.
 */
export async function findAuthSessionById(
  sessionId: string,
  client: { session?: PrismaClient["session"] } = prisma,
) {
  if (!client.session || typeof client.session.findUnique !== "function") {
    return null;
  }
  return client.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      mfaVerified: true,
      activeOrganizationId: true,
    },
  });
}

/**
 * Auth-domain boundary service for setting the session's active workspace organization.
 */
export async function updateAuthSessionActiveOrganization(
  sessionId: string,
  activeOrganizationId: string,
  client: { session?: PrismaClient["session"] } = prisma,
) {
  if (!client.session || typeof client.session.update !== "function") {
    return null;
  }
  return client.session.update({
    where: { id: sessionId },
    data: { activeOrganizationId },
  });
}
