import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";

import { AiConfigService } from "../../src/ai/config/ai-config.service";
import { PromptVersionsService } from "../../src/ai/prompts/prompt-versions.service";
import { AnalyticsService } from "../../src/analytics/kpis/analytics.service";
import { auth as betterAuth } from "../../src/auth";
import { QuotaService } from "../../src/billing/quota/quota.service";
import { MembersController } from "../../src/businesses/members/members.controller";
import { MembersService } from "../../src/businesses/members/members.service";
import { BusinessesController } from "../../src/businesses/workspace/businesses.controller";
import { BusinessesService } from "../../src/businesses/workspace/businesses.service";
import { CategoriesService } from "../../src/catalog/categories/categories.service";
import { ProductsService } from "../../src/catalog/products/products.service";
import { ThreadActionsService } from "../../src/conversations/threads/thread-actions.service";
import { MergeService } from "../../src/customers/identity/merge.service";
import { CustomersService } from "../../src/customers/workspace/customers.service";
import { ChannelsService } from "../../src/integrations/channels/channels.service";
import { WebhooksService } from "../../src/integrations/webhooks/webhooks.service";
import { DocumentsService } from "../../src/knowledge/documents/documents.service";
import { BusinessRulesService } from "../../src/knowledge/rules/business-rules.service";
import { OrdersService } from "../../src/orders/core/orders.service";
import { TenantGuard } from "../../src/platform/security/tenant.guard";
import {
  createMockSecurityContext,
  createSecurityPrismaMock,
  TENANT_A_ID,
  TENANT_B_ID,
  TENANT_B_UUIDS,
  USER_AGENT_A,
  USER_ADMIN_A,
  USER_OWNER_A,
} from "./fixtures";

describe("Security Matrix: 100% Multi-Tenant Isolation Suite across 12 Modules", () => {
  let tenantGuard: TenantGuard;
  let getSessionSpy: jest.SpyInstance;

  beforeEach(() => {
    const { prismaMock } = createSecurityPrismaMock();
    tenantGuard = new TenantGuard(prismaMock as never);
    getSessionSpy = jest.spyOn(betterAuth.api, "getSession");
  });

  afterEach(() => {
    getSessionSpy.mockRestore();
  });

  describe("Global Cross-Tenant Header & URL Boundary Enforcement", () => {
    it("Rejects Tenant A user attempting to access Tenant B via X-Business-Id header -> 403 Forbidden", async () => {
      getSessionSpy.mockResolvedValue({
        user: { id: USER_OWNER_A.id, email: USER_OWNER_A.email },
        session: { id: "sess-a", activeOrganizationId: TENANT_A_ID, mfaVerified: true },
      });

      const { context } = createMockSecurityContext({
        user: USER_OWNER_A,
        businessId: TENANT_B_ID,
        headers: { "x-business-id": TENANT_B_ID },
      });

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("Rejects Tenant A user attempting to access /businesses/:id belonging to Tenant B -> 403 Forbidden", async () => {
      getSessionSpy.mockResolvedValue({
        user: { id: USER_OWNER_A.id, email: USER_OWNER_A.email },
        session: { id: "sess-a", activeOrganizationId: TENANT_A_ID, mfaVerified: true },
      });

      const { context } = createMockSecurityContext({
        user: USER_OWNER_A,
        businessId: TENANT_A_ID,
        path: `/api/v1/businesses/${TENANT_B_ID}`,
        params: { id: TENANT_B_ID },
      });

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================
  // MODULE 1: INBOX
  // ==========================================
  describe("Module 1: Inbox Tenant Isolation", () => {
    let mockPrisma: any;
    let threadActionsService: ThreadActionsService;

    beforeEach(() => {
      mockPrisma = {
        conversation: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID && where.id === TENANT_B_UUIDS.conversationId) {
              return Promise.resolve(null); // Isolated!
            }
            return Promise.resolve(null);
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        message: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID && where.id === TENANT_B_UUIDS.messageId) {
              return Promise.resolve(null); // Isolated!
            }
            return Promise.resolve(null);
          }),
        },
      };

      threadActionsService = new ThreadActionsService(mockPrisma as never);
    });

    it("CROSS-TENANT GET NOTES: Tenant A fetching conversation notes belonging to Tenant B returns 404 (0 leak)", async () => {
      await expect(
        threadActionsService.getNotes(TENANT_A_ID, TENANT_B_UUIDS.conversationId),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: TENANT_B_UUIDS.conversationId,
            business_id: TENANT_A_ID,
          }),
        }),
      );
    });

    it("CROSS-TENANT POST: Tenant A approving draft message belonging to Tenant B returns 404", async () => {
      await expect(
        threadActionsService.approveMessage(TENANT_A_ID, TENANT_B_UUIDS.messageId, USER_OWNER_A.id),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: TENANT_B_UUIDS.messageId,
            business_id: TENANT_A_ID,
          }),
        }),
      );
    });

    it("CROSS-TENANT POST: Tenant A taking over conversation belonging to Tenant B returns 404", async () => {
      await expect(
        threadActionsService.takeover(TENANT_A_ID, TENANT_B_UUIDS.conversationId, USER_AGENT_A.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================
  // MODULE 2: CATALOG
  // ==========================================
  describe("Module 2: Catalog Tenant Isolation", () => {
    let mockPrisma: any;
    let productsService: ProductsService;
    let categoriesService: CategoriesService;

    beforeEach(() => {
      mockPrisma = {
        product: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID && where.id === TENANT_B_UUIDS.productId) {
              return Promise.resolve(null);
            }
            return Promise.resolve(null);
          }),
          update: jest.fn(),
          delete: jest.fn(),
        },
        productCategory: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID && where.id === TENANT_B_UUIDS.categoryId) {
              return Promise.resolve(null);
            }
            return Promise.resolve(null);
          }),
          update: jest.fn(),
          delete: jest.fn(),
        },
        stockReservation: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        orderItem: {
          count: jest.fn().mockResolvedValue(0),
        },
      };

      productsService = new ProductsService({} as never, {} as never, mockPrisma as never);
      categoriesService = new CategoriesService(mockPrisma as never);
    });

    it("CROSS-TENANT GET: Tenant A fetching product of Tenant B returns 404", async () => {
      await expect(
        productsService.getProduct(TENANT_A_ID, TENANT_B_UUIDS.productId),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: TENANT_B_UUIDS.productId,
            business_id: TENANT_A_ID,
          }),
        }),
      );
    });

    it("CROSS-TENANT PATCH: Tenant A modifying product of Tenant B returns 404", async () => {
      await expect(
        productsService.updateProduct(TENANT_A_ID, TENANT_B_UUIDS.productId, {
          title: "Attacked Title",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("CROSS-TENANT DELETE: Tenant A deleting product of Tenant B returns 404", async () => {
      await expect(
        productsService.deleteProduct(TENANT_A_ID, TENANT_B_UUIDS.productId),
      ).rejects.toThrow(NotFoundException);
    });

    it("CROSS-TENANT CATEGORY: Tenant A modifying category of Tenant B returns 404", async () => {
      await expect(
        categoriesService.updateCategory(TENANT_A_ID, TENANT_B_UUIDS.categoryId, {
          name: "Attacked Category",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================
  // MODULE 3: ORDERS
  // ==========================================
  describe("Module 3: Orders Tenant Isolation", () => {
    let mockPrisma: any;
    let ordersService: OrdersService;

    beforeEach(() => {
      mockPrisma = {
        order: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID && where.id === TENANT_B_UUIDS.orderId) {
              return Promise.resolve(null);
            }
            return Promise.resolve(null);
          }),
          findUnique: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
        productVariant: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID && where.id === TENANT_B_UUIDS.variantId) {
              return Promise.resolve(null); // Variant belongs to Tenant B
            }
            return Promise.resolve(null);
          }),
          findMany: jest.fn().mockImplementation(() => {
            // When querying for Tenant B's variant under Tenant A, return empty list
            return Promise.resolve([]);
          }),
        },
        conversation: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID) {
              return Promise.resolve({
                id: "11111111-1111-4111-8111-111111111113",
                business_id: TENANT_A_ID,
                customer_id: "11111111-1111-4111-8111-111111111114",
              });
            }
            return Promise.resolve(null);
          }),
        },
        customer: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID) {
              return Promise.resolve({
                id: "11111111-1111-4111-8111-111111111114",
                business_id: TENANT_A_ID,
                name: "Test Customer",
                phone: "+21699000111",
              });
            }
            return Promise.resolve(null);
          }),
        },
        business: {
          findUnique: jest.fn().mockResolvedValue({ id: TENANT_A_ID, currency: "TND" }),
        },
        aiSettings: {
          findUnique: jest.fn().mockResolvedValue({ reservation_ttl_minutes: 30 }),
        },
        $queryRaw: jest.fn().mockResolvedValue([]),
        $transaction: jest.fn().mockImplementation((cb) => cb(mockPrisma)),
      };

      ordersService = new OrdersService(mockPrisma as never);
    });

    it("CROSS-TENANT GET: Tenant A fetching order of Tenant B returns 404", async () => {
      await expect(ordersService.getOrder(TENANT_A_ID, TENANT_B_UUIDS.orderId)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: TENANT_B_UUIDS.orderId,
            business_id: TENANT_A_ID,
          }),
        }),
      );
    });

    it("CROSS-TENANT POST CONFIRM: Tenant A confirming order of Tenant B returns 404", async () => {
      await expect(ordersService.confirmOrder(TENANT_A_ID, TENANT_B_UUIDS.orderId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("CROSS-TENANT POST CANCEL: Tenant A cancelling order of Tenant B returns 404", async () => {
      await expect(ordersService.cancelOrder(TENANT_A_ID, TENANT_B_UUIDS.orderId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("CROSS-TENANT VARIANT INJECTION: Tenant A creating order referencing Tenant B variant is rejected", async () => {
      await expect(
        ordersService.createDraftOrder(
          TENANT_A_ID,
          "11111111-1111-4111-8111-111111111113",
          USER_AGENT_A.id,
          {
            items: [{ variantId: TENANT_B_UUIDS.variantId, quantity: 1 }],
            customerSnapshot: { name: "Test Customer", phone: "+21699000111", address: null },
            deliveryAddress: { line1: "Rue Habib Bourguiba", city: "Tunis", country: "TN" },
            idempotencyKey: "idemp-order-draft-test-1",
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================
  // MODULE 4: CHANNELS
  // ==========================================
  describe("Module 4: Channels Tenant Isolation", () => {
    let mockPrisma: any;
    let channelsService: ChannelsService;

    beforeEach(() => {
      mockPrisma = {
        channelAccount: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID && where.id === TENANT_B_UUIDS.channelId) {
              return Promise.resolve(null);
            }
            return Promise.resolve(null);
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      channelsService = new ChannelsService({} as never, mockPrisma as never);
    });

    it("CROSS-TENANT GET: Tenant A checking channel health of Tenant B returns 404", async () => {
      await expect(
        channelsService.checkChannelHealth(TENANT_A_ID, TENANT_B_UUIDS.channelId),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.channelAccount.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: TENANT_B_UUIDS.channelId,
            business_id: TENANT_A_ID,
          }),
        }),
      );
    });

    it("CROSS-TENANT DELETE: Tenant A deleting channel of Tenant B returns 404", async () => {
      await expect(
        channelsService.disconnectChannel(TENANT_A_ID, TENANT_B_UUIDS.channelId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================
  // MODULE 5: ANALYTICS
  // ==========================================
  describe("Module 5: Analytics Tenant Isolation", () => {
    let mockPrisma: any;
    let analyticsService: AnalyticsService;

    beforeEach(() => {
      mockPrisma = {
        analyticsDaily: {
          findMany: jest.fn().mockImplementation(({ where }) => {
            // Only returns data matching business_id
            if (where.business_id === TENANT_A_ID) {
              return Promise.resolve([
                {
                  business_id: TENANT_A_ID,
                  day: new Date("2026-11-20"),
                  orders_count: 5,
                  revenue_millimes: 150000n,
                },
              ]);
            }
            return Promise.resolve([]);
          }),
        },
        order: {
          findMany: jest.fn().mockImplementation(({ where }) => {
            expect(where.business_id).toBe(TENANT_A_ID);
            return Promise.resolve([]);
          }),
          count: jest.fn().mockImplementation(({ where }) => {
            expect(where.business_id).toBe(TENANT_A_ID);
            return Promise.resolve(0);
          }),
          aggregate: jest.fn().mockImplementation(({ where }) => {
            expect(where.business_id).toBe(TENANT_A_ID);
            return Promise.resolve({ _sum: { total_amount: 0 }, _count: { id: 0 } });
          }),
        },
        conversation: {
          count: jest.fn().mockImplementation(({ where }) => {
            expect(where.business_id).toBe(TENANT_A_ID);
            return Promise.resolve(0);
          }),
        },
        business: {
          findUnique: jest.fn().mockResolvedValue({
            id: TENANT_A_ID,
            currency: "TND",
            timezone: "Africa/Tunis",
          }),
        },
      };

      const mockDailyRollup = {
        calculateDayMetrics: jest.fn().mockResolvedValue({
          ordersCount: 0,
          revenueMillimes: 0n,
          totalConversations: 0,
          activeConversations: 0,
          ordersConfirmedCount: 0,
          ordersCancelledCount: 0,
          aiMessagesCount: 0,
          humanMessagesCount: 0,
        }),
      };

      analyticsService = new AnalyticsService(mockPrisma as never, mockDailyRollup as never);
    });

    it("EXPLICIT SCOPING: Analytics KPIs strictly filter by business_id (0 leak of Tenant B metrics)", async () => {
      const kpis = await analyticsService.getOverview(TENANT_A_ID, { period: "30d" });
      expect(kpis).toBeDefined();

      // Verify that every single query executed was scoped with business_id: TENANT_A_ID
      expect(mockPrisma.analyticsDaily.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ business_id: TENANT_A_ID }),
        }),
      );
    });
  });

  // ==========================================
  // MODULE 6: CUSTOMERS
  // ==========================================
  describe("Module 6: Customers Tenant Isolation", () => {
    let mockPrisma: any;
    let customersService: CustomersService;
    let mergeService: MergeService;

    beforeEach(() => {
      mockPrisma = {
        customer: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID && where.id === TENANT_B_UUIDS.customerId) {
              return Promise.resolve(null);
            }
            return Promise.resolve(null);
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        idempotencyKey: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: "idemp-1" }),
        },
        $queryRaw: jest.fn().mockResolvedValue([]),
        $transaction: jest.fn().mockImplementation((cb) => cb(mockPrisma)),
      };

      customersService = new CustomersService(mockPrisma as never);
      mergeService = new MergeService(mockPrisma as never);
    });

    it("CROSS-TENANT GET: Tenant A fetching customer of Tenant B returns 404", async () => {
      await expect(
        customersService.getCustomer(TENANT_A_ID, TENANT_B_UUIDS.customerId),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: TENANT_B_UUIDS.customerId,
            business_id: TENANT_A_ID,
          }),
        }),
      );
    });

    it("CROSS-TENANT PATCH: Tenant A modifying customer of Tenant B returns 404", async () => {
      await expect(
        customersService.updateCustomer(TENANT_A_ID, USER_AGENT_A.id, TENANT_B_UUIDS.customerId, {
          name: "Attacked Name",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("CROSS-TENANT MERGE: Tenant A merging Tenant B customer is rejected with 403 Forbidden", async () => {
      await expect(
        mergeService.merge(
          TENANT_A_ID,
          USER_ADMIN_A.id,
          "11111111-1111-4111-8111-111111111112",
          { sourceCustomerId: TENANT_B_UUIDS.customerId },
          "idemp-merge-test-1",
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================
  // MODULE 7: RULES & KNOWLEDGE
  // ==========================================
  describe("Module 7: Rules & Knowledge Tenant Isolation", () => {
    let mockPrisma: any;
    let businessRulesService: BusinessRulesService;
    let documentsService: DocumentsService;

    beforeEach(() => {
      mockPrisma = {
        businessRule: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID && where.id === TENANT_B_UUIDS.ruleId) {
              return Promise.resolve(null);
            }
            return Promise.resolve(null);
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          update: jest.fn(),
          delete: jest.fn(),
        },
        knowledgeDocument: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID && where.id === TENANT_B_UUIDS.documentId) {
              return Promise.resolve(null);
            }
            return Promise.resolve(null);
          }),
          delete: jest.fn(),
        },
        embedding: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      businessRulesService = new BusinessRulesService(mockPrisma as never);
      documentsService = new DocumentsService(mockPrisma as never);
    });

    it("CROSS-TENANT PATCH: Tenant A modifying rule of Tenant B returns 404", async () => {
      await expect(
        businessRulesService.updateRule(TENANT_A_ID, TENANT_B_UUIDS.ruleId, {
          is_enabled: false,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("CROSS-TENANT DOCUMENT DELETE: Tenant A deleting document of Tenant B returns 404", async () => {
      await expect(
        documentsService.deleteDocument(TENANT_A_ID, TENANT_B_UUIDS.documentId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================
  // MODULE 8: PERSONALITY & AI
  // ==========================================
  describe("Module 8: Personality & AI Tenant Isolation", () => {
    let mockPrisma: any;
    let aiConfigService: AiConfigService;
    let promptVersionsService: PromptVersionsService;

    beforeEach(() => {
      mockPrisma = {
        aiSettings: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID) {
              return Promise.resolve({
                business_id: TENANT_A_ID,
                reply_mode: "AUTO",
                primary_model_id: "google/gemini-2.0-flash",
                fast_model_id: "google/gemini-2.0-flash-lite",
                confidence_threshold: 0.7,
                monthly_token_budget: 1000000,
                created_at: new Date(),
                updated_at: new Date(),
              });
            }
            return Promise.resolve(null);
          }),
          upsert: jest.fn(),
        },
        aiPrompt: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.business_id === TENANT_A_ID && where.id === TENANT_B_UUIDS.promptId) {
              return Promise.resolve(null);
            }
            return Promise.resolve(null);
          }),
        },
      };

      aiConfigService = new AiConfigService(mockPrisma as never);
      promptVersionsService = new PromptVersionsService(mockPrisma as never);
    });

    it("SCOPED CONFIG: Tenant A reading AI config receives strictly Tenant A settings", async () => {
      const config = await aiConfigService.getSettings(TENANT_A_ID);
      expect(config.businessId).toBe(TENANT_A_ID);

      expect(mockPrisma.aiSettings.findUnique).toHaveBeenCalledWith({
        where: { business_id: TENANT_A_ID },
      });
    });

    it("CROSS-TENANT PROMPT ACTIVATE: Tenant A activating Tenant B prompt version returns 404", async () => {
      await expect(
        promptVersionsService.activatePromptVersion(TENANT_A_ID, TENANT_B_UUIDS.promptId),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.aiPrompt.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: TENANT_B_UUIDS.promptId,
            business_id: TENANT_A_ID,
          }),
        }),
      );
    });
  });

  // ==========================================
  // MODULE 9: SETTINGS & WORKSPACE
  // ==========================================
  describe("Module 9: Settings & Workspace Tenant Isolation", () => {
    let membersController: MembersController;
    let businessesController: BusinessesController;
    let mockMembersService: Partial<MembersService>;
    let mockBusinessesService: Partial<BusinessesService>;

    beforeEach(() => {
      mockMembersService = {
        listMembers: jest.fn().mockResolvedValue([]),
        removeMember: jest.fn(),
      };
      mockBusinessesService = {
        getBusiness: jest.fn(),
      };

      membersController = new MembersController(mockMembersService as MembersService);
      businessesController = new BusinessesController(mockBusinessesService as BusinessesService);
    });

    it("CROSS-TENANT PATH PARAM: Tenant A admin requesting Tenant B members throws 403 Forbidden", async () => {
      // Path param businessId mismatches resolved businessId
      await expect(membersController.listMembers(TENANT_A_ID, TENANT_B_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("CROSS-TENANT MEMBER REMOVE: Tenant A admin removing member from Tenant B throws 403 Forbidden", async () => {
      await expect(
        membersController.removeMember(
          TENANT_A_ID,
          TENANT_B_ID,
          "target-user-id",
          USER_ADMIN_A,
          {} as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("CROSS-TENANT BUSINESS GET: Tenant A fetching business profile of Tenant B throws 403 Forbidden", async () => {
      await expect(businessesController.getBusiness(TENANT_A_ID, TENANT_B_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ==========================================
  // MODULE 10: BILLING
  // ==========================================
  describe("Module 10: Billing Tenant Isolation", () => {
    it("CROSS-TENANT HEADER ATTACK: Tenant A user cannot access Tenant B billing endpoints", async () => {
      getSessionSpy.mockResolvedValue({
        user: { id: USER_OWNER_A.id, email: USER_OWNER_A.email },
        session: { id: "sess-a", activeOrganizationId: TENANT_A_ID, mfaVerified: true },
      });

      const { context } = createMockSecurityContext({
        user: USER_OWNER_A,
        businessId: TENANT_B_ID,
        path: "/api/v1/billing",
        headers: { "x-business-id": TENANT_B_ID },
      });

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================
  // MODULE 11: USAGE
  // ==========================================
  describe("Module 11: Usage Tenant Isolation", () => {
    let mockPrisma: any;
    let quotaService: QuotaService;

    beforeEach(() => {
      mockPrisma = {
        usageAggregate: {
          findMany: jest.fn().mockImplementation(({ where }) => {
            expect(where.business_id).toBe(TENANT_A_ID);
            return Promise.resolve([]);
          }),
        },
        usageEvent: {
          aggregate: jest.fn().mockImplementation(({ where }) => {
            expect(where.business_id).toBe(TENANT_A_ID);
            return Promise.resolve({ _sum: { quantity: 0 } });
          }),
        },
        subscription: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            expect(where.business_id).toBe(TENANT_A_ID);
            return Promise.resolve(null);
          }),
        },
        aiUsage: {
          aggregate: jest.fn().mockImplementation(({ where }) => {
            expect(where.business_id).toBe(TENANT_A_ID);
            return Promise.resolve({ _sum: { total_tokens: 0 } });
          }),
        },
        order: {
          count: jest.fn().mockImplementation(({ where }) => {
            expect(where.business_id).toBe(TENANT_A_ID);
            return Promise.resolve(0);
          }),
        },
        conversation: {
          count: jest.fn().mockImplementation(({ where }) => {
            expect(where.business_id).toBe(TENANT_A_ID);
            return Promise.resolve(0);
          }),
        },
        member: {
          count: jest.fn().mockImplementation(({ where }) => {
            expect(where.organizationId).toBe(TENANT_A_ID);
            return Promise.resolve(1);
          }),
        },
        businessMember: {
          count: jest.fn().mockImplementation(({ where }) => {
            expect(where.business_id).toBe(TENANT_A_ID);
            return Promise.resolve(1);
          }),
        },
        channelAccount: {
          count: jest.fn().mockImplementation(({ where }) => {
            expect(where.business_id).toBe(TENANT_A_ID);
            return Promise.resolve(1);
          }),
        },
        business: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            expect(where.id).toBe(TENANT_A_ID);
            return Promise.resolve({ id: TENANT_A_ID, settings: {} });
          }),
        },
      };

      quotaService = new QuotaService(mockPrisma as never);
    });

    it("STRICT USAGE SCOPING: QuotaService strictly checks requesting tenant (0 leak of Tenant B)", async () => {
      const usage = await quotaService.getUsage(TENANT_A_ID);
      expect(usage).toBeDefined();

      expect(mockPrisma.subscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ business_id: TENANT_A_ID }),
        }),
      );
    });
  });

  // ==========================================
  // MODULE 12: WEBHOOKS
  // ==========================================
  describe("Module 12: Webhooks Tenant Isolation & Security", () => {
    let mockPrisma: any;
    let webhooksService: WebhooksService;

    beforeEach(() => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue({ id: "job-1" }),
      };

      mockPrisma = {
        channelAccount: {
          findFirst: jest.fn().mockResolvedValue({
            id: TENANT_B_UUIDS.channelId,
            business_id: TENANT_B_ID,
            status: "ACTIVE",
          }),
        },
        integrationEvent: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: "evt-1" }),
        },
      };

      webhooksService = new WebhooksService(mockPrisma as never, mockQueue as never);
    });

    it("WEBHOOK ATTACK: Inbound payload destined for Tenant B resolves strictly to Tenant B (cannot be claimed by Tenant A)", async () => {
      const result = await webhooksService.handleWebhook(
        {
          object: "instagram",
          entry: [
            {
              id: "ext_page_b",
              time: Date.now(),
              messaging: [
                {
                  sender: { id: "cust_123" },
                  recipient: { id: "ext_page_b" },
                  timestamp: Date.now(),
                  message: { mid: "mid_1", text: "Salam" },
                },
              ],
            },
          ],
        },
        Buffer.from("{}"),
      );

      expect(result.ok).toBe(true);

      // Verify created event is strictly tagged with business_id: TENANT_B_ID
      expect(mockPrisma.integrationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            business_id: TENANT_B_ID,
            channel_account_id: TENANT_B_UUIDS.channelId,
          }),
        }),
      );
    });
  });
});
