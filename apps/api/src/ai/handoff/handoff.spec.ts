import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";

import {
  HANDOFF_TRIGGERS,
  HandoffContextSchema,
  getDefaultActionRequired,
  getHandoffTriggerPriority,
  mapTriggerToEscalationReason,
} from "@app/shared";

import { AiModule } from "../ai.module";
import { BriefingGeneratorService } from "./briefing-generator.service";
import { HandoffService } from "./handoff.service";

describe("AI-to-Human handoff triggers engine (all 15 triggers) & briefing generator (T-HAND-01)", () => {
  let handoffService: HandoffService;
  let briefingGenerator: BriefingGeneratorService;

  // Mock PrismaClient with multi-tenant isolation
  const mockConversation = {
    id: "11111111-1111-4111-a111-111111111111",
    business_id: "bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb",
    customer_id: "cccccccc-cccc-4ccc-accc-cccccccccccc",
    channel_account_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    source: "instagram",
    status: "AI_ACTIVE",
    ai_enabled: true,
    last_intent: "product_inquiry",
    last_message_preview: "n7eb n7ki m3a agent",
    is_test: false,
    customer: {
      id: "cccccccc-cccc-4ccc-accc-cccccccccccc",
      name: "Aymen",
      phone: "+21699999999",
      channel: "instagram",
      lifecycle_stage: "qualified_lead",
    },
    channel_account: {
      id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      channel: "instagram",
    },
  };

  const mockPrisma: any = {
    conversation: {
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    conversationStatusEvent: {
      create: jest.fn(),
    },
    conversationNote: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: unknown) => Promise<unknown>)(mockPrisma);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg;
    }),
  };

  const mockRealtimeGateway = {
    emitToTenant: jest.fn(),
    emitToConversation: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BriefingGeneratorService,
        {
          provide: HandoffService,
          useFactory: (bg: BriefingGeneratorService) =>
            new HandoffService(bg, mockPrisma, mockRealtimeGateway),
          inject: [BriefingGeneratorService],
        },
      ],
    }).compile();

    briefingGenerator = module.get<BriefingGeneratorService>(BriefingGeneratorService);
    handoffService = module.get<HandoffService>(HandoffService);

    mockPrisma.conversation.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.conversation.findFirstOrThrow.mockResolvedValue({
      ...mockConversation,
      status: "HUMAN_REQUIRED",
      ai_enabled: false,
    });
  });

  describe("1. Complete Coverage: All 15 Triggers Detection", () => {
    it("verify HANDOFF_TRIGGERS enum has exactly 15 triggers", () => {
      expect(HANDOFF_TRIGGERS).toHaveLength(15);
      expect(HANDOFF_TRIGGERS).toEqual([
        "EXPLICIT_HUMAN_REQUEST",
        "COMPLEX_NEGOTIATION",
        "COMPLAINT_OR_DISPUTE",
        "RETURN_OR_REFUND",
        "CUSTOM_MODIFICATION",
        "BULK_ORDER",
        "REPEATED_CONFUSION",
        "LOW_CONFIDENCE",
        "PAYMENT_FAILURE",
        "STOCK_OUTAGE",
        "OUT_OF_SCOPE",
        "SENSITIVE_TOPIC",
        "POLICY_CONFLICT",
        "HIGH_VALUE_LEAD",
        "MANUAL_OVERRIDE",
      ]);
    });

    it("Trigger 1: EXPLICIT_HUMAN_REQUEST triggers on customer human request phrase (e.g. 'n7eb n7ki m3a agent')", () => {
      const res = handoffService.evaluateTriggers({
        message: "n7eb n7ki m3a agent",
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("EXPLICIT_HUMAN_REQUEST");
      expect(res.priority).toBe("high");
      expect(res.escalationReason).toBe("human_request");
    });

    it("Trigger 1: EXPLICIT_HUMAN_REQUEST triggers on intent 'human_request'", () => {
      const res = handoffService.evaluateTriggers({
        intent: "human_request",
        confidence: 0.95,
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("EXPLICIT_HUMAN_REQUEST");
      expect(res.priority).toBe("high");
    });

    it("Trigger 2: COMPLEX_NEGOTIATION triggers on discount requests without active rules", () => {
      const res = handoffService.evaluateTriggers({
        message: "a3melli soum behy 3aychek",
        intent: "discount_inquiry",
        businessRules: [],
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("COMPLEX_NEGOTIATION");
      expect(res.priority).toBe("high");
      expect(res.escalationReason).toBe("negotiation");
    });

    it("Trigger 3: COMPLAINT_OR_DISPUTE triggers on negative sentiment or complaint words", () => {
      const res = handoffService.evaluateTriggers({
        message: "hada ser9a w arnaque service khayeb barcha!",
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("COMPLAINT_OR_DISPUTE");
      expect(res.priority).toBe("critical");
      expect(res.escalationReason).toBe("complaint");
    });

    it("Trigger 4: RETURN_OR_REFUND triggers on refund request with critical priority", () => {
      const res = handoffService.evaluateTriggers({
        message: "nheb nrajja3 flousi remboursement svp",
        isRefund: true,
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("RETURN_OR_REFUND");
      expect(res.priority).toBe("critical");
      expect(res.escalationReason).toBe("refund_request");
    });

    it("Trigger 4: RETURN_OR_REFUND triggers on item exchange with high priority", () => {
      const res = handoffService.evaluateTriggers({
        message: "nheb nbadal taille swap size echange",
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("RETURN_OR_REFUND");
      expect(res.priority).toBe("high");
      expect(res.escalationReason).toBe("return_exchange");
    });

    it("Trigger 5: CUSTOM_MODIFICATION triggers on bespoke / out-of-catalog requests", () => {
      const res = handoffService.evaluateTriggers({
        message: "tnejjmou ta3mlouli robe sur mesure b gravure speciale?",
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("CUSTOM_MODIFICATION");
      expect(res.priority).toBe("high");
      expect(res.escalationReason).toBe("custom_order");
    });

    it("Trigger 6: BULK_ORDER triggers when quantity exceeds threshold (>= 5 units)", () => {
      const res = handoffService.evaluateTriggers({
        cart: {
          items: [{ quantity: 10, unit_price: 50 }],
          totalAmount: 500,
        },
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("BULK_ORDER");
      expect(res.priority).toBe("high");
      expect(res.escalationReason).toBe("bulk_order");
    });

    it("Trigger 7: REPEATED_CONFUSION triggers when customer or agent expresses circular confusion", () => {
      const res = handoffService.evaluateTriggers({
        consecutiveLowConfidence: 2,
        message: "ma fhemt chay men klemmek",
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("REPEATED_CONFUSION");
      expect(res.priority).toBe("normal");
      expect(res.escalationReason).toBe("low_confidence");
    });

    it("Trigger 8: LOW_CONFIDENCE triggers when classifier confidence is below threshold", () => {
      const res = handoffService.evaluateTriggers({
        intent: "product_inquiry",
        confidence: 0.45,
        aiSettings: { confidence_threshold: 0.65 },
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("LOW_CONFIDENCE");
      expect(res.priority).toBe("normal");
      expect(res.escalationReason).toBe("low_confidence");
    });

    it("Trigger 9: PAYMENT_FAILURE triggers on unverified transfer claims or payment issues", () => {
      const res = handoffService.evaluateTriggers({
        message: "b3atht el virement bancaire w hahou screenshot",
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("PAYMENT_FAILURE");
      expect(res.priority).toBe("critical");
      expect(res.escalationReason).toBe("payment_issue");
    });

    it("Trigger 10: STOCK_OUTAGE triggers on out of stock conflicts or reservation failure", () => {
      const res = handoffService.evaluateTriggers({
        stockAvailable: false,
        reservationFailed: true,
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("STOCK_OUTAGE");
      expect(res.priority).toBe("high");
      expect(res.escalationReason).toBe("inventory_conflict");
    });

    it("Trigger 11: OUT_OF_SCOPE triggers on integration failures or unsupported requests", () => {
      const res = handoffService.evaluateTriggers({
        outOfScope: true,
        integrationError: true,
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("OUT_OF_SCOPE");
      expect(res.priority).toBe("critical");
      expect(res.escalationReason).toBe("integration_failure");
    });

    it("Trigger 12: SENSITIVE_TOPIC triggers on legal threats or blocked topics", () => {
      const res = handoffService.evaluateTriggers({
        message: "I will contact my lawyer and go to the tribunal",
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("SENSITIVE_TOPIC");
      expect(res.priority).toBe("critical");
      expect(res.escalationReason).toBe("legal_sensitive");
    });

    it("Trigger 12: SENSITIVE_TOPIC triggers on merchant blocked topics list", () => {
      const res = handoffService.evaluateTriggers({
        message: "We should discuss politics and cryptocurrency",
        aiSettings: { blocked_topics: ["politics", "crypto"] },
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("SENSITIVE_TOPIC");
      expect(res.priority).toBe("critical");
    });

    it("Trigger 13: POLICY_CONFLICT triggers when contradictory business rules are detected", () => {
      const res = handoffService.evaluateTriggers({
        policyConflict: true,
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("POLICY_CONFLICT");
      expect(res.priority).toBe("normal");
      expect(res.escalationReason).toBe("policy_conflict");
    });

    it("Trigger 14: HIGH_VALUE_LEAD triggers on VIP customer when vip_auto_handoff is active", () => {
      const res = handoffService.evaluateTriggers({
        customer: { lifecycle_stage: "vip" },
        aiSettings: { vip_auto_handoff: true },
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("HIGH_VALUE_LEAD");
      expect(res.priority).toBe("critical");
      expect(res.escalationReason).toBe("vip_customer");
    });

    it("Trigger 15: MANUAL_OVERRIDE triggers on explicit manual staff intervention", () => {
      const res = handoffService.evaluateTriggers({
        manualOverride: true,
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("MANUAL_OVERRIDE");
      expect(res.priority).toBe("high");
      expect(res.escalationReason).toBe("human_request");
    });

    it("returns matched=false when no trigger condition is met", () => {
      const res = handoffService.evaluateTriggers({
        message: "3asslema, b9adech el pull noir?",
        intent: "price_question",
        confidence: 0.95,
        stockAvailable: true,
      });
      expect(res.matched).toBe(false);
      expect(res.trigger).toBeUndefined();
    });

    it("Priority arbitration: critical wins over high and records losing in alsoMatched", () => {
      const res = handoffService.evaluateTriggers({
        message: "n7eb n7ki m3a agent w flousi arnaque", // both EXPLICIT_HUMAN_REQUEST and COMPLAINT_OR_DISPUTE
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("COMPLAINT_OR_DISPUTE"); // critical wins
      expect(res.priority).toBe("critical");
      expect(res.alsoMatched).toContain("EXPLICIT_HUMAN_REQUEST");
    });

    it("Priority arbitration: high wins over normal (e.g. human request beats low confidence)", () => {
      const res = handoffService.evaluateTriggers({
        message: "passez moi un humain",
        intent: "unknown",
        confidence: 0.3,
      });
      expect(res.matched).toBe(true);
      expect(res.trigger).toBe("EXPLICIT_HUMAN_REQUEST");
      expect(res.priority).toBe("high");
      expect(res.alsoMatched).toContain("LOW_CONFIDENCE");
    });
  });

  describe("2. AI Paused & State Transition (`executeHandoff`)", () => {
    it("AI Paused: Sets `ai_enabled = false` and status = `HUMAN_REQUIRED`", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
      mockPrisma.conversation.update.mockResolvedValue({
        ...mockConversation,
        ai_enabled: false,
        status: "HUMAN_REQUIRED",
        handoff_priority: "high",
        escalation_reason: "human_request",
      });
      mockPrisma.conversationStatusEvent.create.mockResolvedValue({
        id: "event-1",
        to_status: "HUMAN_REQUIRED",
      });
      mockPrisma.conversationNote.create.mockResolvedValue({
        id: "note-1",
        body: "Briefing note content",
      });

      const result = await handoffService.executeHandoff({
        businessId: mockConversation.business_id,
        conversationId: mockConversation.id,
        trigger: "EXPLICIT_HUMAN_REQUEST",
        evaluationContext: {
          message: "n7eb n7ki m3a agent",
          intent: "human_request",
          confidence: 0.98,
        },
      });

      // 1. Verify multi-tenant search
      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockConversation.id,
          business_id: mockConversation.business_id,
        },
        include: {
          customer: true,
          channel_account: true,
        },
      });

      // 2. Verify immediate AI pause and status update with status guard
      expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: mockConversation.id,
            business_id: mockConversation.business_id,
            status: { not: "HUMAN_REQUIRED" },
          }),
          data: expect.objectContaining({
            ai_enabled: false, // 🛡️ Invariant: Immediately pauses AI turns
            status: "HUMAN_REQUIRED",
            escalation_reason: "human_request",
            handoff_priority: "high",
          }),
        }),
      );

      // 3. Verify status event transition recorded
      expect(mockPrisma.conversationStatusEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          business_id: mockConversation.business_id,
          conversation_id: mockConversation.id,
          from_status: "AI_ACTIVE",
          to_status: "HUMAN_REQUIRED",
          escalation_reason: "human_request",
          actor_type: "system",
        }),
      });

      // 4. Verify return values
      expect(result.conversation.ai_enabled).toBe(false);
      expect(result.conversation.status).toBe("HUMAN_REQUIRED");
      expect(result.briefing).toBeDefined();
      expect(result.briefing.schema_version).toBe(1);
    });

    it("emits conversation.handoff_triggered event with complete metadata", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
      mockPrisma.conversation.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.conversation.findFirstOrThrow.mockResolvedValue({
        ...mockConversation,
        ai_enabled: false,
        status: "HUMAN_REQUIRED",
      });
      mockPrisma.conversationStatusEvent.create.mockResolvedValue({ id: "e-1" });
      mockPrisma.conversationNote.create.mockResolvedValue({ id: "note-123" });

      const result = await handoffService.executeHandoff({
        businessId: mockConversation.business_id,
        conversationId: mockConversation.id,
        trigger: "PAYMENT_FAILURE",
        evaluationContext: {
          message: "b3atht virement",
        },
      });

      expect(mockRealtimeGateway.emitToTenant).toHaveBeenCalledWith(
        mockConversation.business_id,
        "conversation.handoff_triggered",
        expect.objectContaining({
          conversationId: mockConversation.id,
          businessId: mockConversation.business_id,
          trigger: "PAYMENT_FAILURE",
          escalationReason: "payment_issue",
          priority: "critical",
          noteId: "note-123",
        }),
      );

      expect(result.event).toBeDefined();
      expect(result.event.trigger).toBe("PAYMENT_FAILURE");
      expect(result.event.priority).toBe("critical");
    });

    it("Idempotency: Repeated executeHandoff on already HUMAN_REQUIRED conversation is a no-op", async () => {
      const alreadyHandoffed = {
        ...mockConversation,
        status: "HUMAN_REQUIRED",
        ai_enabled: false,
        handoff_priority: "critical",
        escalation_reason: "payment_issue",
        handoff_context: {
          schema_version: 1,
          customer: {
            id: mockConversation.customer.id,
            channel: "instagram",
            lifecycle_stage: "qualified_lead",
          },
          summary: "Existing handoff summary",
          intent: "payment_inquiry",
          confidence: 0.9,
          confidence_source: "llm",
          products_discussed: [],
          collected_fields: [],
          missing_fields: [],
          ai_recommendation: "Verify payment",
          action_required: "Verify whether payment was received",
          escalation_reason: "payment_issue",
          handoff_priority: "critical",
          also_matched: [],
          pending_order: null,
        },
      };

      const existingNote = {
        id: "existing-note-1",
        business_id: mockConversation.business_id,
        conversation_id: mockConversation.id,
        author_user_id: "system",
        body: "Existing briefing note",
      };

      mockPrisma.conversation.findFirst.mockResolvedValue(alreadyHandoffed);
      mockPrisma.conversationNote.findFirst.mockResolvedValue(existingNote);

      const result = await handoffService.executeHandoff({
        businessId: mockConversation.business_id,
        conversationId: mockConversation.id,
        trigger: "PAYMENT_FAILURE",
      });

      // Assert conversation update was NOT called
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
      // Assert new status event was NOT created
      expect(mockPrisma.conversationStatusEvent.create).not.toHaveBeenCalled();
      // Assert new note was NOT created
      expect(mockPrisma.conversationNote.create).not.toHaveBeenCalled();
      // Assert NO realtime event was re-emitted
      expect(mockRealtimeGateway.emitToTenant).not.toHaveBeenCalled();
      expect(mockRealtimeGateway.emitToConversation).not.toHaveBeenCalled();

      // Return value returns existing state
      expect(result.conversation.status).toBe("HUMAN_REQUIRED");
      expect(result.note?.id).toBe("existing-note-1");
    });

    it("Concurrency & Atomicity: Concurrent workers calling executeHandoff result in exactly 1 transition & 1 briefing note", async () => {
      // Simulate real in-memory DB state for concurrency test
      let convState = { ...mockConversation, status: "AI_ACTIVE", ai_enabled: true };
      const notesCreated: any[] = [];
      const eventsCreated: any[] = [];

      const concurrentPrisma: any = {
        conversation: {
          findFirst: jest.fn(() => Promise.resolve({ ...convState })),
          findFirstOrThrow: jest.fn(() => Promise.resolve({ ...convState })),
          updateMany: jest.fn(
            ({ data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
              if (convState.status === "HUMAN_REQUIRED") {
                return Promise.resolve({ count: 0 });
              }
              convState = { ...convState, ...data, status: "HUMAN_REQUIRED" };
              return Promise.resolve({ count: 1 });
            },
          ),
        },
        conversationStatusEvent: {
          create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
            const e = { id: `event-${eventsCreated.length + 1}`, ...data };
            eventsCreated.push(e);
            return Promise.resolve(e);
          }),
        },
        conversationNote: {
          create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
            const n = { id: `note-${notesCreated.length + 1}`, ...data };
            notesCreated.push(n);
            return Promise.resolve(n);
          }),
          findFirst: jest.fn(() => Promise.resolve(notesCreated[notesCreated.length - 1] ?? null)),
        },
        $transaction: (() => {
          let chain = Promise.resolve();
          return jest.fn((cb: (tx: any) => Promise<unknown>) => {
            const current = chain.then(() => cb(concurrentPrisma));
            chain = current.then(
              () => undefined,
              () => undefined,
            );
            return current;
          });
        })(),
      };

      const testGateway = {
        emitToTenant: jest.fn(),
        emitToConversation: jest.fn(),
      };

      const concurrentService = new HandoffService(
        briefingGenerator,
        concurrentPrisma,
        testGateway,
      );

      // Execute two workers simultaneously
      const [res1, res2] = await Promise.all([
        concurrentService.executeHandoff({
          businessId: mockConversation.business_id,
          conversationId: mockConversation.id,
          trigger: "COMPLAINT_OR_DISPUTE",
          evaluationContext: { message: "service khayeb barcha!" },
        }),
        concurrentService.executeHandoff({
          businessId: mockConversation.business_id,
          conversationId: mockConversation.id,
          trigger: "COMPLAINT_OR_DISPUTE",
          evaluationContext: { message: "service khayeb barcha!" },
        }),
      ]);

      // Both callers receive consistent final state
      expect(res1.conversation.status).toBe("HUMAN_REQUIRED");
      expect(res2.conversation.status).toBe("HUMAN_REQUIRED");

      // Exactly 1 state update happened
      expect(concurrentPrisma.conversation.updateMany).toHaveBeenCalledTimes(1);
      // Exactly 1 status event created
      expect(eventsCreated).toHaveLength(1);
      // Exactly 1 briefing note created
      expect(notesCreated).toHaveLength(1);
      // Exactly 1 realtime event emitted per channel
      expect(testGateway.emitToTenant).toHaveBeenCalledTimes(1);
      expect(testGateway.emitToConversation).toHaveBeenCalledTimes(1);
    });

    it("Status Guard: when updateMany returns count: 0 (lost race), skips event/note creation and returns existing state as no-op", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
      mockPrisma.conversation.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.conversationNote.findFirst.mockResolvedValue({
        id: "existing-note-99",
        body: "Existing briefing",
      });

      const result = await handoffService.executeHandoff({
        businessId: mockConversation.business_id,
        conversationId: mockConversation.id,
        trigger: "COMPLAINT_OR_DISPUTE",
      });

      // Update was attempted with status guard
      expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: "HUMAN_REQUIRED" },
          }),
        }),
      );

      // Status event was NOT created because transaction lost race
      expect(mockPrisma.conversationStatusEvent.create).not.toHaveBeenCalled();
      // Note was NOT created because transaction lost race
      expect(mockPrisma.conversationNote.create).not.toHaveBeenCalled();
      // Realtime was NOT emitted
      expect(mockRealtimeGateway.emitToTenant).not.toHaveBeenCalled();
      // Returns existing note and conversation
      expect(result.note?.id).toBe("existing-note-99");
    });

    it("Confidence Source: preserves evaluationContext.confidenceSource ('rule', 'manual', 'llm', 'unknown')", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);

      // Test 'rule' source
      const resRule = await handoffService.executeHandoff({
        businessId: mockConversation.business_id,
        conversationId: mockConversation.id,
        trigger: "COMPLAINT_OR_DISPUTE",
        evaluationContext: {
          confidence: 0.85,
          confidenceSource: "rule",
        },
      });
      expect(resRule.briefing.confidence_source).toBe("rule");

      // Test 'manual' source
      const resManual = await handoffService.executeHandoff({
        businessId: mockConversation.business_id,
        conversationId: mockConversation.id,
        trigger: "MANUAL_OVERRIDE",
        evaluationContext: {
          confidence: 0.95,
          confidenceSource: "manual",
        },
      });
      expect(resManual.briefing.confidence_source).toBe("manual");

      // Test 'llm' source
      const resLlm = await handoffService.executeHandoff({
        businessId: mockConversation.business_id,
        conversationId: mockConversation.id,
        trigger: "LOW_CONFIDENCE",
        evaluationContext: {
          confidence: 0.45,
          confidenceSource: "llm",
        },
      });
      expect(resLlm.briefing.confidence_source).toBe("llm");

      // Test default 'unknown' source when confidence provided without explicit source
      const resDefault = await handoffService.executeHandoff({
        businessId: mockConversation.business_id,
        conversationId: mockConversation.id,
        trigger: "LOW_CONFIDENCE",
        evaluationContext: {
          confidence: 0.45,
        },
      });
      expect(resDefault.briefing.confidence_source).toBe("unknown");

      // Test null confidence source when confidence is unscored/null
      const resNull = await handoffService.executeHandoff({
        businessId: mockConversation.business_id,
        conversationId: mockConversation.id,
        trigger: "EXPLICIT_HUMAN_REQUEST",
      });
      expect(resNull.briefing.confidence_source).toBeNull();
    });

    it("Policy Authority: canonical mapping is authoritative over customBriefing for automated triggers", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);

      // Attempting to downgrade critical COMPLAINT_OR_DISPUTE to normal via customBriefing is ignored
      const result = await handoffService.executeHandoff({
        businessId: mockConversation.business_id,
        conversationId: mockConversation.id,
        trigger: "COMPLAINT_OR_DISPUTE",
        customBriefing: {
          priority: "normal",
          escalationReason: "negotiation",
        },
      });

      expect(result.briefing.handoff_priority).toBe("critical");
      expect(result.briefing.escalation_reason).toBe("complaint");

      // But MANUAL_OVERRIDE permits custom override
      const manualResult = await handoffService.executeHandoff({
        businessId: mockConversation.business_id,
        conversationId: mockConversation.id,
        trigger: "MANUAL_OVERRIDE",
        customBriefing: {
          priority: "critical",
          escalationReason: "vip_customer",
        },
      });
      expect(manualResult.briefing.handoff_priority).toBe("critical");
      expect(manualResult.briefing.escalation_reason).toBe("vip_customer");
    });
  });

  describe("3. Briefing Generator (`BriefingGeneratorService`)", () => {
    it("Briefing Generated: Inserts structured briefing note in conversation", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
      mockPrisma.conversation.update.mockResolvedValue({
        ...mockConversation,
        ai_enabled: false,
        status: "HUMAN_REQUIRED",
      });
      mockPrisma.conversationStatusEvent.create.mockResolvedValue({ id: "event-1" });
      mockPrisma.conversationNote.create.mockResolvedValue({
        id: "note-99",
        body: "Briefing note",
      });

      await handoffService.executeHandoff({
        businessId: mockConversation.business_id,
        conversationId: mockConversation.id,
        trigger: "COMPLEX_NEGOTIATION",
        evaluationContext: {
          message: "famma remise?",
          intent: "discount_inquiry",
          confidence: 0.9,
        },
      });

      expect(mockPrisma.conversationNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          business_id: mockConversation.business_id,
          conversation_id: mockConversation.id,
          author_user_id: "system",
          body: expect.stringContaining("📋 **AI-to-Human Handoff Briefing**"),
        }),
      });
    });

    it("generates 100% compliant HandoffContext conforming to HandoffContextSchema", () => {
      const briefing = briefingGenerator.generateBriefing({
        customer: {
          id: "33333333-3333-4333-a333-333333333333",
          name: "Sami",
          phone: "+21655555555",
          channel: "whatsapp",
          lifecycle_stage: "customer",
        },
        trigger: "BULK_ORDER",
        intent: "purchase_intent",
        confidence: 0.94,
        lastMessage: "nheb nechri 20 pieces",
        productsDiscussed: [
          {
            product_id: "44444444-4444-4444-a444-444444444444",
            variant_id: "55555555-5555-4555-a555-555555555555",
            name: "Sweatshirt Zip",
            sku: "SW-ZIP-M",
            price: 80,
            currency: "TND",
          },
        ],
        pendingOrder: {
          id: "66666666-6666-4666-a666-666666666666",
          amount: 1600,
          currency: "TND",
          item_count: 20,
        },
      });

      // Strict validation through Zod schema
      const parsed = HandoffContextSchema.parse(briefing);
      expect(parsed.schema_version).toBe(1);
      expect(parsed.escalation_reason).toBe("bulk_order");
      expect(parsed.handoff_priority).toBe("high");
      expect(parsed.action_required).toBe(getDefaultActionRequired("BULK_ORDER"));
      expect(parsed.pending_order).not.toBeNull();
      expect(parsed.pending_order?.amount).toBe(1600);
      expect(parsed.products_discussed).toHaveLength(1);
    });

    it("produces deterministic template fallback summary if no custom summary is supplied", () => {
      const briefing = briefingGenerator.generateBriefing({
        customer: {
          id: "77777777-7777-4777-a777-777777777777",
          name: "Meriem",
          channel: "instagram",
          lifecycle_stage: "interested",
        },
        trigger: "EXPLICIT_HUMAN_REQUEST",
        lastMessage: "n7eb n7ki m3a agent",
      });

      expect(briefing.summary).toContain("Meriem on instagram");
      expect(briefing.summary).toContain("[EXPLICIT_HUMAN_REQUEST]");
      expect(briefing.summary).toContain('Last message: "n7eb n7ki m3a agent"');
      expect(briefing.summary).toContain("Action: Customer asked for a person");
    });

    it("all 15 triggers have non-empty default action_required and priority mappings", () => {
      for (const trigger of HANDOFF_TRIGGERS) {
        const action = getDefaultActionRequired(trigger);
        expect(action).toBeTruthy();
        expect(action.length).toBeGreaterThan(10);

        const priority = getHandoffTriggerPriority(trigger);
        expect(["critical", "high", "normal"]).toContain(priority);

        const reason = mapTriggerToEscalationReason(trigger);
        expect(reason).toBeTruthy();
      }
    });

    it("automatically normalizes uppercase HandoffTriggers in alsoMatched to valid EscalationReasons", () => {
      const briefing = briefingGenerator.generateBriefing({
        customer: {
          id: "77777777-7777-4777-a777-777777777777",
          name: "Meriem",
          channel: "instagram",
          lifecycle_stage: "interested",
        },
        trigger: "COMPLAINT_OR_DISPUTE",
        alsoMatched: ["EXPLICIT_HUMAN_REQUEST", "LOW_CONFIDENCE"],
      });

      expect(briefing.also_matched).toEqual(["human_request", "low_confidence"]);
      expect(() => HandoffContextSchema.parse(briefing)).not.toThrow();
    });

    it("preserves confidence as null when unscored (never defaults to 1.0)", () => {
      const briefing = briefingGenerator.generateBriefing({
        customer: {
          id: "77777777-7777-4777-a777-777777777777",
          name: "Meriem",
          channel: "instagram",
          lifecycle_stage: "interested",
        },
        trigger: "MANUAL_OVERRIDE",
        confidence: undefined,
      });

      expect(briefing.confidence).toBeNull();
      const note = briefingGenerator.formatBriefingNote(briefing, "MANUAL_OVERRIDE");
      expect(note).toContain("(unscored)");
    });

    it("sanitizes customer PII (phone, email, card) in generated fallback summaries", () => {
      const briefing = briefingGenerator.generateBriefing({
        customer: {
          id: "77777777-7777-4777-a777-777777777777",
          name: "Karim",
          channel: "whatsapp",
          lifecycle_stage: "qualified_lead",
        },
        trigger: "PAYMENT_FAILURE",
        lastMessage: "kalemni 3al +21698123456 wela contact@example.com carte 4152-1234-5678-9999",
      });

      expect(briefing.summary).not.toContain("+21698123456");
      expect(briefing.summary).not.toContain("contact@example.com");
      expect(briefing.summary).not.toContain("4152-1234-5678-9999");
      expect(briefing.summary).toContain("[REDACTED_PHONE]");
      expect(briefing.summary).toContain("[REDACTED_EMAIL]");
      expect(briefing.summary).toContain("[REDACTED_CARD]");
    });

    it("falls back to 'unknown' when unrecognized intent string is provided", () => {
      const briefing = briefingGenerator.generateBriefing({
        customer: {
          id: "77777777-7777-4777-a777-777777777777",
          name: "Sami",
          channel: "messenger",
          lifecycle_stage: "interested",
        },
        trigger: "LOW_CONFIDENCE",
        intent: "some_unregistered_intent" as any,
      });

      expect(briefing.intent).toBe("unknown");
    });

    it("resolves HandoffService via NestJS dependency injection in AiModule", async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AiModule],
      }).compile();

      const service = moduleRef.get<HandoffService>(HandoffService);
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(HandoffService);
      await moduleRef.close();
    });
  });
});
