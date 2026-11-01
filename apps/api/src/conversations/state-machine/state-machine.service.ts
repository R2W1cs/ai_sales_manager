import { ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  type Conversation,
  type ConversationStatus,
  type ConversationStatusEvent,
  type HandoffPriority,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "../../lib/prisma";

/**
 * Custom ConflictException thrown when an invalid state machine transition is attempted.
 * HTTP Status: 409 Conflict
 */
export class InvalidTransitionException extends ConflictException {
  constructor(
    public readonly fromStatus: string,
    public readonly toStatus: string,
    public readonly reason?: string,
  ) {
    super({
      error: {
        code: "invalid_transition",
        message:
          reason ?? `Invalid conversation status transition from '${fromStatus}' to '${toStatus}'`,
      },
    });
  }
}

/**
 * Custom ConflictException thrown when resume is blocked by a pending order.
 * HTTP Status: 409 Conflict
 */
export class PendingOrderBlocksResumeException extends ConflictException {
  constructor(
    message = "Cannot resume AI while an unconfirmed order exists for this conversation",
  ) {
    super({
      error: {
        code: "pending_order_blocks_resume",
        message,
      },
    });
  }
}

/**
 * Custom ConflictException thrown when close is blocked by a pending order.
 * HTTP Status: 409 Conflict
 */
export class PendingOrderBlocksCloseException extends ConflictException {
  constructor(
    message = "Cannot close conversation while an unconfirmed order exists. Confirm or cancel the order first.",
  ) {
    super({
      error: {
        code: "pending_order_blocks_close",
        message,
      },
    });
  }
}

/**
 * Canonical legal conversation status transition matrix (14_SYSTEM_DESIGN.md §3.1).
 */
export const LEGAL_TRANSITIONS: Record<ConversationStatus, readonly ConversationStatus[]> = {
  NEW: ["AI_ACTIVE", "RESOLVED"],
  AI_ACTIVE: ["ORDER_INTENT_DETECTED", "HUMAN_REQUIRED", "RESOLVED"],
  ORDER_INTENT_DETECTED: ["HUMAN_REQUIRED", "RESOLVED"],
  HUMAN_REQUIRED: ["HUMAN_HANDLING", "ORDER_CONFIRMED", "AI_ACTIVE", "RESOLVED"],
  HUMAN_HANDLING: ["ORDER_CONFIRMED", "AI_ACTIVE", "RESOLVED"],
  ORDER_CONFIRMED: ["RESOLVED"],
  RESOLVED: [],
} as const;

export type ActorInput =
  | string
  | {
      type: string;
      userId?: string | null;
    };

export interface TransitionOptions {
  conversationId: string;
  toState: ConversationStatus;
  actor?: ActorInput;
  reason?: string | null;
  businessId?: string;
  handoffPriority?: HandoffPriority | null;
  handoffContext?: Record<string, unknown> | null;
}

export interface TransitionResult {
  conversation: Conversation;
  statusEvent: ConversationStatusEvent;
  fromStatus: ConversationStatus;
  toStatus: ConversationStatus;
}

@Injectable()
export class StateMachineService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * Normalizes actor input to standardized actor_type string and actor_user_id.
   */
  private normalizeActor(actor?: ActorInput): {
    actorType: string;
    actorUserId: string | null;
  } {
    if (!actor) {
      return { actorType: "system", actorUserId: null };
    }

    if (typeof actor === "string") {
      const lower = actor.toLowerCase();
      if (lower === "human" || lower === "user") {
        return { actorType: "user", actorUserId: null };
      }
      if (lower === "ai") {
        return { actorType: "ai", actorUserId: null };
      }
      if (lower === "system") {
        return { actorType: "system", actorUserId: null };
      }
      return { actorType: lower, actorUserId: null };
    }

    let actorType = (actor.type || "system").toLowerCase();
    if (actorType === "human") {
      actorType = "user";
    }

    return {
      actorType,
      actorUserId: actor.userId ?? null,
    };
  }

  /**
   * Checks whether a direct transition from `from` to `to` is legally permitted.
   */
  public isLegalTransition(from: ConversationStatus, to: ConversationStatus): boolean {
    const allowed = LEGAL_TRANSITIONS[from];
    return allowed.includes(to);
  }

  /**
   * Returns list of legal destination states from the current state.
   */
  public getLegalTransitions(from: ConversationStatus): readonly ConversationStatus[] {
    return LEGAL_TRANSITIONS[from];
  }

  /**
   * Validates that a transition between two states is legal according to the matrix.
   * Throws InvalidTransitionException (409 Conflict) if forbidden.
   */
  public validateTransition(from: ConversationStatus, to: ConversationStatus): void {
    if (!this.isLegalTransition(from, to)) {
      throw new InvalidTransitionException(from, to);
    }
  }

  /**
   * Executes a verified conversation state machine transition.
   * Atomic operation:
   * 1. Validates conversation existence and multi-tenant boundary
   * 2. Validates legal transition matrix (throws 409 if illegal)
   * 3. Validates order guardrails (e.g. pending order blocks resume or close)
   * 4. In a transaction:
   *    - Inserts immutable row into `conversation_status_events`
   *    - Updates `conversation` status, ai_enabled flag, and relevant handoff timestamps
   */
  async transition(
    conversationIdOrOptions: string | TransitionOptions,
    toStateArg?: ConversationStatus,
    actorArg?: ActorInput,
    reasonArg?: string | null,
    businessIdArg?: string,
  ): Promise<TransitionResult> {
    let conversationId: string;
    let toState: ConversationStatus | undefined;
    let actor: ActorInput | undefined;
    let reason: string | null | undefined;
    let businessId: string | undefined;
    let handoffPriority: HandoffPriority | null | undefined;
    let handoffContext: Record<string, unknown> | null | undefined;

    if (typeof conversationIdOrOptions === "object") {
      conversationId = conversationIdOrOptions.conversationId;
      toState = conversationIdOrOptions.toState;
      actor = conversationIdOrOptions.actor;
      reason = conversationIdOrOptions.reason;
      businessId = conversationIdOrOptions.businessId;
      handoffPriority = conversationIdOrOptions.handoffPriority;
      handoffContext = conversationIdOrOptions.handoffContext;
    } else {
      conversationId = conversationIdOrOptions;
      toState = toStateArg;
      actor = actorArg;
      reason = reasonArg;
      businessId = businessIdArg;
    }

    if (toState === undefined) {
      throw new InvalidTransitionException("UNKNOWN", "UNDEFINED", "Target state must be provided");
    }

    const targetState: ConversationStatus = toState;

    // Lookup conversation with optional multi-tenant scoping
    const whereClause: Prisma.ConversationWhereInput = {
      id: conversationId,
    };
    if (businessId) {
      whereClause.business_id = businessId;
    }

    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: whereClause,
      });

      if (!conversation) {
        throw new NotFoundException({
          error: {
            code: "not_found",
            message: `Conversation ${conversationId} not found`,
          },
        });
      }

      const fromState = conversation.status;

      // 1. Matrix transition validation
      this.validateTransition(fromState, targetState);

      // 2. Guard: Resume AI (to AI_ACTIVE) is blocked if unconfirmed order exists
      if (targetState === "AI_ACTIVE") {
        const pendingOrders = await tx.order.findMany({
          where: {
            business_id: conversation.business_id,
            conversation_id: conversation.id,
            status: "PENDING_CONFIRMATION",
          },
        });

        if (pendingOrders.length > 0) {
          throw new PendingOrderBlocksResumeException();
        }
      }

      // 3. Guard: Close (to RESOLVED) is blocked if unconfirmed order exists
      if (targetState === "RESOLVED") {
        const pendingOrders = await tx.order.findMany({
          where: {
            business_id: conversation.business_id,
            conversation_id: conversation.id,
            status: "PENDING_CONFIRMATION",
          },
        });

        if (pendingOrders.length > 0) {
          throw new PendingOrderBlocksCloseException();
        }
      }

      const { actorType, actorUserId } = this.normalizeActor(actor);
      const now = new Date();

      // Determine ai_enabled flag changes per 14_SYSTEM_DESIGN.md §3.3
      let nextAiEnabled = conversation.ai_enabled;
      if (targetState === "HUMAN_REQUIRED" || targetState === "HUMAN_HANDLING") {
        nextAiEnabled = false;
      } else if (targetState === "AI_ACTIVE") {
        nextAiEnabled = true;
      }

      // Build update data
      const updateData: Prisma.ConversationUpdateInput = {
        status: targetState,
        ai_enabled: nextAiEnabled,
      };

      if (targetState === "HUMAN_REQUIRED") {
        updateData.handoff_at = now;
        if (reason) {
          updateData.escalation_reason = reason;
        }
        if (handoffPriority !== undefined) {
          updateData.handoff_priority = handoffPriority;
        }
        if (handoffContext !== undefined) {
          updateData.handoff_context = handoffContext as Prisma.InputJsonValue;
        }
      }

      if (fromState === "HUMAN_REQUIRED" && targetState === "HUMAN_HANDLING") {
        updateData.handoff_completed_at = now;
      }

      // Execute atomic transition and status event log concurrently
      const [statusEvent, updatedConversation] = await Promise.all([
        tx.conversationStatusEvent.create({
          data: {
            business_id: conversation.business_id,
            conversation_id: conversation.id,
            from_status: fromState,
            to_status: targetState,
            escalation_reason: reason ?? null,
            actor_type: actorType,
            actor_user_id: actorUserId,
            is_test: conversation.is_test,
            created_at: now,
          },
        }),
        tx.conversation.update({
          where: { id: conversation.id },
          data: updateData,
        }),
      ]);

      return {
        conversation: updatedConversation,
        statusEvent,
        fromStatus: fromState,
        toStatus: targetState,
      };
    });
  }

  /**
   * Retrieves status transition event history for a conversation.
   */
  async getStatusHistory(
    conversationId: string,
    businessId?: string,
  ): Promise<ConversationStatusEvent[]> {
    const whereClause: Prisma.ConversationStatusEventWhereInput = {
      conversation_id: conversationId,
    };
    if (businessId) {
      whereClause.business_id = businessId;
    }

    return this.prisma.conversationStatusEvent.findMany({
      where: whereClause,
      orderBy: { created_at: "asc" },
    });
  }
}
