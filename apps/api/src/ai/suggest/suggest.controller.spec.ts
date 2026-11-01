import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  MessageDeliveryStatus,
  MessageDirection,
  SenderType,
  type FeatureFlag,
  type Message,
  type PrismaClient,
} from "@prisma/client";

import { PERMISSIONS_KEY } from "../../platform/security/permissions";
import type { OrchestratorService, TurnResult } from "../orchestrator/orchestrator.service";
import { SuggestController } from "./suggest.controller";
import { SuggestService, type RealtimeSuggestNotifier } from "./suggest.service";

interface MockDb {
  conversations: Map<string, any>;
  featureFlags: Map<string, Partial<FeatureFlag>>;
  messages: (Message & { attachments?: unknown[] })[];
}

describe("On-demand AI draft suggestion API (`/conversations/:id/suggest`) (T-AI-08)", () => {
  let controller: SuggestController;
  let service: SuggestService;
  let mockPrisma: PrismaClient;
  let executeTurnMock: jest.Mock;
  let emitMessageNewMock: jest.Mock;
  let emitConversationSuggestionMock: jest.Mock;
  let mockRealtime: RealtimeSuggestNotifier;
  let db: MockDb;

  const tenantA = "11111111-1111-4111-a111-111111111111";
  const tenantB = "22222222-2222-4222-a222-222222222222";
  const conversationId1 = "aaaa1111-1111-4111-a111-111111111111";
  const conversationId2 = "bbbb2222-2222-4222-a222-222222222222";
  const complaintConvId = "cccc3333-3333-4333-a333-333333333333";
  const refundConvId = "dddd4444-4444-4444-a444-444444444444";
  const channelAccountId1 = "eeee5555-5555-4555-a555-555555555555";

  beforeEach(() => {
    db = {
      conversations: new Map(),
      featureFlags: new Map(),
      messages: [],
    };

    // Seed normal active conversation
    db.conversations.set(conversationId1, {
      id: conversationId1,
      business_id: tenantA,
      channel_account_id: channelAccountId1,
      status: "HUMAN_HANDLING",
      ai_enabled: false,
      escalation_reason: null,
      last_intent: "product_inquiry",
      handoff_context: null,
      business: {
        id: tenantA,
        settings: {},
      },
    });

    // Seed tenantB conversation
    db.conversations.set(conversationId2, {
      id: conversationId2,
      business_id: tenantB,
      channel_account_id: null,
      status: "HUMAN_REQUIRED",
      ai_enabled: false,
      escalation_reason: null,
      last_intent: "order_status",
      handoff_context: null,
      business: {
        id: tenantB,
        settings: {},
      },
    });

    // Seed complaint conversation
    db.conversations.set(complaintConvId, {
      id: complaintConvId,
      business_id: tenantA,
      channel_account_id: channelAccountId1,
      status: "HUMAN_REQUIRED",
      ai_enabled: false,
      escalation_reason: "complaint",
      last_intent: "complaint",
      handoff_context: {
        trigger: "COMPLAINT_OR_DISPUTE",
        escalationReason: "complaint",
      },
      business: {
        id: tenantA,
        settings: {},
      },
    });

    // Seed refund conversation
    db.conversations.set(refundConvId, {
      id: refundConvId,
      business_id: tenantA,
      channel_account_id: channelAccountId1,
      status: "HUMAN_HANDLING",
      ai_enabled: false,
      escalation_reason: "refund_request",
      last_intent: "refund",
      handoff_context: null,
      business: {
        id: tenantA,
        settings: {},
      },
    });

    // Mock Inbound Customer Message
    db.messages.push({
      id: "msg-inbound-1",
      business_id: tenantA,
      conversation_id: conversationId1,
      channel_account_id: channelAccountId1,
      direction: MessageDirection.inbound,
      sender_type: SenderType.customer,
      sender_user_id: null,
      content: "3andkom taille M fl robe noire ?",
      content_type: "text",
      external_message_id: "ext-1",
      idempotency_key: "inbound-key-1",
      ai_metadata: null,
      delivery_status: MessageDeliveryStatus.delivered,
      created_at: new Date(Date.now() - 60000),
    });

    // Setup Mock Prisma
    mockPrisma = {
      conversation: {
        findFirst: jest.fn(({ where }: { where: { id: string; business_id: string } }) => {
          const conv = db.conversations.get(where.id);
          if (conv?.business_id === where.business_id) {
            return Promise.resolve(conv);
          }
          return Promise.resolve(null);
        }),
      },
      featureFlag: {
        findFirst: jest.fn(
          ({
            where,
          }: {
            where: { business_id?: string | null; feature: string; enabled?: boolean };
          }) => {
            const key = `${where.business_id ?? "global"}:${where.feature}`;
            const flag = db.featureFlags.get(key);
            return Promise.resolve(flag ?? null);
          },
        ),
      },
      message: {
        findFirst: jest.fn(
          ({
            where,
            orderBy,
          }: {
            where: {
              business_id: string;
              conversation_id: string;
              direction?: MessageDirection;
              delivery_status?: MessageDeliveryStatus;
            };
            orderBy?: { created_at: "desc" | "asc" };
          }) => {
            const matching = db.messages.filter(
              (m) =>
                m.business_id === where.business_id &&
                m.conversation_id === where.conversation_id &&
                (!where.direction || m.direction === where.direction) &&
                (!where.delivery_status || m.delivery_status === where.delivery_status),
            );
            if (orderBy?.created_at === "desc") {
              matching.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
            }
            return Promise.resolve(matching[0] ?? null);
          },
        ),
        create: jest.fn(
          ({
            data,
          }: {
            data: {
              business_id: string;
              conversation_id: string;
              channel_account_id?: string | null;
              direction: MessageDirection;
              sender_type: SenderType;
              content: string;
              delivery_status: MessageDeliveryStatus;
              idempotency_key: string;
              ai_metadata?: Record<string, unknown>;
            };
            include?: { attachments?: boolean };
          }) => {
            const newMsg = {
              id: `msg-${Date.now()}-${Math.random()}`,
              ...data,
              sender_user_id: null,
              content_type: "text" as any,
              external_message_id: null,
              created_at: new Date(),
              attachments: [],
            };
            db.messages.push(newMsg as any);
            return Promise.resolve(newMsg as unknown as Message);
          },
        ),
        findUnique: jest.fn(({ where }: { where: { id?: string; idempotency_key?: string } }) => {
          const match = db.messages.find(
            (m) =>
              (where.id && m.id === where.id) ||
              (where.idempotency_key && m.idempotency_key === where.idempotency_key),
          );
          return Promise.resolve(match ?? null);
        }),
        deleteMany: jest.fn(
          ({
            where,
          }: {
            where: {
              business_id?: string;
              conversation_id?: string;
              delivery_status?: MessageDeliveryStatus;
            };
          }) => {
            const countBefore = db.messages.length;
            db.messages = db.messages.filter(
              (m) =>
                !(
                  (!where.business_id || m.business_id === where.business_id) &&
                  (!where.conversation_id || m.conversation_id === where.conversation_id) &&
                  (!where.delivery_status || m.delivery_status === where.delivery_status)
                ),
            );
            const countDeleted = countBefore - db.messages.length;
            return Promise.resolve({ count: countDeleted });
          },
        ),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<Message>;
            include?: { attachments?: boolean };
          }) => {
            const idx = db.messages.findIndex((m) => m.id === where.id);
            if (idx >= 0) {
              const updated = { ...db.messages[idx], ...data } as Message;
              db.messages[idx] = updated;
              return Promise.resolve(updated);
            }
            return Promise.resolve(null);
          },
        ),
      },
    } as unknown as PrismaClient;

    // Mock Orchestrator
    const defaultTurnResult: TurnResult = {
      response: "Oui disponible en taille M au prix de 89 TND.",
      deliveryIntent: "draft",
      toolsCalled: ["catalog_search"],
      groundingPassed: true,
      intendedTransition: null,
      usage: {
        provider: "openai",
        model: "gpt-5.6-luna",
        tokensInput: 120,
        tokensOutput: 45,
        estimatedCostUsd: 0.00045,
      },
      decisionTraceId: "trace-suggest-1",
    };

    executeTurnMock = jest.fn().mockResolvedValue(defaultTurnResult);
    const mockOrchestrator = {
      executeTurn: executeTurnMock,
    };

    // Mock Realtime
    emitMessageNewMock = jest.fn();
    emitConversationSuggestionMock = jest.fn();
    mockRealtime = {
      emitMessageNew: emitMessageNewMock,
      emitConversationSuggestion: emitConversationSuggestionMock,
    };

    service = new SuggestService(
      mockOrchestrator as unknown as OrchestratorService,
      mockPrisma,
      mockRealtime,
    );
    controller = new SuggestController(service);
  });

  describe("Technical Contract & HTTP 202 Endpoint", () => {
    it("On-Demand Draft: Generates AI suggestion draft in timeline with 202 Accepted.", async () => {
      const response = await controller.suggest(tenantA, conversationId1);

      expect(response).toBeDefined();
      expect(response.conversationId).toBe(conversationId1);
      expect(response.jobId).toMatch(new RegExp(`^${conversationId1}:suggest:`));

      // Verify draft generation in background/service
      const draft = await service.generateDraft(tenantA, conversationId1, response.jobId);
      expect(draft).toBeDefined();
      expect(draft?.delivery_status).toBe(MessageDeliveryStatus.draft);
      expect(draft?.sender_type).toBe(SenderType.ai);
      expect(draft?.content).toBe("Oui disponible en taille M au prix de 89 TND.");

      // Check orchestrator was invoked in mode: 'suggest'
      expect(executeTurnMock).toHaveBeenCalledWith(
        conversationId1,
        "3andkom taille M fl robe noire ?",
        expect.objectContaining({
          businessId: tenantA,
          mode: "suggest",
        }),
      );

      // Check realtime events were emitted
      expect(emitMessageNewMock).toHaveBeenCalledWith(tenantA, conversationId1, draft);
      expect(emitConversationSuggestionMock).toHaveBeenCalledWith(
        tenantA,
        conversationId1,
        expect.objectContaining({
          messageId: draft?.id,
          content: draft?.content,
        }),
      );
    });

    it("Complaint Block (409): Returns 409 Conflict if thread is in complaint status.", async () => {
      await expect(controller.suggest(tenantA, complaintConvId)).rejects.toThrow(ConflictException);

      try {
        await controller.suggest(tenantA, complaintConvId);
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ConflictException);
        const conflictErr = err as ConflictException;
        expect(conflictErr.getResponse()).toEqual({
          error: {
            code: "conflict",
            message:
              "AI draft suggestions are suppressed during active complaints or refund disputes",
          },
        });
      }
    });

    it("Complaint Block (409): Returns 409 Conflict if thread is in refund dispute status.", async () => {
      await expect(controller.suggest(tenantA, refundConvId)).rejects.toThrow(ConflictException);
    });
  });

  describe("Quota & Feature Flags (403 ai_paused)", () => {
    it("returns 403 Forbidden with code `ai_paused` if business settings have ai_paused = true", async () => {
      const conv = db.conversations.get(conversationId1);
      conv.business.settings = { ai_paused: true };

      await expect(controller.suggest(tenantA, conversationId1)).rejects.toThrow(
        ForbiddenException,
      );

      try {
        await controller.suggest(tenantA, conversationId1);
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const forbiddenErr = err as ForbiddenException;
        expect(forbiddenErr.getResponse()).toEqual({
          error: {
            code: "ai_paused",
            message: "AI capabilities are paused for this workspace",
          },
        });
      }
    });

    it("returns 403 Forbidden with code `ai_paused` if tenant feature flag ai_paused is enabled", async () => {
      db.featureFlags.set(`${tenantA}:ai_paused`, {
        business_id: tenantA,
        feature: "ai_paused",
        enabled: true,
      });

      await expect(controller.suggest(tenantA, conversationId1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("returns 403 Forbidden with code `ai_paused` if global feature flag ai_paused is enabled", async () => {
      db.featureFlags.set("global:ai_paused", {
        business_id: null,
        feature: "ai_paused",
        enabled: true,
      });

      await expect(controller.suggest(tenantA, conversationId1)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("Multi-Tenant Isolation & Input Validation", () => {
    it("returns 404 NotFound if conversation does not exist", async () => {
      await expect(
        controller.suggest(tenantA, "99999999-9999-4999-a999-999999999999"),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns 404 NotFound if conversation belongs to another tenant (cross-tenant isolation)", async () => {
      // tenantA tries to access conversationId2 which belongs to tenantB
      await expect(controller.suggest(tenantA, conversationId2)).rejects.toThrow(NotFoundException);
    });

    it("returns 400 BadRequest if businessId or conversationId is empty", async () => {
      await expect(controller.suggest("", conversationId1)).rejects.toThrow(BadRequestException);
      await expect(controller.suggest(tenantA, "")).rejects.toThrow(BadRequestException);
    });
  });

  describe("Safety & Invariants (No Auto-Send / Grounding Failure)", () => {
    it("does not create a draft message if grounding fails or orchestrator returns empty response", async () => {
      executeTurnMock.mockResolvedValueOnce({
        response: null,
        deliveryIntent: "none",
        toolsCalled: [],
        groundingPassed: false,
        usage: {
          provider: "openai",
          model: "gpt-5.6-luna",
          tokensInput: 50,
          tokensOutput: 0,
          estimatedCostUsd: 0,
        },
      });

      const initialCount = db.messages.length;
      const draft = await service.generateDraft(tenantA, conversationId1);

      expect(draft).toBeNull();
      expect(db.messages.length).toBe(initialCount);
      expect(emitMessageNewMock).not.toHaveBeenCalled();
    });

    it("verifies controller has @RequirePermission('inbox.write') decorator", () => {
      const suggestHandler = Reflect.get(SuggestController.prototype, "suggest") as object;
      const metadata = Reflect.getMetadata(PERMISSIONS_KEY, suggestHandler);
      expect(metadata).toEqual(["inbox.write"]);
    });
  });

  describe("Conversation State Validation", () => {
    it("rejects suggestion request on non-human-handling statuses with 409 Conflict", async () => {
      const disallowedStatuses = [
        "RESOLVED",
        "NEW",
        "AI_ACTIVE",
        "ORDER_INTENT_DETECTED",
        "ORDER_CONFIRMED",
      ];
      const conv = db.conversations.get(conversationId1);

      for (const status of disallowedStatuses) {
        conv.status = status;
        await expect(controller.suggest(tenantA, conversationId1)).rejects.toThrow(
          ConflictException,
        );

        try {
          await controller.suggest(tenantA, conversationId1);
        } catch (err: unknown) {
          expect(err).toBeInstanceOf(ConflictException);
          const conflictErr = err as ConflictException;
          expect((conflictErr.getResponse() as any).error.code).toBe("invalid_conversation_state");
        }
      }
    });

    it("accepts suggestion request on HUMAN_REQUIRED and HUMAN_HANDLING statuses", async () => {
      const conv = db.conversations.get(conversationId1);

      conv.status = "HUMAN_HANDLING";
      await expect(controller.suggest(tenantA, conversationId1)).resolves.toBeDefined();

      conv.status = "HUMAN_REQUIRED";
      await expect(controller.suggest(tenantA, conversationId1)).resolves.toBeDefined();
    });
  });

  describe("Multilingual Arabic / Derja / French Complaint & Refund Suppression", () => {
    it("suppresses suggestions for Tunisian Arabizi complaint keywords (tachki, floussi, mouch 3ajebni)", async () => {
      const arabiziConvId = "arabizi-conv-1";
      db.conversations.set(arabiziConvId, {
        id: arabiziConvId,
        business_id: tenantA,
        channel_account_id: channelAccountId1,
        status: "HUMAN_REQUIRED",
        ai_enabled: false,
        escalation_reason: "mouch 3ajebni el produit w nheb floussi",
        last_intent: "complaint",
        handoff_context: null,
        business: { id: tenantA, settings: {} },
      });

      await expect(controller.suggest(tenantA, arabiziConvId)).rejects.toThrow(ConflictException);
    });

    it("suppresses suggestions for Arabic script complaint keywords (شكوى, استرجاع)", async () => {
      const arabicConvId = "arabic-conv-1";
      db.conversations.set(arabicConvId, {
        id: arabicConvId,
        business_id: tenantA,
        channel_account_id: channelAccountId1,
        status: "HUMAN_REQUIRED",
        ai_enabled: false,
        escalation_reason: "شكوى بخصوص تأخر الطلب واسترجاع المبلغ",
        last_intent: "complaint",
        handoff_context: null,
        business: { id: tenantA, settings: {} },
      });

      await expect(controller.suggest(tenantA, arabicConvId)).rejects.toThrow(ConflictException);
    });

    it("suppresses suggestions for canonical escalation reasons (payment_issue, return_exchange)", async () => {
      const returnConvId = "return-conv-1";
      db.conversations.set(returnConvId, {
        id: returnConvId,
        business_id: tenantA,
        channel_account_id: channelAccountId1,
        status: "HUMAN_REQUIRED",
        ai_enabled: false,
        escalation_reason: "return_exchange",
        last_intent: "return_inquiry",
        handoff_context: { also_matched: ["return_exchange"] },
        business: { id: tenantA, settings: {} },
      });

      await expect(controller.suggest(tenantA, returnConvId)).rejects.toThrow(ConflictException);
    });
  });

  describe("Turn Freshness, Empty Inbound & Draft Deduplication", () => {
    it("gracefully aborts if there is no customer inbound message", async () => {
      const emptyConvId = "empty-conv-1";
      db.conversations.set(emptyConvId, {
        id: emptyConvId,
        business_id: tenantA,
        channel_account_id: channelAccountId1,
        status: "HUMAN_HANDLING",
        ai_enabled: false,
        escalation_reason: null,
        last_intent: "greeting",
        handoff_context: null,
        business: { id: tenantA, settings: {} },
      });

      const draft = await service.generateDraft(tenantA, emptyConvId);
      expect(draft).toBeNull();
      expect(executeTurnMock).not.toHaveBeenCalledWith(emptyConvId, "", expect.anything());
    });

    it("skips suggestion if human agent has already replied after customer inbound turn", async () => {
      // Add human outbound reply that is newer than customer inbound message
      db.messages.push({
        id: "msg-human-outbound-1",
        business_id: tenantA,
        conversation_id: conversationId1,
        channel_account_id: channelAccountId1,
        direction: MessageDirection.outbound,
        sender_type: SenderType.human,
        sender_user_id: "user-1",
        content: "Bonjour, oui c'est bien disponible !",
        content_type: "text",
        external_message_id: "ext-out-1",
        idempotency_key: "outbound-1",
        ai_metadata: null,
        delivery_status: MessageDeliveryStatus.sent,
        created_at: new Date(Date.now() - 10000), // More recent than inbound (60000 ms ago)
      });

      const draft = await service.generateDraft(tenantA, conversationId1);
      expect(draft).toBeNull();
    });

    it("supersedes and cleans up previous unapproved drafts on new suggestion request", async () => {
      // First generation creates draft-1
      const draft1 = await service.generateDraft(tenantA, conversationId1, "job-super-1");
      expect(draft1).toBeDefined();
      const draftsAfterFirst = db.messages.filter(
        (m) =>
          m.conversation_id === conversationId1 &&
          m.delivery_status === MessageDeliveryStatus.draft,
      );
      expect(draftsAfterFirst.length).toBe(1);
      expect(draftsAfterFirst[0]?.content).toBe("Oui disponible en taille M au prix de 89 TND.");

      // Second generation creates draft-2 and supersedes draft-1
      executeTurnMock.mockResolvedValueOnce({
        response: "Nouvelle suggestion mise à jour.",
        deliveryIntent: "draft",
        toolsCalled: [],
        groundingPassed: true,
        usage: {
          provider: "openai",
          model: "gpt-5.6-luna",
          tokensInput: 100,
          tokensOutput: 30,
          estimatedCostUsd: 0.0003,
        },
      });

      const draft2 = await service.generateDraft(tenantA, conversationId1, "job-super-2");
      expect(draft2).toBeDefined();
      expect(draft2?.content).toBe("Nouvelle suggestion mise à jour.");

      const draftsAfterSecond = db.messages.filter(
        (m) =>
          m.conversation_id === conversationId1 &&
          m.delivery_status === MessageDeliveryStatus.draft,
      );
      // Invariant: exactly 1 active unapproved draft exists
      expect(draftsAfterSecond.length).toBe(1);
      expect(draftsAfterSecond[0]?.content).toBe("Nouvelle suggestion mise à jour.");
    });

    it("returns existing draft idempotently when invoked with the same jobId", async () => {
      const draft1 = await service.generateDraft(tenantA, conversationId1, "job-idemp-1");
      expect(draft1).toBeDefined();

      const draft2 = await service.generateDraft(tenantA, conversationId1, "job-idemp-1");
      expect(draft2).toBeDefined();
      expect(draft2?.id).toBe(draft1?.id);
    });

    it("executes within ConversationLockService withLock when lock service is provided", async () => {
      const mockLockService = {
        withLock: jest.fn(
          (
            _b: string,
            _c: string,
            fn: (token: string) => Promise<Message | null>,
          ): Promise<Message | null> => fn("mock-lock-token-123"),
        ),
      };

      const lockedService = new SuggestService(
        { executeTurn: executeTurnMock } as unknown as OrchestratorService,
        mockPrisma,
        mockRealtime,
        mockLockService as any,
      );

      const draft = await lockedService.generateDraft(tenantA, conversationId1, "job-lock-1");
      expect(draft).toBeDefined();
      expect(mockLockService.withLock).toHaveBeenCalledWith(
        tenantA,
        conversationId1,
        expect.any(Function),
        expect.objectContaining({ ttlMs: 30000 }),
      );
      expect(executeTurnMock).toHaveBeenCalledWith(
        conversationId1,
        expect.any(String),
        expect.objectContaining({
          lockToken: "mock-lock-token-123",
        }),
      );
    });

    it("enqueues to BullMQ queue and processes via processJob", async () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue({ id: "job-bull-1" }),
      };

      const queuedService = new SuggestService(
        { executeTurn: executeTurnMock } as unknown as OrchestratorService,
        mockPrisma,
        mockRealtime,
        undefined,
        mockQueue as any,
      );

      const res = await queuedService.requestSuggestion(tenantA, conversationId1);
      expect(res.jobId).toBeDefined();
      expect(mockQueue.add).toHaveBeenCalledWith(
        "generate_suggestion",
        expect.objectContaining({
          businessId: tenantA,
          conversationId: conversationId1,
        }),
        expect.any(Object),
      );

      // Verify processJob execution
      const jobResult = await queuedService.processJob({
        id: "job-bull-1",
        name: "generate_suggestion",
        data: {
          businessId: tenantA,
          conversationId: conversationId1,
          jobId: res.jobId,
        },
      } as any);

      expect(jobResult).toBeDefined();
      expect(jobResult?.delivery_status).toBe(MessageDeliveryStatus.draft);
    });

    it("does not suppress suggestion on clean escalation reason and benign product inquiries", async () => {
      const normalConv = db.conversations.get(conversationId1);
      normalConv.escalation_reason = null;
      normalConv.last_intent = "product_inquiry";
      normalConv.handoff_context = null;

      expect(service.isComplaintOrRefund(normalConv)).toBe(false);
      await expect(controller.suggest(tenantA, conversationId1)).resolves.toBeDefined();
    });
  });
});
