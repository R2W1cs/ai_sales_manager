import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ConversationSource, ConversationStatus } from "@prisma/client";

import { OrchestratorService } from "../orchestrator/orchestrator.service";
import { assertToolCapability } from "../tools/tool-registry";
import { PlaygroundService } from "./playground.service";
import {
  TEST_BUSINESS_ID,
  TEST_CONVERSATION_ID,
  TEST_CUSTOMER_ID,
  createMockPrismaClient,
  type MockPrismaClient,
} from "./test-fixtures";

describe("Playground Sandbox Isolation & Tool Boundary Suite", () => {
  let service: PlaygroundService;
  let prismaMock: MockPrismaClient;
  let orchestratorService: OrchestratorService;

  beforeEach(() => {
    prismaMock = createMockPrismaClient();

    orchestratorService = new OrchestratorService(
      { buildPrompt: jest.fn().mockReturnValue({ systemPrompt: "", userPrompt: "" }) } as any,
      { searchCatalog: jest.fn().mockResolvedValue({ products: [], textSummary: "" }) } as any,
      { checkStock: jest.fn().mockResolvedValue({ inStock: true, textSummary: "" }) } as any,
      { getStorePolicy: jest.fn().mockResolvedValue({ textSummary: "" }) } as any,
      {
        classify: jest
          .fn()
          .mockResolvedValue({ intent: "product_inquiry", confidence: 0.95, secondary: [] }),
      } as any,
      undefined,
      prismaMock as any,
    );

    service = new PlaygroundService(orchestratorService, undefined, prismaMock as any);
  });

  describe("Sandbox Boundary & Prohibited States", () => {
    it("rejects simulation on a live/production conversation (is_test = false) with 403 Forbidden", async () => {
      prismaMock.conversation.findFirst.mockResolvedValueOnce({
        id: TEST_CONVERSATION_ID,
        business_id: TEST_BUSINESS_ID,
        customer_id: TEST_CUSTOMER_ID,
        source: ConversationSource.playground,
        is_test: false, // Live production thread
        status: ConversationStatus.NEW,
      });

      await expect(
        service.simulate(TEST_BUSINESS_ID, {
          message: "Probe live thread",
          conversationId: TEST_CONVERSATION_ID,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects simulation on a non-playground source (e.g. instagram) with 403 Forbidden", async () => {
      prismaMock.conversation.findFirst.mockResolvedValueOnce({
        id: TEST_CONVERSATION_ID,
        business_id: TEST_BUSINESS_ID,
        customer_id: TEST_CUSTOMER_ID,
        source: ConversationSource.instagram, // Non-playground source
        is_test: true,
        status: ConversationStatus.NEW,
      });

      await expect(
        service.simulate(TEST_BUSINESS_ID, {
          message: "Probe non-playground thread",
          conversationId: TEST_CONVERSATION_ID,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects simulation on an invalid conversation state (HUMAN_REQUIRED or RESOLVED) with 400", async () => {
      prismaMock.conversation.findFirst.mockResolvedValueOnce({
        id: TEST_CONVERSATION_ID,
        business_id: TEST_BUSINESS_ID,
        customer_id: TEST_CUSTOMER_ID,
        source: ConversationSource.playground,
        is_test: true,
        status: ConversationStatus.HUMAN_REQUIRED,
      });

      await expect(
        service.simulate(TEST_BUSINESS_ID, {
          message: "Probe escalated thread",
          conversationId: TEST_CONVERSATION_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("Tool Capability Enforcement Boundary", () => {
    it("allows read-only tools in playground and suggest modes", () => {
      expect(() => assertToolCapability("searchCatalog", "playground")).not.toThrow();
      expect(() => assertToolCapability("checkStock", "playground")).not.toThrow();
      expect(() => assertToolCapability("getStorePolicy", "playground")).not.toThrow();
      expect(() => assertToolCapability("requestHumanHandoff", "playground")).not.toThrow();

      expect(() => assertToolCapability("searchCatalog", "suggest")).not.toThrow();
      expect(() => assertToolCapability("checkStock", "suggest")).not.toThrow();
    });

    it("blocks mutating tools in playground mode", () => {
      expect(() => assertToolCapability("reserve_stock", "playground")).toThrow(
        BadRequestException,
      );
      expect(() => assertToolCapability("create_pending_order", "playground")).toThrow(
        BadRequestException,
      );
      expect(() => assertToolCapability("updateCustomer", "playground")).toThrow(
        BadRequestException,
      );
      expect(() => assertToolCapability("adjustInventory", "playground")).toThrow(
        BadRequestException,
      );
    });

    it("blocks external side-effect tools in playground mode", () => {
      expect(() => assertToolCapability("chargePayment", "playground")).toThrow(
        BadRequestException,
      );
      expect(() => assertToolCapability("sendMessageLive", "playground")).toThrow(
        BadRequestException,
      );
    });

    it("blocks unregistered tools in playground mode with fail-closed policy", () => {
      expect(() => assertToolCapability("unknownToolDangerous", "playground")).toThrow(
        BadRequestException,
      );
    });
  });

  describe("Orchestrator Bidirectional Isolation", () => {
    it("orchestrator rejects playground mode on a live/production conversation (is_test = false)", async () => {
      prismaMock.conversation.findUnique.mockResolvedValueOnce({
        id: TEST_CONVERSATION_ID,
        business_id: TEST_BUSINESS_ID,
        customer_id: TEST_CUSTOMER_ID,
        source: ConversationSource.instagram,
        is_test: false,
        status: ConversationStatus.NEW,
        customer: null,
      });

      await expect(
        orchestratorService.executeTurn(
          TEST_CONVERSATION_ID,
          { content: "Test turn" },
          { businessId: TEST_BUSINESS_ID, mode: "playground" },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("orchestrator rejects non-playground mode on a sandbox playground conversation", async () => {
      prismaMock.conversation.findUnique.mockResolvedValueOnce({
        id: TEST_CONVERSATION_ID,
        business_id: TEST_BUSINESS_ID,
        customer_id: TEST_CUSTOMER_ID,
        source: ConversationSource.playground,
        is_test: true,
        status: ConversationStatus.NEW,
        customer: null,
      });

      await expect(
        orchestratorService.executeTurn(
          TEST_CONVERSATION_ID,
          { content: "Test turn" },
          { businessId: TEST_BUSINESS_ID, mode: "inbound" },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
