import type { CanActivate, ExecutionContext } from "@nestjs/common";
import {
  BadRequestException,
  createParamDecorator,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";

import { env } from "@app/shared/server";

import { auth } from "../../auth/better-auth/better-auth";
import { fromNodeHeaders } from "../../auth/better-auth/fastify-adapter";
import { prisma } from "../../lib/prisma";
import { type HttpRequest, requestPath } from "../core/http";
import { InjectPrisma, type PrismaClient } from "../core/prisma.token";
import { extractBearerToken, verifyAccessToken } from "./jwt";

export interface AuthenticatedUser {
  id: string;
  sub: string;
  [key: string]: unknown;
}

export interface TenantRequestContext {
  businessId: string;
  user: AuthenticatedUser;
  membership?: unknown;
  business?: unknown;
}

/**
 * Request augmented with the verified tenant context.
 *
 * `businessId` is always resolved from a server-verified membership lookup.
 * Never read a tenant id straight off the client.
 */
export interface TenantRequest extends HttpRequest {
  user?: AuthenticatedUser;
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

    // 1. Authenticate user if not already attached
    let userId: string | undefined = req.user?.id ?? req.user?.sub;

    if (!userId) {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(req.headers),
        });
        if (session?.user.id) {
          userId = session.user.id;
          req.user = {
            id: session.user.id,
            sub: session.user.id,
            email: session.user.email,
            name: session.user.name,
          };
          if (session.session.activeOrganizationId) {
            // Carried on the request rather than written back into
            // `req.headers`: the active organisation comes from the verified
            // session, and mutating inbound headers made a server-derived
            // value indistinguishable from a client-supplied one.
            req.sessionBusinessId = session.session.activeOrganizationId;
          }
        }
      } catch {
        // continue to Bearer token check
      }
    }

    if (!userId) {
      const rawAccessToken = extractBearerToken(req.headers.authorization);
      if (!rawAccessToken) {
        throw new UnauthorizedException({
          error: {
            code: "unauthorized",
            message: "Missing access token",
          },
        });
      }

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

    // 2. Resolve tenant from X-Business-Id (13 §2.4), falling back to the
    // organisation the verified session marked active. Either way the id is
    // authorised below against `business_members` before it is trusted.
    const rawHeader = req.headers["x-business-id"];
    const headerValue = Array.isArray(rawHeader)
      ? rawHeader[0]?.trim()
      : typeof rawHeader === "string"
        ? rawHeader.trim()
        : undefined;
    const businessIdHeader = headerValue || req.sessionBusinessId;

    if (businessIdHeader) {
      // Load membership: business_members for (user_id, business_id) with removed_at IS NULL and businesses.deleted_at IS NULL
      const membership = await this.prisma.businessMember.findFirst({
        where: {
          user_id: userId,
          business_id: businessIdHeader,
          removed_at: null,
          business: {
            deleted_at: null,
          },
        },
        include: {
          business: true,
          role: {
            include: {
              role_permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      // Else 403 forbidden (do not leak whether the id exists)
      if (!membership) {
        throw new ForbiddenException({
          error: {
            code: "forbidden",
            message: "Access to this business is forbidden",
          },
        });
      }

      req.businessId = membership.business_id;
      req.tenantId = membership.business_id;
      req.membership = membership;
      req.business = membership.business;
    } else {
      // Header is omitted:
      // exactly one active membership -> use it; zero -> 403 no_business; more than one -> 400 business_required
      const memberships = await this.prisma.businessMember.findMany({
        where: {
          user_id: userId,
          removed_at: null,
          business: {
            deleted_at: null,
          },
        },
        include: {
          business: true,
          role: {
            include: {
              role_permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      if (memberships.length === 0) {
        throw new ForbiddenException({
          error: {
            code: "no_business",
            message: "User is not a member of any active business",
          },
        });
      }

      if (memberships.length > 1) {
        throw new BadRequestException({
          error: {
            code: "business_required",
            message: "X-Business-Id header is required when user belongs to multiple businesses",
            details: { hint: "pick_business" },
          },
        });
      }

      const singleMembership = memberships[0];
      if (!singleMembership) {
        throw new ForbiddenException({
          error: {
            code: "no_business",
            message: "User is not a member of any active business",
          },
        });
      }

      req.businessId = singleMembership.business_id;
      req.tenantId = singleMembership.business_id;
      req.membership = singleMembership;
      req.business = singleMembership.business;
    }

    // 3. Path :businessId or /businesses/:id verification (13 §2.4, 17 §4)
    const params = req.params as Record<string, string | undefined> | undefined;
    if (params?.businessId && params.businessId !== req.businessId) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "Path business ID does not match resolved tenant",
        },
      });
    }

    // Check :id on /businesses/:id routes (17 §4 rule 2).
    // Uses `requestPath`, not `req.url`: Fastify has no `request.path`, and the
    // raw url carries the query string, which would corrupt this match.
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
