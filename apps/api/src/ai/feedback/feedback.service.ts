import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { type FeedbackRating, Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { InjectPrisma } from "../../platform/core/prisma.token";
import {
  FEEDBACK_REASONS,
  type FeedbackItemResponse,
  type FeedbackMetricsResponse,
  type FeedbackQuery,
  type FeedbackQueryDto,
  FeedbackQuerySchema,
  type FeedbackReasonCode,
  type SubmitFeedbackDto,
  SubmitFeedbackSchema,
} from "../dto/submit-feedback.dto";
import { sanitizeText } from "../observability/observability.service";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class FeedbackService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() @InjectPrisma() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * 13 §11 / FR-OBS-006 POST /messages/:id/feedback
   * Collects thumbs up/down feedback on AI-generated messages.
   */
  async submitFeedback(
    businessId: string,
    userId: string,
    messageId: string,
    dto: SubmitFeedbackDto,
  ): Promise<FeedbackItemResponse> {
    if (!messageId || !UUID_REGEX.test(messageId)) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Invalid message ID format: must be a valid UUID",
        },
      });
    }

    const parseResult = SubmitFeedbackSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: parseResult.error.issues[0]?.message ?? "Invalid feedback submission",
        },
      });
    }

    const validDto = parseResult.data;

    // Normalize rating enum ('THUMBS_UP' / 'positive' -> 'positive', 'THUMBS_DOWN' / 'negative' -> 'negative')
    const normalizedRating: FeedbackRating =
      validDto.rating === "THUMBS_UP" || validDto.rating === "positive" ? "positive" : "negative";

    // Verify message exists and belongs to the business tenant
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        business_id: businessId,
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: `Message ${messageId} not found in this business`,
        },
      });
    }

    // Enforce Invariant: Feedback allowed only on AI responses (FR-OBS-006).
    // Keyed strictly on `sender_type`: `ai_metadata` is also present on
    // human/system messages derived from an AI draft, and treating those as
    // AI-authored would attribute staff edits to the model.
    if (message.sender_type !== "ai") {
      throw new BadRequestException({
        error: {
          code: "invalid_message_type",
          message: "Feedback can only be submitted on AI-generated messages",
        },
      });
    }

    // A reason code only carries meaning for a negative rating. Dropping it on
    // a positive rating keeps stored rows from contradicting themselves (and
    // keeps `reasonsBreakdown` aligned with `negativeCount`).
    const reasonValue = normalizedRating === "negative" ? (validDto.reason ?? null) : null;
    const commentValue = sanitizeText(validDto.comment ?? null);

    // Upsert staff rating (explicit multi-tenant compound unique per staff user per message)
    const record = await this.prisma.aiFeedback.upsert({
      where: {
        business_id_message_id_user_id: {
          business_id: businessId,
          message_id: messageId,
          user_id: userId,
        },
      },
      create: {
        business_id: businessId,
        message_id: messageId,
        user_id: userId,
        rating: normalizedRating,
        reason: reasonValue,
        comment: commentValue,
      },
      update: {
        rating: normalizedRating,
        reason: reasonValue,
        comment: commentValue,
      },
    });

    const aiMeta = (
      message.ai_metadata &&
      typeof message.ai_metadata === "object" &&
      !Array.isArray(message.ai_metadata)
        ? message.ai_metadata
        : null
    ) as Record<string, unknown> | null;
    const promptVersionId =
      typeof aiMeta?.prompt_version_id === "string" && UUID_REGEX.test(aiMeta.prompt_version_id)
        ? aiMeta.prompt_version_id
        : null;

    return {
      id: record.id,
      businessId: record.business_id,
      messageId: record.message_id,
      userId: record.user_id,
      rating: record.rating === "positive" ? "positive" : "negative",
      reason: record.reason ?? null,
      comment: sanitizeText(record.comment),
      createdAt: record.created_at.toISOString(),
      messageContent: sanitizeText(message.content),
      promptVersionId,
    };
  }

  /**
   * 13 §11 / T-OBS-02 GET /ai/feedback
   * Returns aggregated satisfaction metrics and breakdown.
   */
  async getFeedbackMetrics(
    businessId: string,
    query?: FeedbackQueryDto,
  ): Promise<FeedbackMetricsResponse> {
    const validQuery = this.parseQuery(query);
    const limit = validQuery.limit;

    const where: Prisma.AiFeedbackWhereInput = {
      business_id: businessId,
      ...(validQuery.reason ? { reason: validQuery.reason } : {}),
      ...(validQuery.prompt_version_id
        ? {
            message: {
              is: {
                ai_metadata: {
                  path: ["prompt_version_id"],
                  equals: validQuery.prompt_version_id,
                },
              },
            },
          }
        : {}),
      ...(validQuery.from || validQuery.to
        ? {
            created_at: {
              ...(validQuery.from ? { gte: new Date(validQuery.from) } : {}),
              ...(validQuery.to ? { lte: new Date(validQuery.to) } : {}),
            },
          }
        : {}),
    };

    // Counts come from a single `groupBy` aggregate rather than a full
    // `findMany` scan: the previous approach loaded every matching row into
    // memory to increment counters, so cost grew with total feedback volume.
    // One aggregate also means `totalFeedback` and the rating/reason splits are
    // derived from the same snapshot and cannot disagree.
    let groups: {
      rating: string;
      reason: string | null;
      _count: { _all: number };
    }[];
    let paginatedFeedback: {
      id: string;
      business_id: string;
      message_id: string;
      user_id: string;
      rating: string;
      reason: string | null;
      comment: string | null;
      created_at: Date;
      message: {
        content: string | null;
        ai_metadata: unknown;
      };
    }[];

    try {
      [groups, paginatedFeedback] = await Promise.all([
        this.prisma.aiFeedback.groupBy({
          by: ["rating", "reason"],
          where,
          _count: { _all: true },
        }),
        this.prisma.aiFeedback.findMany({
          where,
          take: limit + 1,
          ...(validQuery.cursor
            ? {
                cursor: { id: validQuery.cursor },
                skip: 1,
              }
            : {}),
          // `id` breaks `created_at` ties. Cursor pagination over a non-unique
          // sort key silently skips or repeats rows when timestamps collide.
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          include: {
            message: {
              select: {
                content: true,
                ai_metadata: true,
              },
            },
          },
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

    let positiveCount = 0;
    let negativeCount = 0;
    // Fixed key set: the response contract declares exactly these six codes,
    // so the breakdown never grows an unexpected key.
    const reasonsBreakdown = Object.fromEntries(
      FEEDBACK_REASONS.map((reason) => [reason, 0]),
    ) as Record<FeedbackReasonCode, number>;

    for (const group of groups) {
      const count = group._count._all;
      const rating = group.rating;
      if (rating === "positive") {
        positiveCount += count;
      } else if (rating === "negative") {
        negativeCount += count;
        if (group.reason && group.reason in reasonsBreakdown) {
          reasonsBreakdown[group.reason as FeedbackReasonCode] += count;
        }
      } else {
        throw new Error(`Corrupted feedback rating in database: ${rating}`);
      }
    }

    // Denominator is the sum of the rating buckets, not an independent count,
    // so the rate stays consistent with the numerator.
    const totalCount = positiveCount + negativeCount;
    const satisfactionRate =
      totalCount > 0 ? Math.round((positiveCount / totalCount) * 10000) / 100 : 0;

    let nextCursor: string | null = null;
    if (paginatedFeedback.length > limit) {
      const nextItem = paginatedFeedback.pop();
      nextCursor = nextItem?.id ?? null;
    }

    const items: FeedbackItemResponse[] = paginatedFeedback.map((f) => {
      const aiMeta = (
        f.message.ai_metadata &&
        typeof f.message.ai_metadata === "object" &&
        !Array.isArray(f.message.ai_metadata)
          ? f.message.ai_metadata
          : null
      ) as Record<string, unknown> | null;
      const promptVersionId =
        typeof aiMeta?.prompt_version_id === "string" && UUID_REGEX.test(aiMeta.prompt_version_id)
          ? aiMeta.prompt_version_id
          : null;

      const mappedRating: "positive" | "negative" =
        f.rating === "positive" ? "positive" : "negative";

      return {
        id: f.id,
        businessId: f.business_id,
        messageId: f.message_id,
        userId: f.user_id,
        rating: mappedRating,
        reason: f.reason ?? null,
        comment: sanitizeText(f.comment),
        createdAt: f.created_at.toISOString(),
        messageContent: sanitizeText(f.message.content),
        promptVersionId,
      };
    });

    return {
      totalFeedback: totalCount,
      positiveCount,
      negativeCount,
      satisfactionRate,
      reasonsBreakdown,
      items,
      nextCursor,
    };
  }

  /**
   * Validates the raw query string at the service boundary.
   *
   * Without this, `reason` and `limit` were cast straight into Prisma inputs
   * and `from`/`to` went through `new Date()` unchecked, so `?reason=bogus`,
   * `?limit=abc` or `?from=nonsense` produced a Prisma-level failure (500)
   * instead of a 400.
   */
  private parseQuery(query?: FeedbackQueryDto): FeedbackQuery {
    const parseResult = FeedbackQuerySchema.safeParse(query ?? {});
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: issue
            ? `Invalid query parameter '${issue.path.join(".")}': ${issue.message}`
            : "Invalid feedback query",
        },
      });
    }
    return parseResult.data;
  }
}
