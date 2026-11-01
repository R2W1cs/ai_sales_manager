import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { BriefingGeneratorService } from "../src/ai/handoff/briefing-generator.service";
import { HandoffService } from "../src/ai/handoff/handoff.service";
import { createPrismaClient } from "../src/lib/prisma";

describe("PostgreSQL Real DB Concurrency & Idempotency: executeHandoff (Claim #1)", () => {
  let prisma: PrismaClient;
  let briefingGenerator: BriefingGeneratorService;
  let handoffService: HandoffService;

  const mockGateway = {
    emitToTenant: jest.fn(),
    emitToConversation: jest.fn(),
  };

  const businessId = randomUUID();
  const customerId = randomUUID();
  const conversationId = randomUUID();

  beforeAll(async () => {
    prisma = createPrismaClient();
    briefingGenerator = new BriefingGeneratorService();
    handoffService = new HandoffService(briefingGenerator, prisma, mockGateway);

    // 1. Seed real records in PostgreSQL
    await prisma.business.create({
      data: {
        id: businessId,
        name: `Integration Test Biz ${businessId.slice(0, 8)}`,
        currency: "TND",
        timezone: "Africa/Tunis",
      },
    });

    await prisma.customer.create({
      data: {
        id: customerId,
        business_id: businessId,
        name: "Concurrent Test Customer",
        phone: "+21699887766",
        lifecycle_stage: "interested",
      },
    });

    await prisma.conversation.create({
      data: {
        id: conversationId,
        business_id: businessId,
        customer_id: customerId,
        source: "instagram",
        status: "AI_ACTIVE",
        ai_enabled: true,
        is_test: true,
      },
    });
  }, 30000);

  afterAll(async () => {
    // Clean up created records in reverse dependency order
    await prisma.conversationNote.deleteMany({
      where: { business_id: businessId },
    });
    await prisma.conversationStatusEvent.deleteMany({
      where: { business_id: businessId },
    });
    await prisma.conversation.deleteMany({
      where: { business_id: businessId },
    });
    await prisma.customer.deleteMany({
      where: { business_id: businessId },
    });
    await prisma.business.deleteMany({
      where: { id: businessId },
    });

    await prisma.$disconnect();
  });

  it("Two real concurrent transactions racing in PostgreSQL result in EXACTLY 1 transition, 1 status event, and 1 note", async () => {
    // Each executeHandoff call opens its own independent Prisma $transaction against PostgreSQL
    // (READ COMMITTED isolation by default). Promise.all starts both before either resolves, so
    // they enter the DB concurrently — this is a genuine DB-level race, not a serialized mock.
    // The status guard (updateMany ... status: { not: "HUMAN_REQUIRED" }) ensures exactly one
    // transaction wins the transition; the loser observes count: 0 and becomes a no-op.
    const [res1, res2] = await Promise.all([
      handoffService.executeHandoff({
        businessId,
        conversationId,
        trigger: "COMPLAINT_OR_DISPUTE",
        evaluationContext: {
          message: "worker 1 complaint: service khayeb!",
          confidence: 0.9,
        },
      }),
      handoffService.executeHandoff({
        businessId,
        conversationId,
        trigger: "COMPLAINT_OR_DISPUTE",
        evaluationContext: {
          message: "worker 2 complaint: service khayeb!",
          confidence: 0.9,
        },
      }),
    ]);

    // Both workers receive valid, consistent final conversation state
    expect(res1.conversation.status).toBe("HUMAN_REQUIRED");
    expect(res1.conversation.ai_enabled).toBe(false);
    expect(res2.conversation.status).toBe("HUMAN_REQUIRED");
    expect(res2.conversation.ai_enabled).toBe(false);

    // Verify directly against PostgreSQL database
    const dbConv = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(dbConv.status).toBe("HUMAN_REQUIRED");
    expect(dbConv.ai_enabled).toBe(false);
    expect(dbConv.escalation_reason).toBe("complaint");

    // Exactly 1 status event created in PostgreSQL for this transition
    const dbEvents = await prisma.conversationStatusEvent.findMany({
      where: { conversation_id: conversationId },
    });
    expect(dbEvents).toHaveLength(1);
    expect(dbEvents[0]?.from_status).toBe("AI_ACTIVE");
    expect(dbEvents[0]?.to_status).toBe("HUMAN_REQUIRED");

    // Exactly 1 briefing note created in PostgreSQL
    const dbNotes = await prisma.conversationNote.findMany({
      where: { conversation_id: conversationId },
    });
    expect(dbNotes).toHaveLength(1);
    expect(dbNotes[0]?.author_user_id).toBe("system");

    // Realtime events were emitted exactly once (idempotent; no duplicate push notifications)
    expect(mockGateway.emitToTenant).toHaveBeenCalledTimes(1);
    expect(mockGateway.emitToConversation).toHaveBeenCalledTimes(1);
  });

  it("Subsequent calls on the already HUMAN_REQUIRED conversation are deterministic no-ops in PostgreSQL", async () => {
    mockGateway.emitToTenant.mockClear();
    mockGateway.emitToConversation.mockClear();

    const resFollowup = await handoffService.executeHandoff({
      businessId,
      conversationId,
      trigger: "PAYMENT_FAILURE",
      evaluationContext: { message: "customer says payment failed" },
    });

    expect(resFollowup.conversation.status).toBe("HUMAN_REQUIRED");
    expect(resFollowup.note).toBeDefined();

    // Still exactly 1 event and 1 note in PostgreSQL
    const dbEvents = await prisma.conversationStatusEvent.findMany({
      where: { conversation_id: conversationId },
    });
    expect(dbEvents).toHaveLength(1);

    const dbNotes = await prisma.conversationNote.findMany({
      where: { conversation_id: conversationId },
    });
    expect(dbNotes).toHaveLength(1);

    // Realtime not re-emitted
    expect(mockGateway.emitToTenant).not.toHaveBeenCalled();
    expect(mockGateway.emitToConversation).not.toHaveBeenCalled();
  });

  it("Four simultaneous concurrent workers racing on a fresh active conversation in PostgreSQL still produce exactly 1 transition, 1 event, and 1 note", async () => {
    mockGateway.emitToTenant.mockClear();
    mockGateway.emitToConversation.mockClear();

    const convId2 = randomUUID();
    await prisma.conversation.create({
      data: {
        id: convId2,
        business_id: businessId,
        customer_id: customerId,
        source: "whatsapp",
        status: "AI_ACTIVE",
        ai_enabled: true,
        is_test: true,
      },
    });

    const results = await Promise.all([
      handoffService.executeHandoff({
        businessId,
        conversationId: convId2,
        trigger: "RETURN_OR_REFUND",
        evaluationContext: { isRefund: true, message: "worker 1 refund" },
      }),
      handoffService.executeHandoff({
        businessId,
        conversationId: convId2,
        trigger: "RETURN_OR_REFUND",
        evaluationContext: { isRefund: true, message: "worker 2 refund" },
      }),
      handoffService.executeHandoff({
        businessId,
        conversationId: convId2,
        trigger: "RETURN_OR_REFUND",
        evaluationContext: { isRefund: true, message: "worker 3 refund" },
      }),
      handoffService.executeHandoff({
        businessId,
        conversationId: convId2,
        trigger: "RETURN_OR_REFUND",
        evaluationContext: { isRefund: true, message: "worker 4 refund" },
      }),
    ]);

    for (const res of results) {
      expect(res.conversation.status).toBe("HUMAN_REQUIRED");
      expect(res.conversation.ai_enabled).toBe(false);
    }

    const events = await prisma.conversationStatusEvent.findMany({
      where: { conversation_id: convId2 },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.escalation_reason).toBe("refund_request");

    const notes = await prisma.conversationNote.findMany({
      where: { conversation_id: convId2 },
    });
    expect(notes).toHaveLength(1);

    expect(mockGateway.emitToTenant).toHaveBeenCalledTimes(1);
    expect(mockGateway.emitToConversation).toHaveBeenCalledTimes(1);
  });
});
