import type { CanActivate, ExecutionContext } from "@nestjs/common";
import {
  createParamDecorator,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";

import { env } from "@app/shared/server";

import { resolveBetterAuthSession } from "../../auth";
import { prisma } from "../../lib/prisma";
import { type HttpRequest, requestPath } from "../core/http";
import { InjectPrisma, type PrismaClient } from "../core/prisma.token";
import { extractBearerToken, verifyAccessToken } from "./jwt";
import { assertPrivilegedMfaSession, resolveAuthorizedTenantMembership } from "./membership-lookup";
import { isPrivilegedRole } from "./permissions";

export interface AuthenticatedUser {
  id: string;
  sub: string;
  email?: string;
  name?: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  platformAdmin?: boolean;
  [key: string]: unknown;
}

export interface AuthenticatedSession {
  id: string;
  mfaVerified: boolean;
  activeOrganizationId?: string | null;
}

export interface TenantRequestContext {
  businessId: string;
  user: AuthenticatedUser;
  session?: AuthenticatedSession;
  membership?: unknown;
  business?: unknown;
}

/**
 * Request augmented with the verified tenant context.
 *
 * `businessId` is always resolved from a server-verified Better Auth `Member` lookup.
 * Never read a tenant id straight off the client.
 */
export interface TenantRequest extends HttpRequest {
  user?: AuthenticatedUser;
  session?: AuthenticatedSession;
  businessId?: string;
  tenantId?: string;
  membership?: unknown;
  business?: unknown;
  /**
   * Tenant selected by the authenticated Better Auth session
   * (`session.activeOrganizationId`), not by the client.
   */
  sessionBusinessId?: string;
}

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly prisma: PrismaClient;

  constructor(@Optional() @InjectPrisma() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  private get accessSecret(): string {
    return env.BETTER_AUTH_SECRET;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TenantRequest>();

    // 1. Authenticate user via Better Auth session
    let userId: string | undefined = req.user?.id ?? req.user?.sub;

    if (!userId) {
      const session = await resolveBetterAuthSession(req.headers);
      if (session?.user.id) {
        userId = session.user.id;
        const sessionRecord = session.session as Record<string, unknown>;
        const userRecord = session.user as Record<string, unknown>;
        req.user = {
          id: session.user.id,
          sub: session.user.id,
          email: session.user.email,
          name: session.user.name,
          emailVerified: Boolean(session.user.emailVerified),
          twoFactorEnabled: Boolean(userRecord.twoFactorEnabled),
          platformAdmin: Boolean(userRecord.platformAdmin),
        };
        req.session = {
          id: session.session.id,
          mfaVerified: Boolean(sessionRecord.mfaVerified),
          activeOrganizationId: session.session.activeOrganizationId ?? null,
        };
        if (session.session.activeOrganizationId) {
          req.sessionBusinessId = session.session.activeOrganizationId;
        }
      }
    }

    // Legacy Bearer JWT fallback strictly for isolated unit tests in test env
    if (!userId && env.NODE_ENV === "test") {
      const rawAccessToken = extractBearerToken(req.headers.authorization);
      if (rawAccessToken) {
        try {
          const payload = verifyAccessToken(rawAccessToken, this.accessSecret);
          userId = payload.sub;
          req.user = { id: userId, sub: userId };
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

    if (!userId) {
      const hasBearer = Boolean(extractBearerToken(req.headers.authorization));
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: hasBearer ? "Invalid or expired access token" : "Missing access token",
        },
      });
    }

    // 2. Resolve tenant from X-Business-Id (13 §2.4), falling back to session.activeOrganizationId.
    const rawHeader = req.headers["x-business-id"];
    const headerValue = Array.isArray(rawHeader)
      ? rawHeader[0]?.trim()
      : typeof rawHeader === "string"
        ? rawHeader.trim()
        : undefined;
    const targetBusinessId = headerValue || req.sessionBusinessId;

    const resolved = await resolveAuthorizedTenantMembership(this.prisma, userId, targetBusinessId);

    // 3. Enforce session-level MFA for privileged workspace roles (owner, admin).
    // Employee reps do not require MFA in this pilot.
    const isPrivileged = isPrivilegedRole(resolved.roleName);
    if (isPrivileged) {
      assertPrivilegedMfaSession({
        session: req.session,
        twoFactorEnabled: req.user?.twoFactorEnabled,
        enforceAlways: env.NODE_ENV === "production",
        enrollmentMessage:
          "Two-factor authentication enrollment is required for workspace owners and administrators.",
        challengeMessage:
          "A verified two-factor authentication session is required for privileged access.",
      });
    }

    req.businessId = resolved.businessId;
    req.tenantId = resolved.businessId;
    req.membership = resolved.membershipPayload;
    req.business = resolved.business;

    // 4. Path :businessId or /businesses/:id verification (13 §2.4, 17 §4)
    const params = req.params as Record<string, string | undefined> | undefined;
    if (params?.businessId && params.businessId !== req.businessId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }

    const reqPath = requestPath(req);
    const isBusinessesRoute = /\/businesses\/[^/]/.test(reqPath);
    if (params?.id && isBusinessesRoute && params.id !== req.businessId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }

    return true;
  }
}

export const CurrentBusinessId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<TenantRequest>();
    return req.businessId;
  },
);

export const CurrentTenant = CurrentBusinessId;

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const req = ctx.switchToHttp().getRequest<TenantRequest>();
    return req.user;
  },
);

export const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): unknown => {
    const req = ctx.switchToHttp().getRequest<TenantRequest>();
    return req.membership;
  },
);
