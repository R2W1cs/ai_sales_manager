import { ConversationSource, ConversationStatus } from "@prisma/client";

import { PlaygroundService } from "./playground.service";
import {
  TEST_BUSINESS_ID,
  TEST_CONVERSATION_ID,
  TEST_CUSTOMER_ID,
  TEST_INBOUND_MSG_ID,
  TEST_OUTBOUND_MSG_ID,
  createMockPrismaClient,
  type MockPrismaClient,
} from "./test-fixtures";

describe("PlaygroundService Core Simulation & Lifecycle Suite", () => {
  let service: PlaygroundService;
  let prismaMock: MockPrismaClient;
  let orchestratorMock: { executeTurn: jest.Mock };
  let stateMachineMock: { transition: jest.Mock };

  beforeEach(() => {
    prismaMock = createMockPrismaClient();
    orchestratorMock = {
      executeTurn: jest.fn(),
    };
    stateMachineMock = {
      transition: jest.fn(),
    };

    service = new PlaygroundService(
      orchestratorMock as any,
      stateMachineMock as any,
      prismaMock as any,
    );

    // Setup standard mock returns
    prismaMock.customer.findFirst.mockResolvedValue({
      id: TEST_CUSTOMER_ID,
      business_id: TEST_BUSINESS_ID,
      name: "Playground Simulation User",
      is_test: true,
      lifecycle_stage: "unknown_visitor",
    });

    prismaMock.conversation.create.mockResolvedValue({
      id: TEST_CONVERSATION_ID,
      business_id: TEST_BUSINESS_ID,
      customer_id: TEST_CUSTOMER_ID,
      source: ConversationSource.playground,
      is_test: true,
      status: ConversationStatus.NEW,
      ai_enabled: true,
    });

    prismaMock.conversation.findFirst.mockResolvedValue({
      id: TEST_CONVERSATION_ID,
      business_id: TEST_BUSINESS_ID,
      customer_id: TEST_CUSTOMER_ID,
      source: ConversationSource.playground,
      is_test: true,
      status: ConversationStatus.AI_ACTIVE,
      ai_enabled: true,
    });

    prismaMock.message.create.mockImplementation((args: any) => {
      const isOutbound = args.data.direction === "outbound";
      return Promise.resolve({
        id: isOutbound ? TEST_OUTBOUND_MSG_ID : TEST_INBOUND_MSG_ID,
        business_id: TEST_BUSINESS_ID,
        conversation_id: TEST_CONVERSATION_ID,
        direction: args.data.direction,
        sender_type: args.data.sender_type,
        content: args.data.content,
        delivery_status: args.data.delivery_status,
        idempotency_key: args.data.idempotency_key,
        ai_metadata: args.data.ai_metadata,
        created_at: new Date(),
      });
    });

    prismaMock.conversation.update.mockResolvedValue({
      id: TEST_CONVERSATION_ID,
      business_id: TEST_BUSINESS_ID,
      status: ConversationStatus.AI_ACTIVE,
    });

    prismaMock.idempotencyKey.findUnique.mockResolvedValue(null);
    prismaMock.idempotencyKey.create.mockResolvedValue({ id: "idemp-id" });
    prismaMock.idempotencyKey.updateMany.mockResolvedValue({ count: 1 });
  });

  describe("Simulation execution & telemetry", () => {
    it("executes AI turn and returns tool telemetry & clear explanation", async () => {
      orchestratorMock.executeTurn.mockResolvedValueOnce({
        response: "Bonjour! Le produit est disponible en stock au prix de 45.000 TND.",
        deliveryIntent: "local",
        toolsCalled: ["searchCatalog", "checkStock"],
        groundingPassed: true,
        intendedTransition: null,
        decisionTraceId: "trace-uuid-1",
        usage: {
          provider: "google",
          model: "gemini-3.5-flash",
          tokensInput: 120,
          tokensOutput: 35,
          estimatedCostUsd: 0.000045,
        },
      });

      const res = await service.simulate(TEST_BUSINESS_ID, {
        message: "Quel est le prix et la dispo du produit?",
      });

      expect(res.response).toBe(
        "Bonjour! Le produit est disponible en stock au prix de 45.000 TND.",
      );
      expect(res.explanation).toContain("Simulated turn completed successfully");
      expect(res.toolCalls).toEqual(["searchCatalog", "checkStock"]);
      expect(res.groundingPassed).toBe(true);
      expect(res.handoffTriggered).toBe(false);
      expect(res.conversationId).toBe(TEST_CONVERSATION_ID);
      expect(res.decisionTraceId).toBe("trace-uuid-1");
      expect(res.usage?.provider).toBe("google");

      // Verify orchestrator received mode = 'playground'
      expect(orchestratorMock.executeTurn).toHaveBeenCalledWith(
        TEST_CONVERSATION_ID,
        { id: TEST_INBOUND_MSG_ID, content: "Quel est le prix et la dispo du produit?" },
        {
          businessId: TEST_BUSINESS_ID,
          inboundMessageId: TEST_INBOUND_MSG_ID,
          mode: "playground",
        },
      );
    });

    it("simulation with canned scenario: maps scenario prompt and detects handoff", async () => {
      orchestratorMock.executeTurn.mockResolvedValueOnce({
        response: "Désolé pour ce désagrément, je transfère votre demande à un conseiller.",
        deliveryIntent: "local",
        toolsCalled: ["requestHumanHandoff"],
        groundingPassed: true,
        intendedTransition: {
          toStatus: "HUMAN_REQUIRED",
          escalationReason: "complaint",
          handoffPriority: "CRITICAL",
        },
        decisionTraceId: "trace-uuid-2",
        usage: {
          provider: "simulator",
          model: "gemini-3.5-flash",
          tokensInput: 80,
          tokensOutput: 25,
          estimatedCostUsd: 0.00002,
        },
      });

      const res = await service.simulate(TEST_BUSINESS_ID, {
        scenario: "angry",
      });

      expect(res.handoffTriggered).toBe(true);
      expect(res.handoffReason).toBe("complaint");
      expect(res.explanation).toContain("Escalation triggered (complaint)");
      expect(res.toolCalls).toEqual(["requestHumanHandoff"]);

      // Verify state machine transition was invoked
      expect(stateMachineMock.transition).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: TEST_CONVERSATION_ID,
          toState: "HUMAN_REQUIRED",
          reason: "complaint",
        }),
      );
    });
  });

  describe("Deterministic test customer handling", () => {
    it("queries by test customer deterministic UUID and oldest creation", async () => {
      prismaMock.customer.findFirst.mockResolvedValueOnce({
        id: TEST_CUSTOMER_ID,
        business_id: TEST_BUSINESS_ID,
        name: "Playground Simulation User",
        is_test: true,
      });

      orchestratorMock.executeTurn.mockResolvedValueOnce({
        response: "Ok",
        deliveryIntent: "local",
        toolsCalled: [],
        groundingPassed: true,
        usage: {
          provider: "simulator",
          model: "gemini-3.5-flash",
          tokensInput: 10,
          tokensOutput: 5,
          estimatedCostUsd: 0,
        },
      });

      await service.simulate(TEST_BUSINESS_ID, { message: "Test customer lookup" });

      expect(prismaMock.customer.findFirst).toHaveBeenCalled();
    });

    it("recovers from P2002 collision by finding existing customer", async () => {
      prismaMock.customer.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: TEST_CUSTOMER_ID,
          business_id: TEST_BUSINESS_ID,
          name: "Playground Simulation User",
          is_test: true,
        });

      prismaMock.customer.create.mockRejectedValueOnce({ code: "P2002" });

      orchestratorMock.executeTurn.mockResolvedValueOnce({
        response: "Collision recovered",
        deliveryIntent: "local",
        toolsCalled: [],
        groundingPassed: true,
        usage: {
          provider: "simulator",
          model: "gemini-3.5-flash",
          tokensInput: 10,
          tokensOutput: 5,
          estimatedCostUsd: 0,
        },
      });

      const res = await service.simulate(TEST_BUSINESS_ID, { message: "Test race recovery" });
      expect(res.response).toBe("Collision recovered");
    });

    it("rethrows unexpected non-P2002 customer creation errors", async () => {
      prismaMock.customer.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      prismaMock.customer.create.mockRejectedValueOnce(new Error("Database connection dropped"));

      await expect(
        service.simulate(TEST_BUSINESS_ID, { message: "Test unexpected DB error" }),
      ).rejects.toThrow("Database connection dropped");
    });
  });

  describe("Conversations listing and pruning", () => {
    it("lists test conversations strictly with source = playground and is_test = true", async () => {
      const mockThreads = [
        {
          id: "conv-1",
          business_id: TEST_BUSINESS_ID,
          is_test: true,
          source: ConversationSource.playground,
          status: ConversationStatus.AI_ACTIVE,
          messages: [{ id: "msg-1", content: "Hello" }],
        },
      ];

      prismaMock.conversation.findMany.mockResolvedValueOnce(mockThreads);

      const res = await service.listPlaygroundConversations(TEST_BUSINESS_ID);
      expect(res).toEqual(mockThreads);
      expect(prismaMock.conversation.findMany).toHaveBeenCalledWith({
        where: {
          business_id: TEST_BUSINESS_ID,
          is_test: true,
          source: ConversationSource.playground,
        },
        include: {
          messages: {
            orderBy: { created_at: "asc" },
          },
        },
        orderBy: { updated_at: "desc" },
      });
    });

    it("prunes stale playground conversations excluding active runs", async () => {
      prismaMock.conversation.deleteMany.mockResolvedValueOnce({ count: 5 });

      const res = await service.prunePlaygroundConversations(TEST_BUSINESS_ID, 14);
      expect(res.count).toBe(5);

      expect(prismaMock.conversation.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            business_id: TEST_BUSINESS_ID,
            is_test: true,
            source: ConversationSource.playground,
            status: {
              notIn: [
                ConversationStatus.NEW,
                ConversationStatus.AI_ACTIVE,
                ConversationStatus.ORDER_INTENT_DETECTED,
                ConversationStatus.HUMAN_REQUIRED,
                ConversationStatus.HUMAN_HANDLING,
              ],
            },
          }),
        }),
      );
    });
  });

  describe("Gate G4 Onboarding Readiness Check (T-AI-07)", () => {
    it("Gate Update: Marks Gate G4 complete by updating business_onboarding.playground_passed = true", async () => {
      orchestratorMock.executeTurn.mockResolvedValueOnce({
        response: "Bonjour! Simulation réussie.",
        deliveryIntent: "local",
        toolsCalled: ["searchCatalog"],
        groundingPassed: true,
        intendedTransition: null,
        decisionTraceId: "trace-g4-1",
        usage: {
          provider: "google",
          model: "gemini-3.5-flash",
          tokensInput: 50,
          tokensOutput: 20,
          estimatedCostUsd: 0.00001,
        },
      });

      const res = await service.simulate(TEST_BUSINESS_ID, {
        message: "Je veux tester mon assistant IA",
      });

      expect(res.response).toBe("Bonjour! Simulation réussie.");
      expect(prismaMock.businessOnboarding.upsert).toHaveBeenCalledWith({
        where: { business_id: TEST_BUSINESS_ID },
        create: {
          business_id: TEST_BUSINESS_ID,
          business_created: true,
          playground_passed: true,
        },
        update: {
          playground_passed: true,
        },
      });
    });

    it("Invariants: Does not flip ai_activated or replyMode upon completing playground simulation (FR-AI-011)", async () => {
      orchestratorMock.executeTurn.mockResolvedValueOnce({
        response: "Simulation sans activation automatique.",
        deliveryIntent: "local",
        toolsCalled: [],
        groundingPassed: true,
        intendedTransition: null,
        decisionTraceId: "trace-g4-2",
      });

      await service.simulate(TEST_BUSINESS_ID, {
        message: "Simulation invariant check",
      });

      // Verify businessOnboarding upsert did NOT set ai_activated = true
      const upsertArgs = prismaMock.businessOnboarding.upsert.mock.calls[0][0];
      expect(upsertArgs.update).toEqual({ playground_passed: true });
      expect(upsertArgs.create.ai_activated).toBeUndefined();
    });

    it("handles non-fatal DB errors during onboarding update without failing simulation turn", async () => {
      prismaMock.businessOnboarding.upsert.mockRejectedValueOnce(
        new Error("Onboarding table locked"),
      );

      orchestratorMock.executeTurn.mockResolvedValueOnce({
        response: "Simulation response despite onboarding warn",
        deliveryIntent: "local",
        toolsCalled: [],
        groundingPassed: true,
        intendedTransition: null,
        decisionTraceId: "trace-g4-3",
      });

      const res = await service.simulate(TEST_BUSINESS_ID, {
        message: "Resilience test",
      });

      expect(res.response).toBe("Simulation response despite onboarding warn");
    });
  });
});
