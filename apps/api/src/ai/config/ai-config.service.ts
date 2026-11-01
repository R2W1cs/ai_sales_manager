import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { AiAgentResponse, UpdateAiAgentDto } from "../dto/update-ai-agent.dto";
import { UpdateAiAgentSchema } from "../dto/update-ai-agent.dto";
import type { AiSettingsResponse, UpdateAiSettingsDto } from "../dto/update-ai-settings.dto";
import { UpdateAiSettingsSchema } from "../dto/update-ai-settings.dto";

@Injectable()
export class AiConfigService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * 13 §11 GET /api/v1/ai/agents
   * List agents for tenant (array of one).
   */
  async listAgents(businessId: string): Promise<AiAgentResponse[]> {
    const agents = await this.prisma.aiAgent.findMany({
      where: {
        business_id: businessId,
      },
    });

    return agents.map((agent) => this.mapAgentToResponse(agent));
  }

  /**
   * 13 §11 GET /api/v1/ai/agents/:id
   * Retrieve agent configuration scoped to caller's businessId.
   */
  async getAgent(businessId: string, agentId: string): Promise<AiAgentResponse> {
    const agent = await this.prisma.aiAgent.findFirst({
      where: {
        id: agentId,
        business_id: businessId,
      },
    });

    if (!agent) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "AI agent not found in this business",
        },
      });
    }

    return this.mapAgentToResponse(agent);
  }

  /**
   * 13 §11 PATCH /api/v1/ai/agents/:id
   * Update agent personality/tone/threshold scoped to caller's businessId.
   */
  async updateAgent(
    businessId: string,
    agentId: string,
    dto: UpdateAiAgentDto,
  ): Promise<AiAgentResponse> {
    const parseResult = UpdateAiAgentSchema.safeParse(dto);
    if (!parseResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parseResult.error.issues) {
        const path = issue.path.join(".") || "body";
        fieldErrors[path] = fieldErrors[path] ?? [];
        fieldErrors[path].push(issue.message);
      }
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Invalid AI agent update data",
          details: { fields: fieldErrors },
        },
      });
    }

    const existing = await this.prisma.aiAgent.findFirst({
      where: {
        id: agentId,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "AI agent not found in this business",
        },
      });
    }

    const updated = await this.prisma.aiAgent.update({
      where: {
        id: agentId,
      },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.personality !== undefined ? { personality: dto.personality } : {}),
        ...(dto.language !== undefined ? { language: dto.language } : {}),
        ...(dto.tone !== undefined ? { tone: dto.tone } : {}),
        ...(dto.salesStrategy !== undefined ? { sales_strategy: dto.salesStrategy as object } : {}),
        ...(dto.greetingTemplate !== undefined ? { greeting_template: dto.greetingTemplate } : {}),
        ...(dto.fallbackTemplate !== undefined ? { fallback_template: dto.fallbackTemplate } : {}),
        ...(dto.confidenceThreshold !== undefined
          ? { confidence_threshold: dto.confidenceThreshold }
          : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    });

    return this.mapAgentToResponse(updated);
  }

  /**
   * 13 §11 GET /api/v1/ai/settings
   * Retrieve tenant AI settings.
   */
  async getSettings(businessId: string): Promise<AiSettingsResponse> {
    const settings = await this.prisma.aiSettings.findUnique({
      where: { business_id: businessId },
    });

    if (!settings) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "AI settings not found for this business",
        },
      });
    }

    return this.mapSettingsToResponse(settings);
  }

  /**
   * 13 §11 PATCH /api/v1/ai/settings
   * Update tenant AI reply mode, model IDs, thresholds, budget.
   */
  async updateSettings(businessId: string, dto: UpdateAiSettingsDto): Promise<AiSettingsResponse> {
    const parseResult = UpdateAiSettingsSchema.safeParse(dto);
    if (!parseResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parseResult.error.issues) {
        const path = issue.path.join(".") || "body";
        fieldErrors[path] = fieldErrors[path] ?? [];
        fieldErrors[path].push(issue.message);
      }
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Invalid AI settings update data",
          details: { fields: fieldErrors },
        },
      });
    }

    const existing = await this.prisma.aiSettings.findUnique({
      where: { business_id: businessId },
    });

    if (!existing) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "AI settings not found for this business",
        },
      });
    }

    const updated = await this.prisma.aiSettings.update({
      where: { business_id: businessId },
      data: {
        ...(dto.modelPrimary !== undefined ? { model_primary: dto.modelPrimary } : {}),
        ...(dto.modelFallback !== undefined ? { model_fallback: dto.modelFallback } : {}),
        ...(dto.maxTokens !== undefined ? { max_tokens: dto.maxTokens } : {}),
        ...(dto.temperature !== undefined ? { temperature: dto.temperature } : {}),
        ...(dto.ragTopK !== undefined ? { rag_top_k: dto.ragTopK } : {}),
        ...(dto.includeProductImagesInContext !== undefined
          ? { include_product_images_in_context: dto.includeProductImagesInContext }
          : {}),
        ...(dto.blockedTopics !== undefined ? { blocked_topics: dto.blockedTopics } : {}),
        ...(dto.customSystemAppend !== undefined
          ? { custom_system_append: dto.customSystemAppend }
          : {}),
        ...(dto.replyMode !== undefined ? { reply_mode: dto.replyMode } : {}),
        ...(dto.leadHotMin !== undefined ? { lead_hot_min: dto.leadHotMin } : {}),
        ...(dto.leadWarmMin !== undefined ? { lead_warm_min: dto.leadWarmMin } : {}),
        ...(dto.reservationTtlMinutes !== undefined
          ? { reservation_ttl_minutes: dto.reservationTtlMinutes }
          : {}),
        ...(dto.inactivityCloseDays !== undefined
          ? { inactivity_close_days: dto.inactivityCloseDays }
          : {}),
        ...(dto.monthlyAiBudgetUsd !== undefined
          ? { monthly_ai_budget_usd: dto.monthlyAiBudgetUsd }
          : {}),
      },
    });

    return this.mapSettingsToResponse(updated);
  }

  private mapAgentToResponse(agent: {
    id: string;
    business_id: string;
    name: string;
    personality: string | null;
    language: string;
    tone: string | null;
    sales_strategy: unknown;
    greeting_template: string | null;
    fallback_template: string | null;
    confidence_threshold: unknown;
    enabled: boolean;
    created_at: Date;
    updated_at: Date;
  }): AiAgentResponse {
    return {
      id: agent.id,
      businessId: agent.business_id,
      name: agent.name,
      personality: agent.personality,
      language: agent.language,
      tone: agent.tone,
      salesStrategy: agent.sales_strategy as AiAgentResponse["salesStrategy"],
      greetingTemplate: agent.greeting_template,
      fallbackTemplate: agent.fallback_template,
      confidenceThreshold: Number(agent.confidence_threshold),
      enabled: agent.enabled,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
    };
  }

  private mapSettingsToResponse(settings: {
    business_id: string;
    model_primary: string;
    model_fallback: string;
    max_tokens: number;
    temperature: unknown;
    rag_top_k: number;
    include_product_images_in_context: boolean;
    blocked_topics: string[];
    custom_system_append: string | null;
    reply_mode: "auto_send" | "approval_required" | "draft_only";
    lead_hot_min: number;
    lead_warm_min: number;
    reservation_ttl_minutes: number;
    inactivity_close_days: number;
    monthly_ai_budget_usd: unknown;
    created_at: Date;
    updated_at: Date;
  }): AiSettingsResponse {
    let budget: string | null = null;
    const rawBudget = settings.monthly_ai_budget_usd;
    if (rawBudget !== null && rawBudget !== undefined) {
      if (typeof rawBudget === "string") {
        budget = rawBudget;
      } else if (typeof rawBudget === "number") {
        budget = rawBudget.toFixed(3);
      } else if (typeof rawBudget === "object" && "toString" in rawBudget) {
        budget = (rawBudget as { toString(): string }).toString();
      }
    }

    return {
      businessId: settings.business_id,
      modelPrimary: settings.model_primary,
      modelFallback: settings.model_fallback,
      maxTokens: settings.max_tokens,
      temperature: Number(settings.temperature),
      ragTopK: settings.rag_top_k,
      includeProductImagesInContext: settings.include_product_images_in_context,
      blockedTopics: settings.blocked_topics,
      customSystemAppend: settings.custom_system_append,
      replyMode: settings.reply_mode,
      leadHotMin: settings.lead_hot_min,
      leadWarmMin: settings.lead_warm_min,
      reservationTtlMinutes: settings.reservation_ttl_minutes,
      inactivityCloseDays: settings.inactivity_close_days,
      monthlyAiBudgetUsd: budget,
      createdAt: settings.created_at,
      updatedAt: settings.updated_at,
    };
  }
}
