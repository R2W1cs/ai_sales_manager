import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PrismaClient } from "@prisma/client";

import { PERMISSIONS_KEY, RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { ObservabilityController } from "./observability.controller";
import { ObservabilityService, MAX_ACTIONS_PER_TRACE } from "./observability.service";

describe("AI decision traces & action logging service (T-OBS-01)", () => {
  let service: ObservabilityService;
  let controller: ObservabilityController;
  let prismaMock: {
    aiDecisionTrace: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    aiAction: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    conversation: {
      findFirst: jest.Mock;
    };
    businessMember: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const businessId = "11111111-1111-4111-a111-111111111111";
  const otherBusinessId = "99999999-9999-4999-a999-999999999999";
  const conversationId = "22222222-2222-4222-a222-222222222222";
  const inboundMessageId = "33333333-3333-4333-a333-333333333333";
  const outboundMessageId = "44444444-4444-4444-a444-444444444444";
  const traceId = "55555555-5555-4555-a555-555555555555";
  const actionId = "66666666-6666-4666-a666-666666666666";
  const now = new Date("2026-08-29T12:00:00Z");

  beforeEach(() => {
    prismaMock = {
      aiDecisionTrace: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      aiAction: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      conversation: {
        findFirst: jest.fn(),
      },
      businessMember: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new ObservabilityService(prismaMock as unknown as PrismaClient);
    controller = new ObservabilityController(service);
  });

  describe("1. Record Decision Trace & Action Logging", () => {
    it("records structured decision trace with multi-tenant isolation", async () => {
      const mockTraceData = {
        schema_version: 1 as const,
        intent: "product_inquiry",
        confidence: 0.94,
        decision: "reply",
        rules_checked: ["stock_available"],
        tools_called: ["search_products"],
        rag_chunk_ids: ["chunk-1", "chunk-2"],
        models_attempted: ["gemini-3.5-flash"],
        mode: "inbound",
        latency_ms: 450,
      };

      prismaMock.aiDecisionTrace.create.mockResolvedValue({
        id: traceId,
        business_id: businessId,
        conversation_id: conversationId,
        inbound_message_id: inboundMessageId,
        outbound_message_id: outboundMessageId,
        decision_trace: mockTraceData,
        created_at: now,
      });

      const result = await service.recordDecisionTrace({
        businessId,
        conversationId,
        inboundMessageId,
        outboundMessageId,
        decisionTrace: mockTraceData,
      });

      expect(prismaMock.aiDecisionTrace.create).toHaveBeenCalledWith({
        data: {
          business_id: businessId,
          conversation_id: conversationId,
          inbound_message_id: inboundMessageId,
          outbound_message_id: outboundMessageId,
          decision_trace: mockTraceData,
        },
      });
      expect(result.id).toBe(traceId);
    });

    it("records AI action and automatically sanitizes PANs and API keys in input/output", async () => {
      prismaMock.aiAction.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: actionId, ...data, created_at: now }),
      );

      const rawInput = {
        cardNumber: "4532-1234-5678-9012",
        apiKey: "sk-secret-key-12345",
        productQuery: "chaussures sport",
      };

      const rawOutput = {
        status: "success",
        token: "jwt-token-xyz",
        found: true,
      };

      await service.recordAction({
        businessId,
        conversationId,
        messageId: inboundMessageId,
        actionType: "tool_call",
        toolName: "search_products",
        input: rawInput,
        output: rawOutput,
        success: true,
        durationMs: 120,
      });

      expect(prismaMock.aiAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          business_id: businessId,
          conversation_id: conversationId,
          message_id: inboundMessageId,
          action_type: "tool_call",
          tool_name: "search_products",
          input: {
            cardNumber: "[REDACTED]",
            apiKey: "[REDACTED]",
            productQuery: "chaussures sport",
          },
          output: {
            status: "success",
            token: "[REDACTED]",
            found: true,
          },
          success: true,
          duration_ms: 120,
        }),
      });
    });

    it("redacts prefixed secret keys that anchored matching missed", () => {
      const sanitized = service.sanitize({
        clientSecret: "cs_live_abc",
        client_secret: "cs_live_abc",
        privateKey: "-----BEGIN RSA PRIVATE KEY-----",
        refreshToken: "rt_abc",
        cookie: "session=abc",
        "set-cookie": "session=abc; HttpOnly",
        Authorization: "Bearer abc",
        nested: { credentials: { password: "hunter2" } },
      }) as Record<string, unknown>;

      expect(sanitized.clientSecret).toBe("[REDACTED]");
      expect(sanitized.client_secret).toBe("[REDACTED]");
      expect(sanitized.privateKey).toBe("[REDACTED]");
      expect(sanitized.refreshToken).toBe("[REDACTED]");
      expect(sanitized.cookie).toBe("[REDACTED]");
      expect(sanitized["set-cookie"]).toBe("[REDACTED]");
      expect(sanitized.Authorization).toBe("[REDACTED]");
      expect(sanitized.nested).toEqual({ credentials: "[REDACTED]" });
    });

    it("distinguishes benign non-sensitive names from credential variants (collision tests)", () => {
      const sanitized = service.sanitize({
        // Benign names that contain 'secret' or 'token'
        secretary: "Alice Smith",
        secretarial_notes: "Meeting at 10 AM",
        tokenizer: "cl100k_base",
        tokenized_query: "running shoes",
        tokenization: "bpe",
        tokens_per_sec: 45.2,
        token_count: 150,

        // Credential variants of those benign names MUST be redacted
        secretary_password: "supersecretpass",
        secretary_token: "tok_sec_123",
        tokenizer_api_key: "sk_tok_999",
        tokenizerSecret: "sec_tok_888",

        // Card token and CVV variants
        cardToken: "tok_visa_4242",
        card_expiry: "12/28",
        cvv: "123",
        cvc2: "456",
      }) as Record<string, unknown>;

      // Benign are preserved
      expect(sanitized.secretary).toBe("Alice Smith");
      expect(sanitized.tokenizer).toBe("cl100k_base");
      expect(sanitized.tokenized_query).toBe("running shoes");
      expect(sanitized.tokenization).toBe("bpe");
      expect(sanitized.token_count).toBe(150);

      // Credentials are redacted
      expect(sanitized.secretary_password).toBe("[REDACTED]");
      expect(sanitized.secretary_token).toBe("[REDACTED]");
      expect(sanitized.tokenizer_api_key).toBe("[REDACTED]");
      expect(sanitized.tokenizerSecret).toBe("[REDACTED]");
      expect(sanitized.cardToken).toBe("[REDACTED]");
      expect(sanitized.card_expiry).toBe("[REDACTED]");
      expect(sanitized.cvv).toBe("[REDACTED]");
      expect(sanitized.cvc2).toBe("[REDACTED]");
    });

    it("preserves legitimate non-secret expiration metadata while redacting card expiration", () => {
      const sanitized = service.sanitize({
        // Generic non-secret expiration fields MUST NOT be redacted
        reservation_ttl_minutes: 30,
        session_expiration: "2026-08-30T12:00:00Z",
        cache_expiration_days: 7,
        product_expiry_date: "2027-01-01",
        quote_expiration: "2026-08-29T18:00:00Z",

        // Payment card expiration fields MUST be redacted
        card_expiry: "12/28",
        ccexp: "11/27",
        card_expiration: "10/26",
        exp_month: "12",
        exp_year: "2028",
        card_exp_year: "28",
      }) as Record<string, unknown>;

      // Preserved
      expect(sanitized.reservation_ttl_minutes).toBe(30);
      expect(sanitized.session_expiration).toBe("2026-08-30T12:00:00Z");
      expect(sanitized.cache_expiration_days).toBe(7);
      expect(sanitized.product_expiry_date).toBe("2027-01-01");
      expect(sanitized.quote_expiration).toBe("2026-08-29T18:00:00Z");

      // Redacted
      expect(sanitized.card_expiry).toBe("[REDACTED]");
      expect(sanitized.ccexp).toBe("[REDACTED]");
      expect(sanitized.card_expiration).toBe("[REDACTED]");
      expect(sanitized.exp_month).toBe("[REDACTED]");
      expect(sanitized.exp_year).toBe("[REDACTED]");
      expect(sanitized.card_exp_year).toBe("[REDACTED]");
    });

    it("table-driven tests for sensitive key classifications", () => {
      const cases: { key: string; expectedSensitive: boolean }[] = [
        { key: "password", expectedSensitive: true },
        { key: "client_secret", expectedSensitive: true },
        { key: "apiKey", expectedSensitive: true },
        { key: "private_key", expectedSensitive: true },
        { key: "jwt_token", expectedSensitive: true },
        { key: "session_id", expectedSensitive: true },
        { key: "cvv", expectedSensitive: true },
        { key: "cvc2", expectedSensitive: true },
        { key: "credit_card", expectedSensitive: true },
        { key: "card_number", expectedSensitive: true },
        { key: "card_expiry", expectedSensitive: true },
        { key: "ccexp", expectedSensitive: true },
        { key: "exp_month", expectedSensitive: true },
        { key: "account_number", expectedSensitive: true },
        { key: "routing_number", expectedSensitive: true },
        { key: "secretary", expectedSensitive: false },
        { key: "secretariat", expectedSensitive: false },
        { key: "secretary_notes", expectedSensitive: false },
        { key: "tokenizer", expectedSensitive: false },
        { key: "tokenized_query", expectedSensitive: false },
        { key: "tokens_input", expectedSensitive: false },
        { key: "tokens_output", expectedSensitive: false },
        { key: "tokens_used", expectedSensitive: false },
        { key: "reservation_ttl_minutes", expectedSensitive: false },
        { key: "session_expiration", expectedSensitive: false },
      ];

      for (const { key, expectedSensitive } of cases) {
        const result = service.sanitize({ [key]: "test_value" }) as Record<string, string>;
        if (expectedSensitive) {
          expect(result[key]).toBe("[REDACTED]");
        } else {
          expect(result[key]).toBe("test_value");
        }
      }
    });

    it("handles circular references without throwing call stack errors", () => {
      const circularObj: any = { name: "root" };
      circularObj.self = circularObj;
      circularObj.nested = { parent: circularObj };

      const sanitized = service.sanitize(circularObj) as any;
      expect(sanitized.name).toBe("root");
      expect(sanitized.self).toBe("[CIRCULAR]");
      expect(sanitized.nested.parent).toBe("[CIRCULAR]");
    });

    it("handles binary buffers, Uint8Array, Map, Set, and depth limits safely", () => {
      const bufferData = Buffer.from("hello world binary");
      const uint8 = new Uint8Array([1, 2, 3, 4]);
      const set = new Set(["item1", "item2", "4111 1111 1111 1111"]);
      const map = new Map<string, unknown>([
        ["apiKey", "secret-key-123"],
        ["count", 42],
      ]);

      const complex = {
        buf: bufferData,
        arr: uint8,
        setVal: set,
        mapVal: map,
      };

      const sanitized = service.sanitize(complex) as any;
      expect(sanitized.buf).toBe("[BINARY_DATA]");
      expect(sanitized.arr).toBe("[BINARY_DATA]");
      expect(sanitized.setVal).toEqual(["item1", "item2", "[REDACTED_PAN]"]);
      expect(sanitized.mapVal).toEqual({
        apiKey: "[REDACTED]",
        count: 42,
      });
    });

    it("truncates excessively nested objects beyond MAX_SANITIZATION_DEPTH", () => {
      const deep: any = { depth: 0 };
      let curr = deep;
      for (let i = 1; i <= 12; i++) {
        curr.child = { depth: i };
        curr = curr.child;
      }

      const sanitized = service.sanitize(deep) as any;
      expect(sanitized.child.child.child.child.child.child.child.child.child).toBe(
        "[TRUNCATED_DEPTH]",
      );
    });

    it("keeps token *count* telemetry readable", () => {
      // `tokens_input`/`tokens_output` contain "token" but are usage counters;
      // redacting them would blind the observability surface.
      const sanitized = service.sanitize({
        tokens_input: 120,
        tokens_output: 340,
        total_tokens: 460,
        accessToken: "at_abc",
      }) as Record<string, unknown>;

      expect(sanitized.tokens_input).toBe(120);
      expect(sanitized.tokens_output).toBe(340);
      expect(sanitized.total_tokens).toBe(460);
      expect(sanitized.accessToken).toBe("[REDACTED]");
    });

    it("redacts only Luhn-valid card numbers found in free text", () => {
      // Luhn-valid Visa test PAN, formatted with separators.
      const sanitized = service.sanitize({
        note: "paid with 4111 1111 1111 1111 today",
        orderRef: "order 1234567890123456 shipped",
      }) as Record<string, string>;

      expect(sanitized.note).toBe("paid with [REDACTED_PAN] today");
      // A plain 16-digit reference fails Luhn and must survive intact.
      expect(sanitized.orderRef).toBe("order 1234567890123456 shipped");
    });

    it("sanitizes error_message so provider failures cannot leak credentials", async () => {
      prismaMock.aiAction.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: actionId, ...data, created_at: now }),
      );

      await service.recordAction({
        businessId,
        conversationId,
        actionType: "tool_call",
        toolName: "checkout",
        success: false,
        errorMessage: "declined for card 4111111111111111",
      });

      expect(prismaMock.aiAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          error_message: "declined for card [REDACTED_PAN]",
        }),
      });
    });
  });

  describe("2. Trace Lookup: Manager can inspect tool inputs/outputs and reasoning trace", () => {
    it("Trace Lookup: Manager can inspect tool inputs/outputs and reasoning trace.", async () => {
      const mockDecisionTrace = {
        schema_version: 1 as const,
        intent: "purchase_intent",
        confidence: 0.92,
        decision: "handoff",
        escalation_reason: "purchase_handoff" as const,
        handoff_priority: "high" as const,
        rules_checked: ["stock_available", "min_order_amount"],
        policy_outcomes: { stock: "in_stock" },
        tools_called: ["search_products", "check_inventory"],
        rag_chunk_ids: ["faq-123"],
        models_attempted: ["gemini-3.5-flash"],
        grounding_passed: true,
        mode: "inbound",
        latency_ms: 1250,
      };

      prismaMock.aiDecisionTrace.findFirst.mockResolvedValue({
        id: traceId,
        business_id: businessId,
        conversation_id: conversationId,
        inbound_message_id: inboundMessageId,
        outbound_message_id: outboundMessageId,
        decision_trace: mockDecisionTrace,
        created_at: now,
      });

      prismaMock.aiAction.findMany.mockResolvedValue([
        {
          id: actionId,
          business_id: businessId,
          conversation_id: conversationId,
          message_id: inboundMessageId,
          action_type: "tool_call",
          tool_name: "search_products",
          input: { query: "robe rouge", limit: 3 },
          output: { products: [{ id: "p1", name: "Robe Rouge" }] },
          success: true,
          error_message: null,
          duration_ms: 85,
          created_at: now,
        },
      ]);

      const result = await controller.getTrace(businessId, inboundMessageId);

      expect(prismaMock.aiDecisionTrace.findFirst).toHaveBeenCalledWith({
        where: {
          business_id: businessId,
          OR: [
            { inbound_message_id: inboundMessageId },
            { outbound_message_id: inboundMessageId },
            { id: inboundMessageId },
          ],
        },
        // A retried turn writes a second trace for the same message, so the
        // newest is selected explicitly rather than left to the planner.
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });

      // Verify contract expectations
      expect(result.id).toBe(traceId);
      expect(result.businessId).toBe(businessId);
      expect(result.conversationId).toBe(conversationId);
      expect(result.inboundMessageId).toBe(inboundMessageId);
      expect(result.outboundMessageId).toBe(outboundMessageId);
      expect(result.intent).toBe("purchase_intent");
      expect(result.confidence).toBe(0.92);
      expect(result.decision).toBe("handoff");
      expect(result.retrievedChunks).toEqual(["faq-123"]);
      expect(result.toolCalls).toEqual(["search_products", "check_inventory"]);
      expect(result.reasoning).toEqual(mockDecisionTrace);
      expect(result.actions).toHaveLength(1);
      expect(result.actionsTruncated).toBe(false);
      expect(result.actions[0]?.toolName).toBe("search_products");
      expect(result.actions[0]?.input).toEqual({ query: "robe rouge", limit: 3 });
      expect(result.actions[0]?.output).toEqual({ products: [{ id: "p1", name: "Robe Rouge" }] });
    });

    it("reports truncation instead of silently dropping the action tail", async () => {
      prismaMock.aiDecisionTrace.findFirst.mockResolvedValue({
        id: traceId,
        business_id: businessId,
        conversation_id: conversationId,
        inbound_message_id: inboundMessageId,
        outbound_message_id: null,
        decision_trace: { intent: "greeting", confidence: 0.9, decision: "allow" },
        created_at: now,
      });

      // One more than the cap, which is how the service detects truncation.
      prismaMock.aiAction.findMany.mockResolvedValue(
        Array.from({ length: MAX_ACTIONS_PER_TRACE + 1 }, (_, i) => ({
          id: `action-${i}`,
          business_id: businessId,
          conversation_id: conversationId,
          message_id: inboundMessageId,
          action_type: "tool_call",
          tool_name: "search_products",
          input: {},
          output: {},
          success: true,
          error_message: null,
          duration_ms: 10,
          created_at: now,
        })),
      );

      const result = await service.getTraceByMessageId(businessId, inboundMessageId);

      expect(result.actions).toHaveLength(MAX_ACTIONS_PER_TRACE);
      expect(result.actionsTruncated).toBe(true);
    });

    it("redacts secrets in stored action payloads on the way out", async () => {
      // `OrchestratorService.logAiAction` writes rows directly, so the response
      // path cannot assume write-time sanitization happened.
      prismaMock.aiDecisionTrace.findFirst.mockResolvedValue({
        id: traceId,
        business_id: businessId,
        conversation_id: conversationId,
        inbound_message_id: inboundMessageId,
        outbound_message_id: null,
        decision_trace: {},
        created_at: now,
      });
      prismaMock.aiAction.findMany.mockResolvedValue([
        {
          id: actionId,
          business_id: businessId,
          conversation_id: conversationId,
          message_id: inboundMessageId,
          action_type: "tool_call",
          tool_name: "legacy_tool",
          input: { apiKey: "leaked-key", query: "robe" },
          output: { note: "card 4111111111111111" },
          success: false,
          error_message: "failed with token abc for card 4111111111111111",
          duration_ms: 5,
          created_at: now,
        },
      ]);

      const result = await service.getTraceByMessageId(businessId, inboundMessageId);

      expect(result.actions[0]?.input).toEqual({ apiKey: "[REDACTED]", query: "robe" });
      expect(result.actions[0]?.output).toEqual({ note: "card [REDACTED_PAN]" });
      expect(result.actions[0]?.errorMessage).toBe("failed with token abc for card [REDACTED_PAN]");
    });

    it("does not default a missing decision to 'allow' and marks malformed trace with traceInvalid", async () => {
      prismaMock.aiDecisionTrace.findFirst.mockResolvedValue({
        id: traceId,
        business_id: businessId,
        conversation_id: conversationId,
        inbound_message_id: inboundMessageId,
        outbound_message_id: null,
        // Malformed trace: no `decision`, and non-string array members.
        decision_trace: { rag_chunk_ids: ["chunk-1", 42, null], tools_called: [{}, "search"] },
        created_at: now,
      });
      prismaMock.aiAction.findMany.mockResolvedValue([]);

      const result = await service.getTraceByMessageId(businessId, inboundMessageId);

      expect(result.decision).toBe("unknown");
      expect(result.retrievedChunks).toEqual(["chunk-1"]);
      expect(result.toolCalls).toEqual(["search"]);
      expect(result.traceInvalid).toBe(true);
    });

    it("throws 404 NotFoundException when trace does not exist", async () => {
      prismaMock.aiDecisionTrace.findFirst.mockResolvedValue(null);

      await expect(service.getTraceByMessageId(businessId, "non-existent-msg")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("enforces tenant isolation: queries for wrong business return 404", async () => {
      prismaMock.aiDecisionTrace.findFirst.mockImplementation(
        ({ where }: { where: { business_id: string; OR: { inbound_message_id?: string }[] } }) => {
          if (
            where.business_id === businessId &&
            where.OR.some((cond) => cond.inbound_message_id === inboundMessageId)
          ) {
            return Promise.resolve({
              id: traceId,
              business_id: businessId,
              conversation_id: conversationId,
              inbound_message_id: inboundMessageId,
              decision_trace: { intent: "greeting", confidence: 0.95 },
              created_at: now,
            });
          }
          return Promise.resolve(null);
        },
      );

      // Querying with otherBusinessId returns 404
      await expect(service.getTraceByMessageId(otherBusinessId, inboundMessageId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("3. Conversation Traces & Action Log Endpoints", () => {
    it("retrieves full conversation decision trace timeline", async () => {
      prismaMock.conversation.findFirst.mockResolvedValue({ id: conversationId });
      prismaMock.aiDecisionTrace.findMany.mockResolvedValue([
        {
          id: traceId,
          business_id: businessId,
          conversation_id: conversationId,
          inbound_message_id: inboundMessageId,
          outbound_message_id: outboundMessageId,
          decision_trace: {
            intent: "product_inquiry",
            confidence: 0.88,
            decision: "reply",
            tools_called: ["search_products"],
          },
          created_at: now,
        },
      ]);
      prismaMock.aiAction.findMany.mockResolvedValue([]);

      const traces = await controller.getConversationTraces(businessId, conversationId);

      expect(prismaMock.aiDecisionTrace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { business_id: businessId, conversation_id: conversationId },
          orderBy: [{ created_at: "asc" }, { id: "asc" }],
        }),
      );
      expect(traces).toHaveLength(1);
      expect(traces[0]?.intent).toBe("product_inquiry");
      expect(traces[0]?.confidence).toBe(0.88);
    });

    it("returns 404 for a conversation outside the tenant instead of an empty list", async () => {
      prismaMock.conversation.findFirst.mockResolvedValue(null);

      await expect(
        controller.getConversationTraces(otherBusinessId, conversationId),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.conversation.findFirst).toHaveBeenCalledWith({
        where: { id: conversationId, business_id: otherBusinessId },
        select: { id: true },
      });
      expect(prismaMock.aiDecisionTrace.findMany).not.toHaveBeenCalled();
    });

    it("attaches each action to its own trace without re-scanning the action list", async () => {
      prismaMock.conversation.findFirst.mockResolvedValue({ id: conversationId });
      prismaMock.aiDecisionTrace.findMany.mockResolvedValue([
        {
          id: "trace-a",
          business_id: businessId,
          conversation_id: conversationId,
          inbound_message_id: inboundMessageId,
          outbound_message_id: null,
          decision_trace: { intent: "greeting", confidence: 0.9, decision: "allow" },
          created_at: now,
        },
        {
          id: "trace-b",
          business_id: businessId,
          conversation_id: conversationId,
          inbound_message_id: outboundMessageId,
          outbound_message_id: null,
          decision_trace: { intent: "order", confidence: 0.8, decision: "allow" },
          created_at: now,
        },
      ]);
      prismaMock.aiAction.findMany.mockResolvedValue([
        {
          id: "action-a",
          business_id: businessId,
          conversation_id: conversationId,
          message_id: inboundMessageId,
          action_type: "tool_call",
          tool_name: "search_products",
          input: {},
          output: {},
          success: true,
          error_message: null,
          duration_ms: 10,
          created_at: now,
        },
        {
          id: "action-b",
          business_id: businessId,
          conversation_id: conversationId,
          message_id: outboundMessageId,
          action_type: "tool_call",
          tool_name: "check_inventory",
          input: {},
          output: {},
          success: true,
          error_message: null,
          duration_ms: 12,
          created_at: now,
        },
      ]);

      const traces = await controller.getConversationTraces(businessId, conversationId);

      expect(traces[0]?.actions.map((a) => a.id)).toEqual(["action-a"]);
      expect(traces[1]?.actions.map((a) => a.id)).toEqual(["action-b"]);
    });

    it("lists AI actions with pagination and filter options", async () => {
      prismaMock.aiAction.count.mockResolvedValue(1);
      prismaMock.aiAction.findMany.mockResolvedValue([
        {
          id: actionId,
          business_id: businessId,
          conversation_id: conversationId,
          message_id: inboundMessageId,
          action_type: "tool_call",
          tool_name: "check_inventory",
          input: { sku: "SKU-RED-M" },
          output: { available: 5 },
          success: true,
          error_message: null,
          duration_ms: 45,
          created_at: now,
        },
      ]);

      const result = await controller.listActions(businessId, {
        conversationId,
        toolName: "check_inventory",
        limit: "10",
      });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.toolName).toBe("check_inventory");
      expect(result.items[0]?.success).toBe(true);
      expect(prismaMock.aiAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 11,
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
        }),
      );
    });

    it("rejects an unparseable limit with 400 rather than passing NaN to Prisma", async () => {
      // `Number.parseInt("abc", 10)` is NaN, and `Math.min(Math.max(NaN, 1), 100)`
      // stays NaN, which Prisma rejects as an invalid `take`.
      await expect(controller.listActions(businessId, { limit: "abc" })).rejects.toThrow(
        BadRequestException,
      );
      expect(prismaMock.aiAction.findMany).not.toHaveBeenCalled();
    });

    it("rejects an unknown actionType with 400 rather than an invalid Prisma enum", async () => {
      await expect(
        controller.listActions(businessId, { actionType: "not_an_action" }),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.aiAction.findMany).not.toHaveBeenCalled();
    });

    it("retrieves single AI action by ID and rejects non-existent ID", async () => {
      prismaMock.aiAction.findFirst.mockResolvedValueOnce({
        id: actionId,
        business_id: businessId,
        conversation_id: conversationId,
        message_id: inboundMessageId,
        action_type: "tool_call",
        tool_name: "policy_lookup",
        input: { topic: "returns" },
        output: { returnWindowDays: 14 },
        success: true,
        error_message: null,
        duration_ms: 30,
        created_at: now,
      });

      const action = await controller.getAction(businessId, actionId);
      expect(action.id).toBe(actionId);
      expect(action.toolName).toBe("policy_lookup");

      prismaMock.aiAction.findFirst.mockResolvedValueOnce(null);
      await expect(controller.getAction(businessId, "missing-action-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("4. Low-Confidence Streak Tracker (OQ-62)", () => {
    it("computes streak of 2 when last two traces have confidence < 0.65", async () => {
      prismaMock.aiDecisionTrace.findMany.mockResolvedValue([
        {
          id: "t1",
          business_id: businessId,
          conversation_id: conversationId,
          decision_trace: { confidence: 0.45, classifier_error: false },
          created_at: new Date("2026-08-29T12:02:00Z"),
        },
        {
          id: "t2",
          business_id: businessId,
          conversation_id: conversationId,
          decision_trace: { confidence: 0.55, classifier_error: false },
          created_at: new Date("2026-08-29T12:01:00Z"),
        },
      ]);

      const streak = await service.getLowConfidenceStreak(businessId, conversationId, 0.65);
      expect(streak).toBe(2);
    });

    it("resets streak to 0 when latest trace has high confidence (>= 0.65)", async () => {
      prismaMock.aiDecisionTrace.findMany.mockResolvedValue([
        {
          id: "t1",
          business_id: businessId,
          conversation_id: conversationId,
          decision_trace: { confidence: 0.92, classifier_error: false },
          created_at: new Date("2026-08-29T12:02:00Z"),
        },
        {
          id: "t2",
          business_id: businessId,
          conversation_id: conversationId,
          decision_trace: { confidence: 0.5, classifier_error: false },
          created_at: new Date("2026-08-29T12:01:00Z"),
        },
      ]);

      const streak = await service.getLowConfidenceStreak(businessId, conversationId, 0.65);
      expect(streak).toBe(0);
    });

    it("does not increment streak on classifier error/outage", async () => {
      prismaMock.aiDecisionTrace.findMany.mockResolvedValue([
        {
          id: "t1",
          business_id: businessId,
          conversation_id: conversationId,
          decision_trace: { confidence: 0.3, classifier_error: true },
          created_at: new Date("2026-08-29T12:02:00Z"),
        },
      ]);

      const streak = await service.getLowConfidenceStreak(businessId, conversationId, 0.65);
      expect(streak).toBe(0);
    });

    it("orders traces with compound [created_at desc, id desc] tie-breaker and handles missing confidence", async () => {
      prismaMock.aiDecisionTrace.findMany.mockResolvedValue([
        {
          id: "t2",
          business_id: businessId,
          conversation_id: conversationId,
          decision_trace: { intent: "unknown" }, // missing confidence
          created_at: new Date("2026-08-29T12:00:00Z"),
        },
        {
          id: "t1",
          business_id: businessId,
          conversation_id: conversationId,
          decision_trace: { confidence: 0.4 },
          created_at: new Date("2026-08-29T12:00:00Z"),
        },
      ]);

      const streak = await service.getLowConfidenceStreak(businessId, conversationId, 0.65, 3);
      expect(streak).toBe(2);
      expect(prismaMock.aiDecisionTrace.findMany).toHaveBeenCalledWith({
        where: { business_id: businessId, conversation_id: conversationId },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 3,
      });
    });

    it("rejects non-UUID query parameters with 400 Bad Request in listActions", async () => {
      await expect(
        controller.listActions(businessId, { conversationId: "not-a-uuid" }),
      ).rejects.toThrow(BadRequestException);
      await expect(controller.listActions(businessId, { messageId: "not-a-uuid" })).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.listActions(businessId, { cursor: "not-a-uuid" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("translates Prisma cursor P2025 error to 400 Bad Request in listActions", async () => {
      prismaMock.aiAction.count.mockResolvedValue(0);
      const prismaError = new Error("Record to use for cursor not found");
      (prismaError as any).code = "P2025";
      prismaMock.aiAction.findMany.mockRejectedValue(prismaError);

      await expect(controller.listActions(businessId, { cursor: actionId })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects unknown query properties via strict schema in listActions", async () => {
      await expect(
        controller.listActions(businessId, { unknownField: "bad" } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("5. RBAC & Security Guardrails", () => {
    it("verifies controller has correct permission decorators on all endpoints", () => {
      const getTraceHandler = Reflect.get(ObservabilityController.prototype, "getTrace") as object;
      const getTracePerm = Reflect.getMetadata(PERMISSIONS_KEY, getTraceHandler);
      expect(getTracePerm).toEqual(["ai.configure"]);

      const getConvTracesHandler = Reflect.get(
        ObservabilityController.prototype,
        "getConversationTraces",
      ) as object;
      const getConvTracesPerm = Reflect.getMetadata(PERMISSIONS_KEY, getConvTracesHandler);
      expect(getConvTracesPerm).toEqual(["ai.traces.read"]);

      const listActionsHandler = Reflect.get(
        ObservabilityController.prototype,
        "listActions",
      ) as object;
      const listActionsPerm = Reflect.getMetadata(PERMISSIONS_KEY, listActionsHandler);
      expect(listActionsPerm).toEqual(["ai.traces.read"]);

      const getActionHandler = Reflect.get(
        ObservabilityController.prototype,
        "getAction",
      ) as object;
      const getActionPerm = Reflect.getMetadata(PERMISSIONS_KEY, getActionHandler);
      expect(getActionPerm).toEqual(["ai.traces.read"]);
    });

    it("Employee Access (403): Employee role receives 403 Forbidden for decision traces", async () => {
      const reflector = new Reflector();
      const guard = new PermissionsGuard(reflector, prismaMock as unknown as PrismaClient);

      const handler = () => undefined;
      RequirePermission("ai.configure")(handler);

      const employeeReq = {
        membership: {
          role: {
            name: "employee",
            role_permissions: [],
          },
        },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => employeeReq,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => handler,
        getClass: () => ObservabilityController,
      } as any;

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("Owner/Admin Access: Owner and Admin roles are permitted to access decision traces", async () => {
      const reflector = new Reflector();
      const guard = new PermissionsGuard(reflector, prismaMock as unknown as PrismaClient);

      const handler = () => undefined;
      RequirePermission("ai.configure")(handler);

      const ownerReq = {
        membership: {
          role: {
            name: "owner",
            role_permissions: [],
          },
        },
      };

      const ownerContext = {
        switchToHttp: () => ({
          getRequest: () => ownerReq,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => handler,
        getClass: () => ObservabilityController,
      } as any;

      expect(await guard.canActivate(ownerContext)).toBe(true);

      const adminReq = {
        membership: {
          role: {
            name: "admin",
            role_permissions: [],
          },
        },
      };

      const adminContext = {
        switchToHttp: () => ({
          getRequest: () => adminReq,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => handler,
        getClass: () => ObservabilityController,
      } as any;

      expect(await guard.canActivate(adminContext)).toBe(true);
    });
  });
});
