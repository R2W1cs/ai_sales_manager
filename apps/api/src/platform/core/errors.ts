import { BadRequestException } from "@nestjs/common";
import type { ZodError } from "zod";

/**
 * Maps Zod issues into structured field errors record { [field]: string[] }.
 */
export function formatZodFieldErrors(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "body";
    fieldErrors[path] = fieldErrors[path] ?? [];
    fieldErrors[path].push(issue.message);
  }
  return fieldErrors;
}

/**
 * Converts a ZodError into a standard 13 §2.6 BadRequestException with code "validation_error".
 */
export function toValidationException(
  error: ZodError,
  customMessage = "Validation failed for one or more fields",
): BadRequestException {
  const fields = formatZodFieldErrors(error);
  return new BadRequestException({
    error: {
      code: "validation_error",
      message: customMessage,
      details: {
        fields,
      },
    },
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates whether a value is a valid UUID string and throws 400 invalid_uuid if not.
 */
export function assertUuid(
  val: string | null | undefined,
  fieldName = "id",
): asserts val is string {
  if (!val || typeof val !== "string" || !UUID_REGEX.test(val.trim())) {
    throw new BadRequestException({
      error: {
        code: "invalid_uuid",
        message: `${fieldName} must be a valid UUID`,
      },
    });
  }
}
