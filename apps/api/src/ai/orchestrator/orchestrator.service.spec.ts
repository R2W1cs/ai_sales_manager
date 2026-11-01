import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ProductStatus, type PrismaClient } from "@prisma/client";

import { HandoffContextSchema } from "@app/shared";

import { ModelFallbackService } from "../gateway/model-fallback.service";
import { IntentClassifierService } from "../intent/intent-classifier.service";
import { PromptBuilderService } from "../prompts/prompt-builder.service";
import { CatalogSearchTool } from "../tools/catalog-search.tool";
import { PolicyLookupTool } from "../tools/policy-lookup.tool";
import { StockCheckTool } from "../tools/stock-check.tool";
import { OrchestratorService, type LockValidator } from "./orchestrator.service";

describe("AI Sales Agent core orchestrator & tool execution pipeline (T-AI-01)", () => {
  const businessId = "11111111-1111-4111-a111-111111111111";
  const conversationId = "22222222-2222-4222-a222-222222222222";
  const customerId = "33333333-3333-4333-a333-333333333333";
  const productId = "44444444-4444-4444-a444-444444444444";
  const variantId = "55555555-5555-4555-a555-555555555555";
  const inboundMessageId = "66666666-6666-4666-a666-666666666666";

  let orchestratorService: OrchestratorService;
  let catalogSearchTool: CatalogSearchTool;
  let stockCheckTool: StockCheckTool;
  let policyLookupTool: PolicyLookupTool;
  let intentClassifier: IntentClassifierService;
  let promptBuilder: PromptBuilderService;
  let mockLockValidator: LockValidator;

  // Mock Prisma client with in-memory stores
  let mockAiUsageCreated: Record<string, unknown>[] = [];
  let mockAiActionsCreated: Record<string, unknown>[] = [];
  let mockAiDecisionTracesCreated: Record<string, unknown>[] = [];

  const mockProduct = {
    id: productId,
    business_id: businessId,
    name: "Robe Noire Soirée",
    description: "Élégante robe noire en satin",
    status: ProductStatus.active,
    currency: "TND",
    category: { name: "Robes" },
    images: [{ url: "https://s3.example.com/robe.jpg", is_primary: true, sort_order: 0 }],
    variants: [
      {
        id: variantId,
        business_id: businessId,
        product_id: productId,
        sku: "ROBE-BLK-M",
        attributes: { size: "M", color: "Noir" },
        price: 89.0,
        discount_price: null,
        stock: 5,
        is_default: true,
        images: [],
        product: {
          name: "Robe Noire Soirée",
          currency: "TND",
        },
      },
    ],
  };

  const mockConversation = {
    id: conversationId,
    business_id: businessId,
    customer_id: customerId,
    source: "INSTAGRAM",
    status: "OPEN",
    is_test: false,
    last_intent: null,
    customer: {
      id: customerId,
      name: "Sarra Ben Ali",
      phone: "+21698123456",
      lifecycle_stage: "LEAD",
    },
  };

  const mockAiAgent = {
    id: "agent-1",
    business_id: businessId,
    name: "Yasmine",
    personality: "Chaleureuse, experte mode et vente.",
    language: "ar",
    tone: "Amical et direct",
    sales_strategy: { upsell: true, cross_sell: true, aggressiveness: "medium" },
    confidence_threshold: 0.65,
    enabled: true,
  };

  const mockAiSettings = {
    business_id: businessId,
    model_primary: "gemini-3.5-flash",
    model_fallback: "gpt-5.6-terra",
    max_tokens: 400,
    temperature: 0.4,
    rag_top_k: 5,
    include_product_images_in_context: false,
    blocked_topics: ["politics", "crypto"],
    custom_system_append: null,
    reply_mode: "auto_send",
  };

  const mockPrisma = {
    conversation: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === conversationId) return Promise.resolve(mockConversation);
        return Promise.resolve(null);
      }),
      update: jest.fn().mockResolvedValue(mockConversation),
    },
    aiAgent: {
      findUnique: jest.fn().mockResolvedValue(mockAiAgent),
    },
    aiSettings: {
      findUnique: jest.fn().mockResolvedValue(mockAiSettings),
    },
    businessRule: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "rule-1",
          business_id: businessId,
          rule_type: "delivery",
          enabled: true,
          priority: 10,
          payload: {
            zones: [
              { name: "Grand Tunis", fee: 7.0, currency: "TND", eta_hours: 24 },
              { name: "Sousse / Sahel", fee: 8.0, currency: "TND", eta_hours: 48 },
            ],
          },
        },
      ]),
      findFirst: jest.fn().mockImplementation(({ where }: { where: { rule_type?: string } }) => {
        if (where.rule_type === "delivery") {
          return Promise.resolve({
            id: "rule-1",
            business_id: businessId,
            rule_type: "delivery",
            enabled: true,
            priority: 10,
            payload: {
              zones: [
                { name: "Grand Tunis", fee: 7.0, currency: "TND", eta_hours: 24 },
                { name: "Sousse / Sahel", fee: 8.0, currency: "TND", eta_hours: 48 },
              ],
            },
          });
        }
        return Promise.resolve(null);
      }),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([mockProduct]),
    },
    productVariant: {
      findMany: jest.fn().mockResolvedValue(mockProduct.variants),
    },
    stockReservation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    aiUsage: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        mockAiUsageCreated.push(data);
        return Promise.resolve({ id: "usage-1", ...data });
      }),
    },
    aiAction: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        mockAiActionsCreated.push(data);
        return Promise.resolve({ id: "action-1", ...data });
      }),
    },
    aiDecisionTrace: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        mockAiDecisionTracesCreated.push(data);
        return Promise.resolve({ id: "trace-1", ...data });
      }),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAiUsageCreated = [];
    mockAiActionsCreated = [];
    mockAiDecisionTracesCreated = [];

    promptBuilder = new PromptBuilderService();
    intentClassifier = new IntentClassifierService();
    catalogSearchTool = new CatalogSearchTool(mockPrisma as unknown as PrismaClient);
    stockCheckTool = new StockCheckTool(mockPrisma as unknown as PrismaClient);
    policyLookupTool = new PolicyLookupTool(mockPrisma as unknown as PrismaClient);
    mockLockValidator = {
      validateToken: jest.fn().mockResolvedValue(true),
    };

    orchestratorService = new OrchestratorService(
      promptBuilder,
      catalogSearchTool,
      stockCheckTool,
      policyLookupTool,
      intentClassifier,
      mockLockValidator,
      mockPrisma as unknown as PrismaClient,
    );
  });

  it("Grounded Response: Product inquiry returns verified catalog price and stock.", async () => {
    const result = await orchestratorService.executeTurn(
      conversationId,
      "3aslema, 9addeh el robe noire?",
      {
        businessId,
        inboundMessageId,
      },
    );

    expect(result).toBeDefined();
    expect(result.response).toContain("89.000 TND");
    expect(result.response).toContain("5 pièces");
    expect(result.groundingPassed).toBe(true);
    expect(result.toolsCalled).toContain("searchCatalog");
    expect(result.toolsCalled).toContain("checkStock");
  });

  it("Tool Loop: Orchestrator calls search and stock tools before outputting answer.", async () => {
    const result = await orchestratorService.executeTurn(
      conversationId,
      "famma robe noire dispo?",
      {
        businessId,
        inboundMessageId,
      },
    );

    expect(result.toolsCalled).toEqual(expect.arrayContaining(["searchCatalog", "checkStock"]));

    // Verify AI actions recorded in database
    expect(mockAiActionsCreated.length).toBeGreaterThanOrEqual(2);
    const toolNames = mockAiActionsCreated.map((a) => a.tool_name as string);
    expect(toolNames).toContain("searchCatalog");
    expect(toolNames).toContain("checkStock");
  });

  it("Token Recording: Logs token counts and model ID in `ai_usage` table.", async () => {
    const result = await orchestratorService.executeTurn(conversationId, "Combien coute la robe?", {
      businessId,
      inboundMessageId,
    });

    expect(mockAiUsageCreated.length).toBe(1);
    const usageRow = mockAiUsageCreated[0];
    expect(usageRow?.business_id).toBe(businessId);
    expect(usageRow?.conversation_id).toBe(conversationId);
    expect(usageRow?.model).toBe("gemini-3.5-flash");
    expect(usageRow?.provider).toBe("google");
    expect(Number(usageRow?.tokens_input)).toBeGreaterThan(0);
    expect(Number(usageRow?.tokens_output)).toBeGreaterThan(0);
    expect(Number(usageRow?.estimated_cost_usd)).toBeGreaterThan(0);

    expect(result.usage.tokensInput).toBe(usageRow?.tokens_input);
    expect(result.usage.tokensOutput).toBe(usageRow?.tokens_output);
  });

  it("Policy Tool: Correctly resolves store delivery zones for region inquiry", async () => {
    const result = await orchestratorService.executeTurn(
      conversationId,
      "b9adech livraison l Tunis?",
      {
        businessId,
        inboundMessageId,
      },
    );

    expect(result.toolsCalled).toContain("getStorePolicy");
    const policyAction = mockAiActionsCreated.find((a) => a.tool_name === "getStorePolicy");
    expect(policyAction).toBeDefined();
    expect((policyAction?.input as { type: string } | undefined)?.type).toBe("delivery");
  });

  it("Human Handoff: Escalates to HUMAN_REQUIRED and validates HandoffContext schema", async () => {
    const result = await orchestratorService.executeTurn(
      conversationId,
      "Choufli 3abd n7eb nkalem un agent",
      {
        businessId,
        inboundMessageId,
      },
    );

    expect(result.toolsCalled).toContain("requestHumanHandoff");
    expect(result.intendedTransition).toBeDefined();
    expect(result.intendedTransition?.toStatus).toBe("HUMAN_REQUIRED");
    expect(result.intendedTransition?.escalationReason).toBe("human_request");

    // Strictly validate against Zod HandoffContextSchema per 06 §4 and 12 §14.1
    const handoffContext = result.intendedTransition?.handoffContext;
    const validated = HandoffContextSchema.safeParse(handoffContext);
    expect(validated.success).toBe(true);
  });

  it("Lock Token Validation: Rejects turn with staleLock=true when lock token is invalid", async () => {
    mockLockValidator.validateToken = jest.fn().mockResolvedValue(false);

    const result = await orchestratorService.executeTurn(
      conversationId,
      "3aslema, 9addeh el robe noire?",
      {
        businessId,
        lockToken: "expired-or-stale-token",
      },
    );

    expect(result.staleLock).toBe(true);
    expect(result.deliveryIntent).toBe("none");
    expect(result.response).toBeNull();
    expect(result.toolsCalled.length).toBe(0);
  });

  it("Intent Classification: Populates decision trace with detected intent and secondary intents", async () => {
    await orchestratorService.executeTurn(conversationId, "3aslema, 9addeh el prix mte3 el robe?", {
      businessId,
      inboundMessageId,
    });

    expect(mockAiDecisionTracesCreated.length).toBe(1);
    const trace = mockAiDecisionTracesCreated[0];
    const tracePayload = trace?.decision_trace as Record<string, unknown>;
    expect(tracePayload.schema_version).toBe(1);
    expect(tracePayload.intent).toBe("price_question");
    expect(Array.isArray(tracePayload.secondary_intents)).toBe(true);
    expect(tracePayload.decision).toBe("allow");
    expect(tracePayload.grounding_passed).toBe(true);
  });

  it("Tenancy Guardrail: Throws BadRequestException on cross-tenant access attempt", async () => {
    await expect(
      orchestratorService.executeTurn(conversationId, "hello", {
        businessId: "99999999-9999-9999-9999-999999999999",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("Not Found Guardrail: Throws NotFoundException for unknown conversation", async () => {
    await expect(
      orchestratorService.executeTurn("00000000-0000-0000-0000-000000000000", "hello", {
        businessId,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("Stock Check Guard: Returns empty summary when no variant/sku/product ID is provided", async () => {
    const output = await stockCheckTool.checkStock(businessId, {});
    expect(output.items).toEqual([]);
    expect(output.textSummary).toContain("No variant, SKU, or product ID specified");
  });

  it("Policy Tool Guard: Returns default summary when policy rule payload is missing or empty", async () => {
    const output = await policyLookupTool.getStorePolicy(businessId, {
      type: "returns",
    });
    expect(output.ruleFound).toBe(false);
    expect(output.textSummary).toContain("Standard store terms apply");
  });

  it("Prompt Builder: Formats Tunisian Derja contract and merchant business rules cleanly", () => {
    const prompt = promptBuilder.buildPrompt({
      businessId,
      conversationId,
      inboundMessage: "3aslema 9addeh livraison?",
      rules: [
        {
          id: "r-1",
          business_id: businessId,
          rule_type: "free_shipping",
          enabled: true,
          priority: 5,
          payload: { threshold: 100, currency: "TND" },
          effective_from: new Date(),
          effective_to: null,
          created_at: new Date(),
        },
      ],
    });

    expect(prompt.systemPrompt).toContain("LANGUAGE & DIALECT CONTRACT");
    expect(prompt.systemPrompt).toContain("Free Shipping: on orders above 100.000 TND");
    expect(prompt.userPrompt).toContain("3aslema 9addeh livraison?");
  });

  it("Grounding Guard: Fails and escalates integration_failure when response contains blocked topics", async () => {
    // Override generateResponseWithFallbacks via spy to simulate blocked topic hallucination
    const spy = jest
      .spyOn(
        orchestratorService as unknown as { generateResponseWithFallbacks: () => Promise<unknown> },
        "generateResponseWithFallbacks",
      )
      .mockResolvedValueOnce({
        text: "Let us discuss politics and crypto investments.",
        model: "gemini-3.5-flash",
        provider: "google",
        tokensInput: 100,
        tokensOutput: 50,
        estimatedCostUsd: 0.00002,
      });

    const result = await orchestratorService.executeTurn(conversationId, "Tell me about this", {
      businessId,
      inboundMessageId,
    });

    expect(result.groundingPassed).toBe(false);
    expect(result.response).toBeNull();
    expect(result.deliveryIntent).toBe("none");
    expect(result.intendedTransition?.toStatus).toBe("HUMAN_REQUIRED");
    expect(result.intendedTransition?.escalationReason).toBe("integration_failure");
    expect(result.intendedTransition?.handoffPriority).toBe("CRITICAL");

    spy.mockRestore();
  });

  it("Grounding Guard: Fails and escalates when response contains forbidden refund commitment", async () => {
    const spy = jest
      .spyOn(
        orchestratorService as unknown as { generateResponseWithFallbacks: () => Promise<unknown> },
        "generateResponseWithFallbacks",
      )
      .mockResolvedValueOnce({
        text: "Bonjour, votre remboursement immédiat est accepté.",
        model: "gemini-3.5-flash",
        provider: "google",
        tokensInput: 100,
        tokensOutput: 50,
        estimatedCostUsd: 0.00002,
      });

    const result = await orchestratorService.executeTurn(conversationId, "Je veux mon argent", {
      businessId,
      inboundMessageId,
    });

    expect(result.groundingPassed).toBe(false);
    expect(result.response).toBeNull();
    expect(result.intendedTransition?.toStatus).toBe("HUMAN_REQUIRED");
    expect(result.intendedTransition?.escalationReason).toBe("integration_failure");

    spy.mockRestore();
  });

  it("Provider outage: does not send deterministic text when the configured fallback chain fails", async () => {
    const gateway = {
      isConfigured: jest.fn().mockReturnValue(true),
      generateText: jest.fn().mockRejectedValue(new Error("provider unavailable")),
    };
    const fallback = new ModelFallbackService(gateway);
    const configuredOrchestrator = new OrchestratorService(
      promptBuilder,
      catalogSearchTool,
      stockCheckTool,
      policyLookupTool,
      intentClassifier,
      mockLockValidator,
      mockPrisma as unknown as PrismaClient,
      gateway as never,
      fallback,
    );

    const result = await configuredOrchestrator.executeTurn(conversationId, "Hello", {
      businessId,
      inboundMessageId,
    });

    expect(result.response).toBeNull();
    expect(result.deliveryIntent).toBe("none");
    expect(result.intendedTransition?.toStatus).toBe("HUMAN_REQUIRED");
    expect(result.intendedTransition?.escalationReason).toBe("integration_failure");
    expect(gateway.generateText).toHaveBeenCalledTimes(3);
  });

  it("Process Turn: Supports alternative processTurn direct interface", async () => {
    const result = await orchestratorService.processTurn({
      businessId,
      conversationId,
      inboundMessage: "3aslema, 9addeh el robe noire?",
      inboundMessageId,
    });

    expect(result).toBeDefined();
    expect(result.response).toContain("89.000 TND");
    expect(result.deliveryIntent).toBe("queued");
  });

  it("Delivery Modes: Maps draft and local delivery intents for suggest and playground modes", async () => {
    const suggestResult = await orchestratorService.executeTurn(
      conversationId,
      "3aslema, 9addeh el robe noire?",
      {
        businessId,
        inboundMessageId,
        mode: "suggest",
      },
    );
    expect(suggestResult.deliveryIntent).toBe("draft");

    mockPrisma.conversation.findUnique.mockResolvedValueOnce({
      ...mockConversation,
      is_test: true,
      source: "playground",
    });

    const playgroundResult = await orchestratorService.executeTurn(
      conversationId,
      "3aslema, 9addeh el robe noire?",
      {
        businessId,
        inboundMessageId,
        mode: "playground",
      },
    );
    expect(playgroundResult.deliveryIntent).toBe("local");

    // Enforce rejection if mode = playground on non-test conversation
    await expect(
      orchestratorService.executeTurn(conversationId, "3aslema", {
        businessId,
        mode: "playground",
      }),
    ).rejects.toThrow(BadRequestException);

    // Enforce rejection if mode = playground on test conversation with non-playground source
    mockPrisma.conversation.findUnique.mockResolvedValueOnce({
      ...mockConversation,
      is_test: true,
      source: "whatsapp",
    });

    await expect(
      orchestratorService.executeTurn(conversationId, "3aslema", {
        businessId,
        mode: "playground",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("Tool Capability Registry: Enforces fail-closed isolation against mutating tools in playground & suggest modes", () => {
    expect(() => {
      orchestratorService.assertToolAllowedForMode("reserve_stock", "playground");
    }).toThrow(BadRequestException);

    expect(() => {
      orchestratorService.assertToolAllowedForMode("create_pending_order", "playground");
    }).toThrow(BadRequestException);

    expect(() => {
      orchestratorService.assertToolAllowedForMode("createOrder", "playground");
    }).toThrow(BadRequestException);

    expect(() => {
      orchestratorService.assertToolAllowedForMode("chargePayment", "playground");
    }).toThrow(BadRequestException);

    expect(() => {
      orchestratorService.assertToolAllowedForMode("sendMessageLive", "suggest");
    }).toThrow(BadRequestException);

    expect(() => {
      orchestratorService.assertToolAllowedForMode("unregistered_tool", "playground");
    }).toThrow(BadRequestException);

    expect(() => {
      orchestratorService.assertToolAllowedForMode("searchCatalog", "playground");
    }).not.toThrow();

    expect(() => {
      orchestratorService.assertToolAllowedForMode("checkStock", "playground");
    }).not.toThrow();

    expect(() => {
      orchestratorService.assertToolAllowedForMode("getStorePolicy", "playground");
    }).not.toThrow();
  });

  it("Sanitizes sensitive data at write-time when logging AI actions", async () => {
    mockAiActionsCreated = [];

    await orchestratorService.executeTurn(
      conversationId,
      "3andkom livraison lel Marsa? carte 4111 1111 1111 1111",
      { businessId, inboundMessageId },
    );

    expect(mockAiActionsCreated.length).toBeGreaterThan(0);
    const allInputs = mockAiActionsCreated.map((a) => JSON.stringify(a.input)).join(" ");
    const allOutputs = mockAiActionsCreated.map((a) => JSON.stringify(a.output)).join(" ");

    expect(allInputs).not.toContain("4111 1111 1111 1111");
    expect(allOutputs).not.toContain("4111 1111 1111 1111");
    expect(allInputs).toContain("[REDACTED_PAN]");
  });

  it("Sanitizes leaked simulated tool execution syntax from AI responses", () => {
    const rawLeakedOutput =
      '3aslema! Bien sûr, nraja7lek chneya famma.\n\n**Searching for products:**\n\n* **Tool**: `search_products`\n* **Parameters**: `{"query": "sbabet"}`';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sanitized = (orchestratorService as any).sanitizeModelOutput(
      rawLeakedOutput,
      { products: [], totalFound: 0, textSummary: "No products found" },
      true,
    );

    expect(sanitized).not.toContain("**Searching for products:**");
    expect(sanitized).not.toContain("search_products");
    expect(sanitized).not.toContain("Parameters");
    expect(sanitized).toContain("3aslema");
  });
});
