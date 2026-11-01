import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PromptType, type PrismaClient, type AiPrompt, type Message } from "@prisma/client";

import { AiMetadataSchema } from "@app/shared";

import { PromptVersionsController } from "./prompt-versions.controller";
import { PromptVersionsService, type CreatePromptDto } from "./prompt-versions.service";

interface PromptRecord {
  id: string;
  business_id: string;
  type: PromptType;
  content: string;
  version: number;
  active: boolean;
  created_at: Date;
  created_by_user_id: string | null;
}

interface MessageRecord {
  id: string;
  business_id: string;
  conversation_id: string;
  direction: string;
  content: string;
  ai_metadata: Record<string, unknown> | null;
}

interface AiUsageRecord {
  id: string;
  business_id: string;
  conversation_id: string;
  message_id: string | null;
  prompt_version_id: string | null;
  provider: string;
  model: string;
  tokens_input: number;
  tokens_output: number;
  estimated_cost_usd: number;
}

describe("AI prompt versions management & audit linking (T-AI-03)", () => {
  let promptVersionsService: PromptVersionsService;
  let promptVersionsController: PromptVersionsController;

  const tenantA = "11111111-1111-4111-a111-111111111111";
  const tenantB = "22222222-2222-4222-a222-222222222222";
  const userA = "33333333-3333-4333-a333-333333333333";

  // In-memory mock database
  let promptsTable: PromptRecord[];
  let messagesTable: MessageRecord[];
  let aiUsageTable: AiUsageRecord[];

  beforeEach(() => {
    promptsTable = [];
    messagesTable = [];
    aiUsageTable = [];

    let idCounter = 1;

    const mockPrisma: any = {
      aiPrompt: {
        findFirst: jest.fn(
          (args: {
            where?: { id?: string; business_id?: string; type?: PromptType; active?: boolean };
            orderBy?: { version?: "asc" | "desc" };
            select?: Record<string, boolean>;
          }) => {
            const { where, orderBy, select } = args;
            let matches = promptsTable.filter((p) => {
              if (where?.id && p.id !== where.id) return false;
              if (where?.business_id && p.business_id !== where.business_id) return false;
              if (where?.type && p.type !== where.type) return false;
              if (where?.active !== undefined && p.active !== where.active) return false;
              return true;
            });

            if (orderBy?.version === "desc") {
              matches = matches.slice().sort((a, b) => b.version - a.version);
            }

            const result = matches[0] ?? null;
            if (result && select) {
              const selected: Record<string, unknown> = {};
              for (const key of Object.keys(select)) {
                if (select[key])
                  selected[key] = (result as unknown as Record<string, unknown>)[key];
              }
              return Promise.resolve(selected as unknown as AiPrompt);
            }
            return Promise.resolve(result ? { ...result } : null);
          },
        ),

        findMany: jest.fn(
          (args: {
            where?: { business_id?: string; type?: PromptType; active?: boolean };
            orderBy?: { type?: "asc" | "desc"; version?: "asc" | "desc" }[];
          }) => {
            const { where, orderBy } = args;
            const matches = promptsTable.filter((p) => {
              if (where?.business_id && p.business_id !== where.business_id) return false;
              if (where?.type && p.type !== where.type) return false;
              if (where?.active !== undefined && p.active !== where.active) return false;
              return true;
            });

            if (Array.isArray(orderBy)) {
              matches.sort((a, b) => {
                for (const ord of orderBy) {
                  if (ord.type) {
                    const cmp = a.type.localeCompare(b.type);
                    if (cmp !== 0) return ord.type === "asc" ? cmp : -cmp;
                  }
                  if (ord.version) {
                    const cmp = a.version - b.version;
                    if (cmp !== 0) return ord.version === "asc" ? cmp : -cmp;
                  }
                }
                return 0;
              });
            }

            return Promise.resolve(matches.map((m) => ({ ...m })));
          },
        ),

        create: jest.fn(
          (args: {
            data: {
              business_id: string;
              type: PromptType;
              content: string;
              version: number;
              active: boolean;
              created_by_user_id?: string | null;
            };
          }) => {
            const newPrompt: PromptRecord = {
              id: `prompt-uuid-${idCounter++}`,
              business_id: args.data.business_id,
              type: args.data.type,
              content: args.data.content,
              version: args.data.version,
              active: args.data.active,
              created_at: new Date(),
              created_by_user_id: args.data.created_by_user_id ?? null,
            };
            promptsTable.push(newPrompt);
            return Promise.resolve({ ...newPrompt });
          },
        ),

        update: jest.fn((args: { where: { id: string }; data: Partial<PromptRecord> }) => {
          const idx = promptsTable.findIndex((p) => p.id === args.where.id);
          if (idx === -1) return Promise.resolve(null);
          const current = promptsTable[idx];
          if (current) {
            promptsTable[idx] = { ...current, ...args.data };
            return Promise.resolve({ ...promptsTable[idx] });
          }
          return Promise.resolve(null);
        }),

        updateMany: jest.fn(
          (args: {
            where: { business_id?: string; type?: PromptType; active?: boolean };
            data: Partial<PromptRecord>;
          }) => {
            let count = 0;
            for (let i = 0; i < promptsTable.length; i++) {
              const p = promptsTable[i];
              if (!p) continue;
              let match = true;
              if (args.where.business_id && p.business_id !== args.where.business_id) match = false;
              if (args.where.type && p.type !== args.where.type) match = false;
              if (args.where.active !== undefined && p.active !== args.where.active) match = false;
              if (match) {
                promptsTable[i] = { ...p, ...args.data };
                count++;
              }
            }
            return Promise.resolve({ count });
          },
        ),
      },

      message: {
        findFirst: jest.fn((args: { where: { id?: string; business_id?: string } }) => {
          const match = messagesTable.find((m) => {
            if (args.where.id && m.id !== args.where.id) return false;
            if (args.where.business_id && m.business_id !== args.where.business_id) return false;
            return true;
          });
          return Promise.resolve(match ? ({ ...match } as unknown as Message) : null);
        }),

        update: jest.fn(
          (args: { where: { id: string }; data: { ai_metadata?: Record<string, unknown> } }) => {
            const idx = messagesTable.findIndex((m) => m.id === args.where.id);
            if (idx === -1) return Promise.resolve(null);
            const current = messagesTable[idx];
            if (current) {
              messagesTable[idx] = { ...current, ...args.data };
              return Promise.resolve({ ...messagesTable[idx] } as unknown as Message);
            }
            return Promise.resolve(null);
          },
        ),
      },

      aiUsage: {
        updateMany: jest.fn(
          (args: {
            where: { business_id?: string; message_id?: string };
            data: { prompt_version_id?: string };
          }) => {
            let count = 0;
            for (let i = 0; i < aiUsageTable.length; i++) {
              const u = aiUsageTable[i];
              if (!u) continue;
              let match = true;
              if (args.where.business_id && u.business_id !== args.where.business_id) match = false;
              if (args.where.message_id && u.message_id !== args.where.message_id) match = false;
              if (match) {
                aiUsageTable[i] = { ...u, ...args.data };
                count++;
              }
            }
            return Promise.resolve({ count });
          },
        ),
      },

      $transaction: jest.fn(
        async (callback: (tx: PrismaClient) => Promise<unknown>): Promise<unknown> => {
          return callback(mockPrisma as PrismaClient);
        },
      ),
    };

    promptVersionsService = new PromptVersionsService(mockPrisma as PrismaClient);
    promptVersionsController = new PromptVersionsController(promptVersionsService);
  });

  describe("1. Acceptance Criteria & Audit Linking", () => {
    it("Traceable Message: AI messages store exact `prompt_version_id` in database.", async () => {
      // 1. Create active system prompt version
      const prompt = await promptVersionsService.createPromptVersion(
        tenantA,
        {
          type: PromptType.system,
          content: "You are an AI sales agent for Tunisian e-commerce...",
        },
        userA,
      );

      expect(prompt.id).toBeDefined();
      expect(prompt.version).toBe(1);
      expect(prompt.active).toBe(true);

      // 2. Insert mock message and ai_usage
      const messageId = "msg-uuid-101";
      messagesTable.push({
        id: messageId,
        business_id: tenantA,
        conversation_id: "conv-uuid-1",
        direction: "outbound",
        content: "3aslema! Marhba bik, chneya t7eb techri lyoum?",
        ai_metadata: null,
      });

      aiUsageTable.push({
        id: "usage-uuid-1",
        business_id: tenantA,
        conversation_id: "conv-uuid-1",
        message_id: messageId,
        prompt_version_id: null,
        provider: "google",
        model: "gemini-3.5-flash",
        tokens_input: 420,
        tokens_output: 55,
        estimated_cost_usd: 0.00012,
      });

      // 3. Attach prompt version to message
      const updatedMessage = await promptVersionsService.attachPromptVersionToMessage(
        tenantA,
        messageId,
        prompt.id,
      );

      // 4. Verify message ai_metadata stores exact prompt_version_id
      expect(updatedMessage.ai_metadata).toEqual({
        prompt_version_id: prompt.id,
      });

      // 5. Verify ai_usage table also links prompt_version_id
      expect(aiUsageTable[0]?.prompt_version_id).toBe(prompt.id);
    });

    it("Builds compliant AiMetadata containing prompt_version_id", () => {
      const promptVersionId = "44444444-4444-4444-a444-444444444444";
      const metadata = promptVersionsService.buildAiMetadata({
        intent: "product_inquiry",
        confidence: 0.94,
        toolsCalled: ["search_products", "check_inventory"],
        model: "gemini-3.5-flash",
        latencyMs: 1450,
        promptVersionId,
        fallbackUsed: false,
      });

      // Validates schema compliance
      const parsed = AiMetadataSchema.parse(metadata);
      expect(parsed.prompt_version_id).toBe(promptVersionId);
      expect(parsed.intent).toBe("product_inquiry");
      expect(parsed.tools_called).toEqual(["search_products", "check_inventory"]);
      expect(parsed.fallback_used).toBe(false);
    });
  });

  describe("2. Immutable Versioning & Sequential Increments", () => {
    it("Monotonically increments versions and deactivates older rows", async () => {
      // Version 1
      const v1 = await promptVersionsService.createPromptVersion(tenantA, {
        type: PromptType.system,
        content: "System prompt v1",
      });
      expect(v1.version).toBe(1);
      expect(v1.active).toBe(true);

      // Version 2
      const v2 = await promptVersionsService.createPromptVersion(tenantA, {
        type: PromptType.system,
        content: "System prompt v2",
      });
      expect(v2.version).toBe(2);
      expect(v2.active).toBe(true);

      // Check that v1 in database is now inactive
      const storedV1 = promptsTable.find((p) => p.id === v1.id);
      const storedV2 = promptsTable.find((p) => p.id === v2.id);
      expect(storedV1?.active).toBe(false);
      expect(storedV2?.active).toBe(true);

      // Version 3
      const v3 = await promptVersionsService.createPromptVersion(tenantA, {
        type: PromptType.system,
        content: "System prompt v3",
      });
      expect(v3.version).toBe(3);
      expect(v3.active).toBe(true);

      const activePrompt = await promptVersionsService.getActivePrompt(tenantA, PromptType.system);
      expect(activePrompt?.id).toBe(v3.id);
      expect(activePrompt?.version).toBe(3);
    });

    it("Maintains separate version sequences per prompt type", async () => {
      const sys1 = await promptVersionsService.createPromptVersion(tenantA, {
        type: PromptType.system,
        content: "System v1",
      });
      const sys2 = await promptVersionsService.createPromptVersion(tenantA, {
        type: PromptType.system,
        content: "System v2",
      });
      const sales1 = await promptVersionsService.createPromptVersion(tenantA, {
        type: PromptType.sales,
        content: "Sales v1",
      });
      const esc1 = await promptVersionsService.createPromptVersion(tenantA, {
        type: PromptType.escalation,
        content: "Escalation v1",
      });

      expect(sys1.version).toBe(1);
      expect(sys2.version).toBe(2);
      expect(sales1.version).toBe(1);
      expect(esc1.version).toBe(1);

      const activeSys = await promptVersionsService.getActivePrompt(tenantA, PromptType.system);
      const activeSales = await promptVersionsService.getActivePrompt(tenantA, PromptType.sales);
      const activeEsc = await promptVersionsService.getActivePrompt(tenantA, PromptType.escalation);

      expect(activeSys?.id).toBe(sys2.id);
      expect(activeSales?.id).toBe(sales1.id);
      expect(activeEsc?.id).toBe(esc1.id);
    });

    it("Reactivates/Rolls back to a previous version cleanly", async () => {
      const v1 = await promptVersionsService.createPromptVersion(tenantA, {
        type: PromptType.system,
        content: "System v1",
      });
      const v2 = await promptVersionsService.createPromptVersion(tenantA, {
        type: PromptType.system,
        content: "System v2",
      });

      expect(v2.active).toBe(true);

      // Rollback to v1
      const activatedV1 = await promptVersionsService.activatePromptVersion(tenantA, v1.id);
      expect(activatedV1.id).toBe(v1.id);
      expect(activatedV1.active).toBe(true);

      const storedV1 = promptsTable.find((p) => p.id === v1.id);
      const storedV2 = promptsTable.find((p) => p.id === v2.id);
      expect(storedV1?.active).toBe(true);
      expect(storedV2?.active).toBe(false);
    });
  });

  describe("3. Multi-Tenant Isolation", () => {
    it("Enforces tenant boundaries on prompt versions", async () => {
      const promptA = await promptVersionsService.createPromptVersion(tenantA, {
        type: PromptType.system,
        content: "Tenant A Prompt",
      });

      const promptB = await promptVersionsService.createPromptVersion(tenantB, {
        type: PromptType.system,
        content: "Tenant B Prompt",
      });

      expect(promptA.version).toBe(1);
      expect(promptB.version).toBe(1); // Tenant B starts at 1 independently

      // Tenant A cannot retrieve Tenant B's prompt
      await expect(promptVersionsService.getPromptById(tenantA, promptB.id)).rejects.toThrow(
        NotFoundException,
      );

      // Tenant B cannot activate Tenant A's prompt
      await expect(
        promptVersionsService.activatePromptVersion(tenantB, promptA.id),
      ).rejects.toThrow(NotFoundException);

      // Listing prompts for Tenant A only returns Tenant A prompts
      const listA = await promptVersionsService.listPrompts(tenantA);
      expect(listA).toHaveLength(1);
      expect(listA[0]?.id).toBe(promptA.id);

      const listB = await promptVersionsService.listPrompts(tenantB);
      expect(listB).toHaveLength(1);
      expect(listB[0]?.id).toBe(promptB.id);
    });
  });

  describe("4. Validation & Error Handling", () => {
    it("Rejects empty or whitespace content with 400 validation error", async () => {
      await expect(
        promptVersionsService.createPromptVersion(tenantA, {
          type: PromptType.system,
          content: "   ",
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        promptVersionsService.createPromptVersion(tenantA, {
          type: PromptType.system,
          content: "",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Rejects invalid prompt types with 400 validation error", async () => {
      await expect(
        promptVersionsService.createPromptVersion(tenantA, {
          type: "invalid_type" as unknown as PromptType,
          content: "Some prompt",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Throws 404 when prompt or message is missing during attachment", async () => {
      await expect(
        promptVersionsService.attachPromptVersionToMessage(
          tenantA,
          "non-existent-msg",
          "non-existent-prompt",
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("5. PromptVersionsController Endpoints", () => {
    it("POST /api/v1/ai/prompts creates version with 201 Created", async () => {
      const dto: CreatePromptDto = {
        type: PromptType.system,
        content: "Controller prompt test",
      };

      const result = await promptVersionsController.createPromptVersion(tenantA, dto, {
        id: userA,
        sub: userA,
      });

      expect(result.id).toBeDefined();
      expect(result.content).toBe("Controller prompt test");
      expect(result.version).toBe(1);
      expect(result.createdByUserId).toBe(userA);
    });

    it("GET /api/v1/ai/prompts lists versions", async () => {
      await promptVersionsController.createPromptVersion(tenantA, {
        type: PromptType.sales,
        content: "Sales v1",
      });
      await promptVersionsController.createPromptVersion(tenantA, {
        type: PromptType.sales,
        content: "Sales v2",
      });

      const list = await promptVersionsController.listPrompts(tenantA, PromptType.sales);
      expect(list).toHaveLength(2);
      expect(list[0]?.version).toBe(2);
      expect(list[1]?.version).toBe(1);
    });

    it("GET /api/v1/ai/prompts/active/:type returns active prompt or 404", async () => {
      await promptVersionsController.createPromptVersion(tenantA, {
        type: PromptType.escalation,
        content: "Escalation active prompt",
      });

      const active = await promptVersionsController.getActivePrompt(tenantA, PromptType.escalation);
      expect(active.type).toBe(PromptType.escalation);
      expect(active.active).toBe(true);

      await expect(
        promptVersionsController.getActivePrompt(tenantA, PromptType.handoff_summary),
      ).rejects.toThrow(NotFoundException);
    });

    it("GET /api/v1/ai/prompts/:id and POST /:id/activate", async () => {
      const created = await promptVersionsController.createPromptVersion(tenantA, {
        type: PromptType.system,
        content: "Initial system prompt",
      });

      const fetched = await promptVersionsController.getPromptById(tenantA, created.id);
      expect(fetched.id).toBe(created.id);

      const activated = await promptVersionsController.activatePromptVersion(tenantA, created.id);
      expect(activated.active).toBe(true);
    });
  });
});
