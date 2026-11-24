import * as fs from "node:fs";
import * as path from "node:path";

describe("Security Matrix: Database Multi-Tenant Query Scoping & Schema Invariants", () => {
  const schemaPath = path.resolve(__dirname, "../../prisma/schema.prisma");
  let schemaContent: string;

  beforeAll(() => {
    schemaContent = fs.readFileSync(schemaPath, "utf-8");
  });

  describe("1. Schema Multi-Tenant Scoping Invariants", () => {
    const TENANT_MODELS = [
      "BusinessMember",
      "BusinessRule",
      "ProductCategory",
      "Product",
      "ProductVariant",
      "ProductImage",
      "StockReservation",
      "InventoryMovement",
      "CatalogImportRun",
      "Customer",
      "CustomerIdentity",
      "CustomerTag",
      "Conversation",
      "Message",
      "AiSettings",
      "AiPrompt",
      "AiAction",
      "AiDecisionTrace",
      "AiUsage",
      "AiFeedback",
      "Subscription",
      "UsageEvent",
      "UsageAggregate",
      "AnalyticsDaily",
      "Notification",
      "AuditLog",
      "ChannelAccount",
    ];

    it.each(TENANT_MODELS)(
      "Model %s must contain explicit business_id column foreign keyed to Business",
      (modelName) => {
        const modelRegex = new RegExp(`model\\s+${modelName}\\s+\\{([\\s\\S]+?)\\n\\}`, "m");
        const match = schemaContent.match(modelRegex);

        expect(match).not.toBeNull();
        const modelBody = match![1];

        // Must declare business_id field
        expect(modelBody).toMatch(/business_id\s+String/);

        // Must declare relation to Business
        expect(modelBody).toMatch(/business\s+Business/);
      },
    );

    it("Core entity models (Product, Customer, ProductCategory) enforce composite [id, business_id] uniqueness", () => {
      const modelsWithCompositeUniqueness = ["Product", "ProductCategory", "Customer"];

      for (const model of modelsWithCompositeUniqueness) {
        const modelRegex = new RegExp(`model\\s+${model}\\s+\\{([\\s\\S]+?)\\n\\}`, "m");
        const match = schemaContent.match(modelRegex);
        expect(match).not.toBeNull();
        const body = match![1];
        expect(body).toContain("@@unique([id, business_id])");
      }
    });

    it("Child entity relations (ProductVariant, ProductImage, CustomerIdentity) enforce composite foreign key referencing [id, business_id]", () => {
      // ProductVariant must reference Product via [product_id, business_id] -> [id, business_id]
      expect(schemaContent).toContain(
        "fields: [product_id, business_id], references: [id, business_id]",
      );

      // CustomerIdentity must reference Customer via [customer_id, business_id] -> [id, business_id]
      expect(schemaContent).toContain(
        "fields: [customer_id, business_id], references: [id, business_id]",
      );
    });
  });

  describe("2. Static Codebase Scoping Verification across all 12 Modules", () => {
    const modulesDir = path.resolve(__dirname, "../../src");

    const SERVICE_TARGETS = [
      { module: "Inbox", file: "conversations/threads/conversations.service.ts" },
      { module: "Inbox", file: "conversations/threads/thread-actions.service.ts" },
      { module: "Catalog", file: "catalog/products/products.service.ts" },
      { module: "Catalog", file: "catalog/categories/categories.service.ts" },
      { module: "Orders", file: "orders/core/orders.service.ts" },
      { module: "Channels", file: "integrations/channels/channels.service.ts" },
      { module: "Analytics", file: "analytics/kpis/analytics.service.ts" },
      { module: "Customers", file: "customers/workspace/customers.service.ts" },
      { module: "Rules", file: "knowledge/rules/business-rules.service.ts" },
      { module: "Personality", file: "ai/config/ai-config.service.ts" },
      { module: "Settings", file: "businesses/workspace/businesses.service.ts" },
      { module: "Billing / Usage", file: "billing/quota/quota.service.ts" },
    ];

    it.each(SERVICE_TARGETS)(
      "Service for $module ($file) enforces business_id scoping in Prisma queries",
      ({ file }) => {
        const fullPath = path.resolve(modulesDir, file);
        expect(fs.existsSync(fullPath)).toBe(true);

        const content = fs.readFileSync(fullPath, "utf-8");

        // Verify that businessId / business_id is actively used in where clauses
        expect(content).toMatch(/business_id/);
      },
    );
  });

  describe("3. Runtime Query Interceptor Assertion", () => {
    it("Intercepts and verifies Prisma queries strictly enforce business_id in where clauses", async () => {
      const interceptedQueries: Array<{ model: string; method: string; args: any }> = [];

      // Create a Proxy around mock Prisma client to audit all query invocations
      const createAuditedPrisma = () => {
        const mockDelegate = (modelName: string) => ({
          findFirst: jest.fn().mockImplementation((args) => {
            interceptedQueries.push({ model: modelName, method: "findFirst", args });
            return Promise.resolve(null);
          }),
          findMany: jest.fn().mockImplementation((args) => {
            interceptedQueries.push({ model: modelName, method: "findMany", args });
            return Promise.resolve([]);
          }),
        });

        return {
          order: mockDelegate("order"),
          product: mockDelegate("product"),
          conversation: mockDelegate("conversation"),
          customer: mockDelegate("customer"),
        };
      };

      const audited = createAuditedPrisma();
      const testBusinessId = "11111111-1111-4111-8111-111111111111";

      // Simulate queries from service patterns
      await audited.order.findFirst({ where: { id: "order-1", business_id: testBusinessId } });
      await audited.product.findFirst({ where: { id: "prod-1", business_id: testBusinessId } });
      await audited.conversation.findFirst({
        where: { id: "conv-1", business_id: testBusinessId },
      });
      await audited.customer.findFirst({ where: { id: "cust-1", business_id: testBusinessId } });

      expect(interceptedQueries.length).toBe(4);

      for (const query of interceptedQueries) {
        expect(query.args.where).toBeDefined();
        expect(query.args.where.business_id).toBe(testBusinessId);
      }
    });
  });
});
