import { z } from "zod";

import { MemberRoleSchema } from "../enums";

/**
 * 13 §3.1 User DTO
 */
export const UserSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  emailVerifiedAt: z.union([z.date(), z.iso.datetime()]).nullable().optional(),
  createdAt: z.union([z.date(), z.iso.datetime()]),
  platformAdmin: z.boolean().optional(),
});

export type UserDto = z.infer<typeof UserSchema>;

/**
 * 13 §3.1 Membership DTO
 */
export const MembershipSchema = z.object({
  businessId: z.string(),
  role: MemberRoleSchema,
  joinedAt: z.union([z.date(), z.iso.datetime()]),
  lastActiveAt: z.union([z.date(), z.iso.datetime()]).nullable().optional(),
});

export type MembershipDto = z.infer<typeof MembershipSchema>;

/**
 * 13 §3.1 Session DTO
 */
export const SessionSchema = z.object({
  user: UserSchema,
  memberships: z.array(MembershipSchema),
  accessToken: z.string().optional(),
  tokenType: z.literal("Bearer").default("Bearer"),
  expiresIn: z.number().default(900),
});

export type SessionDto = z.infer<typeof SessionSchema>;

/**
 * 13 §4 Register Request
 * Min password 10, max 128 per 17 §3.1.
 */
export const RegisterRequestSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128, "Password must not exceed 128 characters"),
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters"),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/**
 * 13 §4 Login Request
 * Bounded password to 128 characters to prevent CPU exhaustion on Argon2 verification.
 */
export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password must not exceed 128 characters"),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * 13 §4 POST /api/v1/auth/invitations/accept
 * Body: { token, name?, password? }
 * - For a new user: name + password (min 10, max 128) are required.
 * - For an existing user: token only (password not set).
 */
export const AcceptInvitationSchema = z.object({
  token: z.string().min(1, "Invitation token is required"),
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters")
    .optional(),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128, "Password must not exceed 128 characters")
    .optional(),
});

export type AcceptInvitationDto = z.infer<typeof AcceptInvitationSchema>;
