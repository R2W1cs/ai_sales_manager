import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";

import { env } from "@app/shared/server";

import { prisma } from "../lib/prisma";
import { extractBearerToken, verifyAccessToken } from "../platform/security/jwt";
import type { TenantRequest } from "../platform/security/tenant.guard";

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TenantRequest>();
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException({
        error: { code: "unauthorized", message: "Missing access token" },
      });
    }

    let userId: string;
    try {
      userId = verifyAccessToken(token, env.BETTER_AUTH_SECRET).sub;
    } catch {
      throw new UnauthorizedException({
        error: { code: "unauthorized", message: "Invalid or expired access token" },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, platform_admin: true },
    });
    // platform_admin is stored on the user, not on a shop membership.
    if (!user?.platform_admin) {
      throw new ForbiddenException({
        error: { code: "forbidden", message: "Platform admin access is required" },
      });
    }

    req.user = { id: user.id, sub: user.id };
    return true;
  }
}
