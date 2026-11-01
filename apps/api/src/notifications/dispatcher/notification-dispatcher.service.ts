import { Injectable, Logger, Optional, type OnModuleDestroy } from "@nestjs/common";
import type { NotificationType, HandoffPriority } from "@prisma/client";
import Redis from "ioredis";

import { env } from "@app/shared/server";

import { NotificationsProcessor, type NotificationJobData } from "./notifications.processor";

export type NotificationEventType =
  | "HANDOFF_REQUIRED"
  | "HANDOFF"
  | "HOT_LEAD"
  | "ORDER_PENDING"
  | "ORDER_DRAFT_READY"
  | "ORDER_REQUEST"
  | "USAGE_WARNING_85"
  | "USAGE_BREACH_100"
  | "ESCALATION";

export interface NotificationEvent {
  businessId: string;
  type: NotificationEventType | NotificationType;
  title?: string;
  message?: string;
  entityType?: string;
  entityId: string;
  handoffPriority?: HandoffPriority | null;
  targetUserIds?: string[];
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
  suppressionTtlSeconds?: number;
}

export interface DispatchResult {
  dispatched: boolean;
  reason?: "dispatched" | "suppressed" | "collapsed" | "failed";
  dedupeKey: string;
  canonicalType: NotificationType;
  jobId?: string;
  error?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class NotificationDispatcherService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private redis: Redis | null = null;
  private readonly isOwnedRedis: boolean;
  private readonly inMemorySuppressionCache = new Map<string, number>();
  private static readonly MAX_SUPPRESSION_CACHE_SIZE = 1000;

  constructor(
    @Optional() private readonly notificationsProcessor?: NotificationsProcessor,
    @Optional() redisClient?: Redis | null,
  ) {
    if (redisClient !== undefined) {
      this.redis = redisClient;
      this.isOwnedRedis = false;
    } else {
      this.isOwnedRedis = true;
      try {
        const redisUrl = env.REDIS_URL;
        if (redisUrl) {
          this.redis = new Redis(redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
          });
        } else if (env.REDIS_HOST && env.REDIS_PORT) {
          this.redis = new Redis({
            host: env.REDIS_HOST,
            port: env.REDIS_PORT,
            password: env.REDIS_PASSWORD,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
          });
        }
        if (this.redis) {
          this.redis.on("error", (err) => {
            this.logger.warn({ err }, "Redis error in NotificationDispatcherService");
          });
        }
      } catch (err) {
        this.logger.warn({ err }, "Could not initialize Redis client for NotificationDispatcher");
      }
    }
  }

  /**
   * Map input event type to the 4 canonical DB NotificationTypes (12 §13.1, FR-NOTIF-010).
   */
  public toCanonicalType(type: NotificationEventType | NotificationType): NotificationType {
    switch (type) {
      case "HANDOFF_REQUIRED":
      case "HANDOFF":
        return "HANDOFF";
      case "HOT_LEAD":
        return "HOT_LEAD";
      case "ORDER_PENDING":
      case "ORDER_DRAFT_READY":
      case "ORDER_REQUEST":
        return "ORDER_REQUEST";
      case "USAGE_WARNING_85":
      case "USAGE_BREACH_100":
      case "ESCALATION":
        return "ESCALATION";
      default:
        this.logger.warn(
          { type },
          "Unrecognized notification type encountered in toCanonicalType; mapping to ESCALATION fallback",
        );
        return "ESCALATION";
    }
  }

  /**
   * Generate canonical deduplication key (12 §13.1, FR-NOTIF-012, FR-NOTIF-013).
   * Standard hourly key: `{type}:{entity_id}:{yyyy-MM-ddTHH}` (e.g. `handoff_required:conv-123:2026-08-28T08`)
   * Quota key: `usage_warning_85:{businessId}:{yyyy-MM}` (one per monthly cycle)
   */
  public generateDedupeKey(event: NotificationEvent, date = new Date()): string {
    if (event.dedupeKey) {
      return event.dedupeKey;
    }

    const typeStr = event.type.toLowerCase();

    // Monthly bucket for usage quota warnings
    if (typeStr === "usage_warning_85" || typeStr === "usage_breach_100") {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      return `${typeStr}:${event.businessId}:${year}-${month}`;
    }

    // Hourly bucket for standard conversation & order notifications
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hour = String(date.getUTCHours()).padStart(2, "0");

    return `${typeStr}:${event.entityId}:${year}-${month}-${day}T${hour}`;
  }

  /**
   * Check and mark suppression key atomically using Redis (or in-memory fallback).
   * Scoped by businessId to guarantee tenant isolation in multi-tenant environments.
   * Returns true if the key is already suppressed, false if newly marked.
   */
  public async isSuppressedOrMark(
    dedupeKey: string,
    ttlSeconds = 1800,
    businessId?: string,
  ): Promise<boolean> {
    const redisKey = businessId
      ? `notif:suppress:${businessId}:${dedupeKey}`
      : `notif:suppress:${dedupeKey}`;
    const inMemoryKey = businessId ? `${businessId}:${dedupeKey}` : dedupeKey;

    if (this.redis) {
      try {
        // SET key 1 EX ttl NX returns "OK" if key was set, null if key already exists
        const result = await this.redis.set(redisKey, "1", "EX", ttlSeconds, "NX");
        if (result === null) {
          return true; // Already suppressed
        }
        return false;
      } catch (err) {
        this.logger.warn(
          { err, dedupeKey, businessId },
          "Redis check failed in isSuppressedOrMark, falling back to in-memory",
        );
      }
    }

    // In-memory fallback
    const now = Date.now();
    const expiry = this.inMemorySuppressionCache.get(inMemoryKey);
    if (expiry && expiry > now) {
      return true; // Suppressed
    }

    // Hard capacity control and bounded eviction (F4)
    this.pruneInMemoryCache(now);

    this.inMemorySuppressionCache.set(inMemoryKey, now + ttlSeconds * 1000);
    return false;
  }

  /**
   * Unmark suppression key (e.g. if job enqueueing fails, allow retry).
   */
  public async unmarkSuppression(dedupeKey: string, businessId?: string): Promise<void> {
    const redisKey = businessId
      ? `notif:suppress:${businessId}:${dedupeKey}`
      : `notif:suppress:${dedupeKey}`;
    const inMemoryKey = businessId ? `${businessId}:${dedupeKey}` : dedupeKey;

    if (this.redis) {
      try {
        await this.redis.del(redisKey);
      } catch (err) {
        this.logger.warn({ err, redisKey }, "Failed to unmark Redis suppression key");
      }
    }
    this.inMemorySuppressionCache.delete(inMemoryKey);
  }

  private pruneInMemoryCache(now: number): void {
    if (
      this.inMemorySuppressionCache.size >= NotificationDispatcherService.MAX_SUPPRESSION_CACHE_SIZE
    ) {
      // 1. Prune expired entries
      for (const [k, exp] of this.inMemorySuppressionCache.entries()) {
        if (exp <= now) {
          this.inMemorySuppressionCache.delete(k);
        }
      }

      // 2. If still at/over capacity, evict oldest entries (FIFO via Map keys iterator)
      while (
        this.inMemorySuppressionCache.size >=
        NotificationDispatcherService.MAX_SUPPRESSION_CACHE_SIZE
      ) {
        const oldestKey = this.inMemorySuppressionCache.keys().next().value;
        if (oldestKey !== undefined) {
          this.inMemorySuppressionCache.delete(oldestKey);
        } else {
          break;
        }
      }
    }
  }

  /**
   * Dispatches a notification event.
   * Handles deduplication suppression, event collapsing, canonical type conversion, and background enqueueing.
   */
  public async dispatch(event: NotificationEvent): Promise<DispatchResult> {
    const dedupeKey = this.generateDedupeKey(event);
    const canonicalType = this.toCanonicalType(event.type);
    const ttlSeconds = event.suppressionTtlSeconds ?? 1800; // Default 30 min window (FR-NOTIF-012)

    // Check duplicate suppression
    const isSuppressed = await this.isSuppressedOrMark(dedupeKey, ttlSeconds, event.businessId);
    if (isSuppressed) {
      this.logger.log(
        { dedupeKey, businessId: event.businessId },
        "Notification suppressed (duplicate within window)",
      );
      return {
        dispatched: false,
        reason: "suppressed",
        dedupeKey,
        canonicalType,
      };
    }

    // Default title & message based on notification type
    const { title, message } = this.resolveContent(event, canonicalType);

    const jobData: NotificationJobData = {
      businessId: event.businessId,
      type: canonicalType,
      handoffPriority:
        event.handoffPriority ??
        (canonicalType === "HANDOFF"
          ? "high"
          : canonicalType === "ESCALATION"
            ? "critical"
            : "normal"),
      title,
      message,
      entityType: event.entityType ?? "conversation",
      entityId: event.entityId,
      dedupeKey,
      targetUserIds: event.targetUserIds,
      metadata: event.metadata,
      enqueuedAt: Date.now(),
    };

    if (!this.notificationsProcessor) {
      this.logger.error(
        { dedupeKey, businessId: event.businessId },
        "Notification processor is not configured; failed to enqueue notification",
      );
      await this.unmarkSuppression(dedupeKey, event.businessId);
      return {
        dispatched: false,
        reason: "failed",
        dedupeKey,
        canonicalType,
        error: "NotificationsProcessor is not available",
      };
    }

    let jobId: string | undefined;
    try {
      jobId = await this.notificationsProcessor.enqueueNotification(jobData);
    } catch (err) {
      this.logger.error(
        { err, dedupeKey, businessId: event.businessId },
        "Failed to enqueue notification in processor",
      );
      await this.unmarkSuppression(dedupeKey, event.businessId);
      return {
        dispatched: false,
        reason: "failed",
        dedupeKey,
        canonicalType,
        error: err instanceof Error ? err.message : "Failed to enqueue notification",
      };
    }

    return {
      dispatched: true,
      reason: "dispatched",
      dedupeKey,
      canonicalType,
      jobId,
      details: {
        title,
        message,
        priority: jobData.handoffPriority,
      },
    };
  }

  /**
   * Collapse priority when multiple events trigger simultaneously (e.g. HANDOFF + HOT_LEAD).
   * Handoff takes precedence and includes hot_lead context (T-NOTIF-01 §3).
   * Repeated hot leads are collapsed into a single grouped event (FR-NOTIF-013).
   * Events are partitioned by businessId and entityId to ensure tenant isolation.
   */
  public collapsePriority(events: NotificationEvent[]): NotificationEvent[] {
    if (events.length <= 1) return events;

    const groupedByTenantAndEntity = new Map<string, NotificationEvent[]>();
    for (const ev of events) {
      const groupKey = `${ev.businessId}:${ev.entityId}`;
      const list = groupedByTenantAndEntity.get(groupKey) ?? [];
      list.push(ev);
      groupedByTenantAndEntity.set(groupKey, list);
    }

    const collapsed: NotificationEvent[] = [];

    for (const [, evList] of groupedByTenantAndEntity.entries()) {
      if (evList.length === 1) {
        const singleEvent = evList[0];
        if (singleEvent) collapsed.push(singleEvent);
        continue;
      }

      const handoffEvent = evList.find(
        (e) => e.type === "HANDOFF" || e.type === "HANDOFF_REQUIRED",
      );
      const hotLeadEvents = evList.filter((e) => e.type === "HOT_LEAD");
      const hotLeadEventsSet = new Set(hotLeadEvents);

      if (handoffEvent && hotLeadEvents.length > 0) {
        // Prioritize HANDOFF and fold hot_lead into metadata/message with defensive guards
        const hotLeadMerged: Record<string, unknown> = {};
        for (const h of hotLeadEvents) {
          if (h.metadata && typeof h.metadata === "object") {
            Object.assign(hotLeadMerged, h.metadata);
          }
        }
        const mergedMetadata: Record<string, unknown> = {
          ...hotLeadMerged,
          ...(handoffEvent.metadata && typeof handoffEvent.metadata === "object"
            ? handoffEvent.metadata
            : {}),
          is_hot_lead: true,
        };
        collapsed.push({
          ...handoffEvent,
          metadata: mergedMetadata,
          message: handoffEvent.message
            ? `${handoffEvent.message} (Hot Lead)`
            : "A hot lead conversation requires human assistance.",
        });

        // Retain any remaining distinct events on the same entity
        for (const ev of evList) {
          if (ev !== handoffEvent && !hotLeadEventsSet.has(ev)) {
            collapsed.push(ev);
          }
        }
      } else if (!handoffEvent && hotLeadEvents.length > 1) {
        // Collapse repeated hot leads into single grouped notification (FR-NOTIF-013)
        const primaryHotLead = hotLeadEvents[0];
        if (primaryHotLead) {
          const mergedMetadata: Record<string, unknown> = {};
          for (const h of hotLeadEvents) {
            if (h.metadata && typeof h.metadata === "object") {
              Object.assign(mergedMetadata, h.metadata);
            }
          }
          collapsed.push({
            ...primaryHotLead,
            metadata: mergedMetadata,
          });
        }

        for (const ev of evList) {
          if (!hotLeadEventsSet.has(ev)) {
            collapsed.push(ev);
          }
        }
      } else {
        collapsed.push(...evList);
      }
    }

    return collapsed;
  }

  private resolveContent(
    event: NotificationEvent,
    canonicalType: NotificationType,
  ): { title: string; message: string } {
    if (event.title && event.message) {
      return { title: event.title, message: event.message };
    }

    switch (canonicalType) {
      case "HANDOFF":
        return {
          title: event.title ?? "Human Takeover Required",
          message:
            event.message ??
            (event.metadata?.is_hot_lead
              ? "A hot lead conversation requires human takeover."
              : "A customer conversation requires human takeover."),
        };
      case "HOT_LEAD":
        return {
          title: event.title ?? "Hot Lead Detected",
          message: event.message ?? "A shopper has shown high purchase intent.",
        };
      case "ORDER_REQUEST":
        return {
          title: event.title ?? "New Order Request",
          message: event.message ?? "A draft order is ready for confirmation.",
        };
      case "ESCALATION":
      default:
        return {
          title:
            event.title ??
            (event.type === "USAGE_WARNING_85"
              ? "Usage Limit Warning (85%)"
              : event.type === "USAGE_BREACH_100"
                ? "Usage Limit Exceeded (100%)"
                : "System Escalation"),
          message:
            event.message ??
            (event.type === "USAGE_WARNING_85"
              ? "Business has reached 85% of monthly message quota."
              : event.type === "USAGE_BREACH_100"
                ? "Business has reached 100% of monthly message quota."
                : "A system escalation requires staff attention."),
        };
    }
  }

  public async onModuleDestroy(): Promise<void> {
    this.inMemorySuppressionCache.clear();
    if (this.isOwnedRedis && this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      } finally {
        this.redis = null;
      }
    }
  }
}
