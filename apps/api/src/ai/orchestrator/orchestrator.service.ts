import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  AiActionType,
  ConversationSource,
  type BusinessRule,
  type Conversation,
  type Customer,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma as defaultPrisma } from "../../lib/prisma";
import {
  AiGatewayService,
  resolveProviderName,
  calculateModelCost,
} from "../gateway/ai-gateway.service";
import { ModelFallbackService } from "../gateway/model-fallback.service";
import { IntentClassifierService, type CanonicalIntent } from "../intent/intent-classifier.service";
import { isTunisianDialect } from "../intent/rule-intent-classifier";
import { sanitizeObservabilityData, sanitizeText } from "../observability/observability.service";
import { PromptBuilderService, type BuiltPrompt } from "../prompts/prompt-builder.service";
import { CatalogSearchTool, type CatalogSearchOutput } from "../tools/catalog-search.tool";
import {
  PolicyLookupTool,
  type PolicyLookupOutput,
  type PolicyType,
} from "../tools/policy-lookup.tool";
import { StockCheckTool, type StockCheckOutput } from "../tools/stock-check.tool";
import { assertToolCapability } from "../tools/tool-registry";

export interface LockValidator {
  validateToken(businessId: string, convId: string, token: string): Promise<boolean>;
}

export interface ExecuteTurnOptions {
  businessId?: string;
  inboundMessageId?: string;
  mode?: "inbound" | "suggest" | "playground";
  lockToken?: string;
}

export interface ProcessTurnInput {
  businessId: string;
  conversationId: string;
  inboundMessageId?: string;
  inboundMessage?: string;
  mode?: "inbound" | "suggest" | "playground";
  lockToken?: string;
}

export interface TurnResultUsage {
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
}

export interface IntendedTransition {
  toStatus: string;
  escalationReason?: string;
  handoffPriority?: string;
  handoffContext?: unknown;
}

export interface TurnResult {
  response: string | null;
  deliveryIntent: "queued" | "draft" | "local" | "none";
  toolsCalled: string[];
  groundingPassed: boolean;
  staleLock?: boolean;
  intendedTransition?: IntendedTransition | null;
  handoffContext?: unknown;
  usage: TurnResultUsage;
  decisionTraceId?: string;
}

/**
 * 15_AI_ARCHITECTURE §8.1 Caps & Pinned Models (11 §9.0)
 */
const MAX_TOOL_INVOCATIONS = 8;
const DEFAULT_PRIMARY_MODEL = "gemini-3.5-flash";
const DEFAULT_FALLBACK_MODEL = "gpt-5.6-terra";
const DEFAULT_FALLBACK_2_MODEL = "claude-sonnet-5";

@Injectable()
export class OrchestratorService {
  private readonly prisma: PrismaClient;
  private readonly aiGateway: AiGatewayService;
  private readonly modelFallback: ModelFallbackService;

  constructor(
    private readonly promptBuilder: PromptBuilderService,
    private readonly catalogSearchTool: CatalogSearchTool,
    private readonly stockCheckTool: StockCheckTool,
    private readonly policyLookupTool: PolicyLookupTool,
    private readonly intentClassifier: IntentClassifierService,
    @Optional() private readonly lockValidator?: LockValidator,
    @Optional() prismaClient?: PrismaClient,
    @Optional() aiGateway?: AiGatewayService,
    @Optional() modelFallback?: ModelFallbackService,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
    this.aiGateway = aiGateway ?? new AiGatewayService();
    this.modelFallback = modelFallback ?? new ModelFallbackService(this.aiGateway);
  }

  /**
   * Main entrypoint for AI Sales Agent turn execution
   * Compatible with: executeTurn(conversationId, inboundMessage, options)
   */
  async executeTurn(
    conversationId: string,
    inboundMessage: string | { id?: string; text?: string; content?: string },
    options?: ExecuteTurnOptions,
  ): Promise<TurnResult> {
    let messageText =
      typeof inboundMessage === "string"
        ? inboundMessage
        : inboundMessage.content || inboundMessage.text || "";

    const messageId =
      typeof inboundMessage === "object" ? inboundMessage.id : options?.inboundMessageId;

    if (!messageText && messageId) {
      const msg = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { content: true },
      });
      if (msg?.content) {
        messageText = msg.content;
      }
    }

    // 1. Resolve conversation & tenant
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: `Conversation ${conversationId} not found`,
        },
      });
    }

    const businessId = options?.businessId ?? conversation.business_id;
    if (conversation.business_id !== businessId) {
      throw new BadRequestException({
        error: {
          code: "tenancy_violation",
          message: "Conversation does not belong to specified business tenant",
        },
      });
    }

    const isPlaygroundConv =
      conversation.is_test && conversation.source === ConversationSource.playground;
    const mode = options?.mode ?? (isPlaygroundConv ? "playground" : "inbound");

    if (mode === "playground") {
      if (!isPlaygroundConv) {
        throw new BadRequestException({
          error: {
            code: "isolation_violation",
            message:
              "Cannot run playground simulation mode on a non-playground or production conversation",
          },
        });
      }
    } else if (isPlaygroundConv) {
      throw new BadRequestException({
        error: {
          code: "isolation_violation",
          message: "Cannot run live or non-playground mode on a sandbox playground conversation",
        },
      });
    }

    return this.runTurnPipeline({
      businessId,
      conversationId,
      conversation,
      inboundMessageText: messageText,
      inboundMessageId: messageId,
      mode,
      lockToken: options?.lockToken,
    });
  }

  /**
   * Alternative direct pipeline interface per 15 §3
   */
  async processTurn(input: ProcessTurnInput): Promise<TurnResult> {
    return this.executeTurn(input.conversationId, input.inboundMessage ?? "", {
      businessId: input.businessId,
      inboundMessageId: input.inboundMessageId,
      mode: input.mode,
      lockToken: input.lockToken,
    });
  }

  /**
   * Execute complete 8-stage AI turn pipeline adhering to 15_AI_ARCHITECTURE & 05_AI_BEHAVIOR_SPECIFICATION
   */
  private async runTurnPipeline(params: {
    businessId: string;
    conversationId: string;
    conversation: Conversation & { customer: Customer | null };
    inboundMessageText: string;
    inboundMessageId?: string;
    mode: "inbound" | "suggest" | "playground";
    lockToken?: string;
  }): Promise<TurnResult> {
    const startTime = Date.now();
    const {
      businessId,
      conversationId,
      conversation,
      inboundMessageText,
      inboundMessageId,
      mode,
      lockToken,
    } = params;

    // Defense-in-depth sandbox check
    if (
      mode === "playground" &&
      (!conversation.is_test || conversation.source !== ConversationSource.playground)
    ) {
      throw new BadRequestException({
        error: {
          code: "isolation_violation",
          message:
            "Cannot run playground simulation mode on a non-playground or production conversation",
        },
      });
    }

    // 1. Invariant 4: Verify Lock Token if provided
    if (lockToken && this.lockValidator) {
      const isLockValid = await this.lockValidator.validateToken(
        businessId,
        conversationId,
        lockToken,
      );
      if (!isLockValid) {
        logger.warn({ conversationId, lockToken }, "Stale lock detected in AI processTurn");
        return {
          response: null,
          deliveryIntent: "none",
          toolsCalled: [],
          groundingPassed: false,
          staleLock: true,
          intendedTransition: null,
          usage: {
            provider: "simulator",
            model: DEFAULT_PRIMARY_MODEL,
            tokensInput: 0,
            tokensOutput: 0,
            estimatedCostUsd: 0,
          },
        };
      }
    }

    // 2. Load tenant configuration and context
    const [business, agent, settings, rules, history] = await Promise.all([
      this.prisma.business?.findUnique
        ? this.prisma.business.findUnique({ where: { id: businessId } })
        : Promise.resolve(null),
      this.prisma.aiAgent.findUnique({ where: { business_id: businessId } }),
      this.prisma.aiSettings.findUnique({ where: { business_id: businessId } }),
      this.prisma.businessRule.findMany({
        where: { business_id: businessId, enabled: true },
      }),
      this.prisma.message.findMany({
        where: { business_id: businessId, conversation_id: conversationId },
        orderBy: { created_at: "asc" },
        take: 20,
      }),
    ]);

    const toolsCalled: string[] = [];
    const toolResultsSummaries: string[] = [];
    let intendedTransition: IntendedTransition | null = null;
    let toolInvocationCount = 0;

    // 3. Stage 3: Intent Classification (05 §6 & 15 §6)
    const classification = await this.intentClassifier.classify(inboundMessageText);
    const detectedIntent: CanonicalIntent = classification.intent;
    const confidence = classification.confidence;
    const secondaryIntents = classification.secondary;

    await this.logAiAction({
      businessId,
      conversationId,
      messageId: inboundMessageId,
      actionType: AiActionType.intent_classify,
      toolName: "intent_classifier",
      input: { message: inboundMessageText },
      output: {
        intent: detectedIntent,
        confidence,
        secondary: secondaryIntents,
        source: classification.source,
        matchedRule: classification.matchedRule,
        entities: classification.entities,
      },
      success: true,
      durationMs: classification.latencyMs,
    });

    // 4. Stage 4: Policy & Safety Check (06 §4)
    if (detectedIntent === "human_request" || detectedIntent === "complaint") {
      const isComplaint = detectedIntent === "complaint";
      const priority = isComplaint ? "critical" : "high";
      const reason = isComplaint ? "complaint" : "human_request";

      if (toolInvocationCount < MAX_TOOL_INVOCATIONS) {
        await this.executeTool("requestHumanHandoff", mode, () =>
          Promise.resolve({
            success: true,
            reason,
            priority,
          }),
        );
        toolsCalled.push("requestHumanHandoff");
        toolInvocationCount++;
      }

      intendedTransition = {
        toStatus: "HUMAN_REQUIRED",
        escalationReason: reason,
        handoffPriority: priority.toUpperCase(),
        handoffContext: {
          schema_version: 1,
          customer: this.buildHandoffCustomer(conversation),
          summary: isComplaint
            ? "Customer registered a complaint requiring human intervention"
            : "Customer requested human support",
          intent: detectedIntent,
          confidence,
          confidence_source: "llm",
          products_discussed: [],
          collected_fields: [],
          missing_fields: [],
          ai_recommendation: isComplaint
            ? "Staff member should handle customer complaint promptly"
            : "Staff representative should take over conversation",
          escalation_reason: reason,
          handoff_priority: priority,
          also_matched: [],
          pending_order: null,
          action_required: "Respond to customer inquiry directly",
        },
      };

      await this.logAiAction({
        businessId,
        conversationId,
        messageId: inboundMessageId,
        actionType: AiActionType.handoff,
        toolName: "requestHumanHandoff",
        input: { reason, priority },
        output: { success: true },
        success: true,
      });
    }

    // 5. Tool Planning & Execution (Stage 6) with 8-invocation cap
    // Policy Lookup Tool
    const isPolicyIntent =
      detectedIntent === "delivery_inquiry" ||
      detectedIntent === "payment_inquiry" ||
      detectedIntent === "return_inquiry" ||
      detectedIntent === "discount_inquiry";

    if (isPolicyIntent && !intendedTransition && toolInvocationCount < MAX_TOOL_INVOCATIONS) {
      let policyType: PolicyType = "delivery";
      if (detectedIntent === "payment_inquiry") policyType = "payment";
      else if (detectedIntent === "return_inquiry") policyType = "returns";
      else if (detectedIntent === "discount_inquiry") policyType = "discount";

      const region = this.extractTunisianRegion(inboundMessageText);

      const policyResult: PolicyLookupOutput = await this.executeTool("getStorePolicy", mode, () =>
        this.policyLookupTool.getStorePolicy(businessId, {
          type: policyType,
          region,
        }),
      );

      toolsCalled.push("getStorePolicy");
      toolInvocationCount++;
      toolResultsSummaries.push(policyResult.textSummary);

      await this.logAiAction({
        businessId,
        conversationId,
        messageId: inboundMessageId,
        actionType: AiActionType.tool_call,
        toolName: "getStorePolicy",
        input: { type: policyType, region },
        output: policyResult as unknown as Record<string, unknown>,
        success: true,
      });
    }

    // Catalog & Stock Tools (for product inquiry, stock check, price questions, purchase intent)
    const isProductIntent =
      detectedIntent === "product_inquiry" ||
      detectedIntent === "stock_check" ||
      detectedIntent === "price_question" ||
      detectedIntent === "purchase_intent";

    let catalogResult: CatalogSearchOutput | null = null;
    let stockResult: StockCheckOutput | null = null;

    if (isProductIntent && toolInvocationCount < MAX_TOOL_INVOCATIONS) {
      // 1. Tool Call: searchCatalog
      const searchQuery =
        classification.entities?.product?.trim() || this.extractSearchKeywords(inboundMessageText);
      catalogResult = await this.executeTool("searchCatalog", mode, () =>
        this.catalogSearchTool.searchCatalog(businessId, {
          query: searchQuery,
          limit: 5,
        }),
      );

      toolsCalled.push("searchCatalog");
      toolInvocationCount++;
      toolResultsSummaries.push(catalogResult.textSummary);

      await this.logAiAction({
        businessId,
        conversationId,
        messageId: inboundMessageId,
        actionType: AiActionType.tool_call,
        toolName: "searchCatalog",
        input: { query: searchQuery },
        output: catalogResult as unknown as Record<string, unknown>,
        success: true,
      });

      // 2. Tool Call: checkStock on found variants
      if (catalogResult.products.length > 0 && toolInvocationCount < MAX_TOOL_INVOCATIONS) {
        const firstProduct = catalogResult.products[0];
        if (firstProduct && firstProduct.variants.length > 0) {
          const firstVariant = firstProduct.variants[0];
          if (firstVariant) {
            stockResult = await this.executeTool("checkStock", mode, () =>
              this.stockCheckTool.checkStock(businessId, {
                variantId: firstVariant.id,
                quantity: 1,
              }),
            );

            toolsCalled.push("checkStock");
            toolResultsSummaries.push(stockResult.textSummary);

            await this.logAiAction({
              businessId,
              conversationId,
              messageId: inboundMessageId,
              actionType: AiActionType.tool_call,
              toolName: "checkStock",
              input: { variantId: firstVariant.id },
              output: stockResult as unknown as Record<string, unknown>,
              success: true,
            });
          }
        }
      }
    }

    // 6. Assemble Prompt Stack (Stage 7)
    const promptData = this.promptBuilder.buildPrompt({
      businessId,
      conversationId,
      inboundMessage: inboundMessageText,
      business,
      agent,
      settings,
      rules,
      history,
      customer: conversation.customer,
      toolResultsSummary: toolResultsSummaries.join("\n\n"),
    });

    // 7. Generate grounded response with multi-provider fallback (Stage 8 & 15 §11)
    const primaryModel = settings?.model_primary ?? DEFAULT_PRIMARY_MODEL;
    const fallbackModel = settings?.model_fallback ?? DEFAULT_FALLBACK_MODEL;
    const temperature = Number(settings?.temperature ?? 0.4);
    const maxTokens = Math.min(Math.max(settings?.max_tokens ?? 400, 1), 400);

    const modelsAttempted: string[] = [];

    const generationResult = await this.generateResponseWithFallbacks({
      promptData,
      primaryModel,
      fallbackModel,
      temperature,
      maxTokens,
      inboundText: inboundMessageText,
      toolResultsSummary: toolResultsSummaries.join("\n\n"),
      catalogResult,
      stockResult,
      isHumanRequest: !!intendedTransition,
      agentName: agent?.name ?? "Assistant",
      businessName: business?.name,
      businessIndustry: business?.industry,
      modelsAttempted,
    });

    const isTunizi = isTunisianDialect(inboundMessageText);

    let generatedResponse: string | null = this.sanitizeModelOutput(
      generationResult.text,
      catalogResult,
      isTunizi,
    );
    const chosenModel = generationResult.model;
    const chosenProvider = generationResult.provider;
    const tokensInput = generationResult.tokensInput;
    const tokensOutput = generationResult.tokensOutput;
    const estimatedCostUsd = generationResult.estimatedCostUsd;

    if (generationResult.handoffReason && mode !== "suggest") {
      intendedTransition = {
        toStatus: "HUMAN_REQUIRED",
        escalationReason: generationResult.handoffReason,
        handoffPriority: "CRITICAL",
        handoffContext: {
          schema_version: 1,
          customer: this.buildHandoffCustomer(conversation),
          summary: "All configured AI response providers failed to complete the turn",
          intent: detectedIntent,
          confidence,
          confidence_source: "llm",
          products_discussed: [],
          collected_fields: [],
          missing_fields: [],
          ai_recommendation: "Review the conversation and reply manually",
          escalation_reason: generationResult.handoffReason,
          handoff_priority: "critical",
          also_matched: [],
          pending_order: null,
          action_required: "Reply manually; the AI could not complete the turn",
        },
      };
    }

    // 8. Grounding check (Stage 9 & 15 §12)
    const groundingEvaluation = this.evaluateGrounding({
      response: generatedResponse,
      toolResultsSummaries,
      rules,
      catalogResult,
      stockResult,
      blockedTopics: settings?.blocked_topics,
    });

    const groundingPassed = groundingEvaluation.passed;

    if (!groundingPassed) {
      logger.warn(
        { conversationId, reason: groundingEvaluation.reason },
        "Grounding check failed on generated AI response",
      );

      if (mode === "inbound" || mode === "playground") {
        intendedTransition = {
          toStatus: "HUMAN_REQUIRED",
          escalationReason: "integration_failure",
          handoffPriority: "CRITICAL",
          handoffContext: {
            schema_version: 1,
            customer: this.buildHandoffCustomer(conversation),
            summary: `AI response failed grounding verification: ${groundingEvaluation.reason}`,
            intent: detectedIntent,
            confidence,
            confidence_source: "llm",
            products_discussed: [],
            collected_fields: [],
            missing_fields: [],
            ai_recommendation: "Review conversation and assist customer manually",
            escalation_reason: "integration_failure",
            handoff_priority: "critical",
            also_matched: [],
            pending_order: null,
            action_required: "Handle customer inquiry directly",
          },
        };
      }
      generatedResponse = null;
    }

    // 9. Persist AI Usage in `ai_usage` table (15 §13.3)
    await this.prisma.aiUsage.create({
      data: {
        business_id: businessId,
        conversation_id: conversationId,
        message_id: inboundMessageId ?? null,
        provider: chosenProvider,
        model: chosenModel,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        estimated_cost_usd: estimatedCostUsd,
      },
    });

    // 10. Persist AI Decision Trace if inbound message ID exists (15 §13.1)
    let decisionTraceId: string | undefined;
    if (inboundMessageId) {
      try {
        const trace = await this.prisma.aiDecisionTrace.create({
          data: {
            business_id: businessId,
            conversation_id: conversationId,
            inbound_message_id: inboundMessageId,
            decision_trace: {
              schema_version: 1,
              intent: detectedIntent,
              confidence,
              secondary_intents: secondaryIntents,
              classifier_source: classification.source,
              matched_rule: classification.matchedRule,
              classifier_latency_ms: classification.latencyMs,
              decision: intendedTransition ? "escalate" : "allow",
              escalation_reason: intendedTransition?.escalationReason,
              handoff_priority: intendedTransition?.handoffPriority?.toLowerCase(),
              rules_checked: rules.map((r) => r.rule_type),
              policy_outcomes: {},
              tools_called: toolsCalled,
              models_attempted: modelsAttempted.length > 0 ? modelsAttempted : [chosenModel],
              grounding_passed: groundingPassed,
              classifier_error: false,
              mode,
              latency_ms: Date.now() - startTime,
            },
          },
        });
        decisionTraceId = trace.id;
      } catch (err) {
        logger.warn({ err, conversationId }, "Could not record decision trace");
      }
    }

    // 11. Update last intent on conversation
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        last_intent: detectedIntent,
      },
    });

    const deliveryIntent = !generatedResponse
      ? "none"
      : mode === "playground"
        ? "local"
        : mode === "suggest"
          ? "draft"
          : "queued";

    return {
      response: generatedResponse,
      deliveryIntent,
      toolsCalled,
      groundingPassed,
      intendedTransition,
      handoffContext: intendedTransition?.handoffContext,
      usage: {
        provider: chosenProvider,
        model: chosenModel,
        tokensInput,
        tokensOutput,
        estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
      },
      decisionTraceId,
    };
  }

  /**
   * Evaluates post-generation grounding guardrails per 15 §12
   */
  private evaluateGrounding(params: {
    response: string | null;
    toolResultsSummaries: string[];
    rules: BusinessRule[];
    catalogResult: CatalogSearchOutput | null;
    stockResult: StockCheckOutput | null;
    blockedTopics?: string[];
  }): { passed: boolean; reason?: string } {
    const { response, blockedTopics } = params;
    if (!response) return { passed: true };

    const lower = response.toLowerCase();

    // 1. Check blocked topics (case-folded substring match)
    if (blockedTopics && blockedTopics.length > 0) {
      for (const topic of blockedTopics) {
        const t = topic.toLowerCase().trim();
        if (t && lower.includes(t)) {
          return { passed: false, reason: `Response mentions blocked topic: "${topic}"` };
        }
      }
    }

    // 2. Check forbidden commitments (never-list 05 §11.1)
    const forbiddenPhrases = [
      "remboursement accepté",
      "je vous rembourse",
      "remboursement immédiat",
      "lien de paiement envoyé",
      "compte bancaire pour virement",
      "gratuit sans condition",
    ];
    for (const phrase of forbiddenPhrases) {
      if (lower.includes(phrase)) {
        return { passed: false, reason: `Response contains forbidden commitment: "${phrase}"` };
      }
    }

    return { passed: true };
  }

  /**
   * Multi-provider generation with 15s timeouts and fallback progression (15 §11 & 11 §9.5)
   */
  private async generateResponseWithFallbacks(params: {
    promptData: BuiltPrompt;
    primaryModel: string;
    fallbackModel: string;
    temperature: number;
    maxTokens: number;
    inboundText: string;
    toolResultsSummary: string;
    catalogResult: CatalogSearchOutput | null;
    stockResult: StockCheckOutput | null;
    isHumanRequest: boolean;
    agentName: string;
    businessName?: string;
    businessIndustry?: string;
    modelsAttempted: string[];
  }): Promise<{
    text: string | null;
    model: string;
    provider: string;
    tokensInput: number;
    tokensOutput: number;
    estimatedCostUsd: number;
    handoffReason?: "integration_failure" | "ai_timeout";
  }> {
    const {
      promptData,
      primaryModel,
      fallbackModel,
      temperature,
      maxTokens,
      inboundText,
      toolResultsSummary,
      catalogResult,
      stockResult,
      isHumanRequest,
      agentName,
      businessName,
      businessIndustry,
      modelsAttempted,
    } = params;

    const candidateModels = [primaryModel, fallbackModel, DEFAULT_FALLBACK_2_MODEL];

    if (this.aiGateway.isConfigured()) {
      const result = await this.modelFallback.generate({
        system: promptData.systemPrompt,
        messages: promptData.messages,
        prompt: promptData.userPrompt,
        temperature,
        maxTokens,
        models: candidateModels,
      });

      modelsAttempted.push(...result.modelsAttempted);

      if (result.generation) {
        return {
          text: result.generation.text,
          model: result.generation.model,
          provider: result.generation.provider,
          tokensInput: result.generation.tokensInput,
          tokensOutput: result.generation.tokensOutput,
          estimatedCostUsd: result.generation.estimatedCostUsd,
        };
      }

      return {
        text: null,
        model: primaryModel,
        provider: this.resolveProviderName(primaryModel),
        tokensInput: 0,
        tokensOutput: 0,
        estimatedCostUsd: 0,
        handoffReason: result.handoff?.reason ?? "integration_failure",
      };
    }

    for (const model of candidateModels) {
      modelsAttempted.push(model);
      const provider = this.resolveProviderName(model);

      try {
        const generated = await this.callProviderApi({
          model,
          promptData,
          temperature,
          maxTokens,
        });

        if (generated && generated.text.trim().length > 0) {
          return generated;
        }
      } catch (err) {
        logger.warn({ err, model, provider }, "Provider call failed; cascading to next fallback");
      }
    }

    // Offline / deterministic fallback generator (used for tests & when all APIs are unreachable)
    const promptLength = promptData.systemPrompt.length + promptData.userPrompt.length;
    const tokensInput = Math.ceil(promptLength / 4);

    const fallbackText = this.generateGroundedResponse({
      inboundText,
      toolResultsSummary,
      catalogResult,
      stockResult,
      isHumanRequest,
      agentName,
      businessName,
      businessIndustry,
    });

    const tokensOutput = Math.ceil(fallbackText.length / 4);
    const estimatedCostUsd = this.calculateCost(primaryModel, tokensInput, tokensOutput);

    return {
      text: fallbackText,
      model: primaryModel,
      provider: this.resolveProviderName(primaryModel),
      tokensInput,
      tokensOutput,
      estimatedCostUsd,
    };
  }

  /**
   * Executes AI model generation using Vercel AI SDK routed through Vercel AI Gateway with 15s timeout
   */
  private async callProviderApi(params: {
    model: string;
    promptData: BuiltPrompt;
    temperature: number;
    maxTokens: number;
  }): Promise<{
    text: string;
    model: string;
    provider: string;
    tokensInput: number;
    tokensOutput: number;
    estimatedCostUsd: number;
  } | null> {
    const { model, promptData, temperature, maxTokens } = params;

    if (!this.aiGateway.isConfigured()) {
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout per 11 §9.6

    try {
      const result = await this.aiGateway.generateText({
        model,
        system: promptData.systemPrompt,
        messages: promptData.messages,
        prompt: promptData.userPrompt,
        temperature,
        maxTokens,
        abortSignal: controller.signal,
      });

      if (result && result.text.trim().length > 0) {
        return result;
      }
      return null;
    } catch (err) {
      logger.warn({ err, model }, "AI Gateway model generation failed; cascading to next fallback");
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private calculateCost(model: string, tokensInput: number, tokensOutput: number): number {
    return calculateModelCost(model, tokensInput, tokensOutput);
  }

  private extractSearchKeywords(message: string): string {
    const clean = message
      .toLowerCase()
      .replace(
        /(\?|!|\.|,|9addeh|b9adech|b9adeh|soum|prix|tarifs?|co[uû]t|taille|dispo|disponible|bonjour|bonsoir|3aslema|aslema|salem|salam|slm|slem|salut|hello|hi|svp|stp|merci|blhy|bellehi|brabi|brabbi|aychek|3aychek|sh3andkom|ch3andkom|chneya 3andkom|chnawa 3andkom|chnowa 3andkom|chfamma|chfama|3andkom|3andek|famma|fama|famech|nheb|n7eb|nechri|neshri|npassi|nvalidi|warini|warina|a3tini|choufli|est[- ]ce que|qu'est[- ]ce que|vous avez|avez[- ]vous)/gi,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim();

    return clean || message.trim();
  }

  private sanitizeModelOutput(
    text: string | null,
    catalogResult: CatalogSearchOutput | null,
    isTunizi: boolean,
  ): string | null {
    if (!text) return null;

    const toolPatterns = [
      /\*\*Searching for [^\n]*\*\*[\s\S]*?(?:\* \*\*Parameters\*\*:[^\n]+|\{[^}]*\})/gi,
      /\*?\*?Tool\*?\*?:\s*`?[a-zA-Z0-9_-]+`?[\s\S]*?(?:\*?\*?Parameters\*?\*?:[^\n]+|\{[^}]*\})/gi,
      /`search_products`[\s\S]*?(?:\*?\*?Parameters\*?\*?:[^\n]+|\{[^}]*\})/gi,
      /\*\*Searching for products:\*\*[\s\S]*/gi,
      /\[(?:Tool|Action|Execution):[\s\S]*?\]/gi,
    ];

    let cleaned = text;
    let hadLeakage = false;

    for (const pattern of toolPatterns) {
      if (pattern.test(cleaned)) {
        hadLeakage = true;
        cleaned = cleaned.replace(pattern, "").trim();
      }
    }

    if (hadLeakage) {
      logger.warn(
        { original: text, cleaned },
        "Stripped simulated tool call leakage from model response",
      );
      if (cleaned.length < 20 || !cleaned.includes(".")) {
        if (catalogResult && catalogResult.products.length === 0) {
          return isTunizi
            ? "3aslema! Lil asaf ma 3andnech hedha fil boutique tawa. T7eb tchouf les articles lokhrin mte3na?"
            : "Bonjour ! Malheureusement nous n'avons pas cet article en boutique actuellement. Souhaitez-vous découvrir nos autres articles ?";
        }
      }
    }

    return cleaned || null;
  }

  private extractTunisianRegion(text: string): string | undefined {
    const lower = text.toLowerCase();
    const tunisianRegions = [
      "tunis",
      "ariana",
      "sousse",
      "sfax",
      "bizerte",
      "nabeul",
      "monastir",
      "gabes",
    ];
    for (const r of tunisianRegions) {
      if (lower.includes(r)) {
        return r;
      }
    }
    return undefined;
  }

  private resolveProviderName(model: string): string {
    return resolveProviderName(model);
  }

  private generateGroundedResponse(params: {
    inboundText: string;
    toolResultsSummary: string;
    catalogResult: CatalogSearchOutput | null;
    stockResult: StockCheckOutput | null;
    isHumanRequest: boolean;
    agentName: string;
    businessName?: string;
    businessIndustry?: string;
  }): string {
    const {
      inboundText,
      catalogResult,
      isHumanRequest,
      toolResultsSummary,
      businessName,
      businessIndustry,
    } = params;
    const lower = inboundText.toLowerCase();
    const isTunizi = isTunisianDialect(inboundText);

    if (isHumanRequest) {
      if (isTunizi) {
        return "3aslema! D9i9a barka n7awlek l wa7ed men l'équipe mte3na bech y3awnek direct.";
      }
      return "Bonjour! Un instant s'il vous plaît, je vous transfère à un conseiller de notre équipe pour vous assister.";
    }

    // Grounded policy responses (Delivery, Payment, Returns)
    if (toolResultsSummary && toolResultsSummary.trim().length > 0) {
      const summary = toolResultsSummary.trim();
      if (summary.toLowerCase().includes("delivery")) {
        const clean = summary.replace(/^Delivery rates:|^Delivery to/i, "").trim();
        if (isTunizi) {
          return `3aslema! Concernant el livraison mte3na: ${clean}. T7eb t3adi commande?`;
        }
        return `Bonjour! Concernant la livraison chez ${businessName || "notre boutique"}: ${clean}. Souhaitez-vous passer commande ?`;
      }
      if (summary.toLowerCase().includes("payment")) {
        if (isTunizi) {
          return `3aslema! E7na n9eblou el paiement à la livraison (espèces kif touslek el commande). T7eb tchouf les articles?`;
        }
        return `Bonjour! Nous acceptons le paiement en espèces à la livraison (Cash on Delivery). Avez-vous besoin d'aide pour choisir un produit ?`;
      }
      if (summary.toLowerCase().includes("returns")) {
        if (isTunizi) {
          return `3aslema! Les retours w l'échange mawjoudin: ${summary}. T7eb n3awnek f 7aja o5ra?`;
        }
        return `Bonjour! Nos conditions d'échange et de retour sont les suivantes : ${summary}. Comment puis-je vous aider ?`;
      }
    }

    // Grounded multi-product inquiry
    if (
      catalogResult &&
      catalogResult.products.length > 1 &&
      (lower.includes("produit") ||
        lower.includes("article") ||
        lower.includes("catalogue") ||
        lower.includes("chnowa") ||
        lower.includes("chnia") ||
        lower.includes("tout"))
    ) {
      const topProds = catalogResult.products
        .slice(0, 3)
        .map((p) => {
          const v = p.variants[0];
          const price = v ? (v.discountPrice ?? v.price) : 0;
          return `${p.name} (${price.toFixed(3)} ${p.currency})`;
        })
        .join(", ");
      if (isTunizi) {
        return `3aslema! Mawjoud 3andna: ${topProds}. T7eb tchouf taille wala couleur m3ayna?`;
      }
      return `Bonjour! Voici quelques-uns de nos articles : ${topProds}. Souhaitez-vous voir une taille ou un modèle en particulier ?`;
    }

    // Grounded single product inquiry
    if (catalogResult && catalogResult.products.length > 0) {
      const product = catalogResult.products[0];
      if (product && product.variants.length > 0) {
        const primaryVariant = product.variants[0];
        if (primaryVariant) {
          const price = primaryVariant.discountPrice ?? primaryVariant.price;
          const currency = product.currency;
          const inStock = primaryVariant.inStock;

          if (isTunizi) {
            if (inStock) {
              return `3aslema! ${product.name} soumou ${price.toFixed(3)} ${currency} w dispo f stock (${primaryVariant.availableStock} pièces). T7eb nvalidilek commande?`;
            } else {
              return `3aslema! ${product.name} soumou ${price.toFixed(3)} ${currency} ema lil asaf wfa mel stock tawa. T7eb n9ollek kif y3awed yodkhol?`;
            }
          }

          // French / English default
          if (inStock) {
            return `Bonjour! Le produit "${product.name}" est disponible au prix de ${price.toFixed(3)} ${currency} (${primaryVariant.availableStock} en stock). Souhaitez-vous passer commande?`;
          } else {
            return `Bonjour! Le produit "${product.name}" est à ${price.toFixed(3)} ${currency} mais est actuellement en rupture de stock. Souhaitez-vous être alerté lors du réassort?`;
          }
        }
      }
    }

    if (catalogResult?.products.length === 0) {
      return "3aslema! Lil asaf ma l9inech l produit hedha dispo fel boutique mte3na tawa. Famma 7aja o5ra t7eb tchoufha?";
    }

    // Store inquiry or general greeting
    const store = businessName || "notre boutique";
    const ind = businessIndustry || "commerce et vente de détail";
    if (isTunizi) {
      return `3aslema! Mar7ba bik fi ${store} (${ind}). Kifech najem n3awnek lyoum?`;
    }

    return `Bonjour! Bienvenue chez ${store} (${ind}). Comment puis-je vous aider aujourd'hui ?`;
  }

  private buildHandoffCustomer(conversation: Conversation & { customer: Customer | null }) {
    const rawChannel = conversation.source.toLowerCase();
    const channel =
      rawChannel === "messenger" || rawChannel === "whatsapp" ? rawChannel : "instagram";

    const rawLifecycle = (conversation.customer?.lifecycle_stage || "").toLowerCase();
    const validLifecycles = [
      "unknown_visitor",
      "interested",
      "qualified_lead",
      "order_pending",
      "customer",
      "returning_customer",
      "vip",
    ];

    let lifecycle_stage:
      | "unknown_visitor"
      | "interested"
      | "qualified_lead"
      | "order_pending"
      | "customer"
      | "returning_customer"
      | "vip" = "interested";

    if (validLifecycles.includes(rawLifecycle)) {
      lifecycle_stage = rawLifecycle as typeof lifecycle_stage;
    } else if (rawLifecycle === "lead") {
      lifecycle_stage = "qualified_lead";
    } else if (rawLifecycle === "prospect") {
      lifecycle_stage = "interested";
    }

    const rawId = conversation.customer_id;
    const isValidUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId);
    const id = isValidUuid ? rawId : "00000000-0000-4000-8000-000000000001";

    return {
      id,
      name: conversation.customer?.name ?? null,
      phone: conversation.customer?.phone ?? null,
      channel,
      lifecycle_stage,
    };
  }

  private async logAiAction(params: {
    businessId: string;
    conversationId: string;
    messageId?: string;
    actionType: AiActionType;
    toolName: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    success: boolean;
    durationMs?: number;
    errorMessage?: string | null;
  }): Promise<void> {
    try {
      const sanitizedInput = sanitizeObservabilityData(params.input) as Prisma.InputJsonValue;
      const sanitizedOutput = sanitizeObservabilityData(params.output) as Prisma.InputJsonValue;
      const sanitizedError = sanitizeText(params.errorMessage);

      await this.prisma.aiAction.create({
        data: {
          business_id: params.businessId,
          conversation_id: params.conversationId,
          message_id: params.messageId ?? null,
          action_type: params.actionType,
          tool_name: params.toolName,
          input: sanitizedInput,
          output: sanitizedOutput,
          success: params.success,
          error_message: sanitizedError,
          duration_ms: params.durationMs ?? null,
        },
      });
    } catch (err) {
      logger.warn({ err, toolName: params.toolName }, "Could not record AI action");
    }
  }

  /**
   * Centralized tool execution boundary that enforces capability permissions
   * across all AI execution modes.
   */
  async executeTool<TOutput>(
    toolName: string,
    mode: "inbound" | "suggest" | "playground",
    executor: () => Promise<TOutput>,
  ): Promise<TOutput> {
    this.assertToolAllowedForMode(toolName, mode);
    return executor();
  }

  /**
   * 15 §5 step 6 & §8.2: Asserts tool execution policy via authoritative ToolRegistry.
   * Mutating and external side-effect tools are strictly blocked in playground and suggest modes.
   */
  assertToolAllowedForMode(toolName: string, mode: "inbound" | "suggest" | "playground"): void {
    assertToolCapability(toolName, mode);
  }
}
