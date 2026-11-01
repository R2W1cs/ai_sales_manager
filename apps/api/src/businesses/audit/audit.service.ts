import { BadRequestException, ForbiddenException, Injectable, Optional } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";

import { AuditPayloadSchema, type AuditPayload } from "@app/shared";

import { prisma } from "../../lib/prisma";
import { toValidationException } from "../../platform/core/errors";

export interface CreateAuditEvent {
  business_id: string;
  actor_user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  payload?: AuditPayload | null;
}

export interface AuditLogsQueryDto {
  actorId?: string;
  actor_user_id?: string;
  action?: string;
  entityType?: string;
  entity_type?: string;
  entityId?: string;
  entity_id?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number | string;
}

export interface AuditActorDto {
  id: string;
  name: string;
  email: string;
}

export type AuditDbClient =
  | Pick<PrismaClient, "auditLog">
  | Pick<Prisma.TransactionClient, "auditLog">;

export interface AuditLogDto {
  id: string;
  business_id: string;
  actor_user_id: string | null;
  actor?: AuditActorDto | null;
  action: string;
  entity_type: string;
  entity_id: string;
  payload: AuditPayload | null;
  created_at: string | Date;
}

export interface PaginatedAuditLogsResponse {
  data: AuditLogDto[];
  next_cursor: string | null;
}

interface DecodedCursor {
  t: string;
  id: string;
}

@Injectable()
export class AuditService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * 17 §9 / 12 §13.2 / FR-AUD-001
   * Records an immutable audit log row asynchronously.
   * AI autonomous actions are prohibited here (they belong in ai_actions).
   * Payloads are validated against AuditPayloadSchema (no PII, no tokens, envelope only).
   */
  async record(event: CreateAuditEvent, tx?: AuditDbClient): Promise<AuditLogDto> {
    // 17 §9 Separation of concerns: AI autonomous/tool actions belong in ai_actions
    if (
      event.entity_type === "ai_action" ||
      event.entity_type === "ai_decision_trace" ||
      event.action.startsWith("ai.trace") ||
      event.action.startsWith("ai.autonomous")
    ) {
      throw new ForbiddenException({
        error: {
          code: "forbidden",
          message: "AI autonomous actions and tool traces must not be logged to audit_logs",
        },
      });
    }

    if (!event.business_id || !event.action || !event.entity_type || !event.entity_id) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "business_id, action, entity_type, and entity_id are required",
        },
      });
    }

    let validatedPayload: AuditPayload | undefined = undefined;
    if (event.payload !== undefined && event.payload !== null) {
      const parsed = AuditPayloadSchema.safeParse(event.payload);
      if (!parsed.success) {
        throw toValidationException(parsed.error, "Invalid audit log payload structure");
      }
      validatedPayload = parsed.data;
    }

    const client: AuditDbClient = tx ?? this.prisma;
    const row = await client.auditLog.create({
      data: {
        business_id: event.business_id,
        actor_user_id: event.actor_user_id ?? null,
        action: event.action,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        payload: validatedPayload ? (validatedPayload as Prisma.InputJsonValue) : undefined,
      },
      include: {
        actor_user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      id: row.id,
      business_id: row.business_id,
      actor_user_id: row.actor_user_id,
      actor: row.actor_user
        ? {
            id: row.actor_user.id,
            name: row.actor_user.name,
            email: row.actor_user.email,
          }
        : null,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      payload: row.payload as AuditPayload | null,
      created_at: row.created_at,
    };
  }

  /**
   * 13 §2.7 & 17 §9 GET /businesses/:id/audit-logs & GET /api/v1/audit-logs
   * Returns time-ordered descending paginated audit logs with base64url cursor support.
   */
  async listAuditLogs(
    businessId: string,
    query: AuditLogsQueryDto = {},
  ): Promise<PaginatedAuditLogsResponse> {
    const rawLimit = Number(query.limit ?? 50);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;

    const actorId = query.actorId || query.actor_user_id;
    const action = query.action;
    const entityType = query.entityType || query.entity_type;
    const entityId = query.entityId || query.entity_id;

    let cursorDecoded: DecodedCursor | null = null;
    if (query.cursor) {
      try {
        const decodedStr = Buffer.from(query.cursor, "base64url").toString("utf-8");
        const parsed = JSON.parse(decodedStr) as DecodedCursor;
        if (parsed.t && parsed.id) {
          cursorDecoded = parsed;
        } else {
          throw new Error("Missing required cursor fields");
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

    const where: Prisma.AuditLogWhereInput = {
      business_id: businessId,
      ...(actorId ? { actor_user_id: actorId } : {}),
      ...(action ? { action } : {}),
      ...(entityType ? { entity_type: entityType } : {}),
      ...(entityId ? { entity_id: entityId } : {}),
    };

    if (query.from || query.to) {
      const fromDate = query.from ? new Date(query.from) : undefined;
      let toDate: Date | undefined = undefined;
      if (query.to) {
        // If calendar date format YYYY-MM-DD, span through the end of that day in UTC
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
          toDate = new Date(`${query.to}T23:59:59.999Z`);
        } else {
          toDate = new Date(query.to);
        }
      }

      where.created_at = {
        ...(fromDate && !isNaN(fromDate.getTime()) ? { gte: fromDate } : {}),
        ...(toDate && !isNaN(toDate.getTime()) ? { lte: toDate } : {}),
      };
    }

    if (cursorDecoded) {
      const cursorDate = new Date(cursorDecoded.t);
      if (!isNaN(cursorDate.getTime())) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          {
            OR: [
              { created_at: { lt: cursorDate } },
              {
                created_at: cursorDate,
                id: { lt: cursorDecoded.id },
              },
            ],
          },
        ];
      }
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        actor_user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    let next_cursor: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      if (lastItem) {
        const cursorPayload: DecodedCursor = {
          t: lastItem.created_at.toISOString(),
          id: lastItem.id,
        };
        next_cursor = Buffer.from(JSON.stringify(cursorPayload)).toString("base64url");
      }
    }

    return {
      data: items.map((row) => ({
        id: row.id,
        business_id: row.business_id,
        actor_user_id: row.actor_user_id,
        actor: row.actor_user
          ? {
              id: row.actor_user.id,
              name: row.actor_user.name,
              email: row.actor_user.email,
            }
          : null,
        action: row.action,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        payload: row.payload as AuditPayload | null,
        created_at: row.created_at,
      })),
      next_cursor,
    };
  }
}
