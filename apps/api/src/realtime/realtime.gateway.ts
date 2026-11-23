import type { Server as HttpServer } from "node:http";
import type { Server as HttpsServer } from "node:https";

import type { OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { HttpException, Injectable, Optional } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import Redis from "ioredis";
import type { ServerOptions, Socket as BaseSocket } from "socket.io";
import { Server } from "socket.io";

import {
  REALTIME_EVENTS,
  REALTIME_ROOMS,
  ThreadClosePayloadSchema,
  ThreadOpenPayloadSchema,
} from "@app/shared";
import { env } from "@app/shared/server";

import {
  AUTH_REVOCATION_CHANNEL,
  type AuthRevocationEvent,
  findAuthSessionById,
  publishAuthRevocation,
  registerLocalRevocationListener,
  resolveBetterAuthSession,
} from "../auth";
import { logger } from "../lib/logger";
import { prisma as defaultPrisma } from "../lib/prisma";
import { InjectPrisma, type PrismaClient } from "../platform/core/prisma.token";
import { extractBearerToken, verifyAccessToken } from "../platform/security/jwt";
import {
  assertPrivilegedMfaSession,
  resolveAuthorizedTenantMembership,
} from "../platform/security/membership-lookup";
import { isPrivilegedRole } from "../platform/security/permissions";

export interface AuthenticatedSocketUser {
  id: string;
  sub: string;
}

export interface SocketData {
  user?: AuthenticatedSocketUser;
  businessId?: string;
  role?: string;
  sessionId?: string;
  mfaVerified?: boolean;
  authStale?: boolean;
  membership?: unknown;
}

export interface SocketAuthData {
  user: AuthenticatedSocketUser;
  businessId: string;
  role?: string;
  sessionId?: string;
  mfaVerified?: boolean;
  membership?: unknown;
}

export type RealtimeEventsMap = Record<string, (...args: unknown[]) => void>;

export type Socket = BaseSocket<
  RealtimeEventsMap,
  RealtimeEventsMap,
  RealtimeEventsMap,
  SocketData
>;

@Injectable()
export class RealtimeGateway implements OnApplicationBootstrap, OnModuleDestroy {
  private io?: Server<RealtimeEventsMap, RealtimeEventsMap, RealtimeEventsMap, SocketData>;
  private readonly prisma: PrismaClient;
  private subscriber?: Redis;
  private subscriberReady = true;
  private unregisterLocalListener?: () => void;

  constructor(
    @Optional() @InjectPrisma() prismaClient?: PrismaClient,
    @Optional() private readonly httpAdapterHost?: HttpAdapterHost,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  onApplicationBootstrap(): void {
    if (this.httpAdapterHost?.httpAdapter) {
      const server = this.httpAdapterHost.httpAdapter.getHttpServer() as
        | HttpServer
        | HttpsServer
        | undefined;
      if (server && !this.io) {
        this.attach(server);
      }
    }
    this.initRevocationSubscriber();
  }

  private initRevocationSubscriber(): void {
    if (!this.unregisterLocalListener) {
      this.unregisterLocalListener = registerLocalRevocationListener((event) => {
        this.handleRevocationEvent(event);
      });
    }

    if (
      (env.NODE_ENV === "test" && process.env.ENABLE_REDIS_REVOCATION_IN_TEST !== "true") ||
      !env.REDIS_URL ||
      this.subscriber
    ) {
      return;
    }

    try {
      const sub = new Redis(env.REDIS_URL, {
        lazyConnect: false,
        maxRetriesPerRequest: null,
      });
      this.subscriber = sub;

      sub.on("ready", () => {
        this.subscriberReady = true;
        void sub.subscribe(AUTH_REVOCATION_CHANNEL).then(() => {
          void this.revalidateConnectedSockets();
        });
      });

      sub.on("error", (err) => {
        logger.warn({ err: err.message }, "Realtime revocation subscriber error");
        this.handleSubscriberDrop();
      });

      sub.on("close", () => {
        this.handleSubscriberDrop();
      });

      sub.on("end", () => {
        this.handleSubscriberDrop();
      });

      sub.on("reconnecting", () => {
        this.handleSubscriberDrop();
      });

      sub.on("message", (channel, rawMessage) => {
        if (channel !== AUTH_REVOCATION_CHANNEL) return;
        try {
          const parsed = JSON.parse(rawMessage) as AuthRevocationEvent;
          this.handleRevocationEvent(parsed);
        } catch {
          // ignore malformed event
        }
      });
    } catch (err) {
      logger.warn({ err }, "Failed to initialize Redis revocation subscriber");
      this.handleSubscriberDrop();
    }
  }

  /**
   * Fails closed when Redis Pub/Sub drops: marks all currently connected sockets
   * as `authStale` so no protected tenant/conversation events are emitted to them
   * until revalidated against PostgreSQL.
   */
  handleSubscriberDrop(): void {
    this.subscriberReady = false;
    if (!this.io) return;
    for (const socket of this.io.sockets.sockets.values()) {
      socket.data.authStale = true;
    }
  }

  /**
   * Marks subscriber healthy again and revalidates every stale socket against PostgreSQL.
   */
  async handleSubscriberRestored(): Promise<void> {
    this.subscriberReady = true;
    await this.revalidateConnectedSockets();
  }

  async revalidateConnectedSockets(): Promise<void> {
    if (!this.io) return;
    const sockets = [...this.io.sockets.sockets.values()];

    for (const socket of sockets) {
      const userId = socket.data.user?.id;
      const businessId = socket.data.businessId;
      const sessionId = socket.data.sessionId;

      if (!userId || !businessId) {
        socket.disconnect(true);
        continue;
      }

      try {
        const valid = await this.verifyLiveSocketAuthorization({
          userId,
          businessId,
          sessionId,
          expectedRole: socket.data.role,
        });

        if (!valid) {
          socket.disconnect(true);
        } else {
          socket.data.authStale = false;
        }
      } catch {
        socket.disconnect(true);
      }
    }
  }

  private async verifyLiveSocketAuthorization(params: {
    userId: string;
    businessId: string;
    sessionId?: string;
    expectedRole?: string;
  }): Promise<boolean> {
    let sessionMfaVerified = false;
    if (params.sessionId) {
      const session = await findAuthSessionById(params.sessionId, this.prisma);
      if (!session || session.userId !== params.userId || session.expiresAt <= new Date()) {
        return false;
      }
      sessionMfaVerified = Boolean(session.mfaVerified);
      if (
        Boolean(params.expectedRole && isPrivilegedRole(params.expectedRole)) &&
        !sessionMfaVerified
      ) {
        return false;
      }
    }

    try {
      const resolved = await resolveAuthorizedTenantMembership(
        this.prisma,
        params.userId,
        params.businessId,
      );
      if (params.expectedRole && resolved.roleName !== params.expectedRole) {
        return false;
      }
      if (params.sessionId && isPrivilegedRole(resolved.roleName) && !sessionMfaVerified) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  handleRevocationEvent(event: AuthRevocationEvent): void {
    if (!this.io) return;

    for (const socket of this.io.sockets.sockets.values()) {
      const sockUserId = socket.data.user?.id;
      if (sockUserId !== event.userId) continue;

      if (event.type === "member_removed" || event.type === "role_changed") {
        if (!event.businessId || socket.data.businessId === event.businessId) {
          socket.disconnect(true);
        }
        continue;
      }

      if (event.type === "mfa_changed") {
        if (event.excludeSessionId && socket.data.sessionId === event.excludeSessionId) {
          continue;
        }
        socket.disconnect(true);
        continue;
      }

      if (event.type === "session_revoked") {
        if (event.sessionId) {
          if (socket.data.sessionId === event.sessionId) {
            socket.disconnect(true);
          }
          continue;
        }
        if (event.excludeSessionId) {
          if (socket.data.sessionId !== event.excludeSessionId) {
            socket.disconnect(true);
          }
          continue;
        }
        socket.disconnect(true);
      }
    }
  }

  setServer(io: Server<RealtimeEventsMap, RealtimeEventsMap, RealtimeEventsMap, SocketData>): void {
    this.io = io;
    this.setupMiddleware(io);
  }

  attach(
    httpServer: HttpServer | HttpsServer | number,
    options?: Partial<ServerOptions>,
  ): Server<RealtimeEventsMap, RealtimeEventsMap, RealtimeEventsMap, SocketData> {
    const io = new Server<RealtimeEventsMap, RealtimeEventsMap, RealtimeEventsMap, SocketData>(
      httpServer,
      {
        path: "/socket.io",
        cors: {
          origin: "*",
          methods: ["GET", "POST"],
        },
        ...options,
      },
    );
    this.setServer(io);
    return io;
  }

  getServer():
    | Server<RealtimeEventsMap, RealtimeEventsMap, RealtimeEventsMap, SocketData>
    | undefined {
    return this.io;
  }

  setupMiddleware(
    io: Server<RealtimeEventsMap, RealtimeEventsMap, RealtimeEventsMap, SocketData>,
  ): void {
    if (typeof io.use === "function") {
      io.use((socket, next) => {
        void this.authenticateSocket(socket)
          .then((authData) => {
            socket.data.user = authData.user;
            socket.data.businessId = authData.businessId;
            socket.data.role = authData.role;
            socket.data.sessionId = authData.sessionId;
            socket.data.mfaVerified = authData.mfaVerified;
            socket.data.authStale = !this.subscriberReady;
            socket.data.membership = authData.membership;
            next();
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : "Authentication failed";
            next(new Error(message));
          });
      });
    }

    if (typeof io.on === "function") {
      io.on("connection", (socket: Socket) => {
        void this.handleConnection(socket);
      });
    }
  }

  async authenticateSocket(socket: {
    handshake: {
      auth?: Record<string, unknown>;
      headers?: Record<string, string | string[] | undefined>;
      query?: Record<string, string | string[] | undefined>;
    };
  }): Promise<SocketAuthData> {
    const handshakeAuth = socket.handshake.auth ?? {};
    const headers = socket.handshake.headers ?? {};
    const query = socket.handshake.query ?? {};

    let businessId: string | undefined;
    if (typeof handshakeAuth.businessId === "string" && handshakeAuth.businessId) {
      businessId = handshakeAuth.businessId.trim();
    } else if (typeof headers["x-business-id"] === "string" && headers["x-business-id"]) {
      businessId = headers["x-business-id"].trim();
    } else if (Array.isArray(headers["x-business-id"]) && headers["x-business-id"][0]) {
      businessId = headers["x-business-id"][0].trim();
    } else if (typeof query.businessId === "string" && query.businessId) {
      businessId = query.businessId.trim();
    }

    let token: string | undefined;
    if (typeof handshakeAuth.token === "string" && handshakeAuth.token) {
      token = handshakeAuth.token;
    } else if (typeof handshakeAuth.accessToken === "string" && handshakeAuth.accessToken) {
      token = handshakeAuth.accessToken;
    } else if (typeof headers.authorization === "string") {
      token = extractBearerToken(headers.authorization);
    } else if (typeof query.token === "string" && query.token) {
      token = query.token;
    }

    if (!token && !headers.cookie) {
      throw new Error("Unauthorized: Missing access token");
    }

    let userId: string | undefined;
    let sessionId: string | undefined;
    let mfaVerified = false;
    let twoFactorEnabled = false;
    let hasBetterAuthSession = false;

    const session = await resolveBetterAuthSession(headers);
    if (session?.user.id) {
      hasBetterAuthSession = true;
      userId = session.user.id;
      sessionId = session.session.id;
      mfaVerified = Boolean((session.session as Record<string, unknown>).mfaVerified);
      twoFactorEnabled = Boolean((session.user as Record<string, unknown>).twoFactorEnabled);
      if (!businessId && session.session.activeOrganizationId) {
        businessId = session.session.activeOrganizationId;
      }
    }

    if (!userId && token && env.NODE_ENV === "test") {
      try {
        const claims = verifyAccessToken(token, env.BETTER_AUTH_SECRET);
        userId = claims.sub;
      } catch {
        throw new Error("Unauthorized: Invalid or expired access token");
      }
    }

    if (!userId) {
      throw new Error("Unauthorized: Missing or invalid session");
    }

    try {
      const resolved = await resolveAuthorizedTenantMembership(this.prisma, userId, businessId);
      const isPrivileged = isPrivilegedRole(resolved.roleName);
      if (isPrivileged) {
        assertPrivilegedMfaSession({
          session: hasBetterAuthSession ? { mfaVerified } : undefined,
          twoFactorEnabled,
          enforceAlways: env.NODE_ENV === "production",
          enrollmentMessage: "Two-factor authentication session required",
          challengeMessage: "Two-factor authentication session required",
        });
      }

      return {
        user: { id: userId, sub: userId },
        businessId: resolved.businessId,
        role: resolved.roleName,
        sessionId,
        mfaVerified,
        membership: resolved.membershipPayload,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        const resp = error.getResponse() as { error?: { code?: string; message?: string } };
        const code = resp?.error?.code;
        if (code === "business_required") {
          throw new Error(
            "BadRequest: businessId is required when user belongs to multiple businesses",
          );
        }
        throw new Error(`Forbidden: ${resp?.error?.message ?? "Access forbidden"}`);
      }
      throw error;
    }
  }

  async handleConnection(socket: Socket): Promise<void> {
    const businessId = socket.data.businessId;
    const user = socket.data.user;

    if (!businessId || !user) {
      socket.disconnect(true);
      return;
    }

    await socket.join(REALTIME_ROOMS.tenant(businessId));
    await socket.join(REALTIME_ROOMS.business(businessId));
    await socket.join(REALTIME_ROOMS.user(user.id));

    socket.on(REALTIME_EVENTS.THREAD_OPEN, (payload: unknown) => {
      void this.handleThreadOpen(socket, payload);
    });

    socket.on(REALTIME_EVENTS.THREAD_CLOSE, (payload: unknown) => {
      this.handleThreadClose(socket, payload);
    });
  }

  async handleThreadOpen(socket: Socket, payload: unknown): Promise<boolean> {
    const parsed = ThreadOpenPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return false;
    }

    const { conversationId } = parsed.data;
    const businessId = socket.data.businessId;
    const userId = socket.data.user?.id;

    if (!businessId || !userId) {
      return false;
    }

    if (socket.data.authStale || !this.subscriberReady) {
      const valid = await this.verifyLiveSocketAuthorization({
        userId,
        businessId,
        sessionId: socket.data.sessionId,
        expectedRole: socket.data.role,
      }).catch(() => false);

      if (!valid) {
        socket.disconnect(true);
        return false;
      }
      if (this.subscriberReady) {
        socket.data.authStale = false;
      }
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        business_id: businessId,
      },
      select: {
        id: true,
      },
    });

    if (!conversation) {
      return false;
    }

    await socket.join(REALTIME_ROOMS.conversation(conversationId));
    await socket.join(REALTIME_ROOMS.conv(conversationId));
    return true;
  }

  handleThreadClose(socket: Socket, payload: unknown): void {
    const parsed = ThreadClosePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return;
    }

    const { conversationId } = parsed.data;
    void socket.leave(REALTIME_ROOMS.conversation(conversationId));
    void socket.leave(REALTIME_ROOMS.conv(conversationId));
  }

  /**
   * Emits an event to a room, refusing delivery to any socket whose authorization
   * state is stale (e.g. during Redis Pub/Sub subscriber loss).
   */
  emitToRoom(room: string, event: string, payload: unknown): void {
    if (!this.io) return;

    const adapterRooms = this.io.sockets?.adapter?.rooms;
    const socketsMap = this.io.sockets?.sockets;

    if (adapterRooms && socketsMap) {
      const roomSockets = adapterRooms.get(room);
      if (!roomSockets) return;

      for (const socketId of roomSockets) {
        const socket = socketsMap.get(socketId);
        if (!socket) continue;
        if (socket.data.authStale) {
          continue;
        }
        socket.emit(event, payload);
      }
      return;
    }

    // Fallback for mocked Socket.IO server objects in unit tests
    this.io.to(room).emit(event, payload);
  }

  emitToTenant(businessId: string, event: string, payload: unknown): void {
    this.emitToRoom(REALTIME_ROOMS.tenant(businessId), event, payload);
    this.emitToRoom(REALTIME_ROOMS.business(businessId), event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.emitToRoom(REALTIME_ROOMS.user(userId), event, payload);
  }

  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    this.emitToRoom(REALTIME_ROOMS.conversation(conversationId), event, payload);
    this.emitToRoom(REALTIME_ROOMS.conv(conversationId), event, payload);
  }

  disconnectSocketsInRoom(room: string): void {
    if (!this.io) return;
    try {
      this.io.in(room).disconnectSockets(true);
    } catch {
      // Ignore if adapter disconnect fails
    }
  }

  disconnectUserSockets(userId: string): void {
    void publishAuthRevocation({ type: "session_revoked", userId });
    this.disconnectSocketsInRoom(REALTIME_ROOMS.user(userId));
  }

  disconnectUserFromBusiness(businessId: string, userId: string): void {
    void publishAuthRevocation({ type: "member_removed", userId, businessId });
    if (!this.io) return;
    try {
      const userRoom = REALTIME_ROOMS.user(userId);
      const sockets = this.io.sockets.adapter.rooms.get(userRoom);
      if (sockets) {
        for (const socketId of sockets) {
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket && socket.data.businessId === businessId) {
            socket.disconnect(true);
          }
        }
      }
    } catch {
      // Ignore if adapter disconnect fails
    }
  }

  onModuleDestroy(): void {
    if (this.unregisterLocalListener) {
      this.unregisterLocalListener();
      this.unregisterLocalListener = undefined;
    }
    if (this.subscriber) {
      void this.subscriber.quit().catch(() => undefined);
      this.subscriber = undefined;
    }
    if (this.io) {
      void this.io.close();
    }
  }
}
