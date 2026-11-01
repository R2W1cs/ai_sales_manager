import { NotFoundException } from "@nestjs/common";
import type { Conversation, ConversationStatus, ConversationStatusEvent } from "@prisma/client";

import {
  InvalidTransitionException,
  LEGAL_TRANSITIONS,
  PendingOrderBlocksCloseException,
  PendingOrderBlocksResumeException,
  StateMachineService,
} from "./state-machine.service";

describe("Conversation state machine & legal transitions engine (T-CONV-03)", () => {
  let service: StateMachineService;
  let mockPrisma: {
    conversation: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    conversationStatusEvent: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    order: {
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const mockBusinessId = "11111111-1111-1111-1111-111111111111";
  const mockConversationId = "22222222-2222-2222-2222-222222222222";
  const mockUserId = "33333333-3333-3333-3333-333333333333";

  const allStatuses: ConversationStatus[] = [
    "NEW",
    "AI_ACTIVE",
    "ORDER_INTENT_DETECTED",
    "HUMAN_REQUIRED",
    "HUMAN_HANDLING",
    "ORDER_CONFIRMED",
    "RESOLVED",
  ];

  const buildMockConversation = (overrides?: Partial<Conversation>): Conversation =>
    ({
      id: mockConversationId,
      business_id: mockBusinessId,
      customer_id: "44444444-4444-4444-4444-444444444444",
      channel_account_id: "55555555-5555-5555-5555-555555555555",
      source: "instagram",
      external_thread_id: "ig_thread_123",
      status: "NEW",
      ai_enabled: true,
      assigned_user_id: null,
      last_intent: null,
      escalation_reason: null,
      handoff_priority: null,
      handoff_context: null,
      handoff_at: null,
      handoff_completed_at: null,
      summary: null,
      collected_fields: null,
      snoozed_until: null,
      lead_score: 50,
      lead_temperature: "warm",
      lead_score_factors: null,
      lead_scored_at: new Date(),
      last_message_at: new Date(),
      last_message_preview: "Hello",
      staff_read_at: null,
      is_test: false,
      whatsapp_window_expires_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    }) as unknown as Conversation;

  beforeEach(() => {
    mockPrisma = {
      conversation: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      conversationStatusEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation(async (arg: unknown) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg) as Promise<unknown[]>;
        }
        if (typeof arg === "function") {
          const result: unknown = await arg(mockPrisma);
          return result;
        }
        return arg;
      }),
    };

    service = new StateMachineService(mockPrisma as any);
  });

  describe("Pure Transition Matrix Definition", () => {
    it("matches 14_SYSTEM_DESIGN.md §3.1 legal transitions specification", () => {
      expect(LEGAL_TRANSITIONS.NEW).toEqual(["AI_ACTIVE", "RESOLVED"]);
      expect(LEGAL_TRANSITIONS.AI_ACTIVE).toEqual([
        "ORDER_INTENT_DETECTED",
        "HUMAN_REQUIRED",
        "RESOLVED",
      ]);
      expect(LEGAL_TRANSITIONS.ORDER_INTENT_DETECTED).toEqual(["HUMAN_REQUIRED", "RESOLVED"]);
      expect(LEGAL_TRANSITIONS.HUMAN_REQUIRED).toEqual([
        "HUMAN_HANDLING",
        "ORDER_CONFIRMED",
        "AI_ACTIVE",
        "RESOLVED",
      ]);
      expect(LEGAL_TRANSITIONS.HUMAN_HANDLING).toEqual([
        "ORDER_CONFIRMED",
        "AI_ACTIVE",
        "RESOLVED",
      ]);
      expect(LEGAL_TRANSITIONS.ORDER_CONFIRMED).toEqual(["RESOLVED"]);
      expect(LEGAL_TRANSITIONS.RESOLVED).toEqual([]);
    });

    it("evaluates isLegalTransition accurately for all possible 49 pairs", () => {
      let legalCount = 0;
      let illegalCount = 0;

      for (const from of allStatuses) {
        for (const to of allStatuses) {
          const isLegal = service.isLegalTransition(from, to);
          const shouldBeLegal = LEGAL_TRANSITIONS[from].includes(to);

          expect(isLegal).toBe(shouldBeLegal);
          if (isLegal) {
            legalCount++;
          } else {
            illegalCount++;
          }
        }
      }

      // Exactly 15 legal directed edges in the system design matrix
      expect(legalCount).toBe(15);
      // Exactly 34 illegal transitions (7*7 - 15 = 34)
      expect(illegalCount).toBe(34);
    });

    it("returns destination states via getLegalTransitions", () => {
      expect(service.getLegalTransitions("NEW")).toEqual(["AI_ACTIVE", "RESOLVED"]);
      expect(service.getLegalTransitions("RESOLVED")).toEqual([]);
    });
  });

  describe("Legal Transitions: All valid state changes succeed and record status events", () => {
    const legalEdges: {
      from: ConversationStatus;
      to: ConversationStatus;
    }[] = [
      { from: "NEW", to: "AI_ACTIVE" },
      { from: "NEW", to: "RESOLVED" },
      { from: "AI_ACTIVE", to: "ORDER_INTENT_DETECTED" },
      { from: "AI_ACTIVE", to: "HUMAN_REQUIRED" },
      { from: "AI_ACTIVE", to: "RESOLVED" },
      { from: "ORDER_INTENT_DETECTED", to: "HUMAN_REQUIRED" },
      { from: "ORDER_INTENT_DETECTED", to: "RESOLVED" },
      { from: "HUMAN_REQUIRED", to: "HUMAN_HANDLING" },
      { from: "HUMAN_REQUIRED", to: "ORDER_CONFIRMED" },
      { from: "HUMAN_REQUIRED", to: "AI_ACTIVE" },
      { from: "HUMAN_REQUIRED", to: "RESOLVED" },
      { from: "HUMAN_HANDLING", to: "ORDER_CONFIRMED" },
      { from: "HUMAN_HANDLING", to: "AI_ACTIVE" },
      { from: "HUMAN_HANDLING", to: "RESOLVED" },
      { from: "ORDER_CONFIRMED", to: "RESOLVED" },
    ];

    for (const edge of legalEdges) {
      it(`succeeds for legal transition ${edge.from} -> ${edge.to}`, async () => {
        const initial = buildMockConversation({ status: edge.from });
        mockPrisma.conversation.findFirst.mockResolvedValue(initial);

        const expectedUpdated = buildMockConversation({
          status: edge.to,
          ai_enabled:
            edge.to === "AI_ACTIVE"
              ? true
              : edge.to === "HUMAN_REQUIRED" || edge.to === "HUMAN_HANDLING"
                ? false
                : initial.ai_enabled,
        });

        const expectedEvent: ConversationStatusEvent = {
          id: "event-uuid",
          business_id: mockBusinessId,
          conversation_id: mockConversationId,
          from_status: edge.from,
          to_status: edge.to,
          escalation_reason: null,
          actor_type: "system",
          actor_user_id: null,
          is_test: false,
          created_at: new Date(),
        };

        mockPrisma.conversationStatusEvent.create.mockResolvedValue(expectedEvent);
        mockPrisma.conversation.update.mockResolvedValue(expectedUpdated);

        const result = await service.transition({
          conversationId: mockConversationId,
          toState: edge.to,
          businessId: mockBusinessId,
        });

        expect(result.fromStatus).toBe(edge.from);
        expect(result.toStatus).toBe(edge.to);
        expect(result.conversation.status).toBe(edge.to);
        expect(result.statusEvent.to_status).toBe(edge.to);

        expect(mockPrisma.conversationStatusEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              business_id: mockBusinessId,
              conversation_id: mockConversationId,
              from_status: edge.from,
              to_status: edge.to,
            }),
          }),
        );
      });
    }
  });

  describe("Illegal Transitions (409): Illegal state changes throw 409 Conflict", () => {
    it("throws InvalidTransitionException (409 Conflict) for all 34 illegal transition pairs", async () => {
      for (const from of allStatuses) {
        for (const to of allStatuses) {
          if (!LEGAL_TRANSITIONS[from].includes(to)) {
            const initial = buildMockConversation({ status: from });
            mockPrisma.conversation.findFirst.mockResolvedValue(initial);

            await expect(
              service.transition({
                conversationId: mockConversationId,
                toState: to,
                businessId: mockBusinessId,
              }),
            ).rejects.toThrow(InvalidTransitionException);
          }
        }
      }
    });

    it("has response code 409 and error code 'invalid_transition'", async () => {
      const initial = buildMockConversation({ status: "RESOLVED" });
      mockPrisma.conversation.findFirst.mockResolvedValue(initial);

      try {
        await service.transition(mockConversationId, "AI_ACTIVE");
        fail("Expected transition to throw InvalidTransitionException");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(InvalidTransitionException);
        const exc = err as InvalidTransitionException;
        expect(exc.getStatus()).toBe(409);
        expect(exc.getResponse()).toEqual({
          error: {
            code: "invalid_transition",
            message: "Invalid conversation status transition from 'RESOLVED' to 'AI_ACTIVE'",
          },
        });
      }
    });

    it("rejects self-transitions (e.g. AI_ACTIVE -> AI_ACTIVE)", async () => {
      const initial = buildMockConversation({ status: "AI_ACTIVE" });
      mockPrisma.conversation.findFirst.mockResolvedValue(initial);

      await expect(
        service.transition({
          conversationId: mockConversationId,
          toState: "AI_ACTIVE",
        }),
      ).rejects.toThrow(InvalidTransitionException);
    });
  });

  describe("Audit Trail: Every transition records actor and reason", () => {
    it("records AI actor type", async () => {
      const initial = buildMockConversation({ status: "AI_ACTIVE" });
      mockPrisma.conversation.findFirst.mockResolvedValue(initial);
      mockPrisma.conversationStatusEvent.create.mockResolvedValue({
        id: "evt-1",
        actor_type: "ai",
        actor_user_id: null,
      });
      mockPrisma.conversation.update.mockResolvedValue({
        ...initial,
        status: "HUMAN_REQUIRED",
      });

      await service.transition({
        conversationId: mockConversationId,
        toState: "HUMAN_REQUIRED",
        actor: "AI",
        reason: "Customer requested human agent",
      });

      expect(mockPrisma.conversationStatusEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actor_type: "ai",
            actor_user_id: null,
            escalation_reason: "Customer requested human agent",
          }),
        }),
      );
    });

    it("records HUMAN / USER actor type with user id", async () => {
      const initial = buildMockConversation({ status: "HUMAN_REQUIRED" });
      mockPrisma.conversation.findFirst.mockResolvedValue(initial);
      mockPrisma.conversationStatusEvent.create.mockResolvedValue({
        id: "evt-2",
        actor_type: "user",
        actor_user_id: mockUserId,
      });
      mockPrisma.conversation.update.mockResolvedValue({
        ...initial,
        status: "HUMAN_HANDLING",
      });

      await service.transition(
        mockConversationId,
        "HUMAN_HANDLING",
        { type: "HUMAN", userId: mockUserId },
        "Agent takeover from inbox",
      );

      expect(mockPrisma.conversationStatusEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actor_type: "user",
            actor_user_id: mockUserId,
            escalation_reason: "Agent takeover from inbox",
          }),
        }),
      );
    });

    it("records SYSTEM actor type when actor is omitted", async () => {
      const initial = buildMockConversation({ status: "ORDER_CONFIRMED" });
      mockPrisma.conversation.findFirst.mockResolvedValue(initial);
      mockPrisma.conversationStatusEvent.create.mockResolvedValue({
        id: "evt-3",
        actor_type: "system",
        actor_user_id: null,
      });
      mockPrisma.conversation.update.mockResolvedValue({
        ...initial,
        status: "RESOLVED",
      });

      await service.transition(
        mockConversationId,
        "RESOLVED",
        undefined,
        "Auto-closed due to inactivity",
      );

      expect(mockPrisma.conversationStatusEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actor_type: "system",
            actor_user_id: null,
            escalation_reason: "Auto-closed due to inactivity",
          }),
        }),
      );
    });

    it("preserves is_test flag on status event log", async () => {
      const initial = buildMockConversation({
        status: "NEW",
        is_test: true,
      });
      mockPrisma.conversation.findFirst.mockResolvedValue(initial);
      mockPrisma.conversationStatusEvent.create.mockResolvedValue({
        id: "evt-test",
        is_test: true,
      });
      mockPrisma.conversation.update.mockResolvedValue({
        ...initial,
        status: "AI_ACTIVE",
      });

      await service.transition({
        conversationId: mockConversationId,
        toState: "AI_ACTIVE",
      });

      expect(mockPrisma.conversationStatusEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            is_test: true,
          }),
        }),
      );
    });
  });

  describe("Invariants, State Flags & Handoff Timestamps", () => {
    it("disables ai_enabled and sets handoff_at when entering HUMAN_REQUIRED", async () => {
      const initial = buildMockConversation({
        status: "AI_ACTIVE",
        ai_enabled: true,
      });
      mockPrisma.conversation.findFirst.mockResolvedValue(initial);
      mockPrisma.conversationStatusEvent.create.mockResolvedValue({
        id: "evt-handoff",
      });
      mockPrisma.conversation.update.mockResolvedValue({
        ...initial,
        status: "HUMAN_REQUIRED",
        ai_enabled: false,
      });

      await service.transition({
        conversationId: mockConversationId,
        toState: "HUMAN_REQUIRED",
        reason: "pricing_negotiation",
        handoffPriority: "high",
        handoffContext: { intent: "bulk_discount" },
      });

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockConversationId },
          data: expect.objectContaining({
            status: "HUMAN_REQUIRED",
            ai_enabled: false,
            escalation_reason: "pricing_negotiation",
            handoff_priority: "high",
            handoff_context: { intent: "bulk_discount" },
            handoff_at: expect.any(Date),
          }),
        }),
      );
    });

    it("disables ai_enabled and sets handoff_completed_at when transitioning HUMAN_REQUIRED -> HUMAN_HANDLING", async () => {
      const initial = buildMockConversation({
        status: "HUMAN_REQUIRED",
        ai_enabled: false,
      });
      mockPrisma.conversation.findFirst.mockResolvedValue(initial);
      mockPrisma.conversationStatusEvent.create.mockResolvedValue({
        id: "evt-takeover",
      });
      mockPrisma.conversation.update.mockResolvedValue({
        ...initial,
        status: "HUMAN_HANDLING",
        ai_enabled: false,
      });

      await service.transition(mockConversationId, "HUMAN_HANDLING");

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockConversationId },
          data: expect.objectContaining({
            status: "HUMAN_HANDLING",
            ai_enabled: false,
            handoff_completed_at: expect.any(Date),
          }),
        }),
      );
    });

    it("enables ai_enabled when resuming to AI_ACTIVE", async () => {
      const initial = buildMockConversation({
        status: "HUMAN_HANDLING",
        ai_enabled: false,
      });
      mockPrisma.conversation.findFirst.mockResolvedValue(initial);
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.conversationStatusEvent.create.mockResolvedValue({
        id: "evt-resume",
      });
      mockPrisma.conversation.update.mockResolvedValue({
        ...initial,
        status: "AI_ACTIVE",
        ai_enabled: true,
      });

      await service.transition(mockConversationId, "AI_ACTIVE");

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockConversationId },
          data: expect.objectContaining({
            status: "AI_ACTIVE",
            ai_enabled: true,
          }),
        }),
      );
    });
  });

  describe("Guardrails: Unconfirmed Orders Block Resume & Close", () => {
    it("blocks resume to AI_ACTIVE when PENDING_CONFIRMATION order exists with 409", async () => {
      const initial = buildMockConversation({ status: "HUMAN_HANDLING" });
      mockPrisma.conversation.findFirst.mockResolvedValue(initial);
      mockPrisma.order.findMany.mockResolvedValue([
        { id: "order-1", status: "PENDING_CONFIRMATION" },
      ]);

      await expect(service.transition(mockConversationId, "AI_ACTIVE")).rejects.toThrow(
        PendingOrderBlocksResumeException,
      );

      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
      expect(mockPrisma.conversationStatusEvent.create).not.toHaveBeenCalled();
    });

    it("blocks close to RESOLVED when PENDING_CONFIRMATION order exists with 409", async () => {
      const initial = buildMockConversation({ status: "HUMAN_REQUIRED" });
      mockPrisma.conversation.findFirst.mockResolvedValue(initial);
      mockPrisma.order.findMany.mockResolvedValue([
        { id: "order-2", status: "PENDING_CONFIRMATION" },
      ]);

      await expect(service.transition(mockConversationId, "RESOLVED")).rejects.toThrow(
        PendingOrderBlocksCloseException,
      );

      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
      expect(mockPrisma.conversationStatusEvent.create).not.toHaveBeenCalled();
    });
  });

  describe("Multi-Tenancy & Edge Cases", () => {
    it("throws NotFoundException when conversation does not exist", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.transition({
          conversationId: "non-existent-id",
          toState: "AI_ACTIVE",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("scopes lookup by businessId to enforce tenant isolation", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.transition({
          conversationId: mockConversationId,
          toState: "AI_ACTIVE",
          businessId: "other-business-id",
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockConversationId,
          business_id: "other-business-id",
        },
      });
    });

    it("retrieves status event history ordered by created_at", async () => {
      const mockEvents = [
        {
          id: "e1",
          conversation_id: mockConversationId,
          from_status: "NEW",
          to_status: "AI_ACTIVE",
          created_at: new Date(1000),
        },
        {
          id: "e2",
          conversation_id: mockConversationId,
          from_status: "AI_ACTIVE",
          to_status: "HUMAN_REQUIRED",
          created_at: new Date(2000),
        },
      ];

      mockPrisma.conversationStatusEvent.findMany.mockResolvedValue(mockEvents);

      const history = await service.getStatusHistory(mockConversationId, mockBusinessId);

      expect(history).toEqual(mockEvents);
      expect(mockPrisma.conversationStatusEvent.findMany).toHaveBeenCalledWith({
        where: {
          conversation_id: mockConversationId,
          business_id: mockBusinessId,
        },
        orderBy: { created_at: "asc" },
      });
    });
  });
});
