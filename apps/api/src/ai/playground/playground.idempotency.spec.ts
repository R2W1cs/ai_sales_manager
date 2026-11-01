import { createHash } from "node:crypto";

import { ConflictException } from "@nestjs/common";
import { ConversationSource, ConversationStatus } from "@prisma/client";

import { PlaygroundService, CLAIM_LEASE_TIMEOUT_MS } from "./playground.service";
import {
  TEST_BUSINESS_ID,
  TEST_CONVERSATION_ID,
  TEST_CUSTOMER_ID,
  TEST_INBOUND_MSG_ID,
  TEST_OUTBOUND_MSG_ID,
  createMockPrismaClient,
  type MockPrismaClient,
} from "./test-fixtures";

describe("Playground Idempotency, Lease Recovery & Rollback Suite", () => {
  let service: PlaygroundService;
  let prismaMock: MockPrismaClient;
  let orchestratorMock: { executeTurn: jest.Mock };

  beforeEach(() => {
    prismaMock = createMockPrismaClient();
    orchestratorMock = {
      executeTurn: jest.fn(),
    };

    service = new PlaygroundService(orchestratorMock as any, undefined, prismaMock as any);

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

  describe("Idempotency Replay and Fingerprint Verification", () => {
    it("replays previously completed turn validated against schema", async () => {
      const canonicalResponse = {
        response: "Bonjour! Le produit est disponible en stock au prix de 45.000 TND.",
        executionSummary: "Turn executed with 2 tool call(s)",
        explanation:
          "Simulated turn completed successfully. Tools called: [searchCatalog, checkStock]. Grounding validation passed.",
        toolCalls: ["searchCatalog", "checkStock"],
        handoffTriggered: false,
        conversationId: TEST_CONVERSATION_ID,
        decisionTraceId: "trace-uuid-1",
        groundingPassed: true,
        usage: {
          provider: "google",
          model: "gemini-3.5-flash",
          tokensInput: 120,
          tokensOutput: 35,
          estimatedCostUsd: 0.000045,
        },
      };

      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            businessId: TEST_BUSINESS_ID,
            message: "Quel est le prix et la dispo du produit?",
            scenario: null,
            conversationId: null,
          }),
        )
        .digest("hex");

      prismaMock.idempotencyKey.findUnique.mockResolvedValueOnce({
        id: "idemp-record-uuid",
        business_id: TEST_BUSINESS_ID,
        key: "playground:idem-key-100",
        request_hash: requestHash,
        response_status: 200,
        response_body: canonicalResponse,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 86400000),
      });

      const res = await service.simulate(TEST_BUSINESS_ID, {
        message: "Quel est le prix et la dispo du produit?",
        idempotencyKey: "idem-key-100",
      });

      expect(res).toEqual(canonicalResponse);
      // Ensure no new messages or AI turns were run
      expect(orchestratorMock.executeTurn).not.toHaveBeenCalled();
      expect(prismaMock.message.create).not.toHaveBeenCalled();
    });

    it("rejects key reuse with altered payload as a 409 Conflict collision", async () => {
      const originalHash = createHash("sha256")
        .update(
          JSON.stringify({
            businessId: TEST_BUSINESS_ID,
            message: "Original message payload",
            scenario: null,
            conversationId: null,
          }),
        )
        .digest("hex");

      prismaMock.idempotencyKey.findUnique.mockResolvedValueOnce({
        id: "idemp-record-uuid",
        business_id: TEST_BUSINESS_ID,
        key: "playground:idem-key-100",
        request_hash: originalHash,
        response_status: 200,
        response_body: {},
        created_at: new Date(),
        expires_at: new Date(Date.now() + 86400000),
      });

      await expect(
        service.simulate(TEST_BUSINESS_ID, {
          message: "Altered message payload attempting to reuse key",
          idempotencyKey: "idem-key-100",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects concurrent in-flight execution on the same key with 409 Conflict within lease window", async () => {
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            businessId: TEST_BUSINESS_ID,
            message: "In-flight test message",
            scenario: null,
            conversationId: null,
          }),
        )
        .digest("hex");

      prismaMock.idempotencyKey.findUnique.mockResolvedValueOnce({
        id: "idemp-record-uuid",
        business_id: TEST_BUSINESS_ID,
        key: "playground:idem-key-in-flight",
        request_hash: requestHash,
        response_status: null, // in-flight claim
        response_body: null,
        created_at: new Date(), // freshly claimed within lease window
        expires_at: new Date(Date.now() + 86400000),
      });

      await expect(
        service.simulate(TEST_BUSINESS_ID, {
          message: "In-flight test message",
          idempotencyKey: "idem-key-in-flight",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("recovers stale claim from crashed process after lease timeout", async () => {
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            businessId: TEST_BUSINESS_ID,
            message: "Recovered stale message",
            scenario: null,
            conversationId: null,
          }),
        )
        .digest("hex");

      // Claim created 2 minutes ago (exceeding CLAIM_LEASE_TIMEOUT_MS = 60s)
      const staleTimestamp = new Date(Date.now() - (CLAIM_LEASE_TIMEOUT_MS + 30000));

      prismaMock.idempotencyKey.findUnique.mockResolvedValueOnce({
        id: "idemp-record-uuid",
        business_id: TEST_BUSINESS_ID,
        key: "playground:idem-stale",
        request_hash: requestHash,
        response_status: null,
        response_body: null,
        created_at: staleTimestamp,
        expires_at: new Date(Date.now() + 86400000),
      });

      orchestratorMock.executeTurn.mockResolvedValueOnce({
        response: "Executed after stale claim recovery",
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

      const res = await service.simulate(TEST_BUSINESS_ID, {
        message: "Recovered stale message",
        idempotencyKey: "idem-stale",
      });

      expect(res.response).toBe("Executed after stale claim recovery");
      expect(prismaMock.idempotencyKey.updateMany).toHaveBeenCalled();
    });
  });

  describe("Downstream Operations & Rollback Boundary", () => {
    it("cleans up newly created conversation, messages, AI traces, and idempotency claim if executeTurn throws", async () => {
      orchestratorMock.executeTurn.mockRejectedValueOnce(
        new Error("AI Model Gateway 500 Unreachable"),
      );

      await expect(
        service.simulate(TEST_BUSINESS_ID, {
          message: "Trigger AI failure",
          idempotencyKey: "test-err-key",
        }),
      ).rejects.toThrow("AI Model Gateway 500 Unreachable");

      // Verify AI actions, traces, and usage cleanup
      expect(prismaMock.aiDecisionTrace.deleteMany).toHaveBeenCalled();
      expect(prismaMock.aiUsage.deleteMany).toHaveBeenCalled();
      expect(prismaMock.aiAction.deleteMany).toHaveBeenCalled();

      // Verify messages and conversation cleanup
      expect(prismaMock.message.deleteMany).toHaveBeenCalledWith({
        where: { conversation_id: TEST_CONVERSATION_ID, business_id: TEST_BUSINESS_ID },
      });
      expect(prismaMock.conversation.delete).toHaveBeenCalledWith({
        where: { id: TEST_CONVERSATION_ID },
      });

      // Verify idempotency claim release
      expect(prismaMock.idempotencyKey.deleteMany).toHaveBeenCalledWith({
        where: { business_id: TEST_BUSINESS_ID, key: "playground:test-err-key" },
      });
    });

    it("cleans up outbound message, inbound message, and child records on existing conversation when simulation fails", async () => {
      prismaMock.conversation.findFirst.mockResolvedValueOnce({
        id: TEST_CONVERSATION_ID,
        business_id: TEST_BUSINESS_ID,
        is_test: true,
        source: ConversationSource.playground,
        status: ConversationStatus.AI_ACTIVE,
      });

      orchestratorMock.executeTurn.mockRejectedValueOnce(
        new Error("Intent classification failure"),
      );

      await expect(
        service.simulate(TEST_BUSINESS_ID, {
          message: "Trigger turn failure on existing thread",
          conversationId: TEST_CONVERSATION_ID,
          idempotencyKey: "existing-err-key",
        }),
      ).rejects.toThrow("Intent classification failure");

      // Verify conversation is NOT deleted
      expect(prismaMock.conversation.delete).not.toHaveBeenCalled();

      // Verify inbound message is deleted
      expect(prismaMock.message.delete).toHaveBeenCalledWith({
        where: { id: TEST_INBOUND_MSG_ID },
      });

      // Verify idempotency claim release
      expect(prismaMock.idempotencyKey.deleteMany).toHaveBeenCalledWith({
        where: { business_id: TEST_BUSINESS_ID, key: "playground:existing-err-key" },
      });
    });

    it("cleans up idempotency claim if downstream post-execution failure occurs (e.g. conversation update fails)", async () => {
      orchestratorMock.executeTurn.mockResolvedValueOnce({
        response: "Valid response generated",
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

      // Conversation update fails after turn execution
      prismaMock.conversation.update.mockRejectedValueOnce(
        new Error("Database connection lost during conversation state update"),
      );

      await expect(
        service.simulate(TEST_BUSINESS_ID, {
          message: "Testing post-execution failure",
          idempotencyKey: "post-exec-fail-key",
        }),
      ).rejects.toThrow("Database connection lost during conversation state update");

      // Verify claim deletion prevents stuck processing state
      expect(prismaMock.idempotencyKey.deleteMany).toHaveBeenCalledWith({
        where: { business_id: TEST_BUSINESS_ID, key: "playground:post-exec-fail-key" },
      });
    });
  });
});
