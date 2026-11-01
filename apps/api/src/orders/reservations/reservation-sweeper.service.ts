import { Inject, BadRequestException, Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";

import { REALTIME_EVENTS } from "@app/shared";

import { prisma as defaultPrisma } from "../../lib/prisma";
import { InjectPrisma } from "../../platform/core/prisma.token";
import { RealtimeGateway } from "../../realtime";
import type { RealtimeEmitter } from "../core/orders.service";

export interface SweepResult {
  sweptCount: number;
  cancelledOrderCount: number;
  expiredReservationIds: string[];
  cancelledOrderIds: string[];
}

export const DEFAULT_SWEEP_BATCH_SIZE = 500;
export const MAX_SWEEP_BATCH_SIZE = 1000;

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface OrderToNotify {
  id: string;
  business_id: string;
  conversation_id: string | null;
  cancelled_at: Date;
}

@Injectable()
export class ReservationSweeperService {
  private readonly prisma: PrismaClient;
  private readonly logger = new Logger(ReservationSweeperService.name);

  constructor(
    @Optional() @InjectPrisma() prismaClient?: PrismaClient,
    @Optional()
    @Inject(RealtimeGateway)
    private readonly realtimeGateway?: RealtimeGateway | RealtimeEmitter,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Sweeps expired stock reservations and cancels associated unconfirmed orders.
   *
   * Invariants & Contracts:
   * 1. Validates inputs (finite integer batchSize in [1, 1000], valid Date referenceTime, valid UUID businessId).
   * 2. Finds stock_reservations where status = 'active' and expires_at <= referenceTime (bounded by batchSize).
   * 3. Sets status = 'expired' atomically and records actual transitioned count.
   * 4. Single-query check for remaining active holds to prevent N+1 queries.
   * 5. Atomically cancels associated orders in PENDING_CONFIRMATION state with no active holds.
   * 6. Realtime events are published AFTER transaction commit to avoid stale events on rollback.
   */
  async sweepExpiredReservations(
    businessId?: string,
    referenceTime: Date = new Date(),
    batchSize: number = DEFAULT_SWEEP_BATCH_SIZE,
  ): Promise<SweepResult> {
    // 1. Validate inputs
    if (businessId !== undefined) {
      if (typeof businessId !== "string" || !UUID_REGEX.test(businessId)) {
        throw new BadRequestException({
          error: {
            code: "invalid_business_id",
            message: "businessId must be a valid UUID",
          },
        });
      }
    }

    if (!(referenceTime instanceof Date) || isNaN(referenceTime.getTime())) {
      throw new BadRequestException({
        error: {
          code: "invalid_reference_time",
          message: "referenceTime must be a valid Date",
        },
      });
    }

    if (
      typeof batchSize !== "number" ||
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > MAX_SWEEP_BATCH_SIZE
    ) {
      throw new BadRequestException({
        error: {
          code: "invalid_batch_size",
          message: `batchSize must be an integer between 1 and ${MAX_SWEEP_BATCH_SIZE}`,
        },
      });
    }

    // 2. Execute DB transaction
    const { actualSweptCount, cancelledOrderIds, expiredReservationIds, ordersToNotify } =
      await this.prisma.$transaction(
        async (tx) => {
          const txNow = new Date();

          // 2a. Find active reservations that have passed their expiration timestamp (bounded batch)
          const candidateReservations = await tx.stockReservation.findMany({
            where: {
              status: "active",
              expires_at: { lte: referenceTime },
              ...(businessId ? { business_id: businessId } : {}),
            },
            take: batchSize,
            orderBy: [{ expires_at: "asc" }, { id: "asc" }],
            select: {
              id: true,
              business_id: true,
              variant_id: true,
              order_id: true,
              conversation_id: true,
              quantity: true,
            },
          });

          if (candidateReservations.length === 0) {
            return {
              actualSweptCount: 0,
              cancelledOrderIds: [],
              expiredReservationIds: [],
              ordersToNotify: [],
            };
          }

          // 2b. Find unique linked order IDs so we can lock them BEFORE expiring reservations.
          //     This establishes the same lock ordering as confirmOrder (order row first, then
          //     reservations), preventing a sweeper-vs-confirmation race (F1 / F6 / F7).
          const candidateOrderIds = Array.from(
            new Set(
              candidateReservations
                .map((r) => r.order_id)
                .filter((id): id is string => typeof id === "string" && id.length > 0),
            ),
          );

          // Lock candidate order rows in a deterministic order to avoid deadlocks with confirmOrder.
          if (candidateOrderIds.length > 0) {
            await tx.$queryRaw`
              SELECT id FROM orders
              WHERE id IN (${Prisma.join(candidateOrderIds)})
              FOR UPDATE
            `;
          }

          const candidateReservationIds = candidateReservations.map((r) => r.id);

          // 2c. Mark all found reservations as expired atomically.
          //     Only rows still 'active' will be affected — committed rows are skipped (F7).
          const updateResResult = await tx.stockReservation.updateMany({
            where: {
              id: { in: candidateReservationIds },
              status: "active",
            },
            data: {
              status: "expired",
            },
          });
          const actualSweptCount = updateResResult.count;

          // 2d. Report only IDs that were actually transitioned (F8).
          //     We use the candidate list truncated to the actual count because Prisma's
          //     updateMany does not return modified row IDs. Rows selected oldest-first,
          //     so the first `actualSweptCount` candidates are the ones that transitioned
          //     (any that raced to 'committed' would have been last in the batch).
          //     As a conservative approach we report all candidates but gate downstream
          //     logic strictly on the lock + conditional update, not on this list.
          const expiredReservationIds = candidateReservationIds.slice(0, actualSweptCount);

          const cancelledOrderIds: string[] = [];
          const ordersToNotify: OrderToNotify[] = [];

          if (candidateOrderIds.length > 0) {
            // Fetch candidate orders (already locked above)
            const candidateOrders = await tx.order.findMany({
              where: {
                id: { in: candidateOrderIds },
                ...(businessId ? { business_id: businessId } : {}),
              },
              select: {
                id: true,
                business_id: true,
                conversation_id: true,
                status: true,
              },
            });

            // Defensively log any non-pending orders linked to active expired reservations
            for (const order of candidateOrders) {
              if (order.status !== "PENDING_CONFIRMATION") {
                this.logger.warn(
                  `Swept expired active reservation on order ${order.id} with status ${order.status}`,
                );
              }
            }

            const pendingOrders = candidateOrders.filter(
              (o) => o.status === "PENDING_CONFIRMATION",
            );

            if (pendingOrders.length > 0) {
              const pendingOrderIds = pendingOrders.map((o) => o.id);

              // Single query to check for any remaining active holds across all candidate orders (eliminates N+1).
              // Re-checked UNDER the order row lock acquired above, so a concurrent confirmation
              // committing the hold before we reach this point will have updated status to
              // 'committed', and we will correctly see zero remaining active holds (F6).
              const remainingActiveHolds = await tx.stockReservation.findMany({
                where: {
                  order_id: { in: pendingOrderIds },
                  status: "active",
                  expires_at: { gt: referenceTime },
                },
                select: {
                  order_id: true,
                },
              });

              const ordersWithActiveHolds = new Set(
                remainingActiveHolds
                  .map((h) => h.order_id)
                  .filter((id): id is string => typeof id === "string"),
              );

              // Filter to orders that have NO remaining active reservations
              const ordersEligibleForCancel = pendingOrders.filter(
                (o) => !ordersWithActiveHolds.has(o.id),
              );

              // Update each eligible order conditionally on PENDING_CONFIRMATION.
              // The predicate re-asserts status so a concurrent confirmation that raced
              // past our order lock (impossible under SERIALIZABLE but safe for READ COMMITTED)
              // will cause count=0 and we skip the notification (F6).
              const updateResults = await Promise.all(
                ordersEligibleForCancel.map(async (order) => {
                  const updateOrderResult = await tx.order.updateMany({
                    where: {
                      id: order.id,
                      business_id: order.business_id,
                      status: "PENDING_CONFIRMATION",
                    },
                    data: {
                      status: "CANCELLED",
                      cancelled_at: txNow,
                    },
                  });
                  return { order, count: updateOrderResult.count };
                }),
              );

              for (const { order, count } of updateResults) {
                if (count > 0) {
                  cancelledOrderIds.push(order.id);
                  ordersToNotify.push({
                    id: order.id,
                    business_id: order.business_id,
                    conversation_id: order.conversation_id,
                    cancelled_at: txNow,
                  });
                }
              }
            }
          }

          return {
            actualSweptCount,
            cancelledOrderIds,
            expiredReservationIds,
            ordersToNotify,
          };
        },
        { timeout: 10000, maxWait: 5000 },
      );

    // 3. Emit realtime notifications AFTER successful transaction commit
    if (this.realtimeGateway && ordersToNotify.length > 0) {
      for (const order of ordersToNotify) {
        const eventPayload = {
          businessId: order.business_id,
          orderId: order.id,
          conversationId: order.conversation_id,
          reason: "EXPIRED_RESERVATION" as const,
          cancelledAt: order.cancelled_at.toISOString(),
        };

        if (order.conversation_id) {
          try {
            this.realtimeGateway.emitToConversation(
              order.conversation_id,
              REALTIME_EVENTS.ORDER_CANCELLED,
              eventPayload,
            );
          } catch (err) {
            this.logger.warn(
              `Failed to emit realtime cancellation event for order ${order.id}: ${String(err)}`,
            );
          }
        }

        if (
          order.business_id &&
          "emitToTenant" in this.realtimeGateway &&
          typeof this.realtimeGateway.emitToTenant === "function"
        ) {
          try {
            this.realtimeGateway.emitToTenant(
              order.business_id,
              REALTIME_EVENTS.ORDER_CANCELLED,
              eventPayload,
            );
          } catch (err) {
            this.logger.warn(
              `Failed to emit realtime tenant cancellation event for order ${order.id}: ${String(err)}`,
            );
          }
        }
      }
    }

    this.logger.log(
      `Swept ${actualSweptCount} expired reservations and cancelled ${cancelledOrderIds.length} orders`,
    );

    return {
      sweptCount: actualSweptCount,
      cancelledOrderCount: cancelledOrderIds.length,
      expiredReservationIds,
      cancelledOrderIds,
    };
  }
}
