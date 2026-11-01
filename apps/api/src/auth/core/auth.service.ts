import * as crypto from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

import type { AcceptInvitationDto, LoginRequest, RegisterRequest, SessionDto } from "@app/shared";
import { AcceptInvitationSchema, LoginRequestSchema, RegisterRequestSchema } from "@app/shared";
import { env } from "@app/shared/server";

import { prisma } from "../../lib/prisma";
import { auth } from "../better-auth/better-auth";
import { fromNodeHeaders } from "../better-auth/fastify-adapter";
import { ACCESS_TOKEN_EXPIRY_SECONDS, FOURTEEN_DAYS_MS, FOURTEEN_DAYS_SECONDS } from "./refresh";

const DUMMY_ARGON2_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgqlfreSAeYFlG8qWV3R2Z0bMmDndnvgU";

interface JwtHeader {
  alg?: string;
  typ?: string;
}

export interface JwtPayload {
  sub: string;
  typ: "access" | "refresh";
  fam?: string;
  jti?: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  options: { expiresInSeconds: number; issuer?: string; audience?: string },
): string {
  const header: JwtHeader = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + options.expiresInSeconds,
    ...(options.issuer ? { iss: options.issuer } : {}),
    ...(options.audience ? { aud: options.audience } : {}),
  };

  const encHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encPayload = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${encHeader}.${encPayload}`)
    .digest("base64url");

  return `${encHeader}.${encPayload}.${signature}`;
}

export function verifyJwt(
  token: string,
  secret: string,
  options?: { issuer?: string; audience?: string; clockSkewSeconds?: number },
): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT structure");
  }

  const encHeader = parts[0];
  const encPayload = parts[1];
  const signature = parts[2];
  if (!encHeader || !encPayload || !signature) {
    throw new Error("Invalid JWT structure");
  }

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(`${encHeader}.${encPayload}`)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Invalid token signature");
  }

  const header = JSON.parse(Buffer.from(encHeader, "base64url").toString("utf8")) as JwtHeader;
  if (header.alg !== "HS256") {
    throw new Error("Unsupported algorithm");
  }

  const payload = JSON.parse(Buffer.from(encPayload, "base64url").toString("utf8")) as JwtPayload;
  const now = Math.floor(Date.now() / 1000);
  const skew = options?.clockSkewSeconds ?? 30;

  if (payload.exp && now - skew > payload.exp) {
    throw new Error("Token expired");
  }
  if (payload.iat && now + skew < payload.iat) {
    throw new Error("Token not yet active");
  }
  if (options?.issuer && payload.iss !== options.issuer) {
    throw new Error("Invalid issuer");
  }
  if (options?.audience && payload.aud !== options.audience) {
    throw new Error("Invalid audience");
  }

  return payload;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface UserSocketDisconnecter {
  disconnectUserSockets(userId: string): void;
}

@Injectable()
export class AuthService {
  private readonly prisma: PrismaClient;
  private readonly realtimeGateway?: UserSocketDisconnecter;

  constructor(
    @Optional() prismaClient?: PrismaClient,
    @Optional() realtimeGateway?: UserSocketDisconnecter,
  ) {
    this.prisma = prismaClient ?? prisma;
    this.realtimeGateway = realtimeGateway;
  }

  private get accessSecret(): string {
    return env.BETTER_AUTH_SECRET;
  }

  private get refreshSecret(): string {
    return env.BETTER_AUTH_SECRET;
  }

  /**
   * 13 §4 POST /api/v1/auth/register
   * Creates users. Does not create a business.
   * Min password 10. Duplicate email 409.
   */
  async register(
    dto: RegisterRequest,
    meta?: RequestMeta,
  ): Promise<{ session: SessionDto; refreshToken: string }> {
    const parseResult = RegisterRequestSchema.safeParse(dto);
    if (!parseResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parseResult.error.issues) {
        const path = issue.path.join(".") || "body";
        fieldErrors[path] ??= [];
        fieldErrors[path].push(issue.message);
      }
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: parseResult.error.issues[0]?.message || "Validation failed",
          details: { fields: fieldErrors },
        },
      });
    }

    const { email, password, name } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException({
        error: {
          code: "conflict",
          message: "User with this email already exists",
        },
      });
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    let user;
    let refreshJwt: string;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: name.trim(),
            password_hash: passwordHash,
          },
        });

        const familyId = crypto.randomUUID();
        const refreshTokenId = crypto.randomUUID();
        const jwt = signJwt(
          { sub: createdUser.id, typ: "refresh", fam: familyId, jti: refreshTokenId },
          this.refreshSecret,
          { expiresInSeconds: FOURTEEN_DAYS_SECONDS, issuer: "aisales", audience: "refresh" },
        );

        await tx.refreshToken.create({
          data: {
            id: refreshTokenId,
            user_id: createdUser.id,
            token_hash: hashToken(jwt),
            family_id: familyId,
            expires_at: new Date(Date.now() + FOURTEEN_DAYS_MS),
            user_agent: meta?.userAgent,
            ip: meta?.ip,
          },
        });

        return { user: createdUser, refreshJwt: jwt };
      });

      user = result.user;
      refreshJwt = result.refreshJwt;
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
        throw new ConflictException({
          error: {
            code: "conflict",
            message: "User with this email already exists",
          },
        });
      }
      throw err;
    }

    const accessToken = signJwt({ sub: user.id, typ: "access" }, this.accessSecret, {
      expiresInSeconds: ACCESS_TOKEN_EXPIRY_SECONDS,
      issuer: "aisales",
      audience: "access",
    });

    const session: SessionDto = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerifiedAt: user.email_verified_at,
        createdAt: user.createdAt,
        platformAdmin: user.platform_admin === true,
      },
      memberships: [],
      accessToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    };

    return { session, refreshToken: refreshJwt };
  }

  /**
   * 13 §4 POST /api/v1/auth/login
   * Failed login 401 with the SAME copy as unknown user.
   */
  async login(
    dto: LoginRequest,
    meta?: RequestMeta,
  ): Promise<{ session: SessionDto; refreshToken: string }> {
    const parseResult = LoginRequestSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: parseResult.error.issues[0]?.message || "Validation failed",
        },
      });
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          where: {
            removed_at: null,
            business: {
              deleted_at: null,
            },
          },
          include: {
            role: true,
          },
        },
      },
    });

    const invalidCredentialsError = new UnauthorizedException({
      error: {
        code: "unauthorized",
        message: "Invalid email or password",
      },
    });

    if (!user?.password_hash) {
      try {
        await argon2.verify(DUMMY_ARGON2_HASH, password);
      } catch {
        // ignore dummy hash verification errors
      }
      throw invalidCredentialsError;
    }

    const isMatch = await argon2.verify(user.password_hash, password).catch(() => false);

    if (!isMatch) {
      throw invalidCredentialsError;
    }

    const accessToken = signJwt({ sub: user.id, typ: "access" }, this.accessSecret, {
      expiresInSeconds: ACCESS_TOKEN_EXPIRY_SECONDS,
      issuer: "aisales",
      audience: "access",
    });

    const familyId = crypto.randomUUID();
    const refreshTokenId = crypto.randomUUID();
    const refreshJwt = signJwt(
      { sub: user.id, typ: "refresh", fam: familyId, jti: refreshTokenId },
      this.refreshSecret,
      { expiresInSeconds: FOURTEEN_DAYS_SECONDS, issuer: "aisales", audience: "refresh" },
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { last_login_at: new Date() },
      });

      await tx.refreshToken.create({
        data: {
          id: refreshTokenId,
          user_id: user.id,
          token_hash: hashToken(refreshJwt),
          family_id: familyId,
          expires_at: new Date(Date.now() + FOURTEEN_DAYS_MS),
          user_agent: meta?.userAgent,
          ip: meta?.ip,
        },
      });
    });

    const session: SessionDto = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerifiedAt: user.email_verified_at,
        createdAt: user.createdAt,
        platformAdmin: user.platform_admin === true,
      },
      memberships: user.memberships.map((m) => ({
        businessId: m.business_id,
        role: m.role.name as "owner" | "admin" | "employee",
        joinedAt: m.joined_at,
        lastActiveAt: m.last_active_at,
      })),
      accessToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    };

    return { session, refreshToken: refreshJwt };
  }

  /**
   * 13 §4, 17 §3.4 POST /api/v1/auth/refresh
   * Rotates refresh token in active family and returns new access token.
   * If reuse of revoked token is detected, revokes the whole family (401).
   */
  async refresh(
    rawRefreshToken?: string,
    meta?: RequestMeta,
  ): Promise<{ session: SessionDto; refreshToken: string }> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "Refresh token is missing",
        },
      });
    }

    let payload: JwtPayload;
    try {
      payload = verifyJwt(rawRefreshToken, this.refreshSecret, {
        issuer: "aisales",
        audience: "refresh",
      });
    } catch {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "Invalid or expired refresh token",
        },
      });
    }

    if (payload.typ !== "refresh") {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "Invalid token type",
        },
      });
    }

    const tokenHash = hashToken(rawRefreshToken);
    const tokenRow = await this.prisma.refreshToken.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!tokenRow) {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "Invalid refresh token",
        },
      });
    }

    if (tokenRow.expires_at < new Date()) {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "Refresh token expired",
        },
      });
    }

    // 17 §3.4 Reuse detection
    // Row revoked_at set -> reuse. Revoke entire family, 401. Assume theft.
    if (tokenRow.revoked_at !== null) {
      await this.prisma.refreshToken.updateMany({
        where: {
          family_id: tokenRow.family_id,
          revoked_at: null,
        },
        data: {
          revoked_at: new Date(),
        },
      });

      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "Refresh token has been revoked",
        },
      });
    }

    const newRefreshTokenId = crypto.randomUUID();
    const newRefreshJwt = signJwt(
      {
        sub: tokenRow.user_id,
        typ: "refresh",
        fam: tokenRow.family_id,
        jti: newRefreshTokenId,
      },
      this.refreshSecret,
      { expiresInSeconds: FOURTEEN_DAYS_SECONDS, issuer: "aisales", audience: "refresh" },
    );

    await this.prisma.$transaction(async (tx) => {
      // Atomic guard: update only if revoked_at is currently null
      const updated = await tx.refreshToken.updateMany({
        where: {
          id: tokenRow.id,
          revoked_at: null,
        },
        data: { revoked_at: new Date() },
      });

      if (updated.count === 0) {
        // Token was already revoked concurrently or previously!
        // Revoke the entire family due to reuse/theft detection
        await tx.refreshToken.updateMany({
          where: {
            family_id: tokenRow.family_id,
            revoked_at: null,
          },
          data: {
            revoked_at: new Date(),
          },
        });

        throw new UnauthorizedException({
          error: {
            code: "unauthorized",
            message: "Refresh token has been revoked",
          },
        });
      }

      await tx.refreshToken.create({
        data: {
          id: newRefreshTokenId,
          user_id: tokenRow.user_id,
          token_hash: hashToken(newRefreshJwt),
          family_id: tokenRow.family_id,
          expires_at: new Date(Date.now() + FOURTEEN_DAYS_MS),
          user_agent: meta?.userAgent,
          ip: meta?.ip,
        },
      });
    });

    const user = await this.prisma.user.findUnique({
      where: { id: tokenRow.user_id },
      include: {
        memberships: {
          where: {
            removed_at: null,
            business: {
              deleted_at: null,
            },
          },
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "User not found",
        },
      });
    }

    const accessToken = signJwt({ sub: user.id, typ: "access" }, this.accessSecret, {
      expiresInSeconds: ACCESS_TOKEN_EXPIRY_SECONDS,
      issuer: "aisales",
      audience: "access",
    });

    const session: SessionDto = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerifiedAt: user.email_verified_at,
        createdAt: user.createdAt,
        platformAdmin: user.platform_admin === true,
      },
      memberships: user.memberships.map((m) => ({
        businessId: m.business_id,
        role: m.role.name as "owner" | "admin" | "employee",
        joinedAt: m.joined_at,
        lastActiveAt: m.last_active_at,
      })),
      accessToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    };

    return { session, refreshToken: newRefreshJwt };
  }

  /**
   * 13 §4, 17 §3.4 POST /api/v1/auth/logout
   * Revokes refresh token family, clears better-auth sessions and cookies, and disconnects user sockets.
   */
  async logout(
    rawRefreshToken?: string,
    rawAccessToken?: string,
    sessionToken?: string,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    let userId: string | undefined;

    // 1. Better Auth session revocation via better-auth API if headers present
    if (headers) {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(headers),
        });
        if (session?.user.id) {
          userId = session.user.id;
        }
        await auth.api.signOut({
          headers: fromNodeHeaders(headers),
        });
      } catch {
        // ignore
      }
    }

    // 2. Invalidate Session row in DB if sessionToken is present
    if (sessionToken) {
      try {
        const sessionRow = await this.prisma.session.findUnique({
          where: { token: sessionToken },
        });
        if (sessionRow) {
          userId = userId ?? sessionRow.userId;
          await this.prisma.session.deleteMany({
            where: { token: sessionToken },
          });
        }
      } catch {
        // ignore
      }
    }

    // 3. Invalidate RefreshToken family if rawRefreshToken is present
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      const tokenRow = await this.prisma.refreshToken.findUnique({
        where: { token_hash: tokenHash },
      });

      if (tokenRow) {
        userId = userId ?? tokenRow.user_id;
        await this.prisma.refreshToken.updateMany({
          where: {
            family_id: tokenRow.family_id,
            revoked_at: null,
          },
          data: {
            revoked_at: new Date(),
          },
        });
      }
    }

    // 4. Access token JWT payload extraction if userId is not resolved yet
    if (rawAccessToken && !userId) {
      try {
        const payload = verifyJwt(rawAccessToken, this.accessSecret, {
          issuer: "aisales",
          audience: "access",
        });
        userId = payload.sub;
      } catch {
        // ignore
      }
    }

    // 5. Clean up all sessions for the resolved userId and disconnect realtime sockets
    if (userId) {
      try {
        await this.prisma.session.deleteMany({
          where: { userId },
        });
      } catch {
        // ignore
      }
      if (this.realtimeGateway) {
        this.realtimeGateway.disconnectUserSockets(userId);
      }
    }
  }

  /**
   * 13 §4 GET /api/v1/auth/me
   * Requires valid access token or active session. Returns current user profile and active memberships.
   */
  async me(
    rawAccessToken?: string,
    sessionToken?: string,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<SessionDto> {
    let userId: string | undefined;

    // 1. Better Auth session via request headers
    if (headers) {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(headers),
        });
        if (session?.user.id) {
          userId = session.user.id;
        }
      } catch {
        // continue
      }
    }

    // 2. JWT Bearer token
    if (!userId && rawAccessToken) {
      try {
        const payload = verifyJwt(rawAccessToken, this.accessSecret, {
          issuer: "aisales",
          audience: "access",
        });
        if (payload.typ === "access") {
          userId = payload.sub;
        }
      } catch {
        // continue to check db session token
      }
    }

    // 3. DB session token lookup
    if (!userId && (sessionToken || rawAccessToken)) {
      const lookupToken = sessionToken || rawAccessToken;
      if (lookupToken) {
        const dbSession = await this.prisma.session.findUnique({
          where: { token: lookupToken },
        });
        if (dbSession && dbSession.expiresAt > new Date()) {
          userId = dbSession.userId;
        }
      }
    }

    if (!userId) {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "Missing or invalid access token",
        },
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: {
            removed_at: null,
            business: {
              deleted_at: null,
            },
          },
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "User not found",
        },
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerifiedAt: user.email_verified_at,
        createdAt: user.createdAt,
        platformAdmin: user.platform_admin === true,
      },
      memberships: user.memberships.map((m) => ({
        businessId: m.business_id,
        role: m.role.name as "owner" | "admin" | "employee",
        joinedAt: m.joined_at,
        lastActiveAt: m.last_active_at,
      })),
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    };
  }

  private buildSessionDto(
    user: {
      id: string;
      email: string;
      name: string;
      email_verified_at: Date | null;
      createdAt: Date;
      platform_admin?: boolean;
      memberships: {
        business_id: string;
        role: { name: string };
        joined_at: Date;
        last_active_at: Date | null;
      }[];
    },
    accessToken: string,
  ): SessionDto {
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerifiedAt: user.email_verified_at,
        createdAt: user.createdAt,
        platformAdmin: user.platform_admin === true,
      },
      memberships: user.memberships.map((m) => ({
        businessId: m.business_id,
        role: m.role.name as "owner" | "admin" | "employee",
        joinedAt: m.joined_at,
        lastActiveAt: m.last_active_at,
      })),
      accessToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    };
  }

  private async fetchUserWithMemberships(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: {
            removed_at: null,
            business: { deleted_at: null },
          },
          include: { role: true },
        },
      },
    });
  }

  private issueTokens(userId: string, familyId?: string) {
    const resolvedFamilyId = familyId ?? crypto.randomUUID();
    const refreshTokenId = crypto.randomUUID();
    const refreshJwt = signJwt(
      { sub: userId, typ: "refresh", fam: resolvedFamilyId, jti: refreshTokenId },
      this.refreshSecret,
      { expiresInSeconds: FOURTEEN_DAYS_SECONDS, issuer: "aisales", audience: "refresh" },
    );
    const accessToken = signJwt({ sub: userId, typ: "access" }, this.accessSecret, {
      expiresInSeconds: ACCESS_TOKEN_EXPIRY_SECONDS,
      issuer: "aisales",
      audience: "access",
    });

    return {
      accessToken,
      refreshJwt,
      refreshTokenId,
      familyId: resolvedFamilyId,
    };
  }

  /**
   * 13 §4, 17 §3.5 POST /api/v1/auth/invitations/accept
   * Allows invited teammates to join a business workspace.
   * - Token is sha256-hashed to look up the invitation row (17 §3.5).
   * - 404 if token not found or expired.
   * - 409 if already accepted (accepted_at IS NOT NULL).
   * - For a new user: creates user with name + password_hash.
   * - For an existing user: links existing user to the membership.
   * - Role is taken from the invitation record (caller cannot choose).
   */
  async acceptInvitation(
    dto: AcceptInvitationDto,
    meta?: RequestMeta,
  ): Promise<{ session: SessionDto; refreshToken: string }> {
    // Validate input
    const parseResult = AcceptInvitationSchema.safeParse(dto);
    if (!parseResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parseResult.error.issues) {
        const path = issue.path.join(".") || "body";
        fieldErrors[path] ??= [];
        fieldErrors[path].push(issue.message);
      }
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: parseResult.error.issues[0]?.message || "Validation failed",
          details: { fields: fieldErrors },
        },
      });
    }

    const { token, name, password } = parseResult.data;
    const tokenHash = hashToken(token);

    // 1. Look up the invitation by token hash or id
    const invitation = await this.prisma.invitation.findFirst({
      where: {
        OR: [{ token_hash: tokenHash }, { id: token }],
      },
      include: {
        business: true,
        role_rel: true,
      },
    });

    // 2. 404 if not found or expired (17 §3.5 — do not leak whether id exists)
    if (!invitation || invitation.expiresAt < new Date()) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Invitation token not found or has expired",
        },
      });
    }

    // 3. 409 if already accepted
    if (invitation.accepted_at !== null || invitation.status === "accepted") {
      throw new ConflictException({
        error: {
          code: "conflict",
          message: "This invitation has already been accepted",
        },
      });
    }

    // 4. Look up existing user by email
    const normalizedEmail = invitation.email.toLowerCase().trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    const targetBusinessId = invitation.business_id || invitation.organizationId;
    let targetRoleId = invitation.role_id;
    if (!targetRoleId) {
      const defaultRole = await this.prisma.role.findFirst({
        where: { name: invitation.role || "employee" },
      });
      targetRoleId = defaultRole?.id || "";
    }

    const { userId, refreshJwt } = await this.prisma.$transaction(async (tx) => {
      let resolvedUserId: string;

      if (existingUser) {
        // Existing user joins the business
        resolvedUserId = existingUser.id;

        const existingMembership = await tx.businessMember.findUnique({
          where: {
            business_id_user_id: {
              business_id: targetBusinessId,
              user_id: existingUser.id,
            },
          },
        });

        if (!existingMembership) {
          await tx.businessMember.create({
            data: {
              business_id: targetBusinessId,
              user_id: existingUser.id,
              role_id: targetRoleId,
              invited_at: invitation.createdAt,
              joined_at: new Date(),
            },
          });
        } else if (existingMembership.removed_at !== null) {
          await tx.businessMember.update({
            where: { id: existingMembership.id },
            data: {
              role_id: targetRoleId,
              removed_at: null,
              joined_at: new Date(),
            },
          });
        }
      } else {
        // New user: name and password are required
        if (!name || !password) {
          throw new BadRequestException({
            error: {
              code: "validation_error",
              message: "Name and password are required for new user registration",
              details: {
                fields: {
                  ...(!name ? { name: ["Name is required for new users"] } : {}),
                  ...(!password ? { password: ["Password is required for new users"] } : {}),
                },
              },
            },
          });
        }

        const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

        const createdUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: name.trim(),
            password_hash: passwordHash,
          },
        });

        resolvedUserId = createdUser.id;

        await tx.businessMember.create({
          data: {
            business_id: targetBusinessId,
            user_id: createdUser.id,
            role_id: targetRoleId,
            invited_at: invitation.createdAt,
            joined_at: new Date(),
          },
        });
      }

      // Mark invitation as accepted
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { accepted_at: new Date(), status: "accepted" },
      });

      // Issue refresh token
      const {
        refreshJwt: txRefreshJwt,
        refreshTokenId,
        familyId,
      } = this.issueTokens(resolvedUserId);

      await tx.refreshToken.create({
        data: {
          id: refreshTokenId,
          user_id: resolvedUserId,
          token_hash: hashToken(txRefreshJwt),
          family_id: familyId,
          expires_at: new Date(Date.now() + FOURTEEN_DAYS_MS),
          user_agent: meta?.userAgent,
          ip: meta?.ip,
        },
      });

      return { userId: resolvedUserId, refreshJwt: txRefreshJwt };
    });

    const user = await this.fetchUserWithMemberships(userId);
    const accessToken = signJwt({ sub: user.id, typ: "access" }, this.accessSecret, {
      expiresInSeconds: ACCESS_TOKEN_EXPIRY_SECONDS,
      issuer: "aisales",
      audience: "access",
    });

    const session = this.buildSessionDto(user, accessToken);
    return { session, refreshToken: refreshJwt };
  }
}
