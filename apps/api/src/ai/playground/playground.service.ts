import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  ConversationSource,
  ConversationStatus,
  MessageDirection,
  MessageDeliveryStatus,
  SenderType,
  Prisma,
  type Conversation,
  type HandoffPriority,
  type PrismaClient,
} from "@prisma/client";

import { StateMachineService } from "../../conversations/state-machine/state-machine.service";
import { logger } from "../../lib/logger";
import { prisma as defaultPrisma } from "../../lib/prisma";
import {
  PlaygroundSimulateSchema,
  PlaygroundSimulateResponseSchema,
  PLAYGROUND_SCENARIO_PROMPTS,
  type PlaygroundSimulateDto,
  type PlaygroundSimulateResponse,
} from "../dto/playground-simulate.dto";
import { OrchestratorService } from "../orchestrator/orchestrator.service";

/**
 * In-flight claim lease duration in milliseconds.
 * If a process crashes after claiming an idempotency key, subsequent requests
 * older than this lease will automatically recover and take over the claim.
 */
export const CLAIM_LEASE_TIMEOUT_MS = 60_000;

@Injectable()
export class PlaygroundService {
  private readonly prisma: PrismaClient;

  constructor(
    private readonly orchestratorService: OrchestratorService,
    @Optional() private readonly stateMachineService?: StateMachineService,
    @Optional() prismaClient?: PrismaClient,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * 13 §11 / 15 §3 POST /api/v1/ai/playground
   * Executes AI sales orchestrator simulation in a strictly isolated sandbox test conversation.
   * Idempotency is tenant-scoped (`business_id` + `key`) and hashed against request payload.
   */
  async simulate(
    businessId: string,
    dto: PlaygroundSimulateDto,
  ): Promise<PlaygroundSimulateResponse> {
    const parsed = PlaygroundSimulateSchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: parsed.error.issues[0]?.message || "Invalid playground simulation payload",
        },
      });
    }

    const { message, conversationId, scenario, idempotencyKey } = parsed.data;
    let messageText = message;
    if (!messageText && scenario) {
      messageText = PLAYGROUND_SCENARIO_PROMPTS[scenario];
    }

    if (!messageText) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "A simulation message or valid scenario is required",
        },
      });
    }

    // 0. Idempotency Resolution & Claim BEFORE conversation creation
    const scopedKey = idempotencyKey ? `playground:${idempotencyKey}` : null;
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          businessId,
          message: messageText,
          scenario: scenario ?? null,
          conversationId: conversationId ?? null,
        }),
      )
      .digest("hex");

    if (scopedKey && idempotencyKey) {
      const existingClaim = await this.prisma.idempotencyKey.findUnique({
        where: {
          business_id_key: {
            business_id: businessId,
            key: scopedKey,
          },
        },
      });

      if (existingClaim) {
        const replay = await this.handleExistingClaim(
          existingClaim,
          businessId,
          scopedKey,
          requestHash,
        );
        if (replay) {
          return replay;
        }
      } else {
        // Atomic DB claim with composite unique constraint [business_id, key]
        try {
          await this.prisma.idempotencyKey.create({
            data: {
              business_id: businessId,
              key: scopedKey,
              request_hash: requestHash,
              response_status: null,
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
        } catch (err: unknown) {
          const prismaErr = err as { code?: string };
          if (prismaErr.code === "P2002") {
            const racedClaim = await this.prisma.idempotencyKey.findUnique({
              where: { business_id_key: { business_id: businessId, key: scopedKey } },
            });
            if (racedClaim) {
              const replay = await this.handleExistingClaim(
                racedClaim,
                businessId,
                scopedKey,
                requestHash,
              );
              if (replay) {
                return replay;
              }
            }
          } else {
            throw err;
          }
        }
      }
    }

    // Wrap the entire post-claim lifecycle in structured failure handling and rollback
    let conversation: Conversation | undefined;
    let isNewConversation = false;
    let inboundMessageId: string | undefined;
    let outboundMessageId: string | undefined;

    try {
      if (conversationId) {
        // Look up conversation strictly within tenant
        const existing = await this.prisma.conversation.findFirst({
          where: {
            id: conversationId,
            business_id: businessId,
          },
        });

        if (!existing) {
          throw new NotFoundException({
            error: {
              code: "not_found",
              message: `Playground conversation ${conversationId} not found`,
            },
          });
        }

        // Security boundary: Reject any non-test or non-playground conversations
        if (!existing.is_test || existing.source !== ConversationSource.playground) {
          throw new ForbiddenException({
            error: {
              code: "forbidden",
              message: "Cannot run playground simulation on a live or non-playground conversation",
            },
          });
        }

        // State validation: Reject closed or human-escalated threads
        const disallowedStatuses: readonly string[] = [
          ConversationStatus.RESOLVED,
          ConversationStatus.HUMAN_REQUIRED,
        ];
        if (disallowedStatuses.includes(existing.status)) {
          throw new BadRequestException({
            error: {
              code: "invalid_conversation_state",
              message: `Playground conversation ${conversationId} is in status ${existing.status} and cannot accept new simulation turns`,
            },
          });
        }

        conversation = existing;
      } else {
        // Deterministic test customer lookup / creation using tenant-scoped deterministic UUID
        const customerHash = createHash("sha256")
          .update(`${businessId}:playground_simulation_user`)
          .digest("hex");
        const deterministicCustomerId = [
          customerHash.slice(0, 8),
          customerHash.slice(8, 12),
          "4" + customerHash.slice(13, 16),
          "8" + customerHash.slice(17, 20),
          customerHash.slice(20, 32),
        ].join("-");

        let testCustomer = await this.prisma.customer.findFirst({
          where: {
            id: deterministicCustomerId,
            business_id: businessId,
          },
        });

        testCustomer ??= await this.prisma.customer.findFirst({
          where: {
            business_id: businessId,
            is_test: true,
            name: "Playground Simulation User",
          },
          orderBy: { created_at: "asc" },
        });

        if (!testCustomer) {
          try {
            testCustomer = await this.prisma.customer.create({
              data: {
                id: deterministicCustomerId,
                business_id: businessId,
                name: "Playground Simulation User",
                is_test: true,
                lifecycle_stage: "unknown_visitor",
              },
            });
          } catch (err: unknown) {
            const prismaErr = err as { code?: string };
            if (prismaErr.code === "P2002") {
              // Concurrency collision on primary key / unique constraint, fetch existing
              testCustomer = await this.prisma.customer.findFirst({
                where: {
                  business_id: businessId,
                  is_test: true,
                  name: "Playground Simulation User",
                },
                orderBy: { created_at: "asc" },
              });
            }
            if (!testCustomer) {
              throw err;
            }
          }
        }

        conversation = await this.prisma.conversation.create({
          data: {
            business_id: businessId,
            customer_id: testCustomer.id,
            source: ConversationSource.playground,
            is_test: true,
            status: ConversationStatus.NEW,
            ai_enabled: true,
          },
        });
        isNewConversation = true;
      }

      // 2. Correlation and Tenant-Scoped Message Idempotency Keys
      const simulationTurnId = idempotencyKey ?? randomUUID();
      const inboundIdempotencyKey = `playground:${businessId}:${conversation.id}:in:${simulationTurnId}`;
      const outboundIdempotencyKey = `playground:${businessId}:${conversation.id}:out:${simulationTurnId}`;

      // 3. Persist inbound test message
      const inboundMessage = await this.prisma.message.create({
        data: {
          business_id: businessId,
          conversation_id: conversation.id,
          direction: MessageDirection.inbound,
          sender_type: SenderType.customer,
          content: messageText,
          delivery_status: MessageDeliveryStatus.delivered,
          idempotency_key: inboundIdempotencyKey,
        },
      });
      inboundMessageId = inboundMessage.id;

      // 4. Execute AI turn pipeline with mode = 'playground'
      const turnResult = await this.orchestratorService.executeTurn(
        conversation.id,
        { id: inboundMessage.id, content: messageText },
        {
          businessId,
          inboundMessageId: inboundMessage.id,
          mode: "playground",
        },
      );

      // 5. Persist outbound AI response in test thread
      if (turnResult.response) {
        const outboundMessage = await this.prisma.message.create({
          data: {
            business_id: businessId,
            conversation_id: conversation.id,
            direction: MessageDirection.outbound,
            sender_type: SenderType.ai,
            content: turnResult.response,
            delivery_status: MessageDeliveryStatus.sent,
            idempotency_key: outboundIdempotencyKey,
            ai_metadata: {
              toolsCalled: turnResult.toolsCalled,
              groundingPassed: turnResult.groundingPassed,
              usage: turnResult.usage,
              intendedTransition: turnResult.intendedTransition ?? null,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        outboundMessageId = outboundMessage.id;
      }

      // 6. Update playground conversation lifecycle state via state machine
      const targetStatus = turnResult.intendedTransition?.toStatus
        ? (turnResult.intendedTransition.toStatus as ConversationStatus)
        : conversation.status === ConversationStatus.NEW
          ? ConversationStatus.AI_ACTIVE
          : conversation.status;

      const handoffTriggered = Boolean(turnResult.intendedTransition);
      const handoffReason = turnResult.intendedTransition?.escalationReason;

      if (targetStatus !== conversation.status && this.stateMachineService) {
        try {
          await this.stateMachineService.transition({
            conversationId: conversation.id,
            toState: targetStatus,
            actor: { type: "ai" },
            businessId,
            reason: handoffReason ?? null,
            handoffPriority: turnResult.intendedTransition?.handoffPriority
              ? (turnResult.intendedTransition.handoffPriority as HandoffPriority)
              : null,
            handoffContext: turnResult.intendedTransition?.handoffContext
              ? (turnResult.intendedTransition.handoffContext as Record<string, unknown>)
              : null,
          });
        } catch (stateErr) {
          logger.warn(
            { err: stateErr, conversationId: conversation.id, targetStatus },
            "State machine transition threw in playground simulation; falling back to direct state update",
          );
          await this.prisma.conversation.update({
            where: { id: conversation.id },
            data: { status: targetStatus },
          });
        }
      } else if (targetStatus !== conversation.status) {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: targetStatus },
        });

        // Record status event for audit trail
        try {
          await this.prisma.conversationStatusEvent.create({
            data: {
              business_id: businessId,
              conversation_id: conversation.id,
              from_status: conversation.status,
              to_status: targetStatus,
              escalation_reason: handoffReason ?? null,
              actor_type: "ai",
              is_test: true,
            },
          });
        } catch (evErr) {
          logger.warn({ err: evErr }, "Could not record playground conversation status event");
        }
      }

      // Update message preview and timestamps
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          last_message_at: new Date(),
          last_message_preview: (turnResult.response || messageText).slice(0, 200),
        },
      });

      const executionSummary = handoffReason
        ? `Handoff escalated: ${handoffReason}`
        : turnResult.groundingPassed
          ? `Turn executed with ${turnResult.toolsCalled.length} tool call(s)`
          : "Grounding check failed; response suppressed";

      const explanation = handoffReason
        ? `Escalation triggered (${handoffReason}) with priority ${turnResult.intendedTransition?.handoffPriority ?? "HIGH"}. Tools invoked: [${turnResult.toolsCalled.join(", ")}].`
        : turnResult.groundingPassed
          ? `Simulated turn completed successfully. Tools called: [${turnResult.toolsCalled.join(", ")}]. Grounding validation passed.`
          : `Response suppressed due to failed grounding check. Tools called: [${turnResult.toolsCalled.join(", ")}].`;

      const finalResponse: PlaygroundSimulateResponse = {
        response: turnResult.response ?? "",
        executionSummary,
        explanation,
        reasoning: explanation,
        toolCalls: turnResult.toolsCalled,
        handoffTriggered,
        handoffReason,
        conversationId: conversation.id,
        decisionTraceId: turnResult.decisionTraceId,
        groundingPassed: turnResult.groundingPassed,
        usage: turnResult.usage,
      };

      // 7. Mark onboarding Gate G4 complete (FR-AI-011, FR-BIZ-026)
      try {
        await this.prisma.businessOnboarding.upsert({
          where: { business_id: businessId },
          create: {
            business_id: businessId,
            business_created: true,
            playground_passed: true,
          },
          update: {
            playground_passed: true,
          },
        });
      } catch (onboardingErr) {
        logger.warn(
          { err: onboardingErr, businessId },
          "Failed to update playground_passed in business_onboarding",
        );
      }

      // 8. Store completed response in IdempotencyKey for race-free, canonical replay
      if (scopedKey) {
        const idempUpdateResult = await this.prisma.idempotencyKey.updateMany({
          where: { business_id: businessId, key: scopedKey },
          data: {
            response_status: 200,
            response_body: finalResponse,
          },
        });
        if (idempUpdateResult.count === 0) {
          throw new Error(`Failed to commit completed idempotency record for ${scopedKey}`);
        }
      }

      return finalResponse;
    } catch (error) {
      logger.error(
        {
          err: error,
          conversationId: conversation?.id,
          inboundMessageId,
          outboundMessageId,
          isNewConversation,
          scopedKey,
        },
        "Playground simulation execution failed. Rolling back test entities in dependency order.",
      );

      try {
        if (inboundMessageId || outboundMessageId || (isNewConversation && conversation)) {
          await this.prisma.aiDecisionTrace.deleteMany({
            where: {
              business_id: businessId,
              OR: [
                ...(inboundMessageId ? [{ inbound_message_id: inboundMessageId }] : []),
                ...(outboundMessageId ? [{ outbound_message_id: outboundMessageId }] : []),
                ...(isNewConversation && conversation
                  ? [{ conversation_id: conversation.id }]
                  : []),
              ],
            },
          });

          await this.prisma.aiUsage.deleteMany({
            where: {
              business_id: businessId,
              OR: [
                ...(inboundMessageId ? [{ message_id: inboundMessageId }] : []),
                ...(outboundMessageId ? [{ message_id: outboundMessageId }] : []),
                ...(isNewConversation && conversation
                  ? [{ conversation_id: conversation.id }]
                  : []),
              ],
            },
          });

          await this.prisma.aiAction.deleteMany({
            where: {
              business_id: businessId,
              OR: [
                ...(inboundMessageId ? [{ message_id: inboundMessageId }] : []),
                ...(outboundMessageId ? [{ message_id: outboundMessageId }] : []),
                ...(isNewConversation && conversation
                  ? [{ conversation_id: conversation.id }]
                  : []),
              ],
            },
          });
        }

        if (isNewConversation && conversation) {
          await this.prisma.conversationStatusEvent.deleteMany({
            where: { conversation_id: conversation.id, business_id: businessId },
          });
          await this.prisma.message.deleteMany({
            where: { conversation_id: conversation.id, business_id: businessId },
          });
          await this.prisma.conversation.delete({
            where: { id: conversation.id },
          });
        } else {
          if (outboundMessageId) {
            await this.prisma.message.delete({
              where: { id: outboundMessageId },
            });
          }
          if (inboundMessageId) {
            await this.prisma.message.delete({
              where: { id: inboundMessageId },
            });
          }
        }

        if (scopedKey) {
          await this.prisma.idempotencyKey.deleteMany({
            where: { business_id: businessId, key: scopedKey },
          });
        }
      } catch (cleanupErr) {
        logger.warn(
          {
            err: cleanupErr,
            conversationId: conversation?.id,
            inboundMessageId,
            outboundMessageId,
            scopedKey,
          },
          "Failed to complete rollback of simulation entities after execution error",
        );
      }
      throw error;
    }
  }

  /**
   * 13 §11 GET /api/v1/ai/playground/conversations
   * Lists sandbox test conversations for the tenant.
   */
  async listPlaygroundConversations(businessId: string) {
    return this.prisma.conversation.findMany({
      where: {
        business_id: businessId,
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
  }

  /**
   * Cleans up stale playground test conversations older than maxAgeDays.
   * Excludes active runs / in-flight human handling states from deletion.
   */
  async prunePlaygroundConversations(
    businessId: string,
    maxAgeDays = 7,
  ): Promise<{ count: number }> {
    const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    const deleteResult = await this.prisma.conversation.deleteMany({
      where: {
        business_id: businessId,
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
        updated_at: { lt: cutoffDate },
      },
    });

    return { count: deleteResult.count };
  }

  /**
   * Helper to verify existing/raced idempotency claim, replay finished response if valid,
   * or reclaim stale claim if previous executor process crashed.
   */
  private async handleExistingClaim(
    existingClaim: {
      request_hash: string;
      response_status: number | null;
      response_body: unknown;
      created_at: Date;
    },
    businessId: string,
    scopedKey: string,
    requestHash: string,
  ): Promise<PlaygroundSimulateResponse | undefined> {
    // Fingerprint verification: Reject key collisions on mismatched request payload/conversation
    if (existingClaim.request_hash !== requestHash) {
      throw new ConflictException({
        error: {
          code: "idempotency_key_conflict",
          message: "Idempotency key already used with different payload or conversation",
        },
      });
    }

    // Safe Replay: Replay completed executions with canonical response validated against schema
    if (existingClaim.response_status === 200 && existingClaim.response_body) {
      const validated = PlaygroundSimulateResponseSchema.safeParse(existingClaim.response_body);
      if (validated.success) {
        return validated.data;
      }
      // If stored JSONB is corrupted or invalid, allow lease reclaim/re-execution below
      logger.warn(
        { scopedKey, issues: validated.error.issues },
        "Stored idempotency response failed schema validation; reclaiming key for fresh simulation",
      );
    }

    // Concurrent in-flight execution check with lease timeout recovery
    if (existingClaim.response_status === null || existingClaim.response_status === 102) {
      const isStaleLease =
        Date.now() - new Date(existingClaim.created_at).getTime() > CLAIM_LEASE_TIMEOUT_MS;

      if (!isStaleLease) {
        throw new ConflictException({
          error: {
            code: "idempotency_in_progress",
            message:
              "A simulation turn with this idempotency key is currently processing. Retry after lease expiration if uncompleted.",
          },
        });
      }

      // Take over stale claim from crashed process
      logger.info(
        { scopedKey, businessId },
        "Stale idempotency claim lease expired; taking over claim for re-execution",
      );
      await this.prisma.idempotencyKey.updateMany({
        where: { business_id: businessId, key: scopedKey },
        data: {
          request_hash: requestHash,
          response_status: null,
          response_body: Prisma.DbNull,
          created_at: new Date(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }

    return undefined;
  }
}
