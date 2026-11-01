import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const mockOwnerUser = {
  id: "user-owner-1",
  email: "owner@moufid.ai",
  name: "Boutique Owner",
};

const mockAdminUser = {
  id: "user-admin-1",
  email: "admin@moufid.ai",
  name: "Boutique Admin",
};

const mockEmployeeUser = {
  id: "user-emp-1",
  email: "employee@moufid.ai",
  name: "Boutique Employee",
};

const mockBusiness = {
  id: "biz-e2e-1",
  name: "Maison Alyssa",
  currency: "TND",
};

const mockAgent = {
  id: "agent-e2e-1",
  businessId: mockBusiness.id,
  name: "Alyssa",
  language: "ar",
  tone: "Chaleureux & Commercial",
  confidenceThreshold: 0.7,
  greetingTemplate: "Salem marhba bik",
  fallbackTemplate: "Je transmets votre demande",
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockAiSettings = {
  businessId: mockBusiness.id,
  modelPrimary: "gemini-3.5-flash",
  modelFallback: "gpt-5.6-terra",
  maxTokens: 1000,
  temperature: 0.7,
  ragTopK: 5,
  includeProductImagesInContext: true,
  blockedTopics: [],
  customSystemAppend: null,
  replyMode: "approval_required",
  leadHotMin: 80,
  leadWarmMin: 50,
  reservationTtlMinutes: 30,
  inactivityCloseDays: 7,
  monthlyAiBudgetUsd: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockChannels = [
  {
    id: "chan-ig-1",
    channel: "instagram",
    status: "active",
    displayName: "maison.alyssa",
    externalAccountId: "ig_987654321",
  },
  {
    id: "chan-ms-1",
    channel: "messenger",
    status: "disconnected",
    externalAccountId: "fb_123456789",
  },
];

const mockBusinessRules = [
  {
    id: "rule-del-1",
    ruleType: "delivery",
    payload: {
      zones: [{ name: "Toute la Tunisie", fee: 7, currency: "TND", eta_hours: 48 }],
    },
    enabled: true,
  },
  {
    id: "rule-free-1",
    ruleType: "free_shipping",
    payload: { threshold: 150, currency: "TND" },
    enabled: true,
  },
  {
    id: "rule-pay-1",
    ruleType: "payment",
    payload: {
      methods: [{ code: "cod", label: "Cash on Delivery" }],
    },
    enabled: true,
  },
  {
    id: "rule-ret-1",
    ruleType: "returns",
    payload: { window_days: 7, conditions: "Articles non portés avec étiquette" },
    enabled: true,
  },
];

const mockMembers = [
  {
    id: "mem-1",
    userId: "user-owner-1",
    email: "owner@moufid.ai",
    name: "Boutique Owner",
    role: "owner",
    createdAt: new Date().toISOString(),
  },
  {
    id: "mem-2",
    userId: "user-agent-1",
    email: "agent1@moufid.ai",
    name: "Sonia Commerciale",
    role: "employee",
    createdAt: new Date().toISOString(),
  },
];

const mockInvitations = [
  {
    id: "inv-1",
    email: "pending-agent@moufid.ai",
    role: "employee",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
  },
];

const mockBillingUsage = {
  cycleStart: "2026-09-01T00:00:00.000Z",
  cycleEnd: "2026-10-01T00:00:00.000Z",
  planCode: "starter",
  limits: {
    aiMessages: 500,
    seats: 2,
    channels: 1,
  },
  current: {
    aiMessages: 210,
    seats: 2,
    channels: 1,
  },
  percentUsed: 42,
  aiPaused: false,
};

const mockPlans = [
  {
    code: "starter",
    name: "Starter",
    limits: { seats: 2, channel_accounts: 1, ai_messages_per_month: 500 },
  },
  {
    code: "growth",
    name: "Growth",
    limits: { seats: 5, channel_accounts: 3, ai_messages_per_month: 3000 },
  },
  {
    code: "scale",
    name: "Scale",
    limits: { seats: 15, channel_accounts: 10, ai_messages_per_month: 15000 },
  },
];

test.describe("Admin Settings Flows & Governance (T-WEB-10)", () => {
  const setupMocks = async (page: any, role: "owner" | "admin" | "employee" = "owner") => {
    const user =
      role === "owner" ? mockOwnerUser : role === "admin" ? mockAdminUser : mockEmployeeUser;

    // 1. Auth Refresh
    await page.route("**/api/v1/auth/refresh", async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user,
          memberships: [
            {
              id: `mem-${role}-1`,
              businessId: mockBusiness.id,
              role,
            },
          ],
          accessToken: "mock-jwt-settings-token",
        }),
      });
    });

    // 2. Business details
    await page.route(`**/api/v1/businesses/${mockBusiness.id}`, async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockBusiness),
      });
    });

    // 3. AI Agents
    await page.route("**/api/v1/ai/agents", async (route: any) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([mockAgent]),
        });
      } else {
        await route.fallback();
      }
    });

    await page.route(`**/api/v1/ai/agents/${mockAgent.id}`, async (route: any) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...mockAgent, ...JSON.parse(route.request().postData() || "{}") }),
        });
      } else {
        await route.fallback();
      }
    });

    // 4. AI Settings
    await page.route("**/api/v1/ai/settings", async (route: any) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockAiSettings),
        });
      } else if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...mockAiSettings,
            ...JSON.parse(route.request().postData() || "{}"),
          }),
        });
      } else {
        await route.fallback();
      }
    });

    // 5. Integrations
    await page.route("**/api/v1/integrations", async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockChannels),
      });
    });

    // 6. Business rules
    await page.route("**/api/v1/business-rules*", async (route: any) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockBusinessRules),
        });
      } else if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: `rule-new-${Date.now()}`,
            ...JSON.parse(route.request().postData() || "{}"),
          }),
        });
      } else {
        await route.fallback();
      }
    });

    // 7. Members & Invitations
    await page.route(`**/api/v1/businesses/${mockBusiness.id}/members`, async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockMembers),
      });
    });

    await page.route(`**/api/v1/businesses/${mockBusiness.id}/invitations`, async (route: any) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockInvitations),
        });
      } else if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: `inv-${Date.now()}`,
            email: body.email,
            role: body.role,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            createdAt: new Date().toISOString(),
          }),
        });
      } else {
        await route.fallback();
      }
    });

    // 8. Billing
    await page.route(/.*\/api\/v1\/(billing\/)?usage.*/, async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockBillingUsage),
      });
    });

    await page.route("**/api/v1/billing/plans", async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockPlans),
      });
    });

    // Fallback for inbox/conversations
    await page.route("**/api/v1/conversations*", async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversations: [], nextCursor: null, totalCount: 0 }),
      });
    });
  };

  test("Settings Tabs: Owner can view all 5 tabs and navigate via URL hashes", async ({ page }) => {
    await setupMocks(page, "owner");

    await page.goto("/settings");
    await page.waitForSelector('[data-testid="settings-page"]', { timeout: 10000 });

    // Verify all 5 tab triggers exist
    await expect(page.locator('[data-testid="tab-trigger-personality"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-trigger-channels"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-trigger-rules"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-trigger-team"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-trigger-billing"]')).toBeVisible();

    // Switch to Channels
    await page.locator('[data-testid="tab-trigger-channels"]').click();
    expect(page.url()).toContain("#channels");
    await expect(page.locator('[data-testid="settings-channels-tab"]')).toBeVisible();

    // Switch to Rules
    await page.locator('[data-testid="tab-trigger-rules"]').click();
    expect(page.url()).toContain("#rules");
    await expect(page.locator('[data-testid="settings-rules-form"]')).toBeVisible();

    // Switch to Team
    await page.locator('[data-testid="tab-trigger-team"]').click();
    expect(page.url()).toContain("#team");
    await expect(page.locator('[data-testid="settings-team-tab"]')).toBeVisible();

    // Switch to Billing
    await page.locator('[data-testid="tab-trigger-billing"]').click();
    expect(page.url()).toContain("#billing");
    await expect(page.locator('[data-testid="settings-billing-tab"]')).toBeVisible();
  });

  test("Settings Personality Tab: Owner can update agent personality and save", async ({
    page,
  }) => {
    await setupMocks(page, "owner");

    await page.goto("/settings#personality");
    await page.waitForSelector('[data-testid="settings-personality-form"]', { timeout: 10000 });

    const nameInput = page.locator('[data-testid="agent-name-input"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Maison Alyssa AI");

    const saveButton = page.locator('[data-testid="save-personality-button"]');
    await saveButton.click();

    // Expect success feedback
    await expect(page.locator("text=Configuration de l'agent enregistrée avec succès")).toBeVisible(
      {
        timeout: 5000,
      },
    );
  });

  test("Settings Team Tab: Owner can invite a new team member", async ({ page }) => {
    await setupMocks(page, "owner");

    await page.goto("/settings#team");
    await page.waitForSelector('[data-testid="settings-team-tab"]', { timeout: 10000 });

    // Check existing members table
    const membersTable = page.locator('[data-testid="members-table"]');
    await expect(membersTable).toBeVisible();
    await expect(membersTable.getByText("Boutique Owner")).toBeVisible();
    await expect(membersTable.getByText("Sonia Commerciale")).toBeVisible();

    // Open invite dialog
    const inviteButton = page.locator('[data-testid="invite-member-button"]');
    await inviteButton.click();

    await expect(page.locator('[data-testid="invite-dialog-popup"]')).toBeVisible();

    // Fill form
    await page
      .locator('[data-testid="invite-email-input"]')
      .fill("nouveau.collaborateur@moufid.ai");
    await page.locator('[data-testid="invite-role-select"]').selectOption("employee");

    // Submit
    await page.locator('[data-testid="send-invite-button"]').click();

    // Dialog closes and success message shows
    await expect(page.locator('[data-testid="invite-dialog-popup"]')).not.toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("text=Invitation envoyée avec succès")).toBeVisible();
  });

  test("Settings Billing Tab: Owner can view quotas and open upgrade modal", async ({ page }) => {
    await setupMocks(page, "owner");

    await page.goto("/settings#billing");
    await page.waitForSelector('[data-testid="settings-billing-tab"]', { timeout: 10000 });

    // Verify current plan and quotas
    const currentPlanCard = page.locator('[data-testid="current-plan-card"]');
    await expect(currentPlanCard).toBeVisible();
    await expect(page.locator('[data-testid="quota-progress-bars"]')).toBeVisible();
    await expect(currentPlanCard.getByText("starter")).toBeVisible();

    // Click upgrade button
    const upgradeButton = page.locator('[data-testid="upgrade-plan-button"]');
    await upgradeButton.click();

    // Verify upgrade modal
    await expect(page.locator('[data-testid="upgrade-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="contact-sales-button"]')).toBeVisible();
  });

  test("RBAC View Guard: Employee visiting /settings redirects to /inbox", async ({ page }) => {
    await setupMocks(page, "employee");

    await page.goto("/settings");
    // Should be redirected away from /settings to /inbox
    await page.waitForURL("**/inbox", { timeout: 10000 });
    expect(page.url()).toContain("/inbox");
  });

  test("RBAC Invariant: Admin cannot see the Billing tab", async ({ page }) => {
    await setupMocks(page, "admin");

    await page.goto("/settings");
    await page.waitForSelector('[data-testid="settings-page"]', { timeout: 10000 });

    // Personality, Channels, Rules, Team are visible
    await expect(page.locator('[data-testid="tab-trigger-personality"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-trigger-channels"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-trigger-rules"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-trigger-team"]')).toBeVisible();

    // Billing tab is strictly hidden
    await expect(page.locator('[data-testid="tab-trigger-billing"]')).toHaveCount(0);
  });

  test("Settings Rules Tab: Owner can view rules form, verify no skeleton hang, and save rules", async ({
    page,
  }) => {
    await setupMocks(page, "owner");

    // Test that grouped object response from GET /api/v1/business-rules works without hanging on skeletons
    await page.route("**/api/v1/business-rules*", async (route: any) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            delivery: {
              id: "rule-del-1",
              ruleType: "delivery",
              payload: {
                zones: [{ name: "Toute la Tunisie", fee: 8, currency: "TND", eta_hours: 24 }],
              },
              enabled: true,
            },
            free_shipping: {
              id: "rule-free-1",
              ruleType: "free_shipping",
              payload: { threshold: 120, currency: "TND" },
              enabled: true,
            },
          }),
        });
      } else if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: `rule-new-${Date.now()}`,
            ...JSON.parse(route.request().postData() || "{}"),
          }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto("/settings#rules");
    await page.waitForSelector('[data-testid="settings-rules-form"]', { timeout: 10000 });

    // Ensure skeletons are not present and form is visible
    await expect(page.locator('[data-testid="settings-rules-loading"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="settings-rules-form"]')).toBeVisible();

    const deliveryFeeInput = page.locator('[data-testid="delivery-fee-input"]');
    await expect(deliveryFeeInput).toBeVisible();
    await expect(deliveryFeeInput).toHaveValue("8");

    const freeShippingInput = page.locator('[data-testid="free-shipping-input"]');
    await expect(freeShippingInput).toBeVisible();
    await expect(freeShippingInput).toHaveValue("120");

    // Save rules
    const saveButton = page.locator('[data-testid="save-rules-button"]');
    await saveButton.click();

    // Expect success feedback
    await expect(page.locator("text=Règles commerciales enregistrées avec succès")).toBeVisible({
      timeout: 5000,
    });
  });
});
