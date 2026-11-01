import { Injectable, NotFoundException } from "@nestjs/common";

import { prisma } from "../lib/prisma";

export interface PlatformBusinessRow {
  id: string;
  name: string;
  country: string;
  industry: string;
  currency: string;
  createdAt: string;
  planCode: string | null;
  planName: string | null;
  memberCount: number;
  ownerEmail: string | null;
  conversationCount: number;
  messageCountToday: number;
  lastActivityAt: string | null;
  channels: string[];
}

export interface PlatformDayPoint {
  date: string;
  messages: number;
  aiTurns: number;
}

export interface PlatformFeedItem {
  id: string;
  businessId: string;
  businessName: string;
  customerName: string | null;
  source: string;
  status: string;
  preview: string | null;
  lastMessageAt: string | null;
  leadTemperature: string;
}

export interface PlatformOverview {
  generatedAt: string;
  totals: {
    businesses: number;
    conversations: number;
    messagesToday: number;
    aiTurns30d: number;
    aiCostUsd30d: number;
  };
  pulse: {
    activeNow: number;
    humanRequired: number;
    hotLeads: number;
    ordersPending: number;
  };
  series: PlatformDayPoint[];
  feed: PlatformFeedItem[];
  businesses: PlatformBusinessRow[];
}

export interface PlatformBusinessDetail {
  id: string;
  name: string;
  industry: string;
  country: string;
  currency: string;
  language: string;
  timezone: string;
  createdAt: string;
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  counts: {
    products: number;
    customers: number;
    conversations: number;
    orders: number;
  };
  members: { name: string; email: string; role: string }[];
  channels: { channel: string; displayName: string | null; status: string }[];
  recentConversations: {
    id: string;
    customerName: string | null;
    source: string;
    status: string;
    preview: string | null;
    lastMessageAt: string | null;
  }[];
}

@Injectable()
export class PlatformAdminService {
  async overview(): Promise<PlatformOverview> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since14d = new Date(startOfDay);
    since14d.setDate(since14d.getDate() - 13);
    const activeSince = new Date(Date.now() - 15 * 60 * 1000);

    const [
      businesses,
      conversationGroups,
      messageGroups,
      channelGroups,
      usageTotal,
      activeNow,
      humanRequired,
      hotLeads,
      ordersPending,
      recentMessages,
      recentAiTurns,
      feedRows,
    ] = await Promise.all([
        prisma.business.findMany({
          where: { deleted_at: null },
          orderBy: { created_at: "desc" },
          include: {
            subscription: { include: { plan: true } },
            members: {
              where: { removed_at: null },
              include: { user: true, role: true },
            },
          },
        }),
        prisma.conversation.groupBy({
          by: ["business_id"],
          where: { is_test: false },
          _count: { _all: true },
          _max: { last_message_at: true },
        }),
        prisma.message.groupBy({
          by: ["business_id"],
          where: { created_at: { gte: startOfDay } },
          _count: { _all: true },
        }),
        prisma.channelAccount.groupBy({
          by: ["business_id", "channel"],
          where: { status: "active" },
          _count: { _all: true },
        }),
        prisma.aiUsage.aggregate({
          where: { created_at: { gte: since30d } },
          _sum: { estimated_cost_usd: true },
          _count: { _all: true },
        }),
        prisma.conversation.count({
          where: { is_test: false, last_message_at: { gte: activeSince } },
        }),
        prisma.conversation.count({
          where: { is_test: false, status: "HUMAN_REQUIRED" },
        }),
        prisma.conversation.count({
          where: { is_test: false, lead_temperature: "hot" },
        }),
        prisma.order.count({
          where: { is_test: false, status: "PENDING_CONFIRMATION" },
        }),
        prisma.message.findMany({
          where: { created_at: { gte: since14d } },
          select: { created_at: true },
        }),
        prisma.aiUsage.findMany({
          where: { created_at: { gte: since14d } },
          select: { created_at: true },
        }),
        prisma.conversation.findMany({
          where: { is_test: false, last_message_at: { not: null } },
          orderBy: { last_message_at: "desc" },
          take: 8,
          include: {
            customer: { select: { name: true } },
            business: { select: { id: true, name: true } },
          },
        }),
      ]);

    const conversationsByBusiness = new Map(
      conversationGroups.map((row) => [row.business_id, row]),
    );
    const messagesByBusiness = new Map(messageGroups.map((row) => [row.business_id, row._count._all]));
    const channelsByBusiness = new Map<string, string[]>();
    for (const row of channelGroups) {
      const list = channelsByBusiness.get(row.business_id) ?? [];
      list.push(row.channel);
      channelsByBusiness.set(row.business_id, list);
    }

    const rows: PlatformBusinessRow[] = businesses.map((business) => {
      const conversation = conversationsByBusiness.get(business.id);
      const owner = business.members.find((member) => member.role.name === "owner");
      return {
        id: business.id,
        name: business.name,
        country: business.country,
        industry: business.industry,
        currency: business.currency,
        createdAt: business.created_at.toISOString(),
        planCode: business.subscription?.plan.code ?? null,
        planName: business.subscription?.plan.name ?? null,
        memberCount: business.members.length,
        ownerEmail: owner?.user.email ?? business.members[0]?.user.email ?? null,
        conversationCount: conversation?._count._all ?? 0,
        messageCountToday: messagesByBusiness.get(business.id) ?? 0,
        lastActivityAt: conversation?._max.last_message_at?.toISOString() ?? null,
        channels: channelsByBusiness.get(business.id) ?? [],
      };
    });

    rows.sort((left, right) => {
      const leftTime = left.lastActivityAt ? Date.parse(left.lastActivityAt) : 0;
      const rightTime = right.lastActivityAt ? Date.parse(right.lastActivityAt) : 0;
      return rightTime - leftTime;
    });

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        businesses: businesses.length,
        conversations: conversationGroups.reduce((sum, row) => sum + row._count._all, 0),
        messagesToday: messageGroups.reduce((sum, row) => sum + row._count._all, 0),
        aiTurns30d: usageTotal._count._all,
        aiCostUsd30d: Number(usageTotal._sum.estimated_cost_usd ?? 0),
      },
      pulse: {
        activeNow,
        humanRequired,
        hotLeads,
        ordersPending,
      },
      series: buildSeries(since14d, recentMessages, recentAiTurns),
      feed: feedRows.map((conversation) => ({
        id: conversation.id,
        businessId: conversation.business.id,
        businessName: conversation.business.name,
        customerName: conversation.customer.name,
        source: conversation.source,
        status: conversation.status,
        preview: conversation.last_message_preview,
        lastMessageAt: conversation.last_message_at?.toISOString() ?? null,
        leadTemperature: conversation.lead_temperature,
      })),
      businesses: rows,
    };
  }

  async business(businessId: string): Promise<PlatformBusinessDetail> {
    const business = await prisma.business.findFirst({
      where: { id: businessId, deleted_at: null },
      include: {
        subscription: { include: { plan: true } },
        members: {
          where: { removed_at: null },
          include: { user: true, role: true },
        },
        channel_accounts: {
          select: { channel: true, display_name: true, status: true },
        },
      },
    });
    if (!business) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Business not found" },
      });
    }

    const [products, customers, conversations, orders, recent] = await Promise.all([
      prisma.product.count({ where: { business_id: businessId } }),
      prisma.customer.count({ where: { business_id: businessId, is_test: false } }),
      prisma.conversation.count({ where: { business_id: businessId, is_test: false } }),
      prisma.order.count({ where: { business_id: businessId, is_test: false } }),
      prisma.conversation.findMany({
        where: { business_id: businessId, is_test: false },
        orderBy: { last_message_at: "desc" },
        take: 8,
        include: { customer: { select: { name: true } } },
      }),
    ]);

    return {
      id: business.id,
      name: business.name,
      industry: business.industry,
      country: business.country,
      currency: business.currency,
      language: business.default_language,
      timezone: business.timezone,
      createdAt: business.created_at.toISOString(),
      planCode: business.subscription?.plan.code ?? null,
      planName: business.subscription?.plan.name ?? null,
      subscriptionStatus: business.subscription?.status ?? null,
      counts: { products, customers, conversations, orders },
      members: business.members.map((member) => ({
        name: member.user.name,
        email: member.user.email,
        role: member.role.name,
      })),
      channels: business.channel_accounts.map((account) => ({
        channel: account.channel,
        displayName: account.display_name,
        status: account.status,
      })),
      recentConversations: recent.map((conversation) => ({
        id: conversation.id,
        customerName: conversation.customer.name,
        source: conversation.source,
        status: conversation.status,
        preview: conversation.last_message_preview,
        lastMessageAt: conversation.last_message_at?.toISOString() ?? null,
      })),
    };
  }
}

function dayKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildSeries(
  since: Date,
  messages: { created_at: Date }[],
  aiTurns: { created_at: Date }[],
): PlatformDayPoint[] {
  const points: PlatformDayPoint[] = [];
  const cursor = new Date(since);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= end.getTime()) {
    points.push({ date: dayKey(cursor), messages: 0, aiTurns: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  const byDate = new Map(points.map((point) => [point.date, point]));
  for (const message of messages) {
    const point = byDate.get(dayKey(message.created_at));
    if (point) point.messages += 1;
  }
  for (const turn of aiTurns) {
    const point = byDate.get(dayKey(turn.created_at));
    if (point) point.aiTurns += 1;
  }
  return points;
}
