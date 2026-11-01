import { BadRequestException, Injectable, NotImplementedException, Optional } from "@nestjs/common";
import {
  type Conversation,
  type ConversationStatus,
  MessageDeliveryStatus,
  type OrderStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  type ConversationSummaryDto,
  type ListConversationsQueryDto,
  type PaginatedConversationsResponse,
  SalesPriorityCursorSchema,
  TimeOrderedCursorSchema,
} from "@app/shared";

import { prisma } from "../../lib/prisma";

interface RawConversationWithRelations extends Conversation {
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
  };
  channel_account: {
    id: string;
    channel: "instagram" | "messenger" | "whatsapp";
  } | null;
  messages?: {
    id: string;
    delivery_status: MessageDeliveryStatus;
  }[];
}

interface PrioritySortTuple {
  id: string;
  human_needed: boolean;
  handoff_priority: "critical" | "high" | "normal" | null;
  handoff_at: string | null;
  lead_temperature: "hot" | "warm" | "cold";
  lead_score: number;
  last_message_at: string | null;
}

@Injectable()
export class ConversationsService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * Compare two conversations for sales_priority sorting.
   * Ranking rules (13 §6.1 / 01 §2.7 / FR-LEAD-009):
   * 1. human_needed (true > false)
   *    1a. handoff_priority (critical > high > normal > null)
   *    1b. oldest handoff_at (earlier date/time first)
   * 2. lead_temperature (hot > warm > cold)
   * 3. lead_score desc (100 -> 0)
   * 4. last_message_at desc (newer first, nulls last)
   * 5. id tie breaker (desc)
   */
  public compareSalesPriority(a: PrioritySortTuple, b: PrioritySortTuple): number {
    // 1. human_needed
    if (a.human_needed !== b.human_needed) {
      return a.human_needed ? -1 : 1;
    }

    if (a.human_needed) {
      // 1a. handoff_priority
      const priorityWeight = (p: string | null): number => {
        if (p === "critical") return 3;
        if (p === "high") return 2;
        if (p === "normal") return 1;
        return 0;
      };
      const pA = priorityWeight(a.handoff_priority);
      const pB = priorityWeight(b.handoff_priority);
      if (pA !== pB) {
        return pB - pA;
      }

      // 1b. oldest handoff_at (earlier timestamp first)
      const hA = a.handoff_at ? new Date(a.handoff_at).getTime() : Infinity;
      const hB = b.handoff_at ? new Date(b.handoff_at).getTime() : Infinity;
      if (hA !== hB) {
        return hA - hB;
      }
    }

    // 2. lead_temperature
    const tempWeight = (t: string): number => {
      if (t === "hot") return 3;
      if (t === "warm") return 2;
      return 1;
    };
    const tA = tempWeight(a.lead_temperature);
    const tB = tempWeight(b.lead_temperature);
    if (tA !== tB) {
      return tB - tA;
    }

    // 3. lead_score desc
    if (a.lead_score !== b.lead_score) {
      return b.lead_score - a.lead_score;
    }

    // 4. last_message_at desc
    const lmA = a.last_message_at ? new Date(a.last_message_at).getTime() : -Infinity;
    const lmB = b.last_message_at ? new Date(b.last_message_at).getTime() : -Infinity;
    if (lmA !== lmB) {
      return lmB - lmA;
    }

    // 5. id tie breaker
    return b.id.localeCompare(a.id);
  }

  private extractPriorityTuple(conv: RawConversationWithRelations): PrioritySortTuple {
    const isHumanNeeded =
      conv.status === "HUMAN_REQUIRED" ||
      conv.status === "HUMAN_HANDLING" ||
      conv.handoff_at !== null;

    return {
      id: conv.id,
      human_needed: isHumanNeeded,
      handoff_priority: conv.handoff_priority,
      handoff_at: conv.handoff_at ? conv.handoff_at.toISOString() : null,
      lead_temperature: conv.lead_temperature,
      lead_score: conv.lead_score,
      last_message_at: conv.last_message_at ? conv.last_message_at.toISOString() : null,
    };
  }

  /**
   * 13 §6.1 GET /api/v1/conversations
   */
  async listConversations(
    businessId: string,
    currentUserId?: string,
    query: ListConversationsQueryDto = {},
  ): Promise<PaginatedConversationsResponse> {
    // Search `q` is not implemented until pg_trgm (13 §6.1 / FR-CONV-006)
    if (query.q !== undefined && query.q.trim().length > 0) {
      throw new NotImplementedException({
        error: {
          code: "not_implemented",
          message: "Conversation search is not implemented yet",
        },
      });
    }

    const rawLimit = query.limit ?? 50;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;

    const view = query.view ?? "needs_me";
    const sort = query.sort ?? "sales_priority";

    // 1. Tenancy and Test Isolation guardrails
    const where: Prisma.ConversationWhereInput = {
      business_id: businessId,
      is_test: false,
    };

    // 2. View Filter: needs_me vs all
    if (view === "needs_me") {
      const needsMeConditions: Prisma.ConversationWhereInput[] = [
        { status: "HUMAN_REQUIRED" },
        { lead_temperature: "hot" },
        { messages: { some: { delivery_status: MessageDeliveryStatus.draft } } },
      ];

      if (currentUserId) {
        needsMeConditions.push({
          status: "HUMAN_HANDLING",
          assigned_user_id: currentUserId,
        });
      } else {
        needsMeConditions.push({
          status: "HUMAN_HANDLING",
        });
      }

      where.OR = needsMeConditions;
    }

    // 3. Status filter
    if (query.status) {
      if (Array.isArray(query.status)) {
        where.status = { in: query.status as ConversationStatus[] };
      } else if (typeof query.status === "string") {
        const statuses = query.status
          .split(",")
          .map((s) => s.trim() as ConversationStatus)
          .filter(Boolean);
        where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
      }
    }

    // 4. Channel filter. Website chats have no Meta channel account.
    if (query.channel === "website") {
      where.source = "website";
    } else if (query.channel) {
      where.OR = [
        ...(Array.isArray(where.OR) ? where.OR : []),
        { channel_account: { channel: query.channel } },
        { source: query.channel },
      ];
    }

    // 5. Assignee filter
    const assignedTo = query.assigned_to ?? query.assigneeId ?? query.assignee_id;
    if (assignedTo) {
      if (assignedTo === "me") {
        where.assigned_user_id = currentUserId ?? null;
      } else if (assignedTo === "unassigned") {
        where.assigned_user_id = null;
      } else {
        where.assigned_user_id = assignedTo;
      }
    }

    // 6. Lead Temperature filter
    const temperature = query.temperature ?? query.leadTemperature;
    if (temperature) {
      where.lead_temperature = temperature;
    }

    // 7. Pending Order filter
    const hasPendingOrderParam = query.has_pending_order ?? query.hasPendingOrder;
    if (hasPendingOrderParam !== undefined) {
      const hasPendingOrder = hasPendingOrderParam === true || hasPendingOrderParam === "true";

      const pendingOrders = await this.prisma.order.findMany({
        where: {
          business_id: businessId,
          status: "PENDING_CONFIRMATION",
          conversation_id: { not: null },
        },
        select: { conversation_id: true },
      });

      const pendingConvIds = Array.from(
        new Set(
          pendingOrders.map((o) => o.conversation_id).filter((id): id is string => Boolean(id)),
        ),
      );

      if (hasPendingOrder) {
        where.id = { in: pendingConvIds };
      } else {
        where.id = { notIn: pendingConvIds };
      }
    }

    // 8. Fetch candidate conversations
    const rawConversations = (await this.prisma.conversation.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        channel_account: {
          select: {
            id: true,
            channel: true,
          },
        },
        messages: {
          where: {
            delivery_status: MessageDeliveryStatus.draft,
          },
          select: {
            id: true,
            delivery_status: true,
          },
          take: 1,
        },
      },
    })) as unknown as RawConversationWithRelations[];

    // 9. Decode and Validate Cursor
    let decodedSalesPriorityCursor: PrioritySortTuple | null = null;
    let decodedRecentCursor: { t: string; id: string } | null = null;

    if (query.cursor) {
      try {
        const decodedStr = Buffer.from(query.cursor, "base64url").toString("utf-8");
        const parsed: unknown = JSON.parse(decodedStr);

        if (sort === "sales_priority") {
          const parseResult = SalesPriorityCursorSchema.safeParse(parsed);
          if (!parseResult.success) {
            throw new Error("Invalid sales priority cursor shape");
          }
          decodedSalesPriorityCursor = {
            id: parseResult.data.id,
            human_needed: parseResult.data.human_needed,
            handoff_priority: parseResult.data.handoff_priority,
            handoff_at: parseResult.data.handoff_at,
            lead_temperature: parseResult.data.lead_temperature,
            lead_score: parseResult.data.lead_score,
            last_message_at: parseResult.data.last_message_at,
          };
        } else {
          const parseResult = TimeOrderedCursorSchema.safeParse(parsed);
          if (!parseResult.success) {
            throw new Error("Invalid time ordered cursor shape");
          }
          decodedRecentCursor = parseResult.data;
        }
      } catch {
        throw new BadRequestException({
          error: {
            code: "invalid_cursor",
            message: "Invalid pagination cursor",
          },
        });
      }
    }

    // 10. Sort candidates
    let sorted = [...rawConversations];
    if (sort === "sales_priority") {
      sorted.sort((a, b) => {
        const tupleA = this.extractPriorityTuple(a);
        const tupleB = this.extractPriorityTuple(b);
        return this.compareSalesPriority(tupleA, tupleB);
      });

      if (decodedSalesPriorityCursor) {
        sorted = sorted.filter((c) => {
          const tupleC = this.extractPriorityTuple(c);
          return this.compareSalesPriority(tupleC, decodedSalesPriorityCursor) > 0;
        });
      }
    } else {
      // Recent sort: last_message_at desc, created_at desc, id desc
      sorted.sort((a, b) => {
        const dateA = a.last_message_at?.getTime() ?? a.created_at.getTime();
        const dateB = b.last_message_at?.getTime() ?? b.created_at.getTime();
        if (dateA !== dateB) return dateB - dateA;
        return b.id.localeCompare(a.id);
      });

      if (decodedRecentCursor) {
        const cursorTime = new Date(decodedRecentCursor.t).getTime();
        const cursorId = decodedRecentCursor.id;
        sorted = sorted.filter((c) => {
          const itemTime = c.last_message_at?.getTime() ?? c.created_at.getTime();
          if (itemTime < cursorTime) return true;
          if (itemTime === cursorTime && c.id.localeCompare(cursorId) < 0) return true;
          return false;
        });
      }
    }

    // 11. Paginate items
    const hasMore = sorted.length > limit;
    const pageConversations = hasMore ? sorted.slice(0, limit) : sorted;

    // 12. Batch load pending orders for this page (13 §3.3 / 13 §6.1)
    const pageConvIds = pageConversations.map((c) => c.id);
    const pendingOrdersMap = new Map<
      string,
      { id: string; status: OrderStatus; total: string; currency: string }[]
    >();

    if (pageConvIds.length > 0) {
      const orders = await this.prisma.order.findMany({
        where: {
          business_id: businessId,
          conversation_id: { in: pageConvIds },
          status: "PENDING_CONFIRMATION",
        },
        orderBy: { created_at: "asc" },
      });

      for (const order of orders) {
        if (!order.conversation_id) continue;
        const list = pendingOrdersMap.get(order.conversation_id) ?? [];
        list.push({
          id: order.id,
          status: order.status,
          total: order.total.toString(),
          currency: order.currency,
        });
        pendingOrdersMap.set(order.conversation_id, list);
      }
    }

    // 13. Map to ConversationSummaryDto
    const items: ConversationSummaryDto[] = pageConversations.map((conv) => {
      const channel = conv.channel_account?.channel ?? conv.source;

      const unread =
        conv.staff_read_at === null ||
        (conv.last_message_at !== null && conv.staff_read_at < conv.last_message_at);

      const convPendingOrders = pendingOrdersMap.get(conv.id) ?? [];
      const oldestPendingOrder = convPendingOrders[0] ?? null;

      return {
        id: conv.id,
        status: conv.status,
        source: conv.source,
        channel,
        aiEnabled: conv.ai_enabled,
        assignedUserId: conv.assigned_user_id,
        handoffPriority: conv.handoff_priority,
        escalationReason: conv.escalation_reason,
        handoffAt: conv.handoff_at ? conv.handoff_at.toISOString() : null,
        leadScore: conv.lead_score,
        leadTemperature: conv.lead_temperature,
        lastMessageAt: conv.last_message_at ? conv.last_message_at.toISOString() : null,
        lastMessagePreview: conv.last_message_preview,
        unread,
        isTest: conv.is_test,
        customer: {
          id: conv.customer.id,
          name: conv.customer.name,
          phone: conv.customer.phone,
        },
        pendingOrder: oldestPendingOrder
          ? {
              id: oldestPendingOrder.id,
              status: oldestPendingOrder.status,
              total: oldestPendingOrder.total,
              currency: oldestPendingOrder.currency,
            }
          : null,
        ...(convPendingOrders.length > 1 ? { pendingOrderAmbiguous: true } : {}),
      };
    });

    // 14. Build nextCursor
    let nextCursor: string | undefined = undefined;
    if (hasMore && pageConversations.length > 0) {
      const lastConv = pageConversations[pageConversations.length - 1];
      if (lastConv) {
        if (sort === "sales_priority") {
          const tuple = this.extractPriorityTuple(lastConv);
          const cursorPayload = {
            human_needed: tuple.human_needed,
            handoff_priority: tuple.handoff_priority,
            handoff_at: tuple.handoff_at,
            lead_temperature: tuple.lead_temperature,
            lead_score: tuple.lead_score,
            last_message_at: tuple.last_message_at,
            id: tuple.id,
          };
          nextCursor = Buffer.from(JSON.stringify(cursorPayload)).toString("base64url");
        } else {
          const lastDate = lastConv.last_message_at ?? lastConv.created_at;
          const cursorPayload = {
            t: lastDate.toISOString(),
            id: lastConv.id,
          };
          nextCursor = Buffer.from(JSON.stringify(cursorPayload)).toString("base64url");
        }
      }
    }

    // 15. Total Unread count for this business
    // All non-test unread conversations in this business
    const allBusinessConversations = await this.prisma.conversation.findMany({
      where: {
        business_id: businessId,
        is_test: false,
      },
      select: {
        staff_read_at: true,
        last_message_at: true,
      },
    });

    const totalUnread = allBusinessConversations.filter(
      (c) =>
        c.staff_read_at === null ||
        (c.last_message_at !== null && c.staff_read_at < c.last_message_at),
    ).length;

    return {
      items,
      ...(nextCursor ? { nextCursor } : {}),
      totalUnread,
    };
  }
}
