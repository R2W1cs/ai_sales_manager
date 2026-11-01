import { z } from "zod";

/**
 * 13 §5 POST /api/v1/businesses/:id/invitations Request Schema
 * Allowed roles: "admin" | "employee" (or "MANAGER" | "EMPLOYEE" normalized to lowercase).
 * Forbid role "owner" / "OWNER".
 */
export const InviteMemberSchema = z.strictObject({
  email: z.email("Invalid email format"),
  role: z
    .string()
    .trim()
    .transform((val) => val.toLowerCase())
    .refine((val) => val === "admin" || val === "employee" || val === "manager", {
      message: "Role must be 'admin', 'employee', or 'manager'. Inviting 'owner' is forbidden.",
    })
    .transform((val): "admin" | "employee" => (val === "manager" ? "admin" : val)),
});

export type InviteMemberDto = z.infer<typeof InviteMemberSchema>;

export interface InvitationResponse {
  id: string;
  businessId: string;
  email: string;
  role: string;
  invitedByUserId: string;
  token?: string;
  expiresAt: Date | string;
  createdAt: Date | string;
}
