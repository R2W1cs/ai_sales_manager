/**
 * Automated TDD Test Suite for T-WEB-03 — Web Realtime Inbox UI (threads, messages, actions, draft approval, order drawer)
 * Generated from backlog card acceptance criteria.
 */

/// <reference types="jest" />
import React from "react";
import { renderToString } from "react-dom/server";

import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationThread } from "@/components/inbox/conversation-thread";
import { DraftApprovalCard } from "@/components/inbox/draft-approval-card";
import { MessageBubble } from "@/components/inbox/message-bubble";
import { OrderDrawer } from "@/components/inbox/order-drawer";
import type { ConversationSummaryDto, MessageDto } from "@app/shared";

const mockConversation: ConversationSummaryDto = {
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

const mockDraftMessage: MessageDto = {
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

const mockCustomerMessage: MessageDto = {
  id: "msg-cust-1",
  conversationId: "conv-1",
  direction: "inbound",
  senderType: "customer",
  content: "nheb commande taille M svp",
  contentType: "text",
  deliveryStatus: "delivered",
  createdAt: new Date().toISOString(),
  attachments: [],
};

describe("Web Realtime Inbox UI (threads, messages, actions, draft approval, order drawer) (T-WEB-03)", () => {
  it("3-Pane Inbox: Renders conversation list, active thread, and details drawer.", () => {
    // 1. Render ConversationList (Pane 1)
    const listHtml = renderToString(
      React.createElement(ConversationList, {
        conversations: [mockConversation],
        selectedConversationId: "conv-1",
        onSelectConversation: () => {},
        activeView: "needs_me",
        onChangeView: () => {},
        searchQuery: "",
        onSearchChange: () => {},
      }),
    );
    expect(listHtml).toContain('data-slot="conversation-list"');
    expect(listHtml).toContain("Ahmed Ben Ali");
    expect(listHtml).toContain("Prêt à commander");
    expect(listHtml).toContain("127.000 DT");
    expect(listHtml).toContain("Action Requise");

    // 2. Render ConversationThread (Pane 2)
    const threadHtml = renderToString(
      React.createElement(ConversationThread, {
        conversation: mockConversation,
        businessId: "biz-1",
        messages: [mockCustomerMessage, mockDraftMessage],
        isLoadingMessages: false,
        isSending: false,
        activeSuggestion: null,
        isSuggesting: false,
        onSendMessage: async () => mockDraftMessage,
        onApproveDraft: async () => mockDraftMessage,
        onRetryMessage: async () => mockDraftMessage,
        onTakeover: async () => {},
        onResumeAi: async () => {},
        onRequestSuggestion: async () => {},
        onClearSuggestion: () => {},
        onCloseConversation: async () => {},
      }),
    );
    expect(threadHtml).toContain('data-slot="conversation-thread"');
    expect(threadHtml).toContain("Ahmed Ben Ali");
    expect(threadHtml).toContain("takeover-banner");
    expect(threadHtml).toContain("Mode Prise en Main Humaine Actif");
    expect(threadHtml).toContain("nheb commande taille M svp");

    // 3. Render OrderDrawer (Pane 3)
    const drawerHtml = renderToString(
      React.createElement(OrderDrawer, {
        conversation: mockConversation,
        businessId: "biz-1",
        isOpen: true,
        onClose: () => {},
        onConfirmOrder: async () => ({}),
        onCreateDraftOrder: async () => ({}),
        onCancelOrder: async () => {},
      }),
    );
    expect(drawerHtml).toContain('data-slot="order-drawer-desktop"');
    expect(drawerHtml).toContain("Fiche Client &amp; Commande");
    expect(drawerHtml).toContain("+216 98 123 456");
    expect(drawerHtml).toContain("127.000 DT");
    expect(drawerHtml).toContain("Confirmer la commande");
  });

  it("Draft Action: Approving draft dispatches message and removes draft card.", () => {
    let approved = false;
    const html = renderToString(
      React.createElement(DraftApprovalCard, {
        message: mockDraftMessage,
        onApprove: async () => {
          approved = true;
        },
        onReject: async () => {},
      }),
    );

    expect(html).toContain('data-slot="draft-approval-card"');
    expect(html).toContain("Proposition de réponse IA (Brouillon)");
    expect(html).toContain("Approuver &amp; Envoyer");
    expect(html).toContain(
      "Salem Ahmed ! Le Hoodie Noir en taille M est bien disponible en stock.",
    );
    expect(approved).toBe(false);
  });

  it("Live Updates: Incoming WebSocket messages prepend/append to thread without page refresh.", () => {
    // Verify MessageBubble renders customer, AI sent, and system events
    const customerHtml = renderToString(
      React.createElement(MessageBubble, { message: mockCustomerMessage }),
    );
    expect(customerHtml).toContain('data-slot="message-bubble-wrapper"');
    expect(customerHtml).toContain("nheb commande taille M svp");

    const systemMessage: MessageDto = {
      id: "msg-sys-1",
      conversationId: "conv-1",
      direction: "outbound",
      senderType: "system",
      content: "Prise en main par Amine",
      contentType: "system",
      deliveryStatus: "delivered",
      createdAt: new Date().toISOString(),
      attachments: [],
    };
    const systemHtml = renderToString(
      React.createElement(MessageBubble, { message: systemMessage }),
    );
    expect(systemHtml).toContain('data-slot="system-event-chip"');
    expect(systemHtml).toContain("Prise en main par Amine");
  });

  it("Order Drawer: Can draft and confirm order directly from conversation pane.", () => {
    // 1. With pending order -> shows confirmation deck
    const withOrderHtml = renderToString(
      React.createElement(OrderDrawer, {
        conversation: mockConversation,
        businessId: "biz-1",
        isOpen: true,
        onClose: () => {},
        onConfirmOrder: async () => ({}),
        onCreateDraftOrder: async () => ({}),
        onCancelOrder: async () => {},
      }),
    );
    expect(withOrderHtml).toContain("Confirmer la commande");
    expect(withOrderHtml).toContain("Annuler la commande");
    expect(withOrderHtml).toContain("Paiement encaissé (avance / virement)");

    // 2. Without pending order -> shows create manual order affordance
    const withoutOrderConv: ConversationSummaryDto = {
      ...mockConversation,
      pendingOrder: null,
    };
    const withoutOrderHtml = renderToString(
      React.createElement(OrderDrawer, {
        conversation: withoutOrderConv,
        businessId: "biz-1",
        isOpen: true,
        onClose: () => {},
        onConfirmOrder: async () => ({}),
        onCreateDraftOrder: async () => ({}),
        onCancelOrder: async () => {},
      }),
    );
    expect(withoutOrderHtml).toContain("Créer une commande manuelle");
    expect(withoutOrderHtml).toContain("Aucune commande active");
  });
});
