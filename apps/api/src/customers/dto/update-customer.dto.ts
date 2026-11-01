import { z } from "zod";

import { normalizePhone } from "@app/shared";

const CustomerTagSchema = z
  .string()
  .trim()
  .min(1, "Tags cannot be empty")
  .max(50, "Tag max length is 50 characters")
  .transform((val) => val.toLowerCase());

export const UpdateCustomerSchema = z
  .strictObject({
    name: z.string().trim().min(1, "Name cannot be empty").max(255).optional(),
    phone: z
      .string()
      .trim()
      .refine((val) => normalizePhone(val) !== null, {
        message:
          "Invalid phone number format. Must be a valid local or international phone number.",
      })
      .transform((val) => normalizePhone(val) ?? val)
      .optional(),
    tags: z
      .array(CustomerTagSchema)
      .max(20, "At most 20 tags permitted")
      .transform((tags) => Array.from(new Set(tags)))
      .optional(),
    isVip: z.boolean().optional(),
    notes: z
      .string()
      .trim()
      .min(1, "Notes cannot be empty")
      .max(2000, "Notes cannot exceed 2000 characters")
      .optional(),
    note: z
      .string()
      .trim()
      .min(1, "Note cannot be empty")
      .max(2000, "Note cannot exceed 2000 characters")
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one customer field is required",
  })
  .refine((data) => !(data.note !== undefined && data.notes !== undefined), {
    message: "Provide either 'note' or 'notes', not both",
    path: ["note"],
  })
  .refine(
    (data) => {
      if (data.tags !== undefined && data.isVip !== undefined) {
        const hasVip = data.tags.includes("vip");
        if (data.isVip && !hasVip) return false;
        if (!data.isVip && hasVip) return false;
      }
      return true;
    },
    {
      message: "Conflicting tags and isVip values: tags array contradicts isVip flag",
      path: ["isVip"],
    },
  );

export type UpdateCustomerDto = z.infer<typeof UpdateCustomerSchema>;
