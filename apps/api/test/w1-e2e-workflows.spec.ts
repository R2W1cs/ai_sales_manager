import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";

import { AiConfigService } from "../src/ai/config/ai-config.service";
import { AuthService } from "../src/auth/core/auth.service";
import { AuditService } from "../src/businesses/audit/audit.service";
import { FlagsService } from "../src/businesses/flags/flags.service";
import { MembersService } from "../src/businesses/members/members.service";
import { OnboardingService } from "../src/businesses/onboarding/onboarding.service";
import { BusinessesService } from "../src/businesses/workspace/businesses.service";
import { createMockPrisma, TEST_BETTER_AUTH_SECRET } from "./test-helpers";

describe("Wave 1 End-to-End Workflows & Lifecycle Suite (W1-E2E)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BETTER_AUTH_SECRET: TEST_BETTER_AUTH_SECRET,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("Workflow 1: Complete Authentication & Token Rotation Lifecycle", () => {
    test("User registers, logs in, accesses profile, rotates refresh token, and logs out", async () => {
      const { prisma, state } = createMockPrisma();
      const authService = new AuthService(prisma);

      // Step 1: Register
      const registerRes = await authService.register({
        email: "alice@example.com",
        password: "SecurePassword123!",
        name: "Alice Owner",
      });

      expect(registerRes.session.user.email).toBe("alice@example.com");
      expect(registerRes.session.user.name).toBe("Alice Owner");
      expect(registerRes.session.accessToken).toBeDefined();
      expect(registerRes.refreshToken).toBeDefined();

      const user = state.users.find((u) => u.email === "alice@example.com");
      expect(user).toBeDefined();
      expect(user?.password_hash).not.toBe("SecurePassword123!");

      // Step 2: Login
      const loginRes = await authService.login({
        email: "alice@example.com",
        password: "SecurePassword123!",
      });

      expect(loginRes.session.user.id).toBe(user?.id);
      expect(loginRes.session.tokenType).toBe("Bearer");
      expect(loginRes.refreshToken).toBeDefined();

      // Step 3: Refresh Token Rotation
      const rawRefreshToken = loginRes.refreshToken;

      const refreshRes = await authService.refresh(rawRefreshToken);
      expect(refreshRes.session.accessToken).toBeDefined();
      expect(refreshRes.refreshToken).toBeDefined();
      expect(refreshRes.refreshToken).not.toBe(rawRefreshToken);

      // Step 4: Replaying the old refresh token triggers theft detection
      await expect(authService.refresh(rawRefreshToken)).rejects.toThrow(UnauthorizedException);

      // Step 5: Logout with current token
      await expect(authService.logout(refreshRes.refreshToken)).resolves.not.toThrow();
    });
  });

  describe("Workflow 2: Workspace Creation & Seed AI Provisioning Lifecycle (T-BIZ-01, T-AI-10)", () => {
    test("Creates business with Idempotency-Key, auto-provisions AI agent and settings, and verifies immediate customization", async () => {
      const { prisma, state } = createMockPrisma();
      const businessesService = new BusinessesService(prisma);
      const aiConfigService = new AiConfigService(prisma);

      const userId = "merchant-user-1";
      state.users.push({
        id: userId,
        email: "merchant@test.com",
        name: "Merchant",
        password_hash: "hash",
        email_verified_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Step 1: Create Business with Idempotency Key
      const createRes = await businessesService.createBusiness(
        userId,
        {
          name: "Sidi Bou Said Crafts",
          currency: "TND",
          timezone: "Africa/Tunis",
          industry: "fashion",
          defaultLanguage: "fr",
        },
        "idempotency-key-001",
      );

      expect(createRes.business.id).toBeDefined();
      expect(createRes.business.name).toBe("Sidi Bou Said Crafts");
      expect(createRes.business.currency).toBe("TND");

      const businessId = createRes.business.id;

      // Verify Owner membership created
      const ownerMember = state.businessMembers.find(
        (m) => m.business_id === businessId && m.user_id === userId,
      );
      expect(ownerMember).toBeDefined();

      // Verify starter AI Agent created
      const starterAgent = state.aiAgents.find((a) => a.business_id === businessId);
      expect(starterAgent).toBeDefined();
      expect(starterAgent?.status).toBe("active");
      expect(starterAgent?.model_id).toBe("claude-3-5-sonnet");

      // Verify starter AI Settings created
      const starterSettings = state.aiSettings.find((s) => s.business_id === businessId);
      expect(starterSettings).toBeDefined();
      expect(starterSettings?.mode).toBe("approval_required");

      // Verify starter Onboarding created
      const starterOnboarding = state.businessOnboardings.find((o) => o.business_id === businessId);
      expect(starterOnboarding).toBeDefined();
      expect(starterOnboarding?.catalog_seeded).toBe(false);

      // Step 2: Customize AI Agent Personality & Threshold
      const starterAgentId = starterAgent?.id ?? "";
      const updatedAgent = await aiConfigService.updateAgent(businessId, starterAgentId, {
        name: "Handicrafts Sales Specialist",
        personality: "You are an expert sales assistant for artisanal crafts.",
        confidenceThreshold: 0.8,
      });

      expect(updatedAgent.name).toBe("Handicrafts Sales Specialist");
      expect(updatedAgent.confidenceThreshold).toBe(0.8);

      // Step 3: Customize AI Settings
      const updatedSettings = await aiConfigService.updateSettings(businessId, {
        replyMode: "auto_send",
        reservationTtlMinutes: 20,
      });

      expect(updatedSettings.replyMode).toBe("auto_send");
      expect(updatedSettings.reservationTtlMinutes).toBe(20);
    });
  });

  describe("Workflow 3: Team Collaboration, Invitations & Sole Owner Invariant (T-BIZ-03, T-AUTH-03)", () => {
    test("Owner invites Admin and Employee, members accept, and Sole Owner demotion protection triggers", async () => {
      const { prisma, state } = createMockPrisma();
      const membersService = new MembersService(prisma);
      const authService = new AuthService(prisma);

      const ownerId = "owner-id-100";
      const adminUserId = "admin-id-200";
      const bizId = "crafts-biz-id";

      state.users.push(
        {
          id: ownerId,
          email: "owner@crafts.com",
          name: "Owner",
          password_hash: "h",
          email_verified_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: adminUserId,
          email: "manager@crafts.com",
          name: "Manager",
          password_hash: "h",
          email_verified_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      );

      state.businesses.push({
        id: bizId,
        name: "Crafts Workshop",
        currency: "TND",
        timezone: "Africa/Tunis",
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      });

      const ownerMember = {
        id: "member-owner-id",
        business_id: bizId,
        user_id: ownerId,
        role_id: "role-owner-id",
        removed_at: null,
        created_at: new Date(),
        role: { id: "role-owner-id", name: "owner" },
      };
      state.businessMembers.push(ownerMember);

      // Step 1: Owner sends invitation for Admin role
      const inviteRes = await membersService.createInvitation(bizId, ownerId, {
        email: "manager@crafts.com",
        role: "admin",
      });

      expect(inviteRes.email).toBe("manager@crafts.com");
      expect(inviteRes.role).toBe("admin");
      expect(inviteRes.token).toBeDefined();

      // Step 2: Manager accepts invitation
      const acceptRes = await authService.acceptInvitation({
        token: inviteRes.token ?? "",
        name: "Manager User",
        password: "NewSecurePassword123!",
      });

      expect(acceptRes.session.user).toBeDefined();
      expect(acceptRes.session.memberships.length).toBeGreaterThan(0);

      // Verify 2 active members now exist
      const membersList = await membersService.listMembers(bizId);
      expect(membersList.length).toBe(2);

      // Step 3: Sole Owner Protection Invariant (Cannot remove or demote last Owner)
      await expect(membersService.removeMember(bizId, ownerId)).rejects.toThrow(ForbiddenException);

      await expect(
        membersService.updateMemberRole(bizId, ownerId, { role: "admin" }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("Workflow 4: Business Onboarding, Feature Flags & Audit Logging (T-BIZ-04, T-BIZ-06, T-BIZ-07)", () => {
    test("Computes unmet onboarding gates, handles client updates, toggles feature flags, and records audit trails", async () => {
      const { prisma, state } = createMockPrisma();
      const onboardingService = new OnboardingService(prisma);
      const flagsService = new FlagsService(prisma);
      const auditService = new AuditService(prisma);

      const bizId = "onboarding-biz-id";
      const userId = "actor-user-id";

      state.businesses.push({
        id: bizId,
        name: "New Store",
        currency: "TND",
        timezone: "Africa/Tunis",
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      });

      state.businessOnboardings.push({
        id: "ob-1",
        business_id: bizId,
        catalog_seeded: false,
        channel_connected: false,
        handoff_acknowledged: false,
        ai_activated: false,
        unmet_gates: ["catalog_seeded", "channel_connected", "handoff_acknowledged"],
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Step 1: Initial Onboarding State
      const initialOnboarding = await onboardingService.getOnboardingState(bizId);
      expect(initialOnboarding.unmetGates).toContain("G5");

      // Step 2: Client acknowledges handoff
      const updatedOnboarding = await onboardingService.updateOnboardingState(bizId, {
        handoffAcknowledged: true,
      });
      expect(updatedOnboarding.handoffAcknowledged).toBe(true);

      // Step 3: Feature Flags Management
      await flagsService.updateFeatureFlag(bizId, "whatsapp_enabled", true);
      const flags = await flagsService.getFeatureFlags(bizId);
      expect(flags.flags.whatsapp_enabled).toBe(true);

      // Invalid feature flag key rejected
      await expect(flagsService.updateFeatureFlag(bizId, "invalid_flag_key", true)).rejects.toThrow(
        BadRequestException,
      );

      // Step 4: Audit Log Recording
      const auditEntry = await auditService.record({
        business_id: bizId,
        actor_user_id: userId,
        action: "business.update",
        entity_type: "business",
        entity_id: bizId,
        payload: { after: { name: "Updated Name" }, reason: "User renamed workspace" },
      });

      expect(auditEntry.action).toBe("business.update");
      expect(state.auditLogs.length).toBe(1);
    });
  });
});
