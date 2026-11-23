import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Injectable } from "@nestjs/common";

import { requireBetterAuthSession } from "../auth";
import { prisma } from "../lib/prisma";
import { assertPrivilegedMfaSession } from "../platform/security/membership-lookup";
import type { TenantRequest } from "../platform/security/tenant.guard";

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TenantRequest>();

    const session = await requireBetterAuthSession(req.headers);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, platform_admin: true, twoFactorEnabled: true },
    });

    if (!user?.platform_admin) {
      throw new ForbiddenException({
        error: { code: "forbidden", message: "Platform admin access is required" },
      });
    }

    const sessionRecord = session.session as Record<string, unknown>;
    const mfaVerified = Boolean(sessionRecord.mfaVerified);

    assertPrivilegedMfaSession({
      session: { mfaVerified },
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      enforceAlways: true,
      enrollmentMessage: "Two-factor authentication enrollment is required for platform operators.",
      challengeMessage: "A verified two-factor session is required for platform operator access.",
    });

    req.user = {
      id: user.id,
      sub: user.id,
      email: session.user.email,
      name: session.user.name,
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      platformAdmin: true,
    };
    req.session = {
      id: session.session.id,
      mfaVerified,
      activeOrganizationId: session.session.activeOrganizationId ?? null,
    };

    return true;
  }
}
