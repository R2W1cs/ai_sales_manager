import { z } from "zod";

/**
 * 13 §5 PATCH /api/v1/businesses/:id/members/:userId Request Schema
 * Allowed target roles: "admin" | "employee" (or "MANAGER" | "EMPLOYEE" normalized).
 * Cannot grant role "owner" / "OWNER".
 */
export const UpdateMemberRoleSchema = z.strictObject({
  role: z
    .string()
    .trim()
    .transform((val) => val.toLowerCase())
    .refine((val) => val === "admin" || val === "employee" || val === "manager", {
      message: "Role must be 'admin', 'employee', or 'manager'. Granting 'owner' is forbidden.",
    })
    .transform((val): "admin" | "employee" => (val === "manager" ? "admin" : val)),
});

export type UpdateMemberRoleDto = z.infer<typeof UpdateMemberRoleSchema>;

export interface MemberResponse {
  id: string;
  userId: string;
  businessId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: Date | string;
  invitedAt?: Date | string | null;
  lastActiveAt?: Date | string | null;
}
