import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from "@nestjs/common";
import {
  MessageDeliveryStatus,
  MessageDirection,
  SenderType,
  type Message,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { Queue, Worker, type Job } from "bullmq";

import { HandoffContextSchema } from "@app/shared";

import { ConversationLockService } from "../../conversations/threads/conversation-lock.service";
import { logger } from "../../lib/logger";
import { prisma as defaultPrisma } from "../../lib/prisma";
import { connection } from "../../lib/queue";
import { InjectPrisma } from "../../platform/core/prisma.token";
import { OrchestratorService } from "../orchestrator/orchestrator.service";

export const SUGGEST_QUEUE = "ai";
export const SUGGEST_JOB = "generate_suggestion";

export interface SuggestDraftResponse {
  jobId: string;
  conversationId: string;
}

export interface SuggestJobData {
  businessId: string;
  conversationId: string;
  jobId: string;
  enqueuedAt?: number;
}

export interface RealtimeSuggestNotifier {
  emitMessageNew(businessId: string, conversationId: string, message: unknown): void;
  emitConversationSuggestion(businessId: string, conversationId: string, suggestion: unknown): void;
}

/**
 * Multilingual complaint and dispute trigger keywords across French, English, Arabic, and Tunisian Derja.
 */
const COMPLAINT_KEYWORDS = [
  // English / Standard
  "complaint",
  "refund",
  "dispute",
  "chargeback",
  "scam",
  "stolen",
  // French
  "reclamation",
  "réclamation",
  "remboursement",
  "litige",
  "plainte",
  "arnaque",
  "insatisfait",
  // Arabic (MSA)
  "شكوى",
  "استرجاع",
  "استرداد",
  "نزاع",
  "غش",
  "نصب",
  "غير راض",
  // Tunisian Arabizi / Derja
  "tachki",
  "techki",
  "chkoua",
  "chakwa",
  "mouch 3ajebni",
  "mouch 3ajbetni",
  "floussi",
  "rajja3",
  "raj3ouli",
  "ghachouni",
  "ghachitouni",
  "mouch radhi",
  "fadhit",
  "ser9a",
  "kla floussi",
];

const CANONICAL_COMPLAINT_ESCALATION_REASONS = new Set([
  "complaint",
  "refund_request",
  "return_exchange",
  "payment_issue",
  "legal_sensitive",
]);

const ALLOWED_SUGGESTION_STATUSES = new Set(["HUMAN_REQUIRED", "HUMAN_HANDLING"]);

@Injectable()
export class SuggestService implements OnModuleInit, OnModuleDestroy {
  private readonly prisma: PrismaClient;
  private queue: Queue<SuggestJobData> | null = null;
  private worker: Worker<SuggestJobData> | null = null;

  constructor(
    private readonly orchestrator: OrchestratorService,
    @Optional() @InjectPrisma() prismaClient?: PrismaClient,
    @Optional() private readonly realtimeService?: RealtimeSuggestNotifier,
    @Optional() private readonly lockService?: ConversationLockService,
    @Optional() queue?: Queue<SuggestJobData>,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
    this.queue = queue ?? null;
  }

  onModuleInit() {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    try {
      this.queue ??= new Queue<SuggestJobData>(SUGGEST_QUEUE, {
        connection,
      });

      this.worker = new Worker<SuggestJobData>(
        SUGGEST_QUEUE,
        async (job: Job<SuggestJobData>) => {
          if (job.name === SUGGEST_JOB) {
            return this.processJob(job);
          }
        },
        {
          connection,
          concurrency: 5,
        },
      );

      this.worker.on("completed", (job) => {
        logger.info(
          {
            jobId: job.id,
            conversationId: job.data.conversationId,
          },
          "Suggest draft job completed successfully",
        );
      });

      this.worker.on("failed", (job, err) => {
        logger.warn(
          {
            jobId: job?.id,
            conversationId: job?.data.conversationId,
            err,
          },
          "Suggest draft job failed",
        );
      });
    } catch (err) {
      logger.warn({ err }, "Could not initialize BullMQ worker for AI suggest drafts");
    }
  }

  async onModuleDestroy() {
    try {
      if (this.worker) {
        await this.worker.close();
        this.worker = null;
      }
      if (this.queue) {
        await this.queue.close();
        this.queue = null;
      }
    } catch (err) {
      logger.warn({ err }, "Error closing suggest queue/worker");
    }
  }

  /**
   * Evaluates if conversation is in an active complaint or refund dispute status.
   * 13 §6.2 & 01 §3: AI suggestions are strictly suppressed on complaint/refund → 409 Conflict.
   */
  isComplaintOrRefund(conversation: {
    escalation_reason?: string | null;
    last_intent?: string | null;
    handoff_context?: unknown;
  }): boolean {
    const matchesKeyword = (text: string, kw: string): boolean => {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "iu");
      return regex.test(text);
    };

    const escalation = (conversation.escalation_reason ?? "").toLowerCase().trim();
    if (escalation) {
      if (CANONICAL_COMPLAINT_ESCALATION_REASONS.has(escalation)) {
        return true;
      }
      for (const kw of COMPLAINT_KEYWORDS) {
        if (matchesKeyword(escalation, kw)) {
          return true;
        }
      }
    }

    const intent = (conversation.last_intent ?? "").toLowerCase().trim();
    if (intent === "complaint" || intent === "refund" || intent === "dispute") {
      return true;
    }

    if (conversation.handoff_context) {
      const parsed = HandoffContextSchema.safeParse(conversation.handoff_context);
      if (parsed.success) {
        const ctx = parsed.data;
        if (CANONICAL_COMPLAINT_ESCALATION_REASONS.has(ctx.escalation_reason)) {
          return true;
        }
        if (ctx.also_matched.some((r) => CANONICAL_COMPLAINT_ESCALATION_REASONS.has(r))) {
          return true;
        }
      } else if (typeof conversation.handoff_context === "object") {
        const ctx = conversation.handoff_context as Record<string, unknown>;
        const reasonVal =
          typeof ctx.escalationReason === "string"
            ? ctx.escalationReason
            : typeof ctx.escalation_reason === "string"
              ? ctx.escalation_reason
              : typeof ctx.reason === "string"
                ? ctx.reason
                : "";
        const reason = reasonVal.toLowerCase().trim();
        const trigger = typeof ctx.trigger === "string" ? ctx.trigger.toUpperCase() : "";

        if (
          trigger === "COMPLAINT_OR_DISPUTE" ||
          trigger === "COMPLAINT" ||
          trigger === "REFUND" ||
          CANONICAL_COMPLAINT_ESCALATION_REASONS.has(reason)
        ) {
          return true;
        }

        for (const kw of COMPLAINT_KEYWORDS) {
          if (matchesKeyword(reason, kw)) {
            return true;
          }
        }

        if (Array.isArray(ctx.also_matched)) {
          for (const m of ctx.also_matched) {
            if (
              typeof m === "string" &&
              CANONICAL_COMPLAINT_ESCALATION_REASONS.has(m.toLowerCase().trim())
            ) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Checks if AI capabilities are paused for this workspace/tenant (quota breach / budget limit / feature flag).
   * 13 §2.6 & 01-conventions: Returns 403 Forbidden with code `ai_paused`.
   */
  private async isAiPaused(businessId: string, businessSettings?: unknown): Promise<boolean> {
    if (
      businessSettings &&
      typeof businessSettings === "object" &&
      (businessSettings as Record<string, unknown>).ai_paused === true
    ) {
      return true;
    }

    const [businessFlag, globalFlag] = await Promise.all([
      this.prisma.featureFlag.findFirst({
        where: { business_id: businessId, feature: "ai_paused" },
      }),
      this.prisma.featureFlag.findFirst({
        where: { business_id: null, feature: "ai_paused" },
      }),
    ]);

    return Boolean(businessFlag?.enabled || globalFlag?.enabled);
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/suggest
   * On-demand entrypoint to request AI reply draft suggestion.
   * Invariants:
   * - 202 Accepted { jobId, conversationId }
   * - Suppress on complaint / refund -> 409 Conflict
   * - Block on ai_paused -> 403 Forbidden
   * - Multi-tenant isolation: conversation must belong to businessId -> 404 NotFound
   * - State validation: reject on RESOLVED -> 409 Conflict
   */
  async requestSuggestion(
    businessId: string,
    conversationId: string,
  ): Promise<SuggestDraftResponse> {
    if (!businessId || !conversationId) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "businessId and conversationId are required",
        },
      });
    }

    // 1. Resolve conversation with multi-tenant boundary
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        business_id: businessId,
      },
      include: {
        business: true,
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

    // 2. Validate conversation status (cannot suggest on RESOLVED / closed conversations)
    if (!ALLOWED_SUGGESTION_STATUSES.has(conversation.status)) {
      throw new ConflictException({
        error: {
          code: "invalid_conversation_state",
          message: `AI draft suggestions are not allowed for conversation in status ${conversation.status}`,
        },
      });
    }

    // 3. Check if AI is paused for tenant
    const paused = await this.isAiPaused(businessId, conversation.business.settings);
    if (paused) {
      throw new ForbiddenException({
        error: {
          code: "ai_paused",
          message: "AI capabilities are paused for this workspace",
        },
      });
    }

    // 4. Check for active complaint or refund suppression
    if (this.isComplaintOrRefund(conversation)) {
      throw new ConflictException({
        error: {
          code: "conflict",
          message:
            "AI draft suggestions are suppressed during active complaints or refund disputes",
        },
      });
    }

    // 5. Generate asynchronous draft task with canonical composite jobId
    const idempotencyKey = randomUUID();
    const jobId = `${conversationId}:suggest:${idempotencyKey}`;

    // BullMQ enqueue with fallback to async execution
    let enqueued = false;
    if (this.queue) {
      try {
        await this.queue.add(
          SUGGEST_JOB,
          {
            businessId,
            conversationId,
            jobId,
            enqueuedAt: Date.now(),
          },
          {
            jobId,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );
        enqueued = true;
      } catch (err: unknown) {
        logger.warn(
          { err, conversationId, jobId },
          "Failed to enqueue suggest job to BullMQ queue",
        );
      }
    }

    if (!enqueued) {
      // Non-blocking async execution per NFR-PERF-04d (Do not hold HTTP for LLM)
      this.generateDraft(businessId, conversationId, jobId).catch((err: unknown) => {
        logger.warn(
          { err, businessId, conversationId, jobId },
          "Asynchronous AI draft suggestion generation encountered an error",
        );
      });
    }

    return {
      jobId,
      conversationId,
    };
  }

  /**
   * BullMQ job execution handler
   */
  async processJob(job: Job<SuggestJobData>): Promise<Message | null> {
    const { businessId, conversationId, jobId } = job.data;
    return this.generateDraft(businessId, conversationId, jobId);
  }

  /**
   * Generates and persists the AI suggestion draft in the conversation timeline.
   * Emits realtime events for instant UI synchronization.
   * Acquires Redlock conversation lock and verifies turn freshness & existing pending drafts.
   */
  async generateDraft(
    businessId: string,
    conversationId: string,
    jobId?: string,
  ): Promise<Message | null> {
    if (this.lockService) {
      return this.lockService.withLock(
        businessId,
        conversationId,
        (lockToken) => this.executeDraftGeneration(businessId, conversationId, jobId, lockToken),
        { ttlMs: 30_000, retryAttempts: 5, retryDelayMs: 200 },
      );
    }

    return this.executeDraftGeneration(businessId, conversationId, jobId);
  }

  private async executeDraftGeneration(
    businessId: string,
    conversationId: string,
    jobId?: string,
    lockToken?: string,
  ): Promise<Message | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        business_id: businessId,
      },
    });

    if (!conversation || !ALLOWED_SUGGESTION_STATUSES.has(conversation.status)) {
      return null;
    }

    if (this.isComplaintOrRefund(conversation)) {
      return null;
    }

    // Fetch latest inbound message for turn grounding
    const latestInbound = await this.prisma.message.findFirst({
      where: {
        business_id: businessId,
        conversation_id: conversationId,
        direction: MessageDirection.inbound,
      },
      orderBy: { created_at: "desc" },
    });

    // Guard: If there is no prior customer inbound message or text is empty, abort gracefully
    if (!latestInbound?.content?.trim()) {
      logger.warn(
        { conversationId, businessId },
        "Cannot generate AI suggestion draft: no prior customer inbound message found",
      );
      return null;
    }

    // Guard: Check if a human agent has already answered after the latest inbound message
    const latestMessage = await this.prisma.message.findFirst({
      where: {
        business_id: businessId,
        conversation_id: conversationId,
      },
      orderBy: { created_at: "desc" },
    });

    if (
      latestMessage?.direction === MessageDirection.outbound &&
      latestMessage.delivery_status !== MessageDeliveryStatus.draft &&
      latestMessage.created_at.getTime() > latestInbound.created_at.getTime()
    ) {
      logger.info(
        { conversationId, latestMessageId: latestMessage.id },
        "Suggestion skipped: human/outbound message already replied after customer inbound turn",
      );
      return null;
    }

    const turnResult = await this.orchestrator.executeTurn(conversationId, latestInbound.content, {
      businessId,
      mode: "suggest",
      inboundMessageId: latestInbound.id,
      lockToken,
    });

    if (!turnResult.response) {
      return null;
    }

    const idempotencyKey = `ai-suggest-${jobId ?? randomUUID()}`;

    // 1. Idempotency Guard: return existing draft if already processed
    const existing = await this.prisma.message.findUnique({
      where: { idempotency_key: idempotencyKey },
      include: {
        attachments: {
          orderBy: { sort_order: "asc" },
        },
      },
    });

    if (existing) {
      return existing;
    }

    // 2. Draft Superseding Invariant: clean up any stale/unapproved drafts for this conversation
    await this.prisma.message.deleteMany({
      where: {
        business_id: businessId,
        conversation_id: conversationId,
        delivery_status: MessageDeliveryStatus.draft,
      },
    });

    const aiMetadata = {
      isSuggestion: true,
      mode: "suggest",
      suggestedAt: new Date().toISOString(),
      toolsCalled: turnResult.toolsCalled,
      tools_called: turnResult.toolsCalled,
      groundingPassed: turnResult.groundingPassed,
      usage: turnResult.usage,
      decisionTraceId: turnResult.decisionTraceId,
      jobId,
      intent: conversation.last_intent ?? "product_inquiry",
      confidence: 1.0,
      model: turnResult.usage.model,
      latency_ms: 0,
      fallback_used: false,
    } as unknown as Prisma.InputJsonValue;

    // 3. Persist new active draft message in timeline
    const draftMessage = await this.prisma.message.create({
      data: {
        business_id: businessId,
        conversation_id: conversationId,
        channel_account_id: conversation.channel_account_id,
        direction: MessageDirection.outbound,
        sender_type: SenderType.ai,
        content: turnResult.response,
        delivery_status: MessageDeliveryStatus.draft,
        idempotency_key: idempotencyKey,
        ai_metadata: aiMetadata,
      },
      include: {
        attachments: {
          orderBy: { sort_order: "asc" },
        },
      },
    });

    // 4. Realtime notification dispatch
    if (this.realtimeService) {
      try {
        this.realtimeService.emitMessageNew(businessId, conversationId, draftMessage);
        this.realtimeService.emitConversationSuggestion(businessId, conversationId, {
          messageId: draftMessage.id,
          content: draftMessage.content,
          draft: draftMessage,
          jobId,
        });
      } catch (err: unknown) {
        logger.warn(
          { err, conversationId, messageId: draftMessage.id },
          "Failed to emit realtime events for draft suggestion",
        );
      }
    }

    return draftMessage;
  }
}
