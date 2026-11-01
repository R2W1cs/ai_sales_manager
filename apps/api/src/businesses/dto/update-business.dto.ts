import { z } from "zod";

/**
 * 13 §5 PATCH /api/v1/businesses/:id Request Schema
 * Only profile fields from FR-BIZ-002 are allowed.
 * Strictly forbids onboarding status flags and unknown keys.
 */
export const UpdateBusinessSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, "Name cannot be empty")
    .max(100, "Name must not exceed 100 characters")
    .optional(),
  industry: z.string().trim().min(1, "Industry cannot be empty").max(50).optional(),
  country: z.string().trim().length(2, "Country must be a 2-letter ISO code").optional(),
  defaultLanguage: z.enum(["fr", "ar"]).optional(),
  timezone: z.string().trim().min(1, "Timezone cannot be empty").optional(),
  currency: z.string().trim().length(3, "Currency must be a 3-letter ISO code").optional(),
  phone: z.string().trim().max(30).optional(),
});

export type UpdateBusinessDto = z.infer<typeof UpdateBusinessSchema>;

export interface BusinessProfileResponse {
  id: string;
  name: string;
  industry: string;
  country: string;
  defaultLanguage: string;
  timezone: string;
  currency: string;
  phone?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}
