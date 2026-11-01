import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";

import { env } from "@app/shared/server";

import { prisma } from "../../lib/prisma";
import { emailService } from "../email/email.service";
import { ac, adminRole, employeeRole, ownerRole } from "./better-auth-permissions";

const secret = env.BETTER_AUTH_SECRET;
const baseURL = env.BETTER_AUTH_URL;
const frontendURL = env.PUBLIC_APP_URL || env.CORS_ORIGIN;

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret,
  baseURL,
  trustedOrigins: [frontendURL, "http://localhost:3000", "http://localhost:3001", env.CORS_ORIGIN],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    async sendResetPassword(data: {
      user: { email: string; name: string };
      token: string;
      url?: string;
    }) {
      const resetLink = data.url || `${frontendURL}/reset-password?token=${data.token}`;
      const sent = await emailService.sendResetPasswordEmail({
        to: data.user.email,
        url: resetLink,
        name: data.user.name,
      });
      if (!sent) {
        throw new Error(
          "Failed to send password reset email. Email service is not configured or delivery failed.",
        );
      }
    },
    async sendVerificationEmail(data: {
      user: { email: string; name: string };
      token: string;
      url?: string;
    }) {
      const verifyLink = data.url || `${frontendURL}/verify-email?token=${data.token}`;
      const sent = await emailService.sendVerificationEmail({
        to: data.user.email,
        url: verifyLink,
        name: data.user.name,
      });
      if (!sent) {
        throw new Error(
          "Failed to send verification email. Email service is not configured or delivery failed.",
        );
      }
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  advanced: {
    database: {
      joins: true,
    },
  },
  plugins: [
    organization({
      ac,
      roles: {
        owner: ownerRole,
        admin: adminRole,
        employee: employeeRole,
      },
      allowUserToCreateOrganization: true,
      async sendInvitationEmail(data) {
        const inviteLink = `${frontendURL}/accept-invitation/${data.id}`;
        const sent = await emailService.sendOrganizationInvitationEmail({
          to: data.email,
          organizationName: data.organization.name,
          inviterName: data.inviter.user.name,
          inviteLink,
          role: data.role || "employee",
        });
        if (!sent) {
          throw new Error(
            "Failed to send organization invitation email. Email service is not configured or delivery failed.",
          );
        }
      },
    }),
  ],
});

export type Auth = typeof auth;
