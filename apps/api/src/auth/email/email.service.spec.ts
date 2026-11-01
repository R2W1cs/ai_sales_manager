import { EmailService } from "../email/email.service";

describe("EmailService", () => {
  it("returns false and logs warning when RESEND_API_KEY is unset", async () => {
    const service = new EmailService();
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const verifyResult = await service.sendVerificationEmail({
      to: "user@example.com",
      url: "https://example.com/verify",
      name: "User",
    });
    expect(verifyResult).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[EmailService] RESEND_API_KEY is unset"),
    );

    const resetResult = await service.sendResetPasswordEmail({
      to: "user@example.com",
      url: "https://example.com/reset",
      name: "User",
    });
    expect(resetResult).toBe(false);

    const inviteResult = await service.sendOrganizationInvitationEmail({
      to: "user@example.com",
      organizationName: "Acme Corp",
      inviterName: "Alice",
      inviteLink: "https://example.com/invite",
    });
    expect(inviteResult).toBe(false);

    warnSpy.mockRestore();
  });
});
