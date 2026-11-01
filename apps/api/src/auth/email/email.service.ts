import { Injectable } from "@nestjs/common";
import { Resend } from "resend";

import { env } from "@app/shared/server";

@Injectable()
export class EmailService {
  private resend: Resend | null = null;
  private fromEmail = env.EMAIL_FROM;

  constructor() {
    const apiKey = env.RESEND_API_KEY;
    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  async sendVerificationEmail(options: {
    to: string;
    url: string;
    name?: string;
  }): Promise<boolean> {
    if (!this.resend) {
      console.warn(
        `[EmailService] RESEND_API_KEY is unset; cannot send verification email to: ${options.to}`,
      );
      return false;
    }
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: options.to,
        subject: "Verify your email - AI Sales",
        html: `<p>Hi ${options.name || "there"},</p><p>Please verify your email by clicking the link below:</p><p><a href="${options.url}">Verify Email</a></p>`,
      });
      return true;
    } catch (err) {
      console.error("[EmailService] Failed to send verification email:", err);
      return false;
    }
  }

  async sendResetPasswordEmail(options: {
    to: string;
    url: string;
    name?: string;
  }): Promise<boolean> {
    if (!this.resend) {
      console.warn(
        `[EmailService] RESEND_API_KEY is unset; cannot send password reset email to: ${options.to}`,
      );
      return false;
    }
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: options.to,
        subject: "Reset your password - AI Sales",
        html: `<p>Hi ${options.name || "there"},</p><p>You requested a password reset. Click the link below to set a new password:</p><p><a href="${options.url}">Reset Password</a></p>`,
      });
      return true;
    } catch (err) {
      console.error("[EmailService] Failed to send password reset email:", err);
      return false;
    }
  }

  async sendOrganizationInvitationEmail(options: {
    to: string;
    organizationName: string;
    inviterName: string;
    inviteLink: string;
    role?: string;
  }): Promise<boolean> {
    if (!this.resend) {
      console.warn(
        `[EmailService] RESEND_API_KEY is unset; cannot send organization invitation email to: ${options.to}`,
      );
      return false;
    }
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: options.to,
        subject: `You've been invited to join ${options.organizationName} on AI Sales`,
        html: `<p>Hi,</p><p>${options.inviterName} has invited you to join <strong>${options.organizationName}</strong> as a <strong>${options.role || "member"}</strong>.</p><p><a href="${options.inviteLink}">Accept Invitation</a></p>`,
      });
      return true;
    } catch (err) {
      console.error("[EmailService] Failed to send invitation email:", err);
      return false;
    }
  }
}

export const emailService = new EmailService();
