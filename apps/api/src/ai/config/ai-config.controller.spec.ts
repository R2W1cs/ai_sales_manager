import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { AiConfigController } from "./ai-config.controller";
import { AiConfigService } from "./ai-config.service";

describe("AI Agent configuration & settings CRUD (`/ai/agents/:id`, `/ai/settings`) (T-AI-10)", () => {
  let controller: AiConfigController;
  let service: AiConfigService;
  let prismaMock: {
    aiAgent: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    aiSettings: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    businessMember: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const businessId = "11111111-1111-1111-1111-111111111111";
  const agentId = "22222222-2222-2222-2222-222222222222";
  const now = new Date("2026-08-19T00:00:00Z");

  beforeEach(() => {
    prismaMock = {
      aiAgent: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      aiSettings: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      businessMember: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new AiConfigService(prismaMock as unknown as PrismaClient);
    controller = new AiConfigController(service);
  });

  describe("Agent CRUD", () => {
    it("Happy Path: Owner/Manager lists AI agents (array of one).", async () => {
      prismaMock.aiAgent.findMany.mockResolvedValue([
        {
          id: agentId,
          business_id: businessId,
          name: "Sales Assistant",
          personality: "Warm & helpful",
          language: "fr",
          tone: "Friendly Tunisian",
          sales_strategy: { upsell: true, cross_sell: false, aggressiveness: "medium" },
          greeting_template: "Bonjour !",
          fallback_template: "Un moment s'il vous plaît",
          confidence_threshold: 0.65,
          enabled: true,
          created_at: now,
          updated_at: now,
        },
      ]);

      const result = await controller.listAgents(businessId);

      expect(prismaMock.aiAgent.findMany).toHaveBeenCalledWith({
        where: { business_id: businessId },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: agentId,
        businessId,
        name: "Sales Assistant",
        personality: "Warm & helpful",
        language: "fr",
        tone: "Friendly Tunisian",
        salesStrategy: { upsell: true, cross_sell: false, aggressiveness: "medium" },
        greetingTemplate: "Bonjour !",
        fallbackTemplate: "Un moment s'il vous plaît",
        confidenceThreshold: 0.65,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    it("Happy Path: Owner/Manager retrieves agent configuration.", async () => {
      prismaMock.aiAgent.findFirst.mockResolvedValue({
        id: agentId,
        business_id: businessId,
        name: "Sales Assistant",
        personality: "Warm & helpful",
        language: "fr",
        tone: "Friendly Tunisian",
        sales_strategy: { upsell: true, cross_sell: false, aggressiveness: "medium" },
        greeting_template: "Bonjour !",
        fallback_template: "Un moment s'il vous plaît",
        confidence_threshold: 0.65,
        enabled: true,
        created_at: now,
        updated_at: now,
      });

      const result = await controller.getAgent(businessId, agentId);

      expect(prismaMock.aiAgent.findFirst).toHaveBeenCalledWith({
        where: {
          id: agentId,
          business_id: businessId,
        },
      });

      expect(result).toEqual({
        id: agentId,
        businessId,
        name: "Sales Assistant",
        personality: "Warm & helpful",
        language: "fr",
        tone: "Friendly Tunisian",
        salesStrategy: { upsell: true, cross_sell: false, aggressiveness: "medium" },
        greetingTemplate: "Bonjour !",
        fallbackTemplate: "Un moment s'il vous plaît",
        confidenceThreshold: 0.65,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    it("Happy Path: Owner/Manager updates agent personality and tone.", async () => {
      prismaMock.aiAgent.findFirst.mockResolvedValue({
        id: agentId,
        business_id: businessId,
        name: "Sales Assistant",
      });

      prismaMock.aiAgent.update.mockResolvedValue({
        id: agentId,
        business_id: businessId,
        name: "Sales Assistant",
        personality: "Enthusiastic and concise",
        language: "ar",
        tone: "Friendly Tunisian",
        sales_strategy: { upsell: true, cross_sell: true, aggressiveness: "high" },
        greeting_template: "Marhba bik!",
        fallback_template: null,
        confidence_threshold: 0.7,
        enabled: true,
        created_at: now,
        updated_at: now,
      });

      const result = await controller.updateAgent(businessId, agentId, {
        personality: "Enthusiastic and concise",
        language: "ar",
        tone: "Friendly Tunisian",
        salesStrategy: { upsell: true, cross_sell: true, aggressiveness: "high" },
        greetingTemplate: "Marhba bik!",
        confidenceThreshold: 0.7,
      });

      expect(prismaMock.aiAgent.update).toHaveBeenCalledWith({
        where: { id: agentId },
        data: {
          personality: "Enthusiastic and concise",
          language: "ar",
          tone: "Friendly Tunisian",
          sales_strategy: { upsell: true, cross_sell: true, aggressiveness: "high" },
          greeting_template: "Marhba bik!",
          confidence_threshold: 0.7,
        },
      });

      expect(result.personality).toBe("Enthusiastic and concise");
      expect(result.tone).toBe("Friendly Tunisian");
      expect(result.language).toBe("ar");
    });

    it("Validation (400): Passing invalid sales strategy aggressiveness throws 400 Bad Request.", async () => {
      await expect(
        controller.updateAgent(businessId, agentId, {
          salesStrategy: { upsell: true, cross_sell: true, aggressiveness: "ultra" as any },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Not Found (404): Accessing an agent belonging to a different tenant returns 404.", async () => {
      prismaMock.aiAgent.findFirst.mockResolvedValue(null);

      await expect(controller.getAgent(businessId, "wrong-agent-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("Settings CRUD", () => {
    it("Happy Path: Owner/Manager retrieves and updates tenant AI settings and reply mode.", async () => {
      prismaMock.aiSettings.findUnique.mockResolvedValue({
        business_id: businessId,
        model_primary: "gemini-3.5-flash",
        model_fallback: "gpt-5.6-terra",
        max_tokens: 400,
        temperature: 0.4,
        rag_top_k: 5,
        include_product_images_in_context: false,
        blocked_topics: ["politics", "religion"],
        custom_system_append: "Always be polite.",
        reply_mode: "approval_required",
        lead_hot_min: 80,
        lead_warm_min: 50,
        reservation_ttl_minutes: 30,
        inactivity_close_days: 30,
        monthly_ai_budget_usd: "50.000",
        created_at: now,
        updated_at: now,
      });

      const getRes = await controller.getSettings(businessId);
      expect(getRes.replyMode).toBe("approval_required");
      expect(getRes.modelPrimary).toBe("gemini-3.5-flash");

      prismaMock.aiSettings.update.mockResolvedValue({
        business_id: businessId,
        model_primary: "gpt-5.6-terra",
        model_fallback: "claude-sonnet-5",
        max_tokens: 500,
        temperature: 0.3,
        rag_top_k: 8,
        include_product_images_in_context: true,
        blocked_topics: ["politics"],
        custom_system_append: null,
        reply_mode: "auto_send",
        lead_hot_min: 85,
        lead_warm_min: 60,
        reservation_ttl_minutes: 45,
        inactivity_close_days: 14,
        monthly_ai_budget_usd: "100.000",
        created_at: now,
        updated_at: now,
      });

      const updateRes = await controller.updateSettings(businessId, {
        modelPrimary: "gpt-5.6-terra",
        modelFallback: "claude-sonnet-5",
        replyMode: "auto_send",
        leadHotMin: 85,
        monthlyAiBudgetUsd: "100.000",
      });

      expect(prismaMock.aiSettings.update).toHaveBeenCalledWith({
        where: { business_id: businessId },
        data: {
          model_primary: "gpt-5.6-terra",
          model_fallback: "claude-sonnet-5",
          reply_mode: "auto_send",
          lead_hot_min: 85,
          monthly_ai_budget_usd: "100.000",
        },
      });

      expect(updateRes.replyMode).toBe("auto_send");
      expect(updateRes.modelPrimary).toBe("gpt-5.6-terra");
      expect(updateRes.modelFallback).toBe("claude-sonnet-5");
    });

    it("Invalid Model (400): Passing unrecognized model string to settings returns 400 Bad Request.", async () => {
      await expect(
        controller.updateSettings(businessId, {
          modelPrimary: "gpt-5.6-sol" as any, // Forbidden alias per 11 §9.0
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.updateSettings(businessId, {
          modelFallback: "claude-sonnet-4.5" as any, // Forbidden outdated model
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Validation (400): Passing invalid temperature or thresholds throws 400 Bad Request.", async () => {
      await expect(
        controller.updateSettings(businessId, {
          temperature: 5.0, // max 2
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.updateSettings(businessId, {
          leadHotMin: 150, // max 100
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Not Found (404): Accessing settings for non-existent business returns 404.", async () => {
      prismaMock.aiSettings.findUnique.mockResolvedValue(null);

      await expect(controller.getSettings("non-existent-biz")).rejects.toThrow(NotFoundException);
    });
  });

  describe("RBAC & Permissions (ai.configure)", () => {
    it("Employee Access (403): Employee role receives 403 Forbidden for AI configuration.", async () => {
      const { PermissionsGuard } = await import("../../platform/security/permissions.guard");
      const { RequirePermission } = await import("../../platform/security/permissions");
      const { Reflector } = await import("@nestjs/core");

      const reflector = new Reflector();
      const guard = new PermissionsGuard(reflector, prismaMock as unknown as PrismaClient);

      const handler = () => undefined;
      RequirePermission("ai.configure")(handler);

      const req = {
        membership: {
          role: {
            name: "employee",
            role_permissions: [],
          },
        },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => handler,
        getClass: () => AiConfigController,
      } as any;

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("Owner/Admin Access: Owner/Admin role is authorized for ai.configure.", async () => {
      const { PermissionsGuard } = await import("../../platform/security/permissions.guard");
      const { RequirePermission } = await import("../../platform/security/permissions");
      const { Reflector } = await import("@nestjs/core");

      const reflector = new Reflector();
      const guard = new PermissionsGuard(reflector, prismaMock as unknown as PrismaClient);

      const handler = () => undefined;
      RequirePermission("ai.configure")(handler);

      const ownerReq = {
        membership: {
          role: {
            name: "owner",
            role_permissions: [],
          },
        },
      };

      const ownerContext = {
        switchToHttp: () => ({
          getRequest: () => ownerReq,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => handler,
        getClass: () => AiConfigController,
      } as any;

      expect(await guard.canActivate(ownerContext)).toBe(true);

      const adminReq = {
        membership: {
          role: {
            name: "admin",
            role_permissions: [],
          },
        },
      };

      const adminContext = {
        switchToHttp: () => ({
          getRequest: () => adminReq,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => handler,
        getClass: () => AiConfigController,
      } as any;

      expect(await guard.canActivate(adminContext)).toBe(true);
    });
  });
});
