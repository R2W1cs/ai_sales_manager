import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { type AiPrompt, type Message, type PrismaClient, PromptType } from "@prisma/client";
import { z } from "zod";

import { PromptTypeSchema } from "@app/shared";
import type { AiMetadata } from "@app/shared";

import { prisma as defaultPrisma } from "../../lib/prisma";

export const CreatePromptSchema = z.object({
  type: PromptTypeSchema,
  content: z.string().trim().min(1, "Prompt content cannot be empty"),
});

export type CreatePromptDto = z.infer<typeof CreatePromptSchema>;

export interface AiPromptResponse {
  id: string;
  businessId: string;
  type: PromptType;
  content: string;
  version: number;
  active: boolean;
  createdByUserId: string | null;
  createdAt: Date;
}

export interface BuildAiMetadataParams {
  intent: string;
  confidence: number;
  toolsCalled?: string[];
  model: string;
  latencyMs: number;
  promptVersionId?: string | null;
  fallbackUsed?: boolean;
}

@Injectable()
export class PromptVersionsService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * 13 §11 / 15 §18.2 Create a new immutable prompt version
   * Monotonically increments version per (business_id, type), deactivates prior active versions,
   * and marks the new version as active. Prompts are immutable once created.
   */
  async createPromptVersion(
    businessId: string,
    dto: CreatePromptDto,
    userId?: string | null,
  ): Promise<AiPromptResponse> {
    const parseResult = CreatePromptSchema.safeParse(dto);
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
          message: "Invalid prompt version data",
          details: { fields: fieldErrors },
        },
      });
    }

    const { type, content } = parseResult.data;

    return this.prisma.$transaction(async (tx) => {
      // 1. Find the highest existing version for this business and type
      const latest = await tx.aiPrompt.findFirst({
        where: {
          business_id: businessId,
          type,
        },
        orderBy: {
          version: "desc",
        },
        select: {
          version: true,
        },
      });

      const nextVersion = latest ? latest.version + 1 : 1;

      // 2. Deactivate existing active prompt for this business and type
      await tx.aiPrompt.updateMany({
        where: {
          business_id: businessId,
          type,
          active: true,
        },
        data: {
          active: false,
        },
      });

      // 3. Create the new immutable prompt version
      const prompt = await tx.aiPrompt.create({
        data: {
          business_id: businessId,
          type,
          content,
          version: nextVersion,
          active: true,
          created_by_user_id: userId ?? null,
        },
      });

      return this.mapPromptToResponse(prompt);
    });
  }

  /**
   * 13 §11 List all prompt versions for a tenant, optionally filtered by PromptType.
   */
  async listPrompts(businessId: string, type?: PromptType): Promise<AiPromptResponse[]> {
    const prompts = await this.prisma.aiPrompt.findMany({
      where: {
        business_id: businessId,
        ...(type ? { type } : {}),
      },
      orderBy: [{ type: "asc" }, { version: "desc" }],
    });

    return prompts.map((p) => this.mapPromptToResponse(p));
  }

  /**
   * Retrieve a specific prompt version by ID scoped to caller's businessId.
   */
  async getPromptById(businessId: string, promptId: string): Promise<AiPromptResponse> {
    const prompt = await this.prisma.aiPrompt.findFirst({
      where: {
        id: promptId,
        business_id: businessId,
      },
    });

    if (!prompt) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Prompt version not found",
        },
      });
    }

    return this.mapPromptToResponse(prompt);
  }

  /**
   * Retrieve the currently active prompt version for a given PromptType.
   */
  async getActivePrompt(businessId: string, type: PromptType): Promise<AiPromptResponse | null> {
    const prompt = await this.prisma.aiPrompt.findFirst({
      where: {
        business_id: businessId,
        type,
        active: true,
      },
    });

    return prompt ? this.mapPromptToResponse(prompt) : null;
  }

  /**
   * Convenience helper to get the active prompt version UUID for audit linking.
   */
  async getActivePromptId(
    businessId: string,
    type: PromptType = PromptType.system,
  ): Promise<string | null> {
    const prompt = await this.getActivePrompt(businessId, type);
    return prompt?.id ?? null;
  }

  /**
   * Activate an existing prompt version (e.g., rollback), deactivating others of the same type.
   */
  async activatePromptVersion(businessId: string, promptId: string): Promise<AiPromptResponse> {
    const target = await this.prisma.aiPrompt.findFirst({
      where: {
        id: promptId,
        business_id: businessId,
      },
    });

    if (!target) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Prompt version not found",
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.aiPrompt.updateMany({
        where: {
          business_id: businessId,
          type: target.type,
          active: true,
        },
        data: {
          active: false,
        },
      });

      const updated = await tx.aiPrompt.update({
        where: {
          id: promptId,
        },
        data: {
          active: true,
        },
      });

      return this.mapPromptToResponse(updated);
    });
  }

  /**
   * Attach exact prompt_version_id to a message's ai_metadata and link any associated ai_usage record.
   * Fulfills T-AI-03 audit traceability requirement.
   */
  async attachPromptVersionToMessage(
    businessId: string,
    messageId: string,
    promptVersionId: string,
  ): Promise<Message> {
    // 1. Verify prompt version exists in business
    const prompt = await this.prisma.aiPrompt.findFirst({
      where: {
        id: promptVersionId,
        business_id: businessId,
      },
    });

    if (!prompt) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Prompt version not found in this business",
        },
      });
    }

    // 2. Verify message exists
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        business_id: businessId,
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Message not found in this business",
        },
      });
    }

    const existingMetadata =
      typeof message.ai_metadata === "object" && message.ai_metadata !== null
        ? (message.ai_metadata as Record<string, unknown>)
        : {};

    const updatedMetadata = {
      ...existingMetadata,
      prompt_version_id: promptVersionId,
    };

    return this.prisma.$transaction(async (tx) => {
      // Link to message ai_metadata
      const updatedMessage = await tx.message.update({
        where: {
          id: messageId,
        },
        data: {
          ai_metadata: updatedMetadata,
        },
      });

      // Also link any existing ai_usage records for this message
      await tx.aiUsage.updateMany({
        where: {
          business_id: businessId,
          message_id: messageId,
        },
        data: {
          prompt_version_id: promptVersionId,
        },
      });

      return updatedMessage;
    });
  }

  /**
   * Build structured AI metadata envelope with exact prompt_version_id (15 §13.2 / 12 §14.2)
   */
  buildAiMetadata(params: BuildAiMetadataParams): AiMetadata {
    return {
      intent: params.intent,
      confidence: params.confidence,
      tools_called: params.toolsCalled ?? [],
      model: params.model,
      latency_ms: params.latencyMs,
      prompt_version_id: params.promptVersionId ?? null,
      fallback_used: params.fallbackUsed ?? false,
    };
  }

  /**
   * Helper to map Prisma entity to clean DTO response
   */
  private mapPromptToResponse(prompt: AiPrompt): AiPromptResponse {
    return {
      id: prompt.id,
      businessId: prompt.business_id,
      type: prompt.type,
      content: prompt.content,
      version: prompt.version,
      active: prompt.active,
      createdByUserId: prompt.created_by_user_id,
      createdAt: prompt.created_at,
    };
  }
}
