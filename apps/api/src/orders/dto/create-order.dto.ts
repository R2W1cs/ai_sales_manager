import { BadRequestException } from "@nestjs/common";

export {
  CreateOrderItemSchema,
  type CreateOrderItemDto,
  CreateOrderSchema,
  type CreateOrderDto,
  CreateDraftOrderSchema,
  type CreateDraftOrderDto,
  ConfirmConversationOrderSchema,
  type ConfirmConversationOrderDto,
  DeliveryFeeSchema,
  CustomerSnapshotSchema,
  type CustomerSnapshot,
} from "@app/shared";

export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

/**
 * Normalizes and validates Idempotency-Key across HTTP header and request body.
 * Throws 400 Bad Request if both are provided but mismatch, or if neither is provided / empty.
 */
export function resolveIdempotencyKey(headerKey?: string | null, bodyKey?: string | null): string {
  if (headerKey && headerKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new BadRequestException({
      error: {
        code: "invalid_idempotency_key",
        message: `Idempotency-Key header exceeds maximum length of ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
      },
    });
  }
  if (bodyKey && bodyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new BadRequestException({
      error: {
        code: "invalid_idempotency_key",
        message: `body idempotencyKey exceeds maximum length of ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
      },
    });
  }

  const trimmedHeader = headerKey?.trim();
  const trimmedBody = bodyKey?.trim();

  if (trimmedHeader && trimmedBody && trimmedHeader !== trimmedBody) {
    throw new BadRequestException({
      error: {
        code: "idempotency_key_mismatch",
        message: "Header Idempotency-Key and body idempotencyKey do not match",
      },
    });
  }

  const key = trimmedHeader || trimmedBody;
  if (!key || key === "") {
    throw new BadRequestException({
      error: {
        code: "idempotency_key_required",
        message: "Idempotency-Key header or body idempotencyKey is required",
      },
    });
  }

  return key;
}
