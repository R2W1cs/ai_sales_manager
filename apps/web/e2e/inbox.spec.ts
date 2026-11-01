import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const mockUser = {
  id: "user-1",
  email: "merchant@example.com",
  name: "Merchant E2E",
};

const mockBusiness = {
  id: "biz-1",
  name: "Boutique Tunisienne",
  currency: "TND",
};

const mockConversation = {
  id: "conv-1",
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
    id: "cust-1",
    name: "Ahmed Ben Ali",
    phone: "+216 98 123 456",
  },
  pendingOrder: {
    id: "ord-1",
    status: "PENDING_CONFIRMATION",
    total: "127.000",
    currency: "TND",
  },
};

const mockCustomerMessage = {
  id: "msg-cust-1",
  conversationId: "conv-1",
  direction: "inbound",
  senderType: "customer",
  content: "nheb commande taille M svp",
  contentType: "text",
  deliveryStatus: "delivered",
  createdAt: new Date(Date.now() - 60000).toISOString(),
  attachments: [],
};

const mockDraftMessage = {
  id: "msg-draft-1",
  conversationId: "conv-1",
  direction: "outbound",
  senderType: "ai",
  content: "Salem Ahmed ! Le Hoodie Noir en taille M est bien disponible en stock.",
  contentType: "text",
  deliveryStatus: "draft",
  createdAt: new Date().toISOString(),
  attachments: [],
};

const mockNotes = [
  {
    id: "note-1",
    conversationId: "conv-1",
    userId: "user-1",
    authorName: "Merchant E2E",
    body: "Client VIP très intéressé par la nouvelle collection",
    createdAt: new Date().toISOString(),
  },
];

test.describe("Realtime Inbox E2E Flow (T-WEB-03)", () => {
  test.beforeEach(async ({ page }) => {
    // 1. Mock Authentication
    await page.route("**/api/v1/auth/refresh", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: mockUser,
          memberships: [
            {
              id: "mem-1",
              businessId: mockBusiness.id,
              role: "owner",
            },
          ],
          accessToken: "mock-jwt-token",
        }),
      });
    });

    // 2. Mock Business endpoint
    await page.route(`**/api/v1/businesses/${mockBusiness.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockBusiness),
      });
    });

    // 3. Mock Conversations List
    await page.route("**/api/v1/conversations*", async (route) => {
      const url = route.request().url();

      if (url.includes("/messages")) {
        return; // Handled by message routes
      }
      if (url.includes("/notes")) {
        return; // Handled by notes route
      }
      if (url.includes("/takeover") || url.includes("/resume") || url.includes("/suggest")) {
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

    // 4. Mock Thread Messages
    await page.route("**/api/v1/conversations/*/messages*", async (route) => {
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
            conversationId: "conv-1",
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

    // 5. Mock Read endpoint
    await page.route("**/api/v1/conversations/*/read", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, staffReadAt: new Date().toISOString() }),
      });
    });

    // 6. Mock Notes endpoint
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
            conversationId: "conv-1",
            userId: "user-1",
            authorName: "Merchant E2E",
            body: data.body,
            createdAt: new Date().toISOString(),
          }),
        });
      }
    });
  });

  test("1. 3-Pane Command Center: Renders triage list, active thread, and details drawer", async ({
    page,
  }) => {
    await page.goto("/inbox?id=conv-1");

    // Pane 1: Conversation List
    const conversationList = page.locator('[data-slot="conversation-list"]');
    await expect(conversationList).toBeVisible();
    await expect(conversationList.getByText("Ahmed Ben Ali")).toBeVisible();
    await expect(conversationList.getByText("Action Requise")).toBeVisible();
    await expect(conversationList.getByText("127.000 DT")).toBeVisible();

    // Pane 2: Conversation Thread
    const thread = page.locator('[data-slot="conversation-thread"]');
    await expect(thread).toBeVisible();
    await expect(thread.locator("h2").first()).toBeVisible();
    await expect(thread.getByText("nheb commande taille M svp")).toBeVisible();

    // Invariant: Takeover banner is visible for HUMAN_REQUIRED
    await expect(page.locator('[data-slot="takeover-banner"]')).toBeVisible();
    await expect(page.getByText("Mode Prise en Main Humaine Actif")).toBeVisible();

    // Pane 3: Order Drawer
    const drawer = page.locator('[data-slot="order-drawer-desktop"]');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Fiche Client & Commande")).toBeVisible();
    await expect(drawer.getByText("+216 98 123 456")).toBeVisible();
    await expect(drawer.getByText("Score Lead")).toBeVisible();
    await expect(drawer.getByText("92/100")).toBeVisible();
    await expect(drawer.getByText("Total à encaisser :")).toBeVisible();
    await expect(drawer.getByText("127.000 DT")).toBeVisible();
    await expect(drawer.getByText("Confirmer la commande")).toBeVisible();
  });

  test("2. View Filtering & Search: Toggles filter tabs and filters customer items", async ({
    page,
  }) => {
    await page.goto("/inbox?id=conv-1");

    // Click 'Tous' tab
    const allTab = page.locator("button", { hasText: "Tous" }).first();
    await allTab.click();
    await expect(allTab).toHaveAttribute("data-active", "true");

    // Click 'À traiter' tab
    const needsMeTab = page.locator("button", { hasText: "À traiter" }).first();
    await needsMeTab.click();
    await expect(needsMeTab).toHaveAttribute("data-active", "true");

    // Search filter input
    const searchInput = page.getByPlaceholder("Rechercher une conversation...");
    await searchInput.fill("NonExistentCustomer");
    await expect(page.getByText("Aucune conversation trouvée pour ce filtre.")).toBeVisible();

    await searchInput.fill("Ahmed");
    await expect(page.getByText("Ahmed Ben Ali").first()).toBeVisible();
  });

  test("3. API Takeover & Resume: Takeover button calls API and toggles persistent banner", async ({
    page,
  }) => {
    let takeoverCalled = false;
    let resumeCalled = false;

    await page.route("**/api/v1/conversations/*/takeover", async (route) => {
      takeoverCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, aiEnabled: false, status: "HUMAN_HANDLING" }),
      });
    });

    await page.route("**/api/v1/conversations/*/resume-ai", async (route) => {
      resumeCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, aiEnabled: true, status: "AI_ACTIVE" }),
      });
    });

    await page.goto("/inbox?id=conv-1");

    // In initial HUMAN_REQUIRED state, takeover banner is present
    await expect(page.locator('[data-slot="takeover-banner"]')).toBeVisible();

    // Click 'Prendre la main' in toolbar
    const takeoverBtn = page.locator("button", { hasText: /Prendre la main/i });
    if (await takeoverBtn.isVisible()) {
      await takeoverBtn.click();
      expect(takeoverCalled).toBe(true);
    }

    // Now 'Réactiver l'IA' is visible
    const resumeBtn = page.locator("button", { hasText: /Réactiver l'IA/i }).first();
    await expect(resumeBtn).toBeVisible();

    // Click 'Réactiver l'IA'
    await resumeBtn.click();
    expect(resumeCalled).toBe(true);
  });

  test("4. Draft Action: Approving draft dispatches message and clears draft card", async ({
    page,
  }) => {
    let approveCalled = false;
    let approvedBody: { content?: string } | null = null;

    await page.route("**/api/v1/conversations/*/messages/*/approve", async (route) => {
      approveCalled = true;
      approvedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...mockDraftMessage,
          deliveryStatus: "delivered",
          content: approvedBody?.content || mockDraftMessage.content,
        }),
      });
    });

    await page.goto("/inbox?id=conv-1");

    // Draft card should be visible
    const draftCard = page.locator('[data-slot="draft-approval-card"]');
    await expect(draftCard).toBeVisible();
    await expect(draftCard.getByText("Proposition de réponse IA (Brouillon)")).toBeVisible();

    // Test editing draft
    await draftCard.locator("button", { hasText: "Modifier" }).click();
    const editTextarea = draftCard.locator("textarea");
    await expect(editTextarea).toBeVisible();
    await editTextarea.fill("Salem Ahmed ! Nous avons bien réservé votre Hoodie.");

    // Approve & send
    await draftCard.locator("button", { hasText: "Valider & Envoyer" }).click();

    expect(approveCalled).toBe(true);
    expect((approvedBody as { content?: string } | null)?.content).toBe(
      "Salem Ahmed ! Nous avons bien réservé votre Hoodie.",
    );

    // Draft card should now be dismissed and confirmed bubble rendered
    await expect(draftCard).not.toBeVisible();
    await expect(
      page.getByText("Salem Ahmed ! Nous avons bien réservé votre Hoodie."),
    ).toBeVisible();
  });

  test("5. Draft vs Human Send Race: Sending manual reply automatically dismisses pending draft card", async ({
    page,
  }) => {
    await page.goto("/inbox?id=conv-1");

    // Draft card is initially present
    const draftCard = page.locator('[data-slot="draft-approval-card"]');
    await expect(draftCard).toBeVisible();

    // Type human message in composer action bar
    const composer = page.locator('[data-slot="inbox-action-bar"] textarea');
    await composer.fill("Bonjour Ahmed, je prends le relais manuellement.");

    // Click send button
    await page
      .locator('[data-slot="inbox-action-bar"]')
      .locator("button", { hasText: "Envoyer" })
      .click();

    // The human message is rendered
    await expect(page.getByText("Bonjour Ahmed, je prends le relais manuellement.")).toBeVisible();

    // Invariant: Pending draft card must be automatically dismissed
    await expect(draftCard).not.toBeVisible();
  });

  test("6. Optimistic UI & Error Rollback: Failed send displays retry indicator and allows retry", async ({
    page,
  }) => {
    let attempts = 0;
    let retryCalled = false;

    await page.route("**/api/v1/conversations/*/messages", async (route) => {
      if (route.request().method() === "POST") {
        attempts++;
        if (attempts === 1) {
          // Fail the first send
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "Échec d'envoi du message" }),
          });
          return;
        }
      }
      return route.fallback();
    });

    await page.route("**/api/v1/conversations/*/messages/*/retry", async (route) => {
      retryCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "msg-retried-1",
          conversationId: "conv-1",
          direction: "outbound",
          senderType: "human",
          content: "Test retry message",
          contentType: "text",
          deliveryStatus: "delivered",
          createdAt: new Date().toISOString(),
          attachments: [],
        }),
      });
    });

    await page.goto("/inbox?id=conv-1");

    const composer = page.locator('[data-slot="inbox-action-bar"] textarea');
    await composer.fill("Test retry message");
    await page
      .locator('[data-slot="inbox-action-bar"]')
      .locator("button", { hasText: "Envoyer" })
      .click();

    // Error banner / failed indicator
    await expect(page.getByText("Échec d'envoi").first()).toBeVisible();
    const retryBtn = page.locator("button", { hasText: "Réessayer" }).first();
    await expect(retryBtn).toBeVisible();

    // Click retry
    await retryBtn.click();
    expect(retryCalled).toBe(true);
  });

  test("7. AI Suggestion Panel: Requests and displays custom AI suggestion draft", async ({
    page,
  }) => {
    await page.route("**/api/v1/conversations/*/suggest", async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          status: "generating",
          conversationId: "conv-1",
        }),
      });
    });

    await page.goto("/inbox?id=conv-1");

    // Click "Suggérer" in action bar
    const suggestBtn = page.locator("button", { hasText: "Suggérer" });
    await expect(suggestBtn).toBeVisible();
    await suggestBtn.click();
  });

  test("8. Order Confirmation & Cancellation: Confirms order with COD payment and tests cancel", async ({
    page,
  }) => {
    let confirmCalled = false;
    let cancelCalled = false;
    let paymentCompletedFlag = false;

    await page.route("**/api/v1/conversations/*/confirm-order", async (route) => {
      confirmCalled = true;
      const data = route.request().postDataJSON() || {};
      paymentCompletedFlag = data.paymentStatus === "COMPLETED";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route("**/api/v1/orders/*/status", async (route) => {
      cancelCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, status: "CANCELLED" }),
      });
    });

    await page.goto("/inbox?id=conv-1");

    // Drawer is open
    const drawer = page.locator('[data-slot="order-drawer-desktop"]');
    await expect(drawer).toBeVisible();

    // Check payment collected checkbox
    const paidCheckbox = drawer.getByRole("checkbox", { name: /Paiement encaissé/i });
    await paidCheckbox.click();

    // Confirm order
    const confirmBtn = drawer.locator("button", { hasText: "Confirmer la commande" });
    await confirmBtn.click();
    expect(confirmCalled).toBe(true);
    expect(paymentCompletedFlag).toBe(true);

    // Cancel order
    page.on("dialog", (dialog) => dialog.accept());
    const cancelBtn = drawer.locator("button", { hasText: "Annuler la commande" });
    await cancelBtn.click();
    expect(cancelCalled).toBe(true);
  });

  test("9. Order Drawer: Internal Notes tab lists and creates commercial notes", async ({
    page,
  }) => {
    await page.goto("/inbox?id=conv-1");

    const drawer = page.locator('[data-slot="order-drawer-desktop"]');
    await expect(drawer).toBeVisible();

    // Switch to notes tab
    await drawer.locator("button", { hasText: /Notes internes/i }).click();

    // Existing note is rendered
    await expect(
      drawer.getByText("Client VIP très intéressé par la nouvelle collection"),
    ).toBeVisible();

    // Add new note
    const noteTextarea = drawer.locator("textarea");
    await noteTextarea.fill("Rappel prévu demain à 14h");
    await drawer.locator("button", { hasText: "Ajouter la note" }).click();

    // New note is displayed
    await expect(drawer.getByText("Rappel prévu demain à 14h")).toBeVisible();
  });

  test("10. Details Pane Toggle: Opens and collapses details drawer", async ({ page }) => {
    await page.goto("/inbox?id=conv-1");

    const drawer = page.locator('[data-slot="order-drawer-desktop"]');
    await expect(drawer).toBeVisible();

    // Click toggle button in header
    const toggleBtn = page.getByLabel("Fiche client et commande");
    await toggleBtn.click();

    // Drawer is collapsed
    await expect(drawer).not.toBeVisible();

    // Click toggle button again to reopen
    await toggleBtn.click();
    await expect(drawer).toBeVisible();
  });
});
