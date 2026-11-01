import * as crypto from "node:crypto";

import { REALTIME_EVENTS, REALTIME_ROOMS } from "@app/shared";

import { RealtimeGateway } from "./realtime.gateway";
import { RealtimeService } from "./realtime.service";

describe("Realtime WebSocket gateway & rooms (Socket.IO) (T-CONV-06)", () => {
  const testSecret = "test-jwt-secret-key-32-chars-long!";
  const testUserId = "11111111-1111-4111-8111-111111111111";
  const testBusinessId = "22222222-2222-4222-8222-222222222222";
  const testConversationId = "33333333-3333-4333-8333-333333333333";

  let prismaMock: any;
  let gateway: RealtimeGateway;
  let service: RealtimeService;

  function createAccessToken(
    userId: string,
    secret: string = testSecret,
    expiresInSec = 3600,
    typ = "access",
    iss = "aisales",
    aud = "access",
  ): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        sub: userId,
        typ,
        iss,
        aud,
        iat: now,
        exp: now + expiresInSec,
      }),
    ).toString("base64url");

    const sig = crypto
      .createHmac("sha256", secret)
      .update(`${header}.${payload}`)
      .digest("base64url");

    return `${header}.${payload}.${sig}`;
  }

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = testSecret;

    prismaMock = {
      businessMember: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      conversation: {
        findFirst: jest.fn(),
      },
    };

    gateway = new RealtimeGateway(prismaMock);
    service = new RealtimeService(gateway);
  });

  describe("Authenticated Connection & Handshake", () => {
    it("Authenticated Connection: Valid JWT establishes WebSocket connection.", async () => {
      const validToken = createAccessToken(testUserId);
      prismaMock.businessMember.findFirst.mockResolvedValue({
        id: "bm-1",
        user_id: testUserId,
        business_id: testBusinessId,
        removed_at: null,
        business: { id: testBusinessId, deleted_at: null },
      });

      const socketHandshake = {
        handshake: {
          auth: { token: validToken, businessId: testBusinessId },
        },
      };

      const authData = await gateway.authenticateSocket(socketHandshake);

      expect(authData).toBeDefined();
      expect(authData.user.id).toBe(testUserId);
      expect(authData.businessId).toBe(testBusinessId);
      expect(prismaMock.businessMember.findFirst).toHaveBeenCalledWith({
        where: {
          user_id: testUserId,
          business_id: testBusinessId,
          removed_at: null,
          business: { deleted_at: null },
        },
        include: { business: true },
      });
    });

    it("Authenticates when token is provided in Authorization Bearer header", async () => {
      const validToken = createAccessToken(testUserId);
      prismaMock.businessMember.findFirst.mockResolvedValue({
        id: "bm-1",
        user_id: testUserId,
        business_id: testBusinessId,
        removed_at: null,
        business: { id: testBusinessId, deleted_at: null },
      });

      const socketHandshake = {
        handshake: {
          headers: {
            authorization: `Bearer ${validToken}`,
            "x-business-id": testBusinessId,
          },
        },
      };

      const authData = await gateway.authenticateSocket(socketHandshake);
      expect(authData.user.id).toBe(testUserId);
      expect(authData.businessId).toBe(testBusinessId);
    });

    it("Defaults to single active membership if businessId is omitted", async () => {
      const validToken = createAccessToken(testUserId);
      prismaMock.businessMember.findMany.mockResolvedValue([
        {
          id: "bm-1",
          user_id: testUserId,
          business_id: testBusinessId,
          removed_at: null,
          business: { id: testBusinessId, deleted_at: null },
        },
      ]);

      const socketHandshake = {
        handshake: {
          auth: { token: validToken },
        },
      };

      const authData = await gateway.authenticateSocket(socketHandshake);
      expect(authData.businessId).toBe(testBusinessId);
    });

    it("Rejects if businessId omitted and user has multiple active memberships", async () => {
      const validToken = createAccessToken(testUserId);
      prismaMock.businessMember.findMany.mockResolvedValue([
        { id: "bm-1", business_id: "biz-1" },
        { id: "bm-2", business_id: "biz-2" },
      ]);

      const socketHandshake = {
        handshake: {
          auth: { token: validToken },
        },
      };

      await expect(gateway.authenticateSocket(socketHandshake)).rejects.toThrow(
        "businessId is required when user belongs to multiple businesses",
      );
    });
  });

  describe("Unauthenticated Reject (401)", () => {
    it("Unauthenticated Reject (401): Invalid token rejects connection handshake.", async () => {
      const invalidToken = "invalid.jwt.token";

      const socketHandshake = {
        handshake: {
          auth: { token: invalidToken, businessId: testBusinessId },
        },
      };

      await expect(gateway.authenticateSocket(socketHandshake)).rejects.toThrow(
        "Unauthorized: Invalid or expired access token",
      );
    });

    it("Rejects connection when token is completely missing", async () => {
      const socketHandshake = {
        handshake: {
          auth: {},
        },
      };

      await expect(gateway.authenticateSocket(socketHandshake)).rejects.toThrow(
        "Unauthorized: Missing access token",
      );
    });

    it("Rejects connection when token is expired", async () => {
      const expiredToken = createAccessToken(testUserId, testSecret, -100);

      const socketHandshake = {
        handshake: {
          auth: { token: expiredToken },
        },
      };

      await expect(gateway.authenticateSocket(socketHandshake)).rejects.toThrow(
        "Unauthorized: Invalid or expired access token",
      );
    });

    it("Rejects connection with Forbidden if user has no membership in business", async () => {
      const validToken = createAccessToken(testUserId);
      prismaMock.businessMember.findFirst.mockResolvedValue(null);

      const socketHandshake = {
        handshake: {
          auth: { token: validToken, businessId: testBusinessId },
        },
      };

      await expect(gateway.authenticateSocket(socketHandshake)).rejects.toThrow(
        "Forbidden: Access to this business is forbidden",
      );
    });
  });

  describe("Tenant Room Isolation & Occupancy", () => {
    let mockSocket: any;
    let joinedRooms: Set<string>;
    let leftRooms: Set<string>;

    beforeEach(() => {
      joinedRooms = new Set();
      leftRooms = new Set();

      mockSocket = {
        data: {
          user: { id: testUserId, sub: testUserId },
          businessId: testBusinessId,
        },
        join: jest.fn().mockImplementation((room: string) => {
          joinedRooms.add(room);
          return Promise.resolve();
        }),
        leave: jest.fn().mockImplementation((room: string) => {
          leftRooms.add(room);
          return Promise.resolve();
        }),
        disconnect: jest.fn(),
        on: jest.fn(),
      };
    });

    it("Tenant Room: Events broadcast strictly within tenant room.", async () => {
      // Connect socket -> automatically joins tenant and user rooms
      await gateway.handleConnection(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith(REALTIME_ROOMS.tenant(testBusinessId));
      expect(mockSocket.join).toHaveBeenCalledWith(REALTIME_ROOMS.business(testBusinessId));
      expect(mockSocket.join).toHaveBeenCalledWith(REALTIME_ROOMS.user(testUserId));
    });

    it("Allows joining conversation room only when conversation belongs to tenant", async () => {
      prismaMock.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        business_id: testBusinessId,
      });

      const joined = await gateway.handleThreadOpen(mockSocket, {
        conversationId: testConversationId,
      });

      expect(joined).toBe(true);
      expect(mockSocket.join).toHaveBeenCalledWith(REALTIME_ROOMS.conversation(testConversationId));
      expect(mockSocket.join).toHaveBeenCalledWith(REALTIME_ROOMS.conv(testConversationId));
    });

    it("Rejects joining conversation room if conversation belongs to another tenant", async () => {
      prismaMock.conversation.findFirst.mockResolvedValue(null);

      const joined = await gateway.handleThreadOpen(mockSocket, {
        conversationId: "foreign-conv-id",
      });

      expect(joined).toBe(false);
      expect(mockSocket.join).not.toHaveBeenCalledWith(
        REALTIME_ROOMS.conversation("foreign-conv-id"),
      );
      expect(mockSocket.disconnect).not.toHaveBeenCalled(); // per spec §12.1, don't disconnect
    });

    it("Leaves conversation room on thread:close", () => {
      gateway.handleThreadClose(mockSocket, { conversationId: testConversationId });

      expect(mockSocket.leave).toHaveBeenCalledWith(
        REALTIME_ROOMS.conversation(testConversationId),
      );
      expect(mockSocket.leave).toHaveBeenCalledWith(REALTIME_ROOMS.conv(testConversationId));
    });
  });

  describe("RealtimeService Event Emission Dispatchers", () => {
    let mockIo: any;
    let emittedEvents: { room: string; event: string; payload: any }[];

    beforeEach(() => {
      emittedEvents = [];
      mockIo = {
        to: jest.fn().mockImplementation((room: string) => ({
          emit: jest.fn().mockImplementation((event: string, payload: any) => {
            emittedEvents.push({ room, event, payload });
          }),
        })),
        in: jest.fn().mockImplementation(() => ({
          disconnectSockets: jest.fn(),
        })),
        use: jest.fn(),
        on: jest.fn(),
        close: jest.fn(),
      };

      gateway.setServer(mockIo);
    });

    it("Emits message.new to tenant and conversation rooms", () => {
      const message = { id: "msg-1", content: "Hello world" };
      service.emitMessageNew(testBusinessId, testConversationId, message);

      expect(emittedEvents).toContainEqual({
        room: REALTIME_ROOMS.tenant(testBusinessId),
        event: REALTIME_EVENTS.MESSAGE_NEW,
        payload: { conversationId: testConversationId, message },
      });
      expect(emittedEvents).toContainEqual({
        room: REALTIME_ROOMS.conversation(testConversationId),
        event: REALTIME_EVENTS.MESSAGE_NEW,
        payload: { conversationId: testConversationId, message },
      });
    });

    it("Emits message.updated event", () => {
      const message = { id: "msg-1", deliveryStatus: "delivered" };
      service.emitMessageUpdated(testBusinessId, testConversationId, message);

      expect(emittedEvents).toContainEqual({
        room: REALTIME_ROOMS.tenant(testBusinessId),
        event: REALTIME_EVENTS.MESSAGE_UPDATED,
        payload: { conversationId: testConversationId, message },
      });
    });

    it("Emits conversation.status_changed event", () => {
      service.emitConversationStatusChanged(testBusinessId, testConversationId, "HUMAN_REQUIRED", {
        escalationReason: "low_confidence",
      });

      expect(emittedEvents).toContainEqual({
        room: REALTIME_ROOMS.tenant(testBusinessId),
        event: REALTIME_EVENTS.CONVERSATION_STATUS_CHANGED,
        payload: {
          conversationId: testConversationId,
          status: "HUMAN_REQUIRED",
          escalationReason: "low_confidence",
        },
      });
    });

    it("Emits conversation.assigned event", () => {
      service.emitConversationAssigned(testBusinessId, testConversationId, "rep-user-id");

      expect(emittedEvents).toContainEqual({
        room: REALTIME_ROOMS.tenant(testBusinessId),
        event: REALTIME_EVENTS.CONVERSATION_ASSIGNED,
        payload: { conversationId: testConversationId, assignedUserId: "rep-user-id" },
      });
    });

    it("Emits lead.score_updated event", () => {
      service.emitLeadScoreUpdated(testBusinessId, testConversationId, 85, "hot");

      expect(emittedEvents).toContainEqual({
        room: REALTIME_ROOMS.tenant(testBusinessId),
        event: REALTIME_EVENTS.LEAD_SCORE_UPDATED,
        payload: { conversationId: testConversationId, score: 85, temperature: "hot" },
      });
    });

    it("Emits notification.new event to user and tenant", () => {
      const notif = { id: "notif-1", type: "ORDER_REQUEST", title: "New Order" };
      service.emitNotificationNew(testBusinessId, testUserId, notif);

      expect(emittedEvents).toContainEqual({
        room: REALTIME_ROOMS.user(testUserId),
        event: REALTIME_EVENTS.NOTIFICATION_NEW,
        payload: { businessId: testBusinessId, userId: testUserId, notification: notif },
      });
    });

    it("Disconnects user sockets across user room", () => {
      service.disconnectUserSockets(testUserId);
      expect(mockIo.in).toHaveBeenCalledWith(REALTIME_ROOMS.user(testUserId));
    });
  });
});
