import type { Server as HttpServer } from "node:http";
import type { Server as HttpsServer } from "node:https";

import type { OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { Injectable, Optional } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { ServerOptions, Socket as BaseSocket } from "socket.io";
import { Server } from "socket.io";

import {
  REALTIME_EVENTS,
  REALTIME_ROOMS,
  ThreadClosePayloadSchema,
  ThreadOpenPayloadSchema,
} from "@app/shared";
import { env } from "@app/shared/server";

import { auth as betterAuth, fromNodeHeaders } from "../auth";
import { prisma as defaultPrisma } from "../lib/prisma";
import { InjectPrisma, type PrismaClient } from "../platform/core/prisma.token";
import { extractBearerToken, verifyAccessToken } from "../platform/security/jwt";

export interface AuthenticatedSocketUser {
  id: string;
  sub: string;
}

export interface SocketData {
  user?: AuthenticatedSocketUser;
  businessId?: string;
  membership?: unknown;
}

export interface SocketAuthData {
  user: AuthenticatedSocketUser;
  businessId: string;
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

  constructor(
    @Optional() @InjectPrisma() prismaClient?: PrismaClient,
    @Optional() private readonly httpAdapterHost?: HttpAdapterHost,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Automatically attach Socket.IO server to HTTP server on application bootstrap.
   */
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
  }

  /**
   * Set or attach a Socket.IO Server instance.
   */
  setServer(io: Server<RealtimeEventsMap, RealtimeEventsMap, RealtimeEventsMap, SocketData>): void {
    this.io = io;
    this.setupMiddleware(io);
  }

  /**
   * Attach Socket.IO to an existing HTTP server.
   */
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

  /**
   * Setup authentication middleware and connection lifecycle handlers.
   */
  setupMiddleware(
    io: Server<RealtimeEventsMap, RealtimeEventsMap, RealtimeEventsMap, SocketData>,
  ): void {
    // 1. Handshake authentication middleware
    if (typeof io.use === "function") {
      io.use((socket, next) => {
        void this.authenticateSocket(socket)
          .then((authData) => {
            socket.data.user = authData.user;
            socket.data.businessId = authData.businessId;
            socket.data.membership = authData.membership;
            next();
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : "Authentication failed";
            next(new Error(message));
          });
      });
    }

    // 2. Connection event handling
    if (typeof io.on === "function") {
      io.on("connection", (socket: Socket) => {
        void this.handleConnection(socket);
      });
    }
  }

  /**
   * Authenticate socket connection via JWT and resolve tenant membership.
   */
  async authenticateSocket(socket: {
    handshake: {
      auth?: Record<string, unknown>;
      headers?: Record<string, string | string[] | undefined>;
      query?: Record<string, string | string[] | undefined>;
    };
  }): Promise<SocketAuthData> {
    const auth = socket.handshake.auth ?? {};
    const headers = socket.handshake.headers ?? {};
    const query = socket.handshake.query ?? {};

    // 1. Extract optional business ID from handshake
    let businessId: string | undefined;
    if (typeof auth.businessId === "string" && auth.businessId) {
      businessId = auth.businessId.trim();
    } else if (typeof headers["x-business-id"] === "string" && headers["x-business-id"]) {
      businessId = headers["x-business-id"].trim();
    } else if (Array.isArray(headers["x-business-id"]) && headers["x-business-id"][0]) {
      businessId = headers["x-business-id"][0].trim();
    } else if (typeof query.businessId === "string" && query.businessId) {
      businessId = query.businessId.trim();
    }

    // 2. Extract token
    let token: string | undefined;
    if (typeof auth.token === "string" && auth.token) {
      token = auth.token;
    } else if (typeof auth.accessToken === "string" && auth.accessToken) {
      token = auth.accessToken;
    } else if (typeof headers.authorization === "string") {
      token = extractBearerToken(headers.authorization);
    } else if (typeof query.token === "string" && query.token) {
      token = query.token;
    }

    if (!token && !headers.cookie) {
      throw new Error("Unauthorized: Missing access token");
    }

    let userId: string | undefined;

    // Try Better Auth session verification first (from cookie or headers)
    try {
      const session = await betterAuth.api.getSession({
        headers: fromNodeHeaders(headers),
      });
      if (session?.user.id) {
        userId = session.user.id;
        if (!businessId && session.session.activeOrganizationId) {
          businessId = session.session.activeOrganizationId;
        }
      }
    } catch {
      // Continue to token resolution
    }

    // If session not found via cookie, try token lookup (session token or JWT)
    if (!userId && token) {
      try {
        const dbSession = await this.prisma.session.findUnique({
          where: { token },
        });
        if (dbSession && dbSession.expiresAt > new Date()) {
          userId = dbSession.userId;
          if (!businessId && dbSession.activeOrganizationId) {
            businessId = dbSession.activeOrganizationId;
          }
        }
      } catch {
        // continue
      }
      if (!userId) {
        try {
          const claims = verifyAccessToken(token, env.BETTER_AUTH_SECRET);
          userId = claims.sub;
        } catch {
          throw new Error("Unauthorized: Invalid or expired access token");
        }
      }
    }

    if (!userId) {
      throw new Error("Unauthorized: Missing access token");
    }

    // 4. Verify tenant membership
    if (businessId) {
      const membership = await this.prisma.businessMember.findFirst({
        where: {
          user_id: userId,
          business_id: businessId,
          removed_at: null,
          business: {
            deleted_at: null,
          },
        },
        include: {
          business: true,
        },
      });

      if (!membership) {
        throw new Error("Forbidden: Access to this business is forbidden");
      }

      return {
        user: { id: userId, sub: userId },
        businessId,
        membership,
      };
    }

    // If businessId header/auth was omitted, resolve from active memberships
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
      },
    });

    if (memberships.length === 0) {
      throw new Error("Forbidden: User is not a member of any active business");
    }

    if (memberships.length > 1) {
      throw new Error(
        "BadRequest: businessId is required when user belongs to multiple businesses",
      );
    }

    const single = memberships[0];
    if (!single) {
      throw new Error("Forbidden: User is not a member of any active business");
    }

    return {
      user: { id: userId, sub: userId },
      businessId: single.business_id,
      membership: single,
    };
  }

  /**
   * Handle authenticated socket connection and join tenant & user rooms.
   */
  async handleConnection(socket: Socket): Promise<void> {
    const businessId = socket.data.businessId;
    const user = socket.data.user;

    if (!businessId || !user) {
      socket.disconnect(true);
      return;
    }

    // Join tenant rooms
    await socket.join(REALTIME_ROOMS.tenant(businessId));
    await socket.join(REALTIME_ROOMS.business(businessId));

    // Join user room
    await socket.join(REALTIME_ROOMS.user(user.id));

    // Register occupancy event listeners
    socket.on(REALTIME_EVENTS.THREAD_OPEN, (payload: unknown) => {
      void this.handleThreadOpen(socket, payload);
    });

    socket.on(REALTIME_EVENTS.THREAD_CLOSE, (payload: unknown) => {
      this.handleThreadClose(socket, payload);
    });
  }

  /**
   * Handle thread:open occupancy event. Validates tenant ownership before joining room.
   */
  async handleThreadOpen(socket: Socket, payload: unknown): Promise<boolean> {
    const parsed = ThreadOpenPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return false;
    }

    const { conversationId } = parsed.data;
    const businessId = socket.data.businessId;

    if (!businessId) {
      return false;
    }

    // Verify conversation belongs to authenticated business
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
      // Per spec §12.1: Unauthorized -> ignore (do not error-disconnect socket)
      return false;
    }

    await socket.join(REALTIME_ROOMS.conversation(conversationId));
    await socket.join(REALTIME_ROOMS.conv(conversationId));
    return true;
  }

  /**
   * Handle thread:close occupancy event. Leaves conversation rooms.
   */
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
   * Emit an event to a specific room.
   */
  emitToRoom(room: string, event: string, payload: unknown): void {
    this.io?.to(room).emit(event, payload);
  }

  /**
   * Emit an event strictly to a tenant room.
   */
  emitToTenant(businessId: string, event: string, payload: unknown): void {
    this.emitToRoom(REALTIME_ROOMS.tenant(businessId), event, payload);
    this.emitToRoom(REALTIME_ROOMS.business(businessId), event, payload);
  }

  /**
   * Emit an event to a user-specific room.
   */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.emitToRoom(REALTIME_ROOMS.user(userId), event, payload);
  }

  /**
   * Emit an event to a conversation room.
   */
  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    this.emitToRoom(REALTIME_ROOMS.conversation(conversationId), event, payload);
    this.emitToRoom(REALTIME_ROOMS.conv(conversationId), event, payload);
  }

  /**
   * Forcefully disconnect all sockets in a room (e.g. on membership removal or password reset).
   */
  disconnectSocketsInRoom(room: string): void {
    if (!this.io) return;
    try {
      this.io.in(room).disconnectSockets(true);
    } catch {
      // Ignore if adapter disconnect fails
    }
  }

  /**
   * Forcefully disconnect all sockets belonging to a specific user.
   */
  disconnectUserSockets(userId: string): void {
    this.disconnectSocketsInRoom(REALTIME_ROOMS.user(userId));
  }

  /**
   * Forcefully disconnect all sockets for a user in a specific business workspace.
   */
  disconnectUserFromBusiness(businessId: string, userId: string): void {
    if (!this.io) return;
    try {
      const userRoom = REALTIME_ROOMS.user(userId);
      const businessRoom = REALTIME_ROOMS.business(businessId);
      const sockets = this.io.sockets.adapter.rooms.get(userRoom);
      if (sockets) {
        for (const socketId of sockets) {
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket) {
            void socket.leave(businessRoom);
          }
        }
      }
    } catch {
      // Ignore if adapter disconnect fails
    }
  }

  onModuleDestroy(): void {
    if (this.io) {
      void this.io.close();
    }
  }
}
