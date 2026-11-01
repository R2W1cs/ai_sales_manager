import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { type AiActionType, Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { AiActionTypeSchema, type DecisionTrace } from "@app/shared";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { InjectPrisma } from "../../platform/core/prisma.token";
import { StrictIntegerLimitSchema } from "../dto/submit-feedback.dto";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RecordDecisionTraceInput {
  businessId: string;
  conversationId: string;
  inboundMessageId: string;
  outboundMessageId?: string | null;
  decisionTrace: Partial<DecisionTrace> & Record<string, unknown>;
}

export interface RecordAiActionInput {
  businessId: string;
  conversationId: string;
  messageId?: string | null;
  actionType: AiActionType;
  toolName?: string | null;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  success: boolean;
  errorMessage?: string | null;
  durationMs?: number | null;
}

export interface DetailedTraceResponse {
  id: string;
  businessId: string;
  conversationId: string;
  inboundMessageId: string;
  outboundMessageId: string | null;
  createdAt: string;
  intent: string;
  confidence: number;
  decision: string;
  retrievedChunks: string[];
  toolCalls: string[];
  reasoning: Record<string, unknown>;
  decisionTrace: Record<string, unknown>;
  actions: AiActionResponseItem[];
  /** True when the action list hit `MAX_ACTIONS_PER_TRACE` and is incomplete. */
  actionsTruncated: boolean;
  /** True when trace data is malformed, corrupted, or has invalid field types. */
  traceInvalid?: boolean;
}

export interface AiActionResponseItem {
  id: string;
  businessId: string;
  conversationId: string;
  messageId: string | null;
  actionType: string;
  toolName: string | null;
  input: unknown;
  output: unknown;
  success: boolean;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface ListActionsQuery {
  conversationId?: string;
  messageId?: string;
  toolName?: string;
  actionType?: string;
  limit?: number | string;
  cursor?: string;
}

export interface ListActionsResponse {
  items: AiActionResponseItem[];
  nextCursor: string | null;
  total: number;
}

/**
 * 13 §11 `GET /ai/actions` query contract.
 *
 * Validated strictly so unknown query properties, malformed UUIDs, or unparseable limits
 * return controlled 400 Bad Request responses instead of reaching Prisma and surfacing as 500s.
 */
export const ListActionsQuerySchema = z.strictObject({
  conversationId: z.uuid().optional(),
  messageId: z.uuid().optional(),
  toolName: z.string().min(1).max(100).optional(),
  actionType: AiActionTypeSchema.optional(),
  limit: StrictIntegerLimitSchema,
  cursor: z.uuid().optional(),
});

/** Upper bound on actions materialised per trace response. */
export const MAX_ACTIONS_PER_TRACE = 200;

/** Upper bound on traces materialised per conversation response. */
export const MAX_TRACES_PER_CONVERSATION = 200;

/** Max recursion depth for data sanitization. */
export const MAX_SANITIZATION_DEPTH = 8;

/** Max string length in sanitized payloads. */
export const MAX_STRING_LENGTH = 10_000;

/** Max error message string length. */
export const MAX_ERROR_MESSAGE_LENGTH = 2_048;

/**
 * Candidate payment-card runs: 13-19 digits with optional single separators.
 * The `\b` anchors stop a longer digit run from being sampled 19 digits at a
 * time. Every candidate is Luhn-checked before redaction.
 */
export const PAN_CANDIDATE_REGEX = /\b\d(?:[ -]?\d){12,18}\b/g;

/**
 * Key names that contain `token` but hold counts, not credentials. Checked
 * before the deny list so AI usage telemetry (`tokens_input`, `tokens_output`)
 * stays readable in traces.
 */
export const TOKEN_COUNT_KEYS = new Set([
  "tokens",
  "tokensinput",
  "tokensoutput",
  "tokensused",
  "tokencount",
  "tokencounts",
  "tokenlimit",
  "totaltokens",
  "inputtokens",
  "outputtokens",
  "prompttokens",
  "completiontokens",
  "maxtokens",
]);

/**
 * Benign non-sensitive keys that contain substrings like `secret` or `token`
 * but represent ordinary words or counters, not credentials.
 */
export const BENIGN_NON_SENSITIVE_KEYS = new Set([
  "secretary",
  "secretarial",
  "secretariat",
  "tokenizer",
  "tokenized",
  "tokenization",
  "tokenspersecond",
  "tokenspersec",
]);

/** Exact-match secret keys too short to use as substrings safely. */
export const EXACT_SENSITIVE_KEYS = new Set([
  "pan",
  "pin",
  "iban",
  "bic",
  "ssn",
  "cvv",
  "cvc",
  "cvv2",
  "cvc2",
  "cid",
]);

/**
 * Secret-bearing key fragments, matched against the normalised key so
 * `clientSecret`, `client_secret` and `CLIENT-SECRET` all collapse to one form.
 *
 * Specific card expiration patterns (`cardexp`, `ccexp`, `expmonth`, `expyear`, `cardexpiry`, etc.)
 * are used instead of generic `expiration`/`expiry` so that benign fields (e.g. `reservation_ttl_minutes`,
 * `session_expiration`, `token_expires_at`, `cookie_expiration`) are not incorrectly redacted.
 */
export const SENSITIVE_KEY_PATTERN =
  /(password|passwd|passphrase|secret|credential|apikey|privatekey|signingkey|encryptionkey|token|authorization|bearer|cookie|sessionid|cvv|cvc|otpcode|onetimecode|totp|mfacode|pincode|pinnumber|signature|cardnumber|cardno|creditcard|debitcard|accountnumber|routingnumber|cardtoken|cardexp|ccexp|cardexpiry|cardexpiration|expmonth|expyear|expdate|expirymonth|expiryyear|track2|magstripe|cardholder)/;

const SECONDARY_SENSITIVE_PATTERN =
  /(password|passwd|passphrase|credential|apikey|privatekey|signingkey|encryptionkey|authorization|bearer|cookie|sessionid|cvv|cvc|otpcode|onetimecode|totp|mfacode|pincode|pinnumber|signature|cardnumber|cardno|creditcard|debitcard|accountnumber|routingnumber|cardtoken|cardexp|ccexp|cardexpiry|cardexpiration|expmonth|expyear|expdate|expirymonth|expiryyear|track2|magstripe|cardholder)/;

/** Normalises a key to lowercase alphanumerics so separators cannot evade matching. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (TOKEN_COUNT_KEYS.has(normalized)) return false;
  if (BENIGN_NON_SENSITIVE_KEYS.has(normalized)) return false;

  // NLP tokenization (tokenizer, tokenized_query, tokenization, etc.)
  if (normalized.includes("tokeniz") || normalized.includes("tokenspersec")) {
    return (
      SECONDARY_SENSITIVE_PATTERN.test(normalized) ||
      normalized.includes("secret") ||
      normalized.includes("key")
    );
  }

  // Clerical names (secretary, secretarial, secretariat, etc.)
  if (normalized.includes("secretar")) {
    return (
      SECONDARY_SENSITIVE_PATTERN.test(normalized) ||
      normalized.includes("token") ||
      normalized.includes("key")
    );
  }

  return EXACT_SENSITIVE_KEYS.has(normalized) || SENSITIVE_KEY_PATTERN.test(normalized);
}

/**
 * Luhn checksum (ISO/IEC 7812).
 *
 * Without it, any 13-19 digit run was redacted, which destroyed ordinary long
 * identifiers (order references, external message ids) while still missing
 * nothing real. Luhn keeps real PANs redacted and leaves plain numbers intact.
 */
export function isLuhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Replaces Luhn-valid 13-19 digit runs, formatted or not, with a placeholder. */
export function redactPans(text: string): string {
  return text.replace(PAN_CANDIDATE_REGEX, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return match;
    return isLuhnValid(digits) ? "[REDACTED_PAN]" : match;
  });
}

/** Sanitizes structured objects/JSON to avoid persisting secrets or raw payment card PANs. */
export function sanitizeObservabilityData(
  data: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    const truncated =
      data.length > MAX_STRING_LENGTH ? `${data.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]` : data;
    return redactPans(truncated);
  }

  if (typeof data === "number" || typeof data === "boolean" || typeof data === "bigint") {
    return data;
  }

  if (typeof data === "symbol" || typeof data === "function") {
    return String(data);
  }

  if (typeof data === "object") {
    if (depth > MAX_SANITIZATION_DEPTH) {
      return "[TRUNCATED_DEPTH]";
    }

    if (seen.has(data)) {
      return "[CIRCULAR]";
    }
    seen.add(data);

    // Binary / Buffer / Uint8Array handling
    if (
      (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) ||
      data instanceof Uint8Array ||
      data instanceof ArrayBuffer
    ) {
      return "[BINARY_DATA]";
    }

    // Set handling
    if (data instanceof Set) {
      return Array.from(data).map((item) => sanitizeObservabilityData(item, seen, depth + 1));
    }

    // Map handling
    if (data instanceof Map) {
      const sanitizedObj: Record<string, unknown> = {};
      for (const [key, value] of data.entries()) {
        const keyStr = String(key);
        if (isSensitiveKey(keyStr)) {
          sanitizedObj[keyStr] = "[REDACTED]";
        } else {
          sanitizedObj[keyStr] = sanitizeObservabilityData(value, seen, depth + 1);
        }
      }
      return sanitizedObj;
    }

    if (Array.isArray(data)) {
      return data.map((item: unknown) => sanitizeObservabilityData(item, seen, depth + 1));
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeObservabilityData(value, seen, depth + 1);
      }
    }
    return sanitized;
  }

  return data;
}

/** Sanitizes a free-text message, preserving `null`. */
export function sanitizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const truncated =
    value.length > MAX_ERROR_MESSAGE_LENGTH
      ? `${value.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...[TRUNCATED]`
      : value;
  return redactPans(truncated);
}

@Injectable()
export class ObservabilityService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() @InjectPrisma() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  public sanitize(data: unknown): unknown {
    return sanitizeObservabilityData(data);
  }

  public sanitizeText(value: string | null | undefined): string | null {
    return sanitizeText(value);
  }

  /**
   * 15 §13.1 Record AI Decision Trace into `ai_decision_traces`
   *
   * Sanitizes and bounds input trace at write time.
   * Tenant integrity is enforced by the schema: `ai_decision_traces`
   * references `conversations(id, business_id)` and `messages(id, business_id)`
   * as composite foreign keys (12 §11.4).
   */
  async recordDecisionTrace(params: RecordDecisionTraceInput) {
    try {
      const sanitizedTrace = this.sanitize(params.decisionTrace) as Prisma.InputJsonValue;

      return await this.prisma.aiDecisionTrace.create({
        data: {
          business_id: params.businessId,
          conversation_id: params.conversationId,
          inbound_message_id: params.inboundMessageId,
          outbound_message_id: params.outboundMessageId ?? null,
          decision_trace: sanitizedTrace,
        },
      });
    } catch (err) {
      logger.warn(
        { err, conversationId: params.conversationId, messageId: params.inboundMessageId },
        "Could not record AI decision trace",
      );
      throw err;
    }
  }

  /**
   * 15 §13 / 12 §11.4 Record AI Tool/Action into `ai_actions`
   */
  async recordAction(params: RecordAiActionInput) {
    try {
      const sanitizedInput = params.input
        ? (this.sanitize(params.input) as Prisma.InputJsonValue)
        : Prisma.JsonNull;
      const sanitizedOutput = params.output
        ? (this.sanitize(params.output) as Prisma.InputJsonValue)
        : Prisma.JsonNull;

      return await this.prisma.aiAction.create({
        data: {
          business_id: params.businessId,
          conversation_id: params.conversationId,
          message_id: params.messageId ?? null,
          action_type: params.actionType,
          tool_name: params.toolName ?? null,
          input: sanitizedInput,
          output: sanitizedOutput,
          success: params.success,
          // Provider error strings routinely echo the failing request, so they
          // get the same redaction pass as the structured payloads.
          error_message: this.sanitizeText(params.errorMessage),
          duration_ms: params.durationMs ?? null,
        },
      });
    } catch (err) {
      logger.warn({ err, toolName: params.toolName }, "Could not record AI action");
      throw err;
    }
  }

  /**
   * 13 §11 / T-OBS-01 GET /ai/traces/:messageId
   * Retrieve detailed AI decision trace and reasoning for an inbound message or trace ID.
   *
   * Accepts an inbound id, an outbound id, or a trace id. A message can carry
   * more than one trace (a retried turn writes a second row), so the newest is
   * returned under an explicit ordering instead of whatever the planner emits.
   */
  /**
   * 13 §11 / T-OBS-01 GET /ai/traces/:messageId
   * Retrieve detailed AI decision trace and reasoning for an inbound message or trace ID.
   *
   * Accepts an inbound id, an outbound id, or a trace id. A message can carry
   * more than one trace (a retried turn writes a second row), so the newest is
   * returned under an explicit ordering instead of whatever the planner emits.
   */
  async getTraceByMessageId(businessId: string, messageId: string): Promise<DetailedTraceResponse> {
    return this.getTraceByIdOrMessageId(businessId, messageId);
  }

  /**
   * 13 §11 / T-OBS-01 Alias with explicit semantics for trace ID or message ID lookup.
   */
  async getTraceByIdOrMessageId(
    businessId: string,
    messageId: string,
  ): Promise<DetailedTraceResponse> {
    const trace = await this.prisma.aiDecisionTrace.findFirst({
      where: {
        business_id: businessId,
        OR: [
          { inbound_message_id: messageId },
          { outbound_message_id: messageId },
          { id: messageId },
        ],
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    if (!trace) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: `Decision trace for message or trace ID ${messageId} not found`,
        },
      });
    }

    const actions = await this.prisma.aiAction.findMany({
      where: {
        business_id: businessId,
        OR: [
          { message_id: trace.inbound_message_id },
          ...(trace.outbound_message_id ? [{ message_id: trace.outbound_message_id }] : []),
        ],
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      // One over the cap so truncation is detectable and reported rather than
      // silently dropping the tail of the action history.
      take: MAX_ACTIONS_PER_TRACE + 1,
    });

    const actionsTruncated = actions.length > MAX_ACTIONS_PER_TRACE;
    if (actionsTruncated) actions.length = MAX_ACTIONS_PER_TRACE;

    return this.buildTraceResponse(trace, actions, actionsTruncated);
  }

  /**
   * 13 §11 / 15 §3 GET /conversations/:id/decision-traces
   * Retrieve all decision traces for a specific conversation.
   */
  async getConversationTraces(
    businessId: string,
    conversationId: string,
  ): Promise<DetailedTraceResponse[]> {
    // A conversation outside the tenant (or one that never existed) previously
    // returned an empty 200, which is indistinguishable from a real
    // conversation with no AI turns.
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, business_id: businessId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: `Conversation ${conversationId} not found`,
        },
      });
    }

    const traces = await this.prisma.aiDecisionTrace.findMany({
      where: {
        business_id: businessId,
        conversation_id: conversationId,
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      take: MAX_TRACES_PER_CONVERSATION,
    });

    if (traces.length === 0) {
      return [];
    }

    // Gather specific message IDs belonging to the retrieved traces
    const messageIds = Array.from(
      new Set(traces.flatMap((t) => [t.inbound_message_id, t.outbound_message_id].filter(Boolean))),
    ) as string[];

    const actions =
      messageIds.length > 0
        ? await this.prisma.aiAction.findMany({
            where: {
              business_id: businessId,
              message_id: { in: messageIds },
            },
            orderBy: [{ created_at: "asc" }, { id: "asc" }],
          })
        : [];

    // Index actions by message id once. Filtering the full action list per
    // trace was O(traces x actions) and re-scanned the same array for every
    // turn in the conversation.
    const actionsByMessageId = new Map<string, typeof actions>();
    for (const action of actions) {
      if (!action.message_id) continue;
      const bucket = actionsByMessageId.get(action.message_id);
      if (bucket) {
        bucket.push(action);
      } else {
        actionsByMessageId.set(action.message_id, [action]);
      }
    }

    return traces.map((trace) => {
      const matchingActions = [
        ...(actionsByMessageId.get(trace.inbound_message_id) ?? []),
        ...(trace.outbound_message_id
          ? (actionsByMessageId.get(trace.outbound_message_id) ?? [])
          : []),
      ];

      const actionsTruncated = matchingActions.length > MAX_ACTIONS_PER_TRACE;
      return this.buildTraceResponse(
        trace,
        actionsTruncated ? matchingActions.slice(0, MAX_ACTIONS_PER_TRACE) : matchingActions,
        actionsTruncated,
      );
    });
  }

  /** Shared projection so both trace endpoints emit an identical shape. */
  private buildTraceResponse(
    trace: {
      id: string;
      business_id: string;
      conversation_id: string;
      inbound_message_id: string;
      outbound_message_id: string | null;
      decision_trace: unknown;
      created_at: Date;
    },
    actions: Parameters<ObservabilityService["mapAction"]>[0][],
    actionsTruncated: boolean,
  ): DetailedTraceResponse {
    const parsed = this.parseDecisionTrace(trace.decision_trace);

    return {
      id: trace.id,
      businessId: trace.business_id,
      conversationId: trace.conversation_id,
      inboundMessageId: trace.inbound_message_id,
      outboundMessageId: trace.outbound_message_id,
      createdAt: trace.created_at.toISOString(),
      intent: parsed.intent,
      confidence: parsed.confidence,
      decision: parsed.decision,
      retrievedChunks: parsed.retrievedChunks,
      toolCalls: parsed.toolCalls,
      reasoning: parsed.traceData,
      decisionTrace: parsed.traceData,
      actions: actions.map((a) => this.mapAction(a)),
      actionsTruncated,
      traceInvalid: parsed.traceInvalid,
    };
  }

  /**
   * Helper to parse and extract structured fields from raw JSON decision trace.
   * Detects corrupted, partial, or invalid field types and exposes `traceInvalid: true`.
   */
  private parseDecisionTrace(rawTrace: unknown): {
    traceData: Record<string, unknown>;
    retrievedChunks: string[];
    toolCalls: string[];
    intent: string;
    confidence: number;
    decision: string;
    traceInvalid: boolean;
  } {
    let traceInvalid = false;

    if (!rawTrace || typeof rawTrace !== "object" || Array.isArray(rawTrace)) {
      traceInvalid = true;
    }

    const traceData = (
      rawTrace && typeof rawTrace === "object" && !Array.isArray(rawTrace) ? rawTrace : {}
    ) as Record<string, unknown>;

    const chunksRaw = traceData.rag_chunk_ids ?? traceData.retrieved_chunks;
    const { items: retrievedChunks, hasInvalid: chunksInvalid } =
      this.extractStringArray(chunksRaw);
    if (chunksInvalid) traceInvalid = true;

    const toolsRaw = traceData.tools_called ?? traceData.tool_calls;
    const { items: toolCalls, hasInvalid: toolsInvalid } = this.extractStringArray(toolsRaw);
    if (toolsInvalid) traceInvalid = true;

    let intent = "unknown";
    if (typeof traceData.intent === "string" && traceData.intent.trim().length > 0) {
      intent = traceData.intent;
    } else if (traceData.intent !== undefined) {
      traceInvalid = true;
    }

    let confidence = 0;
    if (
      typeof traceData.confidence === "number" &&
      !Number.isNaN(traceData.confidence) &&
      traceData.confidence >= 0 &&
      traceData.confidence <= 1
    ) {
      confidence = traceData.confidence;
    } else if (traceData.confidence !== undefined) {
      traceInvalid = true;
    }

    let decision = "unknown";
    if (typeof traceData.decision === "string" && traceData.decision.trim().length > 0) {
      decision = traceData.decision;
    } else if (traceData.decision !== undefined) {
      traceInvalid = true;
    }

    return {
      traceData,
      retrievedChunks,
      toolCalls,
      intent,
      confidence,
      decision,
      traceInvalid,
    };
  }

  /**
   * Narrows an untrusted JSON array to strings, tracking whether malformed elements existed.
   */
  private extractStringArray(value: unknown): { items: string[]; hasInvalid: boolean } {
    if (value === undefined || value === null) return { items: [], hasInvalid: false };
    if (!Array.isArray(value)) return { items: [], hasInvalid: true };
    const items: string[] = [];
    let hasInvalid = false;
    for (const item of value) {
      if (typeof item === "string") {
        items.push(item);
      } else {
        hasInvalid = true;
      }
    }
    return { items, hasInvalid };
  }

  /**
   * 13 §11 GET /api/v1/ai/actions
   * Debug tool log for AI operations with pagination.
   */
  async listActions(businessId: string, query?: ListActionsQuery): Promise<ListActionsResponse> {
    const parseResult = ListActionsQuerySchema.safeParse(query ?? {});
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: issue
            ? `Invalid query parameter '${issue.path.join(".")}': ${issue.message}`
            : "Invalid action log query",
        },
      });
    }
    const validQuery = parseResult.data;
    const limit = validQuery.limit;

    const where: Prisma.AiActionWhereInput = {
      business_id: businessId,
      ...(validQuery.conversationId ? { conversation_id: validQuery.conversationId } : {}),
      ...(validQuery.messageId ? { message_id: validQuery.messageId } : {}),
      ...(validQuery.toolName ? { tool_name: validQuery.toolName } : {}),
      ...(validQuery.actionType ? { action_type: validQuery.actionType } : {}),
    };

    let total: number;
    let actions: {
      id: string;
      business_id: string;
      conversation_id: string;
      message_id: string | null;
      action_type: string;
      tool_name: string | null;
      input: unknown;
      output: unknown;
      success: boolean;
      error_message: string | null;
      duration_ms: number | null;
      created_at: Date;
    }[];

    try {
      [total, actions] = await Promise.all([
        this.prisma.aiAction.count({ where }),
        this.prisma.aiAction.findMany({
          where,
          take: limit + 1,
          ...(validQuery.cursor
            ? {
                cursor: { id: validQuery.cursor },
                skip: 1,
              }
            : {}),
          // `id` breaks `created_at` ties so the cursor walk cannot skip or
          // repeat rows written within the same timestamp.
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
        }),
      ]);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2025"
      ) {
        throw new BadRequestException({
          error: {
            code: "invalid_cursor",
            message: `Cursor '${validQuery.cursor}' not found in results`,
          },
        });
      }
      throw err;
    }

    let nextCursor: string | null = null;
    if (actions.length > limit) {
      const nextItem = actions.pop();
      nextCursor = nextItem?.id ?? null;
    }

    return {
      items: actions.map((a) => this.mapAction(a)),
      nextCursor,
      total,
    };
  }

  /**
   * 13 §11 GET /api/v1/ai/actions/:id
   * Get single tool/AI action record.
   */
  async getActionById(businessId: string, actionId: string): Promise<AiActionResponseItem> {
    const action = await this.prisma.aiAction.findFirst({
      where: {
        id: actionId,
        business_id: businessId,
      },
    });

    if (!action) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: `AI action ${actionId} not found`,
        },
      });
    }

    return this.mapAction(action);
  }

  /**
   * 15 §16 OQ-62 Streak Tracking
   * Count consecutive low confidence turns in last N traces (default 2).
   */
  async getLowConfidenceStreak(
    businessId: string,
    conversationId: string,
    confidenceThreshold = 0.65,
    maxTurns = 2,
  ): Promise<number> {
    if (!conversationId || !UUID_REGEX.test(conversationId)) {
      return 0;
    }

    const traces = await this.prisma.aiDecisionTrace.findMany({
      where: {
        business_id: businessId,
        conversation_id: conversationId,
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: Math.max(1, maxTurns),
    });

    let streak = 0;
    for (const trace of traces) {
      const data = (
        trace.decision_trace &&
        typeof trace.decision_trace === "object" &&
        !Array.isArray(trace.decision_trace)
          ? trace.decision_trace
          : {}
      ) as Record<string, unknown>;

      const isError = Boolean(data.classifier_error);
      const hasConfidence =
        typeof data.confidence === "number" &&
        !Number.isNaN(data.confidence) &&
        data.confidence >= 0 &&
        data.confidence <= 1;

      if (isError) {
        break;
      }

      if (hasConfidence) {
        if ((data.confidence as number) < confidenceThreshold) {
          streak += 1;
        } else {
          break;
        }
      } else {
        // Unspecified / malformed confidence is treated as low confidence turn rather than resetting
        streak += 1;
      }
    }

    return streak;
  }

  private mapAction(action: {
    id: string;
    business_id: string;
    conversation_id: string;
    message_id: string | null;
    action_type: string;
    tool_name: string | null;
    input: unknown;
    output: unknown;
    success: boolean;
    error_message: string | null;
    duration_ms: number | null;
    created_at: Date;
  }): AiActionResponseItem {
    return {
      id: action.id,
      businessId: action.business_id,
      conversationId: action.conversation_id,
      messageId: action.message_id,
      actionType: action.action_type,
      toolName: action.tool_name,
      // Redacted again on read. `OrchestratorService.logAiAction` writes
      // `ai_actions` rows directly (bypassing `recordAction`), and rows stored
      // before a redaction rule existed keep whatever they were written with,
      // so the write-time pass alone does not cover the response.
      input: this.sanitize(action.input),
      output: this.sanitize(action.output),
      success: action.success,
      errorMessage: this.sanitizeText(action.error_message),
      durationMs: action.duration_ms,
      createdAt: action.created_at.toISOString(),
    };
  }
}
