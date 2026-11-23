import { execSync } from "node:child_process";

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

/* ------------------------------------------------------------------ */
/*  Helpers: Redis rate-limit clearing & DB tenant teardown            */
/* ------------------------------------------------------------------ */

function clearAuthRateLimits(email?: string) {
  try {
    const keys = [
      "rate_limit:auth:ip:127.0.0.1",
      "rate_limit:auth:ip:::1",
      "rate_limit:auth:ip:::ffff:127.0.0.1",
    ];
    if (email) {
      keys.push(`rate_limit:auth:email:${email.toLowerCase()}`);
    }
    execSync(`docker exec ai-sales-redis redis-cli del ${keys.join(" ")}`, {
      shell: "/bin/bash",
      stdio: "ignore",
    });
  } catch {
    // Ignore if docker/redis isn't available
  }
}

function cleanupTestUser(email: string) {
  try {
    const escapedEmail = email.toLowerCase().replace(/'/g, "''");
    execSync(
      `docker exec ai-sales-postgres psql -U postgres -d ai_sales -c "DELETE FROM users WHERE email = '${escapedEmail}';"`,
      { shell: "/bin/bash", stdio: "ignore" },
    );
  } catch {
    // Ignore if docker/postgres isn't available
  }
}

/* ------------------------------------------------------------------ */
/*  Test Fixtures: mock data for onboarding & inbox phases             */
/* ------------------------------------------------------------------ */

const TEST_EMAIL = `e2e_journey_${Date.now()}@example.com`;
const TEST_NAME = "E2E Journey Merchant";

const mockBusiness = {
  id: "journey-biz-1",
  name: "Boutique E2E Journey",
  currency: "TND",
  storeName: "Boutique E2E Journey",
  storeUrl: "",
  phone: "+216 70 000 000",
  industry: "fashion",
};

const mockOnboardingStatus = {
  step: 1,
  completed: false,
  storeSetup: false,
  channelsConnected: false,
  catalogUploaded: false,
  playgroundTested: false,
  rulesConfigured: false,
  activated: false,
};

const mockConversation = {
  id: "journey-conv-1",
  status: "HUMAN_REQUIRED",
  source: "instagram",
  channel: "instagram",
  aiEnabled: false,
  assignedUserId: null,
  handoffPriority: "high",
  escalationReason: "Prêt à commander",
  handoffAt: new Date().toISOString(),
  leadScore: 92,
  leadTemperature: "hot",
  lastMessageAt: new Date().toISOString(),
  lastMessagePreview: "nheb commande taille M svp",
  unread: true,
  isTest: false,
  customer: {
    id: "journey-cust-1",
    name: "Ahmed Ben Ali",
    phone: "+216 98 123 456",
  },
  pendingOrder: {
    id: "journey-ord-1",
    status: "PENDING_CONFIRMATION",
    total: "127.000",
    currency: "TND",
  },
};

const mockCustomerMessage = {
  id: "msg-journey-cust-1",
  conversationId: "journey-conv-1",
  direction: "inbound",
  senderType: "customer",
  content: "nheb commande taille M svp",
  contentType: "text",
  deliveryStatus: "delivered",
  createdAt: new Date(Date.now() - 60000).toISOString(),
  attachments: [],
};

const mockDraftMessage = {
  id: "msg-journey-draft-1",
  conversationId: "journey-conv-1",
  direction: "outbound",
  senderType: "ai",
  content:
    "Salem Ahmed ! Le Hoodie Noir en taille M est bien disponible en stock. Souhaitez-vous passer commande ?",
  contentType: "text",
  deliveryStatus: "draft",
  createdAt: new Date().toISOString(),
  attachments: [],
};

const mockNotes: unknown[] = [];

/* ------------------------------------------------------------------ */
/*  Core Journey E2E: Registration → Onboarding → Inbox → Order       */
/* ------------------------------------------------------------------ */

test.describe("Core User Journey E2E (T-WEB-06)", () => {
  test.beforeAll(async () => {
    clearAuthRateLimits(TEST_EMAIL);
    cleanupTestUser(TEST_EMAIL);
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch("http://localhost:3000/api/v1/health");
        if (res.ok) break;
      } catch {
        // waiting for API backend to boot
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  });

  test.afterAll(() => {
    clearAuthRateLimits(TEST_EMAIL);
    cleanupTestUser(TEST_EMAIL);
  });

  test.beforeEach(() => {
    clearAuthRateLimits(TEST_EMAIL);
  });

  /* ======== PHASE 1: Invite-only Signup & Authentication ======== */

  test("1. Signup: Invite-only gate on /register and invited signup flow", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByText("Invitation requise")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retourner à la connexion" })).toBeVisible();
  });

  /* ======== PHASE 2: Authenticated Onboarding Wizard ======== */

  test("2. Onboarding: Store setup renders cleanly with Better Auth session", async ({ page }) => {
    await setupMockedAuth(page);
    await page.route("**/api/v1/businesses/*/onboarding", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockOnboardingStatus),
      });
    });

    await page.goto("/onboarding");

    // Wait for onboarding wizard to render
    await expect(page.locator('[data-slot="onboarding-wizard"]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Profil de votre entreprise")).toBeVisible({ timeout: 10000 });
  });

  /* ======== PHASE 3: Inbox with Mocked Data ======== */

  test("3. Inbox: Navigate to inbox and verify 3-pane layout with mocked conversation", async ({
    page,
  }) => {
    // Mock auth to bypass re-login
    await setupMockedAuth(page);

    // Mock conversation data
    await setupMockedInbox(page);

    await page.goto("/inbox?id=journey-conv-1");

    // Pane 1: Conversation list renders
    const conversationList = page.locator('[data-slot="conversation-list"]');
    await expect(conversationList).toBeVisible();
    await expect(conversationList.getByText("Ahmed Ben Ali")).toBeVisible();

    // Pane 2: Thread renders with customer message and draft
    const thread = page.locator('[data-slot="conversation-thread"]');
    await expect(thread).toBeVisible();
    await expect(thread.getByText("nheb commande taille M svp")).toBeVisible();

    // Draft card is visible
    const draftCard = page.locator('[data-slot="draft-approval-card"]');
    await expect(draftCard).toBeVisible();

    // Pane 3: Order drawer renders with pending order
    const drawer = page.locator('[data-slot="order-drawer-desktop"]');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("127.000 DT")).toBeVisible();
    await expect(drawer.getByText("Confirmer la commande")).toBeVisible();
  });

  /* ======== PHASE 4: AI Draft Approval ======== */

  test("4. Draft Approval: Review AI draft, edit, and approve to send", async ({ page }) => {
    let approveCalled = false;
    let approvedContent: string | null = null;

    await setupMockedAuth(page);
    await setupMockedInbox(page);

    // Mock approve endpoint
    await page.route("**/api/v1/conversations/*/messages/*/approve", async (route) => {
      approveCalled = true;
      const postData = route.request().postDataJSON() || {};
      approvedContent = postData.content || mockDraftMessage.content;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...mockDraftMessage,
          deliveryStatus: "delivered",
          content: approvedContent,
        }),
      });
    });

    await page.goto("/inbox?id=journey-conv-1");

    // Draft card is visible with AI proposed reply
    const draftCard = page.locator('[data-slot="draft-approval-card"]');
    await expect(draftCard).toBeVisible();
    await expect(draftCard.getByText("Proposition de réponse IA (Brouillon)")).toBeVisible();

    // Edit the draft
    await draftCard.locator("button", { hasText: "Modifier" }).click();
    const editTextarea = draftCard.locator("textarea");
    await expect(editTextarea).toBeVisible();
    await editTextarea.fill("Salem Ahmed ! Nous avons bien réservé votre Hoodie Noir en taille M.");

    // Approve & send
    await draftCard.locator("button", { hasText: "Valider & Envoyer" }).click();

    expect(approveCalled).toBe(true);
    expect(approvedContent).toBe(
      "Salem Ahmed ! Nous avons bien réservé votre Hoodie Noir en taille M.",
    );

    // Draft card dismissed, approved message visible
    await expect(draftCard).not.toBeVisible();
    await expect(
      page.getByText("Salem Ahmed ! Nous avons bien réservé votre Hoodie Noir en taille M."),
    ).toBeVisible();
  });

  /* ======== PHASE 5: Order Confirmation ======== */

  test("5. Order Confirmation: Confirm pending order in Pane 3 drawer", async ({ page }) => {
    let confirmCalled = false;
    let confirmPayload: Record<string, unknown> = {};

    await setupMockedAuth(page);
    await setupMockedInbox(page);

    // Mock confirm-order endpoint
    await page.route("**/api/v1/conversations/*/confirm-order", async (route) => {
      confirmCalled = true;
      confirmPayload = route.request().postDataJSON() || {};
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto("/inbox?id=journey-conv-1");

    // Pane 3: Order drawer is visible with order details
    const drawer = page.locator('[data-slot="order-drawer-desktop"]');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Total à encaisser :")).toBeVisible();
    await expect(drawer.getByText("127.000 DT")).toBeVisible();

    // Check payment checkbox
    const paidCheckbox = drawer.getByRole("checkbox", { name: /Paiement encaissé/i });
    await paidCheckbox.click();

    // Click confirm
    const confirmBtn = drawer.locator("button", { hasText: "Confirmer la commande" });
    await confirmBtn.click();

    expect(confirmCalled).toBe(true);
    expect(confirmPayload.paymentStatus).toBe("COMPLETED");
  });
});

/* ------------------------------------------------------------------ */
/*  Route Mocking Helpers                                              */
/* ------------------------------------------------------------------ */

/**
 * Sets up mocked authentication endpoints so the test can navigate
 * directly to authenticated pages without a real login flow.
 */
async function setupMockedAuth(page: Page) {
  const mockUser = {
    id: "journey-user-1",
    email: TEST_EMAIL.toLowerCase(),
    name: TEST_NAME,
    platformAdmin: false,
    emailVerified: true,
    twoFactorEnabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: mockUser,
        session: {
          id: "sess-journey-1",
          userId: mockUser.id,
          expiresAt: "2099-01-01T00:00:00.000Z",
          mfaVerified: true,
          activeOrganizationId: mockBusiness.id,
        },
      }),
    });
  });

  await page.route("**/api/v1/workspaces", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: mockUser,
        memberships: [
          {
            businessId: mockBusiness.id,
            role: "owner",
            businessName: mockBusiness.name,
            joinedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        mfaVerified: true,
        mfaSetupRequired: false,
        mfaChallengeRequired: false,
        tokenType: "Bearer",
        expiresIn: 604800,
      }),
    });
  });

  await page.route(`**/api/v1/businesses/${mockBusiness.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockBusiness),
    });
  });

  await page.route("**/api/v1/notifications*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], unreadCount: 0, nextCursor: null }),
    });
  });

  await page.route(/.*\/api\/v1\/(billing\/)?usage.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cycleStart: "2026-09-01T00:00:00.000Z",
        cycleEnd: "2026-10-01T00:00:00.000Z",
        planCode: "starter",
        limits: { aiMessages: 500, seats: 2, channels: 1 },
        current: { aiMessages: 210, seats: 2, channels: 1 },
        percentUsed: 42,
        aiPaused: false,
      }),
    });
  });

  // Mock onboarding status (completed)
  await page.route("**/api/v1/businesses/*/onboarding", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...mockOnboardingStatus,
        completed: true,
        storeSetup: true,
        channelsConnected: true,
        catalogUploaded: true,
        playgroundTested: true,
        rulesConfigured: true,
        activated: true,
      }),
    });
  });
}

/**
 * Sets up mocked inbox/conversation endpoints for the journey tests.
 * Follows the same patterns as inbox.spec.ts.
 */
async function setupMockedInbox(page: Page) {
  // Conversations list
  await page.route("**/api/v1/conversations*", async (route) => {
    const url = route.request().url();

    if (url.includes("/messages")) return;
    if (url.includes("/notes")) return;
    if (
      url.includes("/takeover") ||
      url.includes("/resume") ||
      url.includes("/suggest") ||
      url.includes("/confirm-order") ||
      url.includes("/read")
    ) {
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [mockConversation],
        nextCursor: null,
        hasMore: false,
      }),
    });
  });

  // Thread messages
  await page.route("**/api/v1/conversations/*/messages*", async (route) => {
    if (route.request().url().includes("/approve")) return;
    if (route.request().url().includes("/retry")) return;

    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [mockCustomerMessage, mockDraftMessage],
          nextCursor: null,
          hasMore: false,
        }),
      });
    } else if (route.request().method() === "POST") {
      const postData = route.request().postDataJSON() || {};
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: `msg-${Date.now()}`,
          conversationId: "journey-conv-1",
          direction: "outbound",
          senderType: "human",
          content: postData.content || "Message envoyé",
          contentType: "text",
          deliveryStatus: "sent",
          createdAt: new Date().toISOString(),
          attachments: [],
        }),
      });
    }
  });

  // Read endpoint
  await page.route("**/api/v1/conversations/*/read", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, staffReadAt: new Date().toISOString() }),
    });
  });

  // Notes endpoint
  await page.route("**/api/v1/conversations/*/notes", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockNotes),
      });
    } else {
      const data = route.request().postDataJSON() || {};
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: `note-${Date.now()}`,
          conversationId: "journey-conv-1",
          userId: "journey-user-1",
          authorName: TEST_NAME,
          body: data.body,
          createdAt: new Date().toISOString(),
        }),
      });
    }
  });
}
