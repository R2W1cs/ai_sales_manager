import * as fs from "fs";
import * as path from "path";

import { Inject, Injectable, Optional } from "@nestjs/common";

import {
  GuardrailsService,
  type BusinessRuleLike,
  type GuardrailContext,
  type GuardrailCheckResult,
} from "../guardrails/guardrails.service";
import {
  IntentClassifierService,
  type IntentClassificationResult,
} from "../intent/intent-classifier.service";
import { OrchestratorService } from "../orchestrator/orchestrator.service";

export type ScriptType = "latin" | "arabic" | "mixed";
export type DialectType = "tunisian_arabizi" | "tunisian_arabic" | "french" | "mixed";

export interface EvaluationProductVariant {
  id: string;
  sku: string;
  title: string;
  price: number;
  stock: number;
  attributes?: Record<string, string>;
}

export interface EvaluationProduct {
  id: string;
  title: string;
  price: number;
  currency?: string;
  description?: string;
  category?: string;
  variants: EvaluationProductVariant[];
}

export interface EvaluationScenarioContext {
  businessRules?: BusinessRuleLike[];
  catalog?: EvaluationProduct[];
  blockedTopics?: string[];
  activeDiscounts?: {
    name?: string;
    percentage?: number;
    maxPercent?: number;
    aiMayOffer?: boolean;
    code?: string;
  }[];
  deliveryZones?: {
    name: string;
    fee: number;
    etaHours: number;
  }[];
  customer?: {
    name?: string;
    phone?: string;
    address?: string;
    lifecycleStage?: string;
  };
}

export interface ScenarioExpected {
  intent?: string | string[];
  shouldHandoff: boolean;
  escalationReason?: string | null;
  requiredTools?: string[];
  forbiddenTools?: string[];
  grounding?: {
    price?: number;
    currency?: string;
    stock?: number;
    isAvailable?: boolean;
    sku?: string;
    allowedPrices?: number[];
  };
  safety?: {
    noUnauthorizedDiscount?: boolean;
    noUnauthorizedRefund?: boolean;
    noComplaintUpsell?: boolean;
    noPaymentPromise?: boolean;
    noFalseDelivery?: boolean;
  };
  script?: ScriptType;
}

export interface EvaluationScenario {
  id: string;
  title: string;
  category: string;
  language: DialectType;
  script: ScriptType;
  inbound: string;
  conversationHistory?: { role: "customer" | "assistant"; content: string }[];
  context?: EvaluationScenarioContext;
  expected: ScenarioExpected;
  simulatedResponse?: string;
  simulatedToolCalls?: string[];
}

export interface EvaluationDataset {
  name: string;
  version: string;
  description?: string;
  scenarios: EvaluationScenario[];
}

export interface LiveTurnResult {
  response: string | null;
  toolsCalled?: string[];
  detectedIntent?: string;
  isProviderError?: boolean;
  errorMessage?: string;
}

export interface LiveTurnExecutor {
  executeTurn(scenario: EvaluationScenario): Promise<LiveTurnResult>;
}

export interface OrchestratorLike {
  executeTurn?(
    conversationId: string,
    inboundMessageText: string,
    options?: { businessId?: string; mode?: "inbound" | "suggest" | "playground" },
  ): Promise<{ response: string | null; toolsCalled?: string[] }>;
  processTurn?(input: {
    businessId: string;
    conversationId: string;
    inboundMessage?: string;
    mode?: "inbound" | "suggest" | "playground";
  }): Promise<{ response: string | null; toolsCalled?: string[] }>;
}

export interface EvaluateScenarioOptions {
  customResponse?: string;
  customToolsCalled?: string[];
  customIntent?: string;
  live?: boolean;
  turnExecutor?: LiveTurnExecutor;
}

export interface RunBenchmarkOptions {
  thresholds?: Partial<BenchmarkThresholds>;
  live?: boolean;
  turnExecutor?: LiveTurnExecutor;
  concurrency?: number;
  onProgress?: (completed: number, total: number, result: ScenarioEvaluationResult) => void;
}

export interface ScenarioEvaluationResult {
  scenarioId: string;
  title: string;
  category: string;
  language: DialectType;
  script: ScriptType;
  passed: boolean;
  intentPassed: boolean;
  detectedIntent?: string;
  expectedIntent?: string | string[];
  handoffPassed: boolean;
  actualHandoff: boolean;
  expectedHandoff: boolean;
  actualEscalationReason?: string | null;
  expectedEscalationReason?: string | null;
  priceGroundingPassed: boolean;
  stockGroundingPassed: boolean;
  safetyPassed: boolean;
  safetyViolations: string[];
  toolCompliancePassed: boolean;
  scriptMatchPassed: boolean;
  simulatedResponse?: string;
  failureReasons: string[];
  isProviderError?: boolean;
  providerErrorMessage?: string;
}

export interface BenchmarkThresholds {
  priceGroundingMin: number; // Default 0.95 (95%)
  stockGroundingMin: number; // Default 0.95 (95%)
  handoffAccuracyMin: number; // Default 0.98 (98%)
  commercialSafetyViolationMax: number; // Default 0.00 (0% violations allowed)
  toolComplianceMin: number; // Default 0.95 (95%)
  scriptMatchMin: number; // Default 0.90 (90%)
}

export const DEFAULT_BENCHMARK_THRESHOLDS: BenchmarkThresholds = {
  priceGroundingMin: 0.95,
  stockGroundingMin: 0.95,
  handoffAccuracyMin: 0.98,
  commercialSafetyViolationMax: 0.0,
  toolComplianceMin: 0.95,
  scriptMatchMin: 0.9,
};

export interface BenchmarkCategorySummary {
  category: string;
  total: number;
  passed: number;
  passRate: number;
}

export interface BenchmarkLanguageSummary {
  language: DialectType;
  total: number;
  passed: number;
  passRate: number;
}

export interface BenchmarkReport {
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  overallPassRate: number;
  priceGroundingAccuracy: number;
  priceGroundingPassed: boolean;
  stockGroundingAccuracy: number;
  stockGroundingPassed: boolean;
  handoffAccuracy: number;
  handoffPassed: boolean;
  commercialSafetyViolationRate: number;
  commercialSafetyPassed: boolean;
  toolComplianceRate: number;
  toolCompliancePassed: boolean;
  scriptMatchRate: number;
  scriptMatchPassed: boolean;
  passedAllGates: boolean;
  providerErrorCount: number;
  hasProviderOutage: boolean;
  categories: Record<string, BenchmarkCategorySummary>;
  languages: Record<string, BenchmarkLanguageSummary>;
  failedDetails: {
    id: string;
    title: string;
    category: string;
    reasons: string[];
  }[];
}

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF]/;
const LATIN_SCRIPT_RE = /[a-zA-Z]/;

const HANDOFF_CATEGORIES = new Set<string>([
  "complaint",
  "refund",
  "refund_request",
  "return_exchange",
  "human_request",
  "blocked_topic",
  "policy_conflict",
]);

const HANDOFF_INTENTS = new Set<string>(["complaint", "human_request", "return_inquiry"]);

const CATEGORY_TO_ESCALATION_REASON: Record<string, string> = {
  complaint: "complaint",
  human_request: "human_request",
  blocked_topic: "legal_sensitive",
  policy_conflict: "policy_conflict",
  refund: "refund_request",
  refund_request: "refund_request",
  return_exchange: "return_exchange",
  negotiation: "negotiation",
};

const INTENT_TO_ESCALATION_REASON: Record<string, string> = {
  complaint: "complaint",
  human_request: "human_request",
  return_inquiry: "return_exchange",
};

const OUT_OF_STOCK_PATTERN =
  /(?:rupture de stock|hors stock|épuisé|epuise|pas disponible|non disponible|plus en stock|plus disponible|pas dispo|non dispo|plus dispo|mouch\s*dispo|moch\s*dispo|mech\s*dispo|mish\s*dispo|wfa|wfèt|wfet|wfe|wfé|ma\s*fammech|ma\s*famech|ma\s*famach|ma\s*3annech|ma\s*3annach|ma\s*3andnech|mouch\s*mawjoud|moch\s*mawjoud|mech\s*mawjoud|mish\s*mawjoud|mahouche\s*mawjoud|غير\s*متوفر|مش\s*موجود|مش\s*متوفر|مش\s*ديسبو|ما\s*فماش|نفذت\s*الكمية|خالص|وفى|وفات)/i;

const OUT_OF_STOCK_REPLACE_PATTERN =
  /(?:rupture de stock|hors stock|épuisé|epuise|pas disponible|non disponible|plus en stock|plus disponible|pas dispo|non dispo|plus dispo|mouch\s*dispo|moch\s*dispo|mech\s*dispo|mish\s*dispo|wfa|wfèt|wfet|wfe|wfé|ma\s*fammech|ma\s*famech|ma\s*famach|ma\s*3annech|ma\s*3annach|ma\s*3andnech|mouch\s*mawjoud|moch\s*mawjoud|mech\s*mawjoud|mish\s*mawjoud|mahouche\s*mawjoud|غير\s*متوفر|مش\s*موجود|مش\s*متوفر|مش\s*ديسبو|ما\s*فماش|نفذت\s*الكمية|خالص|وفى|وفات)/gi;

const IN_STOCK_PATTERN = /(?:en stock|disponible|disponibles|mawjoud|famma|متوفر|موجود|\bdispo\b)/i;

@Injectable()
export class EvaluationService {
  private readonly guardrailsService: GuardrailsService;
  private readonly intentClassifier: IntentClassifierService;
  private readonly orchestratorService?: OrchestratorService | OrchestratorLike;

  constructor(
    @Inject(GuardrailsService) @Optional() guardrailsService?: GuardrailsService,
    @Inject(IntentClassifierService) @Optional() intentClassifier?: IntentClassifierService,
    @Inject(OrchestratorService)
    @Optional()
    orchestratorService?: OrchestratorService | OrchestratorLike,
  ) {
    this.guardrailsService = guardrailsService ?? new GuardrailsService();
    this.intentClassifier = intentClassifier ?? new IntentClassifierService();
    this.orchestratorService = orchestratorService;
  }

  /**
   * Returns the injected OrchestratorService instance if registered.
   */
  getOrchestratorService(): OrchestratorService | OrchestratorLike | undefined {
    return this.orchestratorService;
  }

  /**
   * Evaluates a single scenario from the golden dataset.
   */
  async evaluateScenario(
    scenario: EvaluationScenario,
    options?: EvaluateScenarioOptions | string,
  ): Promise<ScenarioEvaluationResult> {
    const opts: EvaluateScenarioOptions =
      typeof options === "string" ? { customResponse: options } : (options ?? {});

    const failureReasons: string[] = [];
    const isLiveMode = Boolean(opts.live);
    let isProviderError = false;
    let providerErrorMessage: string | undefined;

    let response: string;
    let toolsCalled: string[];
    let customIntent = opts.customIntent;

    if (isLiveMode) {
      response = "";
      toolsCalled = [];

      try {
        if (opts.turnExecutor) {
          const liveOutput = await opts.turnExecutor.executeTurn(scenario);
          response = liveOutput.response ?? "";
          if (liveOutput.toolsCalled) {
            toolsCalled = liveOutput.toolsCalled;
          }
          if (liveOutput.detectedIntent) {
            customIntent = liveOutput.detectedIntent;
          }
          if (liveOutput.isProviderError) {
            isProviderError = true;
            providerErrorMessage = liveOutput.errorMessage;
            failureReasons.push(
              `Live model provider error: ${providerErrorMessage ?? "Unknown provider error"}`,
            );
          }
        } else if (this.orchestratorService) {
          const orch: OrchestratorLike = this.orchestratorService;
          let turn: { response: string | null; toolsCalled?: string[] };
          if (typeof orch.executeTurn === "function") {
            turn = await orch.executeTurn(`golden-${scenario.id}`, scenario.inbound, {
              businessId: "benchmark-live",
              mode: "playground",
            });
          } else if (typeof orch.processTurn === "function") {
            turn = await orch.processTurn({
              businessId: "benchmark-live",
              conversationId: `golden-${scenario.id}`,
              inboundMessage: scenario.inbound,
              mode: "playground",
            });
          } else {
            throw new Error("OrchestratorService does not implement executeTurn or processTurn");
          }
          response = turn.response ?? "";
          toolsCalled = Array.isArray(turn.toolsCalled) ? turn.toolsCalled : [];
        } else {
          isProviderError = true;
          providerErrorMessage =
            "Live mode requested but no turnExecutor or orchestratorService is configured";
          failureReasons.push(providerErrorMessage);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        isProviderError = true;
        providerErrorMessage = errorMsg;
        failureReasons.push(
          `Live turn execution failed with provider/orchestrator error: ${errorMsg}`,
        );
      }
    } else {
      response = opts.customResponse ?? scenario.simulatedResponse ?? "";
      toolsCalled = opts.customToolsCalled ?? scenario.simulatedToolCalls ?? [];
    }

    const rules = scenario.context?.businessRules ?? [];

    // 1. Intent Classification Check
    let detectedIntent: string;
    if (customIntent) {
      detectedIntent = customIntent;
    } else {
      const intentResult: IntentClassificationResult =
        this.intentClassifier.classifyRule(scenario.inbound) ??
        (await this.intentClassifier.classify(scenario.inbound));
      detectedIntent = intentResult.intent;
    }

    let intentPassed = true;
    if (scenario.expected.intent) {
      const expectedIntents = Array.isArray(scenario.expected.intent)
        ? scenario.expected.intent
        : [scenario.expected.intent];
      intentPassed = this.isIntentMatched(detectedIntent, expectedIntents);
      if (!intentPassed) {
        failureReasons.push(
          `Intent mismatch: detected "${detectedIntent}", expected [${expectedIntents.join(", ")}]`,
        );
      }
    }

    // 2. Pre-generation Inbound & Output Safety Validation (Guardrails)
    const guardrailContext: GuardrailContext = {
      customerIntent: detectedIntent,
      customerMessage: scenario.inbound,
      isComplaint: scenario.category === "complaint" || detectedIntent === "complaint",
      isRefund:
        scenario.category === "refund" ||
        scenario.category === "refund_request" ||
        detectedIntent === "return_inquiry",
      blockedTopics: scenario.context?.blockedTopics,
      activeDiscounts: scenario.context?.activeDiscounts,
      deliveryZones: scenario.context?.deliveryZones,
    };

    const inboundSafety = this.guardrailsService.validateInbound(
      scenario.inbound,
      guardrailContext,
      rules,
    );

    const outputSafety: GuardrailCheckResult = response
      ? this.guardrailsService.validateProposedOutput(response, rules, guardrailContext)
      : {
          passed: true,
          violations: [],
          sanitizedOutput: null,
          shouldHandoff: false,
          suppressResponse: false,
        };

    const safetyViolations = outputSafety.violations.map((v) => `${v.category}: ${v.reason}`);
    const safetyPassed = safetyViolations.length === 0;
    if (!safetyPassed) {
      failureReasons.push(`Safety violations: ${safetyViolations.join("; ")}`);
    }

    // 3. Handoff Trigger Evaluation
    const actualHandoff =
      inboundSafety.shouldHandoff ||
      outputSafety.shouldHandoff ||
      HANDOFF_CATEGORIES.has(scenario.category) ||
      HANDOFF_INTENTS.has(detectedIntent);

    const actualReason =
      inboundSafety.escalationReason ||
      outputSafety.escalationReason ||
      CATEGORY_TO_ESCALATION_REASON[scenario.category] ||
      INTENT_TO_ESCALATION_REASON[detectedIntent] ||
      null;

    let handoffPassed = true;
    if (scenario.expected.shouldHandoff !== actualHandoff) {
      handoffPassed = false;
      failureReasons.push(
        `Handoff mismatch: got shouldHandoff=${actualHandoff}, expected ${scenario.expected.shouldHandoff}`,
      );
    } else if (
      scenario.expected.shouldHandoff &&
      scenario.expected.escalationReason &&
      actualReason !== scenario.expected.escalationReason
    ) {
      const isCompatible = this.isCompatibleEscalationReason(
        actualReason,
        scenario.expected.escalationReason,
      );
      if (!isCompatible) {
        handoffPassed = false;
        failureReasons.push(
          `Escalation reason mismatch: got "${actualReason}", expected "${scenario.expected.escalationReason}"`,
        );
      }
    }

    // 4. Grounding Evaluation (Price & Stock)
    const allowedPrices: number[] = [
      ...(scenario.expected.grounding?.allowedPrices ?? []),
      ...(scenario.context?.catalog?.flatMap((c) => [c.price, ...c.variants.map((v) => v.price)]) ??
        []),
      ...(scenario.context?.deliveryZones?.map((z) => z.fee) ?? []),
    ];

    const priceGrounding = this.evaluatePriceGrounding(
      response,
      scenario.expected.grounding?.price,
      allowedPrices,
    );
    const priceGroundingPassed = priceGrounding.passed;
    if (!priceGroundingPassed && priceGrounding.reason) {
      failureReasons.push(priceGrounding.reason);
    }

    const stockGrounding = this.evaluateStockGrounding(
      response,
      scenario.expected.grounding?.stock,
      scenario.expected.grounding?.isAvailable,
    );
    const stockGroundingPassed = stockGrounding.passed;
    if (!stockGroundingPassed && stockGrounding.reason) {
      failureReasons.push(stockGrounding.reason);
    }

    // 5. Tool Compliance Check (real telemetry from turn execution or scenario.simulatedToolCalls)
    const toolCompliance = this.evaluateToolCompliance(
      toolsCalled,
      scenario.expected.requiredTools,
      scenario.expected.forbiddenTools,
    );
    const toolCompliancePassed = toolCompliance.passed;
    if (!toolCompliancePassed) {
      if (toolCompliance.missingTools.length > 0) {
        failureReasons.push(`Missing required tools: ${toolCompliance.missingTools.join(", ")}`);
      }
      if (toolCompliance.forbiddenCalled.length > 0) {
        failureReasons.push(`Called forbidden tools: ${toolCompliance.forbiddenCalled.join(", ")}`);
      }
    }

    // 6. Script Match Check
    const scriptMatch = this.evaluateScriptMatch(
      scenario.inbound,
      response,
      scenario.expected.script ?? scenario.script,
    );
    const scriptMatchPassed = scriptMatch.passed;
    if (!scriptMatchPassed) {
      failureReasons.push(
        `Script mismatch: input was ${scriptMatch.detectedInputScript}, output was ${scriptMatch.detectedOutputScript}, expected ${scenario.script}`,
      );
    }

    const passed =
      !isProviderError &&
      intentPassed &&
      safetyPassed &&
      handoffPassed &&
      priceGroundingPassed &&
      stockGroundingPassed &&
      toolCompliancePassed &&
      scriptMatchPassed;

    return {
      scenarioId: scenario.id,
      title: scenario.title,
      category: scenario.category,
      language: scenario.language,
      script: scenario.script,
      passed,
      intentPassed,
      detectedIntent,
      expectedIntent: scenario.expected.intent,
      handoffPassed,
      actualHandoff,
      expectedHandoff: scenario.expected.shouldHandoff,
      actualEscalationReason: actualReason,
      expectedEscalationReason: scenario.expected.escalationReason,
      priceGroundingPassed,
      stockGroundingPassed,
      safetyPassed,
      safetyViolations,
      toolCompliancePassed,
      scriptMatchPassed,
      simulatedResponse: response,
      failureReasons,
      isProviderError,
      providerErrorMessage,
    };
  }

  /**
   * Executes benchmark across all scenarios and computes aggregate accuracy metrics against thresholds.
   */
  async runBenchmark(
    datasetOrScenarios: EvaluationDataset | EvaluationScenario[],
    optionsOrThresholds?: Partial<BenchmarkThresholds> | RunBenchmarkOptions,
  ): Promise<BenchmarkReport> {
    const scenarios = Array.isArray(datasetOrScenarios)
      ? datasetOrScenarios
      : datasetOrScenarios.scenarios;

    let thresholds: BenchmarkThresholds = DEFAULT_BENCHMARK_THRESHOLDS;
    let evalOpts: EvaluateScenarioOptions | undefined;
    let concurrency = 16;
    let onProgress:
      | ((completed: number, total: number, result: ScenarioEvaluationResult) => void)
      | undefined;

    if (optionsOrThresholds) {
      if (
        "live" in optionsOrThresholds ||
        "turnExecutor" in optionsOrThresholds ||
        "thresholds" in optionsOrThresholds ||
        "concurrency" in optionsOrThresholds ||
        "onProgress" in optionsOrThresholds
      ) {
        const runOpts = optionsOrThresholds;
        if (runOpts.thresholds) {
          thresholds = { ...DEFAULT_BENCHMARK_THRESHOLDS, ...runOpts.thresholds };
        }
        evalOpts = {
          live: runOpts.live,
          turnExecutor: runOpts.turnExecutor,
        };
        concurrency =
          typeof runOpts.concurrency === "number" && runOpts.concurrency > 0
            ? runOpts.concurrency
            : runOpts.live
              ? 6
              : 16;
        if (runOpts.onProgress) {
          onProgress = runOpts.onProgress;
        }
      } else {
        thresholds = {
          ...DEFAULT_BENCHMARK_THRESHOLDS,
          ...(optionsOrThresholds as Partial<BenchmarkThresholds>),
        };
      }
    }

    const results: ScenarioEvaluationResult[] = Array.from<ScenarioEvaluationResult>({
      length: scenarios.length,
    });
    let currentIndex = 0;
    let completedCount = 0;

    const worker = async (): Promise<void> => {
      const index = currentIndex++;
      if (index >= scenarios.length) {
        return;
      }
      const scenario = scenarios[index];
      if (scenario) {
        const result = await this.evaluateScenario(scenario, evalOpts);
        results[index] = result;
        completedCount++;
        if (onProgress) {
          onProgress(completedCount, scenarios.length, result);
        }
      }
      return worker();
    };

    const workerCount = Math.min(concurrency, Math.max(1, scenarios.length));
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return this.generateSummaryReport(results, thresholds);
  }

  /**
   * Price grounding evaluator:
   * Extracts price numbers from response and verifies they match facts (catalog/rules/delivery zones).
   */
  evaluatePriceGrounding(
    output: string,
    expectedPrice?: number,
    allowedPrices?: number[],
  ): { passed: boolean; extractedPrices: number[]; reason?: string } {
    if (!output.trim()) {
      return { passed: true, extractedPrices: [] };
    }

    const extractedPrices = this.extractPricesFromText(output);
    if (extractedPrices.length === 0) {
      return { passed: true, extractedPrices: [] };
    }

    const validPriceSet = new Set<number>();
    if (typeof expectedPrice === "number") {
      validPriceSet.add(expectedPrice);
    }
    if (allowedPrices) {
      for (const p of allowedPrices) {
        if (typeof p === "number") {
          validPriceSet.add(p);
        }
      }
    }

    for (const price of extractedPrices) {
      if (validPriceSet.size > 0 && !validPriceSet.has(price)) {
        return {
          passed: false,
          extractedPrices,
          reason: `Ungrounded price mentioned in response: ${price} (Allowed: ${Array.from(validPriceSet).join(", ")})`,
        };
      }
    }

    return { passed: true, extractedPrices };
  }

  /**
   * Stock grounding evaluator:
   * Verifies response statements regarding availability match expected inventory facts.
   */
  evaluateStockGrounding(
    output: string,
    expectedStock?: number,
    isAvailable?: boolean,
  ): { passed: boolean; reason?: string } {
    if (!output.trim()) {
      return { passed: true };
    }

    const lower = output.toLowerCase();

    const claimsOutOfStock = OUT_OF_STOCK_PATTERN.test(lower);
    // Strip out-of-stock phrases to prevent substring collisions (e.g., mawjoud in mouch mawjoud)
    const cleanedForInStock = lower.replace(OUT_OF_STOCK_REPLACE_PATTERN, "");
    const claimsAvailable = IN_STOCK_PATTERN.test(cleanedForInStock);

    const actualAvailable = isAvailable ?? (expectedStock !== undefined ? expectedStock > 0 : true);

    if (!actualAvailable && claimsAvailable && !claimsOutOfStock) {
      return {
        passed: false,
        reason: "Ungrounded stock: claimed product is in stock/available when stock is 0",
      };
    }

    if (actualAvailable && claimsOutOfStock && !claimsAvailable) {
      return {
        passed: false,
        reason: "Ungrounded stock: claimed product is out of stock when inventory is available",
      };
    }

    return { passed: true };
  }

  /**
   * Tool compliance evaluator:
   * Verifies required tools were invoked and forbidden tools were avoided.
   */
  evaluateToolCompliance(
    actualTools: string[],
    requiredTools?: string[],
    forbiddenTools?: string[],
  ): { passed: boolean; missingTools: string[]; forbiddenCalled: string[] } {
    const missingTools: string[] = [];
    const forbiddenCalled: string[] = [];
    const actualToolsSet = new Set(actualTools);

    if (requiredTools) {
      for (const req of requiredTools) {
        if (!actualToolsSet.has(req)) {
          missingTools.push(req);
        }
      }
    }

    if (forbiddenTools) {
      for (const forb of forbiddenTools) {
        if (actualToolsSet.has(forb)) {
          forbiddenCalled.push(forb);
        }
      }
    }

    const passed = missingTools.length === 0 && forbiddenCalled.length === 0;
    return { passed, missingTools, forbiddenCalled };
  }

  /**
   * Script match evaluator:
   * Verifies Arabic script vs Latin/Arabizi script consistency.
   */
  evaluateScriptMatch(
    inbound: string,
    outbound: string,
    expectedScript?: ScriptType,
  ): { passed: boolean; detectedInputScript: string; detectedOutputScript: string } {
    if (!outbound.trim()) {
      return { passed: true, detectedInputScript: "none", detectedOutputScript: "none" };
    }

    const inputHasArabic = ARABIC_SCRIPT_RE.test(inbound);
    const inputHasLatin = LATIN_SCRIPT_RE.test(inbound);
    const outputHasArabic = ARABIC_SCRIPT_RE.test(outbound);
    const outputHasLatin = LATIN_SCRIPT_RE.test(outbound);

    const detectedInput =
      inputHasArabic && inputHasLatin ? "mixed" : inputHasArabic ? "arabic" : "latin";
    const detectedOutput =
      outputHasArabic && outputHasLatin ? "mixed" : outputHasArabic ? "arabic" : "latin";

    const targetScript = expectedScript ?? detectedInput;

    if (targetScript === "arabic") {
      if (!outputHasArabic && outputHasLatin) {
        return {
          passed: false,
          detectedInputScript: detectedInput,
          detectedOutputScript: detectedOutput,
        };
      }
    } else if (targetScript === "latin") {
      if (outputHasArabic && !outputHasLatin) {
        return {
          passed: false,
          detectedInputScript: detectedInput,
          detectedOutputScript: detectedOutput,
        };
      }
    }

    return {
      passed: true,
      detectedInputScript: detectedInput,
      detectedOutputScript: detectedOutput,
    };
  }

  /**
   * Generates aggregated summary report across evaluation scenarios.
   */
  generateSummaryReport(
    results: ScenarioEvaluationResult[],
    thresholds: BenchmarkThresholds = DEFAULT_BENCHMARK_THRESHOLDS,
  ): BenchmarkReport {
    const total = results.length;
    if (total === 0) {
      return {
        totalScenarios: 0,
        passedScenarios: 0,
        failedScenarios: 0,
        overallPassRate: 1,
        priceGroundingAccuracy: 1,
        priceGroundingPassed: true,
        stockGroundingAccuracy: 1,
        stockGroundingPassed: true,
        handoffAccuracy: 1,
        handoffPassed: true,
        commercialSafetyViolationRate: 0,
        commercialSafetyPassed: true,
        toolComplianceRate: 1,
        toolCompliancePassed: true,
        scriptMatchRate: 1,
        scriptMatchPassed: true,
        passedAllGates: true,
        providerErrorCount: 0,
        hasProviderOutage: false,
        categories: {},
        languages: {},
        failedDetails: [],
      };
    }

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = total - passedCount;
    const providerErrorCount = results.filter((r) => r.isProviderError).length;
    const hasProviderOutage = providerErrorCount > 0;

    const priceGroundingCount = results.filter((r) => r.priceGroundingPassed).length;
    const stockGroundingCount = results.filter((r) => r.stockGroundingPassed).length;
    const handoffCount = results.filter((r) => r.handoffPassed).length;
    const safetyViolationsCount = results.filter((r) => !r.safetyPassed).length;
    const toolComplianceCount = results.filter((r) => r.toolCompliancePassed).length;
    const scriptMatchCount = results.filter((r) => r.scriptMatchPassed).length;

    const priceGroundingAccuracy = priceGroundingCount / total;
    const stockGroundingAccuracy = stockGroundingCount / total;
    const handoffAccuracy = handoffCount / total;
    const commercialSafetyViolationRate = safetyViolationsCount / total;
    const toolComplianceRate = toolComplianceCount / total;
    const scriptMatchRate = scriptMatchCount / total;

    const priceGroundingPassed = priceGroundingAccuracy >= thresholds.priceGroundingMin;
    const stockGroundingPassed = stockGroundingAccuracy >= thresholds.stockGroundingMin;
    const handoffPassed = handoffAccuracy >= thresholds.handoffAccuracyMin;
    const commercialSafetyPassed =
      commercialSafetyViolationRate <= thresholds.commercialSafetyViolationMax;
    const toolCompliancePassed = toolComplianceRate >= thresholds.toolComplianceMin;
    const scriptMatchPassed = scriptMatchRate >= thresholds.scriptMatchMin;

    const passedAllGates =
      !hasProviderOutage &&
      priceGroundingPassed &&
      stockGroundingPassed &&
      handoffPassed &&
      commercialSafetyPassed &&
      toolCompliancePassed &&
      scriptMatchPassed;

    const categories = this.aggregateMetricSummary(
      results,
      (r) => r.category,
      (key) => ({ category: key, total: 0, passed: 0, passRate: 0 }),
    );
    const languages = this.aggregateMetricSummary(
      results,
      (r) => r.language,
      (key) => ({ language: key, total: 0, passed: 0, passRate: 0 }),
    );

    const failedDetails: {
      id: string;
      title: string;
      category: string;
      reasons: string[];
    }[] = [];
    for (const r of results) {
      if (!r.passed) {
        failedDetails.push({
          id: r.scenarioId,
          title: r.title,
          category: r.category,
          reasons: r.failureReasons,
        });
      }
    }

    return {
      totalScenarios: total,
      passedScenarios: passedCount,
      failedScenarios: failedCount,
      overallPassRate: passedCount / total,
      priceGroundingAccuracy,
      priceGroundingPassed,
      stockGroundingAccuracy,
      stockGroundingPassed,
      handoffAccuracy,
      handoffPassed,
      commercialSafetyViolationRate,
      commercialSafetyPassed,
      toolComplianceRate,
      toolCompliancePassed,
      scriptMatchRate,
      scriptMatchPassed,
      passedAllGates,
      providerErrorCount,
      hasProviderOutage,
      categories,
      languages,
      failedDetails,
    };
  }

  /**
   * Price regex extractor:
   * Supports currency suffixes (120 DT, 89.500 TND), prefixes (DT 120, TND 50),
   * and Tunisian Arabizi / French pricing keywords (soumou 89, soumha 120, b 120, prix 120).
   */
  extractPricesFromText(text: string): number[] {
    const prices: number[] = [];
    const addPrice = (rawStr: string) => {
      const normalized = rawStr.replace(",", ".");
      const val = parseFloat(normalized);
      if (!isNaN(val) && val > 0 && !prices.includes(val)) {
        prices.push(val);
      }
    };

    // 1. Number followed by currency token (e.g., "120 DT", "89.500 TND", "50 dinars", "120 د.ت")
    const suffixPattern = /\b(\d+(?:[.,]\d+)?)\s*(?:dt|tnd|د\.ت|دينار|dinars?)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = suffixPattern.exec(text)) !== null) {
      if (match[1]) addPrice(match[1]);
    }

    // 2. Currency token followed by number (e.g., "DT 120", "TND 50", "د.ت 120", "DT120")
    const prefixPattern = /(?:(?:dt|tnd)\b|د\.ت)\s*[:=-]?\s*(\d+(?:[.,]\d+)?)/gi;
    while ((match = prefixPattern.exec(text)) !== null) {
      if (match[1]) addPrice(match[1]);
    }

    // 3. Pricing keywords followed by number (e.g., "prix: 120", "soumou 89", "soumha 120", "b 120", "سعرها 120")
    const keywordPattern =
      /(?:\b(?:prix|soum(?:ou|ha|hom)?|assoum)\b|\bb\b|بـ?|\bسعر(?:ه|ها)?\b)\s*[:=-]?\s*(\d+(?:[.,]\d+)?)/gi;
    while ((match = keywordPattern.exec(text)) !== null) {
      if (match[1]) addPrice(match[1]);
    }

    return prices;
  }

  /**
   * Exports benchmark report to formatted JSON file for CI artifact retention.
   */
  saveReportToFile(report: BenchmarkReport, filePath?: string): string {
    const targetPath = filePath ? path.resolve(filePath) : resolveDefaultReportPath();
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(targetPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    return targetPath;
  }

  private aggregateMetricSummary<
    K extends string,
    T extends { total: number; passed: number; passRate: number },
  >(
    results: ScenarioEvaluationResult[],
    keyExtractor: (r: ScenarioEvaluationResult) => K,
    itemFactory: (key: K) => T,
  ): Record<K, T> {
    const summaryMap = new Map<K, T>();
    for (const r of results) {
      const key = keyExtractor(r);
      let entry = summaryMap.get(key);
      if (!entry) {
        entry = itemFactory(key);
        summaryMap.set(key, entry);
      }
      entry.total++;
      if (r.passed) entry.passed++;
    }
    const result: Partial<Record<K, T>> = {};
    for (const [key, entry] of summaryMap.entries()) {
      entry.passRate = entry.total > 0 ? entry.passed / entry.total : 0;
      result[key] = entry;
    }
    return result as Record<K, T>;
  }

  private isIntentMatched(detected: string, expectedList: string[]): boolean {
    return expectedList.includes(detected);
  }

  private isCompatibleEscalationReason(actual: string | null, expected: string | null): boolean {
    if (!actual || !expected) return actual === expected;
    return actual === expected;
  }
}

/**
 * Resolves the default golden benchmark report path cross-platform in local dev, CI, and dist.
 */
export function resolveDefaultReportPath(): string {
  if (process.env.EVAL_REPORT_PATH) {
    return path.resolve(process.env.EVAL_REPORT_PATH);
  }
  const cwd = process.cwd();
  // If running from inside the apps/api directory
  if (path.basename(cwd) === "api" || fs.existsSync(path.join(cwd, "src/ai/evaluation"))) {
    return path.resolve(cwd, "test/golden-eval/eval-report.json");
  }
  // If running from the workspace root or parent directory
  if (fs.existsSync(path.join(cwd, "apps/api"))) {
    return path.resolve(cwd, "apps/api/test/golden-eval/eval-report.json");
  }
  // Default target path within apps/api
  return path.resolve(cwd, "apps/api/test/golden-eval/eval-report.json");
}
