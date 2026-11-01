import { Injectable, Optional } from "@nestjs/common";

import type { ExtractedEntities, IntentClassification } from "@app/shared";

import { LlmIntentClassifierService } from "./llm-intent-classifier.service";
import { RuleIntentClassifier } from "./rule-intent-classifier";

export type { CanonicalIntent } from "@app/shared";

/**
 * Public result type for the hybrid classifier.
 * `entities` is optional because the deterministic rule path may produce no entities.
 * The LLM path always populates entities via Zod `.default({})`.
 */
export type IntentClassificationResult = Omit<IntentClassification, "entities"> & {
  entities?: ExtractedEntities;
};

export interface ClassifyOptions {
  forceLlm?: boolean;
}

@Injectable()
export class IntentClassifierService {
  private readonly llmClassifier: LlmIntentClassifierService;

  constructor(@Optional() llmClassifier?: LlmIntentClassifierService) {
    this.llmClassifier = llmClassifier ?? new LlmIntentClassifierService();
  }

  /**
   * Synchronous pure deterministic rule match.
   * Returns result immediately if a high-confidence rule matches; otherwise null.
   */
  classifyRule(text: string): IntentClassificationResult | null {
    const startTime = Date.now();
    const ruleMatch = RuleIntentClassifier.match(text);
    if (ruleMatch && ruleMatch.confidence >= 0.85) {
      return {
        intent: ruleMatch.intent,
        confidence: ruleMatch.confidence,
        secondary: ruleMatch.secondary,
        entities: ruleMatch.entities,
        matchedRule: ruleMatch.matchedRule,
        source: "rule",
        latencyMs: Date.now() - startTime,
      };
    }
    return null;
  }

  /**
   * Canonical hybrid intent classification:
   * 1. Deterministic Rule Classifier (Sub-millisecond, zero cost).
   * 2. If no confident rule match, calls cheap structured LLM (gpt-5.6-luna).
   * 3. Validates structured JSON schema and returns result.
   */
  async classify(text: string, options?: ClassifyOptions): Promise<IntentClassificationResult> {
    const startTime = Date.now();

    // 1. Stage 1: Deterministic rules fast-path (unless explicitly forced to LLM)
    if (!options?.forceLlm) {
      const ruleResult = this.classifyRule(text);
      if (ruleResult) {
        return ruleResult;
      }
    }

    // 2. Stage 2: Cheap structured LLM fallback (gpt-5.6-luna)
    const llmResult: IntentClassification = await this.llmClassifier.classify(text);

    return {
      intent: llmResult.intent,
      confidence: llmResult.confidence,
      secondary: llmResult.secondary,
      entities: llmResult.entities,
      source: "llm",
      latencyMs: Date.now() - startTime,
      model: llmResult.model,
    };
  }
}
