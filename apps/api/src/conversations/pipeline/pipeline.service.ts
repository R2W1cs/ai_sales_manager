import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { ConversationStatus, OrderStatus, Prisma, type PrismaClient } from "@prisma/client";

import {
  type PipelineCardDto,
  type PipelineColumnDto,
  type PipelineQueryDto,
  PipelineQuerySchema,
  type PipelineResponseDto,
  PipelineResponseSchema,
} from "@app/shared";

import { prisma } from "../../lib/prisma";
import { InjectPrisma } from "../../platform/core/prisma.token";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ConversationWithCustomer = Prisma.ConversationGetPayload<{
  include: {
    customer: {
      select: {
        id: true;
        name: true;
        phone: true;
      };
    };
  };
}>;

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    customer: {
      select: {
        id: true;
        name: true;
      };
    };
    items: {
      select: {
        name_snapshot: true;
        sku_snapshot: true;
        quantity: true;
        unit_price: true;
      };
    };
  };
}>;

/**
 * Defensive date to ISO string normalizer.
 * Handles Date objects, ISO strings, timestamps, nulls, and corrupted adapter values gracefully.
 */
function safeToIsoString(date: Date | string | number | null | undefined): string | null {
  if (!date) return null;
  if (date instanceof Date) {
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Defensive timestamp extractor returning epoch milliseconds.
 */
function safeGetTime(date: Date | string | number | null | undefined): number {
  if (!date) return 0;
  if (date instanceof Date) {
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/**
 * High-precision Decimal conversion to minor currency units (millimes = 1/1000 TND).
 * Avoids IEEE-754 binary floating-point inaccuracies.
 */
function decimalToMillimes(amount: Prisma.Decimal | number | string | null | undefined): number {
  if (amount === null || amount === undefined) return 0;
  try {
    const dec = amount instanceof Prisma.Decimal ? amount : new Prisma.Decimal(amount);
    if (dec.isNaN() || !dec.isFinite() || dec.isNegative()) return 0;
    return dec.mul(1000).round().toNumber();
  } catch {
    return 0;
  }
}

/**
 * Defensively extracts product summary snapshot and aggregate estimated deal value
 * from conversation intent, summary, or structured handoff context.
 * Empty or malformed product items are omitted rather than generating phantom zero-value entries.
 */
function extractConversationProductInfo(conv: ConversationWithCustomer): {
  productSnapshot: string | null;
  value: number;
} {
  let productSnapshot = conv.last_intent ?? conv.summary ?? null;
  let value = 0;

  if (
    conv.handoff_context &&
    typeof conv.handoff_context === "object" &&
    !Array.isArray(conv.handoff_context)
  ) {
    const hc = conv.handoff_context as Record<string, unknown>;
    if (Array.isArray(hc.products_discussed) && hc.products_discussed.length > 0) {
      const validProducts: { name: string; sku?: string | null; price: number }[] = [];
      let totalDec = new Prisma.Decimal(0);

      for (const item of hc.products_discussed) {
        if (item && typeof item === "object") {
          const rawItem = item as Record<string, unknown>;
          const name = typeof rawItem.name === "string" ? rawItem.name.trim() : "";
          const sku = typeof rawItem.sku === "string" ? rawItem.sku.trim() : null;
          const priceRaw = rawItem.price;

          let itemPrice = 0;
          if (typeof priceRaw === "number" && Number.isFinite(priceRaw) && priceRaw > 0) {
            itemPrice = priceRaw;
          } else if (
            typeof priceRaw === "string" &&
            !isNaN(Number(priceRaw)) &&
            Number(priceRaw) > 0
          ) {
            itemPrice = Number(priceRaw);
          }

          if (name.length > 0) {
            validProducts.push({ name, sku, price: itemPrice });
            if (itemPrice > 0) {
              totalDec = totalDec.plus(new Prisma.Decimal(itemPrice).mul(1000).round());
            }
          }
        }
      }

      if (validProducts.length > 0) {
        const productNames: string[] = [];
        for (const p of validProducts) {
          const itemStr = `${p.name}${p.sku ? ` (${p.sku})` : ""}`.trim();
          if (itemStr) productNames.push(itemStr);
        }
        if (productNames.length > 0) {
          productSnapshot = productNames.join(", ");
        }
        value = totalDec.toNumber();
      }
    }
  }

  return {
    productSnapshot,
    value: Number.isFinite(value) && value > 0 ? value : 0,
  };
}

function mapConversationToCard(conv: ConversationWithCustomer): PipelineCardDto {
  const { productSnapshot, value } = extractConversationProductInfo(conv);
  const activityDate = conv.last_message_at ?? conv.updated_at;
  return {
    conversationId: conv.id,
    orderId: null,
    customerName: conv.customer.name,
    productSnapshot,
    value,
    valueType: "estimated",
    currency: "TND",
    temperature: conv.lead_temperature,
    lastActivityAt: safeToIsoString(activityDate),
  };
}

function mapOrderToCard(
  order: OrderWithRelations,
  convMap: Map<string, ConversationWithCustomer>,
): PipelineCardDto {
  const customerSnapshot = order.customer_snapshot as Record<string, unknown> | null;
  const customerName =
    order.customer.name ??
    (typeof customerSnapshot?.name === "string" ? customerSnapshot.name : null);

  let productSnapshot: string | null = null;
  if (order.items.length > 0) {
    const itemNames: string[] = [];
    for (const i of order.items) {
      const itemStr = `${i.name_snapshot}${i.sku_snapshot ? ` (${i.sku_snapshot})` : ""}`.trim();
      if (itemStr) itemNames.push(itemStr);
    }
    if (itemNames.length > 0) {
      productSnapshot = itemNames.join(", ");
    }
  }

  const linkedConv = order.conversation_id ? convMap.get(order.conversation_id) : null;
  const temperature = linkedConv?.lead_temperature ?? null;

  const value = decimalToMillimes(order.total);

  // Chronology: latest commercial activity among order lifecycle timestamps + linked conversation
  const candidateTimes = [
    safeGetTime(order.completed_at),
    safeGetTime(order.order_confirmed_at),
    safeGetTime(order.updated_at),
    safeGetTime(order.created_at),
    safeGetTime(linkedConv?.last_message_at),
    safeGetTime(linkedConv?.updated_at),
  ];
  const maxTime = Math.max(...candidateTimes);
  const activityIso =
    maxTime > 0 ? new Date(maxTime).toISOString() : safeToIsoString(order.updated_at);

  return {
    conversationId: order.conversation_id ?? null,
    orderId: order.id,
    customerName,
    productSnapshot,
    value,
    valueType: "actual",
    currency: order.currency,
    temperature,
    lastActivityAt: activityIso,
  };
}

/**
 * 13 §7 PipelineService (FR-CONV-050–053)
 * Read-only commercial sales pipeline Kanban aggregation projection.
 * This service is purely a read-only projection aggregator and not a source of truth for mutations.
 */
@Injectable()
export class PipelineService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() @InjectPrisma() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * 13 §7 GET /api/v1/pipeline (FR-CONV-050–053)
   * Read-only commercial sales pipeline Kanban aggregation projected dynamically
   * from active conversations and orders.
   *
   * 4 Canonical Columns:
   * 1. new_leads: NEW or AI_ACTIVE, not hot, no pending/sold order, not ORDER_CONFIRMED.
   *    Conversations move out of new_leads as soon as any order exists or is qualified/handed off.
   * 2. qualified: ORDER_INTENT_DETECTED or lead_temperature = 'hot' still AI-side (NEW/AI_ACTIVE, ai_enabled: true),
   *    no pending/sold order, not ORDER_CONFIRMED. Handed off hot leads (HUMAN_REQUIRED) are excluded per 13 §7.
   * 3. payment_pending: Orders PENDING_CONFIRMATION (not is_test, UI label: awaits staff confirmation).
   * 4. sold: Orders CONFIRMED/COMPLETED or standalone conversations ORDER_CONFIRMED (not duplicated with order cards).
   */
  async getPipeline(
    businessId: string,
    queryParam?: PipelineQueryDto | number,
  ): Promise<PipelineResponseDto> {
    if (!businessId || typeof businessId !== "string" || !UUID_REGEX.test(businessId.trim())) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "A valid UUID businessId is required",
        },
      });
    }

    const validBusinessId = businessId.trim();
    const { limit } = this.parseQuery(
      typeof queryParam === "number" ? { limit: queryParam } : queryParam,
    );

    // Bounded candidate reads: only load active pipeline conversation statuses (exclude RESOLVED, HUMAN_REQUIRED, HUMAN_HANDLING)
    const activePipelineStatuses = [
      ConversationStatus.NEW,
      ConversationStatus.AI_ACTIVE,
      ConversationStatus.ORDER_INTENT_DETECTED,
      ConversationStatus.ORDER_CONFIRMED,
    ];

    // 1. Fetch active candidate conversations and orders in parallel
    const [conversations, orders] = await Promise.all([
      this.prisma.conversation.findMany({
        where: {
          business_id: validBusinessId,
          is_test: false,
          status: { in: activePipelineStatuses },
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
        orderBy: [{ last_message_at: "desc" }, { id: "desc" }],
      }),

      this.prisma.order.findMany({
        where: {
          business_id: validBusinessId,
          is_test: false,
          status: {
            in: [OrderStatus.PENDING_CONFIRMATION, OrderStatus.CONFIRMED, OrderStatus.COMPLETED],
          },
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
            },
          },
          items: {
            select: {
              name_snapshot: true,
              sku_snapshot: true,
              quantity: true,
              unit_price: true,
            },
          },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      }),
    ]);

    const pendingOrders = orders.filter((o) => o.status === OrderStatus.PENDING_CONFIRMATION);
    const soldOrders = orders.filter(
      (o) => o.status === OrderStatus.CONFIRMED || o.status === OrderStatus.COMPLETED,
    );

    // Map conversation IDs for fast lookup
    const convMap = new Map<string, ConversationWithCustomer>(conversations.map((c) => [c.id, c]));

    // Fetch missing linked conversations for orders (e.g. if conversation is HUMAN_HANDLING or RESOLVED)
    // so temperature and chronology can be accurately resolved on order cards
    const orderConvIds = orders
      .map((o) => o.conversation_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    const missingConvIds = Array.from(new Set(orderConvIds.filter((id) => !convMap.has(id))));
    if (missingConvIds.length > 0) {
      const extraConvs = await this.prisma.conversation.findMany({
        where: {
          business_id: validBusinessId,
          id: { in: missingConvIds },
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      });
      for (const extra of extraConvs) {
        convMap.set(extra.id, extra);
      }
    }

    const pendingConvIds = new Set<string>(
      pendingOrders
        .map((o) => o.conversation_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );

    const soldOrderConvIds = new Set<string>(
      soldOrders
        .map((o) => o.conversation_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );

    // 2. Build Column 1: new_leads
    // NEW or AI_ACTIVE, not hot, no pending/sold order, not ORDER_CONFIRMED
    const newLeadsCards: PipelineCardDto[] = [];
    for (const conv of conversations) {
      if (conv.status !== ConversationStatus.NEW && conv.status !== ConversationStatus.AI_ACTIVE) {
        continue;
      }
      if (conv.lead_temperature === "hot") {
        continue;
      }
      if (pendingConvIds.has(conv.id) || soldOrderConvIds.has(conv.id)) {
        continue;
      }
      newLeadsCards.push(mapConversationToCard(conv));
    }

    // 3. Build Column 2: qualified
    // ORDER_INTENT_DETECTED or lead_temperature = 'hot' (still AI-side, no pending/sold order)
    const qualifiedCards: PipelineCardDto[] = [];
    for (const conv of conversations) {
      if (conv.status === ConversationStatus.ORDER_CONFIRMED) {
        continue;
      }
      if (pendingConvIds.has(conv.id) || soldOrderConvIds.has(conv.id)) {
        continue;
      }

      const isOrderIntent = conv.status === ConversationStatus.ORDER_INTENT_DETECTED;
      const isHotStillAiSide =
        conv.lead_temperature === "hot" &&
        conv.ai_enabled &&
        (conv.status === ConversationStatus.NEW || conv.status === ConversationStatus.AI_ACTIVE);

      if (isOrderIntent || isHotStillAiSide) {
        qualifiedCards.push(mapConversationToCard(conv));
      }
    }

    // 4. Build Column 3: payment_pending
    // Orders PENDING_CONFIRMATION (UI label: awaits staff confirmation). Order-level cards.
    const paymentPendingCards: PipelineCardDto[] = pendingOrders.map((order) =>
      mapOrderToCard(order, convMap),
    );

    // 5. Build Column 4: sold
    // Orders CONFIRMED / COMPLETED + standalone ORDER_CONFIRMED conversations (deduplicated by order presence)
    const soldOrderCards: PipelineCardDto[] = soldOrders.map((order) =>
      mapOrderToCard(order, convMap),
    );

    const standaloneConfirmedConvs: PipelineCardDto[] = [];
    for (const conv of conversations) {
      if (
        conv.status === ConversationStatus.ORDER_CONFIRMED &&
        !soldOrderConvIds.has(conv.id) &&
        !pendingConvIds.has(conv.id)
      ) {
        standaloneConfirmedConvs.push(mapConversationToCard(conv));
      }
    }

    const soldCards: PipelineCardDto[] = [...soldOrderCards, ...standaloneConfirmedConvs];

    // 6. Project columns with full aggregates and preview capped at limit
    const response: PipelineResponseDto = {
      currency: "TND",
      columns: {
        new_leads: this.buildColumn(newLeadsCards, limit),
        qualified: this.buildColumn(qualifiedCards, limit),
        payment_pending: this.buildColumn(paymentPendingCards, limit),
        sold: this.buildColumn(soldCards, limit),
      },
    };

    // 7. Enforce runtime response projection schema conformance
    return PipelineResponseSchema.parse(response);
  }

  /**
   * Validates and parses query parameters at the service boundary.
   * Throws 400 Bad Request if parameters are malformed.
   */
  private parseQuery(query?: PipelineQueryDto): { limit: number } {
    const parseResult = PipelineQuerySchema.safeParse(query ?? {});
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: issue
            ? `Invalid query parameter '${issue.path.join(".")}': ${issue.message}`
            : "Invalid pipeline query parameters",
        },
      });
    }
    return { limit: parseResult.data.limit ?? 50 };
  }

  private buildColumn(cards: PipelineCardDto[], limit: number): PipelineColumnDto {
    const count = cards.length;
    const totalValue = cards.reduce(
      (sum, card) => sum + (Number.isFinite(card.value) ? card.value : 0),
      0,
    );

    // Sort cards by lastActivityAt descending (most recent first) with deterministic secondary tie-breaker
    const sorted = cards.toSorted((a, b) => {
      const timeA = safeGetTime(a.lastActivityAt);
      const timeB = safeGetTime(b.lastActivityAt);
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      const keyA = a.orderId ? `order:${a.orderId}` : `conv:${a.conversationId ?? ""}`;
      const keyB = b.orderId ? `order:${b.orderId}` : `conv:${b.conversationId ?? ""}`;
      return keyB.localeCompare(keyA);
    });

    return {
      count,
      totalValue,
      cards: sorted.slice(0, limit),
    };
  }
}
