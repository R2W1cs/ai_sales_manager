import { z } from "zod";

import { FeedbackReasonSchema } from "@app/shared";

export const RatingInputSchema = z.enum(["positive", "negative", "THUMBS_UP", "THUMBS_DOWN"]);

export type RatingInput = z.infer<typeof RatingInputSchema>;

/** The six structured negative-reason codes (12 §5 `FeedbackReason`). */
export const FEEDBACK_REASONS = FeedbackReasonSchema.options;

export type FeedbackReasonCode = (typeof FEEDBACK_REASONS)[number];

export const SubmitFeedbackSchema = z
  .strictObject({
    rating: RatingInputSchema,
    reason: FeedbackReasonSchema.optional().nullable(),
    comment: z.string().trim().max(1000).optional().nullable(),
  })
  .refine(
    (data) => {
      const isNegative = data.rating === "negative" || data.rating === "THUMBS_DOWN";
      // `reason` is a closed enum, so presence is the only thing to assert;
      // an empty or whitespace value cannot reach this point.
      return !isNegative || (data.reason !== undefined && data.reason !== null);
    },
    {
      message: "Reason is required for negative feedback ratings",
      path: ["reason"],
    },
  )
  .refine(
    (data) => {
      const isPositive = data.rating === "positive" || data.rating === "THUMBS_UP";
      // Reject contradictory submissions where positive feedback supplies a negative reason code.
      return !isPositive || data.reason === undefined || data.reason === null;
    },
    {
      message: "Reason must not be provided for positive feedback ratings",
      path: ["reason"],
    },
  );

export type SubmitFeedbackDto = z.infer<typeof SubmitFeedbackSchema>;

export interface NormalizedFeedbackInput {
  rating: "positive" | "negative";
  reason?:
    | "wrong_product"
    | "wrong_tone"
    | "missing_information"
    | "incorrect_policy"
    | "hallucination"
    | "other"
    | null;
  comment?: string | null;
}

export interface FeedbackQueryDto {
  from?: string;
  to?: string;
  reason?: string;
  prompt_version_id?: string;
  limit?: number | string;
  cursor?: string;
}

export const StrictIntegerLimitSchema = z
  .union([
    z
      .string()
      .trim()
      .regex(/^[1-9]\d*$/, { message: "Limit must be a positive integer" })
      .transform((val) => Number.parseInt(val, 10)),
    z
      .number()
      .int()
      .refine((n) => Number.isFinite(n) && !Number.isNaN(n), {
        message: "Limit must be a finite integer",
      }),
  ])
  .pipe(z.number().int().min(1).max(100))
  .default(50);

/**
 * 13 §11 `GET /ai/feedback` query contract.
 *
 * Validated at the service boundary so a malformed `reason`, `from`/`to` or
 * `limit` returns a controlled 400 instead of reaching Prisma and surfacing as
 * a 500. `limit` is parsed strictly so strings like `NaN`, `1.5`, or `abc` are
 * rejected rather than passed through.
 * Date range `from <= to` is strictly validated. Unknown properties are rejected via `.strict()`.
 */
export const FeedbackQuerySchema = z
  .strictObject({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    reason: FeedbackReasonSchema.optional(),
    prompt_version_id: z.uuid().optional(),
    limit: StrictIntegerLimitSchema,
    cursor: z.uuid().optional(),
  })
  .refine(
    (data) => {
      if (data.from && data.to) {
        return new Date(data.from) <= new Date(data.to);
      }
      return true;
    },
    {
      message: "'from' date must be before or equal to 'to' date",
      path: ["from"],
    },
  );

export type FeedbackQuery = z.infer<typeof FeedbackQuerySchema>;

export interface FeedbackMetricsResponse {
  totalFeedback: number;
  positiveCount: number;
  negativeCount: number;
  satisfactionRate: number; // 0 to 100 percentage
  /** Fixed keys: one entry per `FeedbackReason` code, never a dynamic key. */
  reasonsBreakdown: Record<FeedbackReasonCode, number>;
  items: FeedbackItemResponse[];
  nextCursor: string | null;
}

export interface FeedbackItemResponse {
  id: string;
  businessId: string;
  messageId: string;
  userId: string;
  rating: "positive" | "negative";
  reason: string | null;
  comment: string | null;
  createdAt: string;
  messageContent?: string | null;
  promptVersionId?: string | null;
}
