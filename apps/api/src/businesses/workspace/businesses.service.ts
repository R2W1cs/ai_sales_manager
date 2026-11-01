import * as crypto from "node:crypto";

import { ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { toValidationException } from "../../platform/core/errors";
import type { CreateBusinessDto, CreateBusinessResponse } from "../dto/create-business.dto";
import { CreateBusinessSchema } from "../dto/create-business.dto";
import type { BusinessProfileResponse, UpdateBusinessDto } from "../dto/update-business.dto";
import { UpdateBusinessSchema } from "../dto/update-business.dto";

@Injectable()
export class BusinessesService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  async createBusiness(
    userId: string,
    rawDto: CreateBusinessDto,
    idempotencyKey?: string,
  ): Promise<CreateBusinessResponse> {
    const parseResult = CreateBusinessSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const dto = parseResult.data;
    const requestHash = crypto.createHash("sha256").update(JSON.stringify(rawDto)).digest("hex");

    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyKey.findFirst({
        where: { key: idempotencyKey },
      });

      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new ConflictException({
            error: {
              code: "idempotency_key_conflict",
              message: "Idempotency key already used with different payload",
            },
          });
        }
        if (existing.response_body) {
          return existing.response_body as unknown as CreateBusinessResponse;
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Resolve or create system owner role
      const ownerRole = await tx.role.findFirst({
        where: { name: "owner", business_id: null },
      });

      let roleId = ownerRole?.id;
      if (!roleId) {
        const createdRole = await tx.role.create({
          data: { name: "owner" },
        });
        roleId = createdRole.id;
      }

      // 2. Insert business and sync Better Auth organization
      const business = await tx.business.create({
        data: {
          name: dto.name,
          industry: dto.industry ?? "fashion",
          country: dto.country ?? "TN",
          default_language: dto.defaultLanguage ?? "fr",
          timezone: dto.timezone ?? "Africa/Tunis",
          currency: dto.currency ?? "TND",
          settings: {},
        },
      });

      // Sync Better Auth organization
      await tx.organization.upsert({
        where: { id: business.id },
        update: { name: dto.name },
        create: {
          id: business.id,
          name: dto.name,
          slug: dto.name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + business.id.slice(0, 8),
        },
      });

      // 3. Insert membership (Owner) and sync Better Auth member
      const membership = await tx.businessMember.create({
        data: {
          business_id: business.id,
          user_id: userId,
          role_id: roleId,
          joined_at: new Date(),
        },
        include: {
          role: true,
        },
      });

      await tx.member.upsert({
        where: {
          organizationId_userId: {
            organizationId: business.id,
            userId,
          },
        },
        update: { role: "owner" },
        create: {
          organizationId: business.id,
          userId,
          role: "owner",
        },
      });

      // 4. Insert default AI agent
      const aiAgent = await tx.aiAgent.create({
        data: {
          business_id: business.id,
          name: "Sales Assistant",
          language: dto.defaultLanguage ?? "ar",
          confidence_threshold: 0.65,
          enabled: true,
        },
      });

      // 5. Insert AI settings (reply_mode = 'approval_required')
      await tx.aiSettings.create({
        data: {
          business_id: business.id,
          model_primary: "gemini-3.5-flash",
          model_fallback: "gpt-5.6-terra",
          max_tokens: 400,
          temperature: 0.4,
          rag_top_k: 5,
          include_product_images_in_context: false,
          blocked_topics: [],
          reply_mode: "approval_required",
          lead_hot_min: 80,
          lead_warm_min: 50,
          reservation_ttl_minutes: 30,
          inactivity_close_days: 30,
        },
      });

      // 6. Insert starter business rules
      const now = new Date();
      await tx.businessRule.createMany({
        data: [
          {
            business_id: business.id,
            rule_type: "delivery",
            payload: {
              zones: [
                {
                  name: "Tunis",
                  fee: 5,
                  currency: dto.currency ?? "TND",
                  eta_hours: 24,
                },
              ],
            },
            priority: 100,
            enabled: true,
            effective_from: now,
          },
          {
            business_id: business.id,
            rule_type: "payment",
            payload: {
              methods: [{ code: "cod", label: "Cash on delivery" }],
            },
            priority: 100,
            enabled: true,
            effective_from: now,
          },
          {
            business_id: business.id,
            rule_type: "returns",
            payload: {
              window_days: 7,
              conditions: "unworn, tags on",
            },
            priority: 100,
            enabled: true,
            effective_from: now,
          },
        ],
      });

      // 7. Insert onboarding tracker
      const onboarding = await tx.businessOnboarding.create({
        data: {
          business_id: business.id,
          business_created: true,
          channel_connected: false,
          products_imported: false,
          ai_configured: false,
          playground_passed: false,
          approval_trial_passed: false,
          handoff_acknowledged: false,
          ai_activated: false,
        },
      });

      const response: CreateBusinessResponse = {
        business: {
          id: business.id,
          name: business.name,
          industry: business.industry,
          country: business.country,
          defaultLanguage: business.default_language,
          timezone: business.timezone,
          currency: business.currency,
          createdAt: business.created_at,
        },
        membership: {
          businessId: membership.business_id,
          role: membership.role.name as "owner" | "admin" | "employee",
          joinedAt: membership.joined_at,
        },
        aiAgent: {
          id: aiAgent.id,
          name: aiAgent.name,
          language: aiAgent.language,
          confidenceThreshold: Number(aiAgent.confidence_threshold),
          enabled: aiAgent.enabled,
        },
        onboarding: {
          businessCreated: onboarding.business_created,
          channelConnected: onboarding.channel_connected,
          productsImported: onboarding.products_imported,
          aiConfigured: onboarding.ai_configured,
          playgroundPassed: onboarding.playground_passed,
          approvalTrialPassed: onboarding.approval_trial_passed,
          handoffAcknowledged: onboarding.handoff_acknowledged,
          aiActivated: onboarding.ai_activated,
        },
      };

      // 8. Save Idempotency Key record
      if (idempotencyKey) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await tx.idempotencyKey.create({
          data: {
            business_id: business.id,
            key: idempotencyKey,
            request_hash: requestHash,
            response_status: 201,
            response_body: response,
            expires_at: expiresAt,
          },
        });
      }

      return response;
    });
  }

  async getBusiness(businessId: string): Promise<BusinessProfileResponse> {
    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        deleted_at: null,
      },
    });

    if (!business) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Business not found",
        },
      });
    }

    const settings =
      business.settings && typeof business.settings === "object"
        ? (business.settings as Record<string, unknown>)
        : {};

    return {
      id: business.id,
      name: business.name,
      industry: business.industry,
      country: business.country,
      defaultLanguage: business.default_language,
      timezone: business.timezone,
      currency: business.currency,
      phone: typeof settings.phone === "string" ? settings.phone : undefined,
      createdAt: business.created_at,
      updatedAt: business.updated_at,
    };
  }

  async updateBusiness(
    businessId: string,
    rawDto: UpdateBusinessDto,
  ): Promise<BusinessProfileResponse> {
    const parseResult = UpdateBusinessSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const dto = parseResult.data;

    const existing = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        deleted_at: null,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Business not found",
        },
      });
    }

    const currentSettings =
      existing.settings && typeof existing.settings === "object"
        ? (existing.settings as Record<string, unknown>)
        : {};
    const newSettings =
      dto.phone !== undefined ? { ...currentSettings, phone: dto.phone } : currentSettings;

    const updated = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.industry !== undefined && { industry: dto.industry }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.defaultLanguage !== undefined && { default_language: dto.defaultLanguage }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.phone !== undefined && { settings: newSettings as Prisma.InputJsonObject }),
      },
    });

    const updatedSettings =
      updated.settings && typeof updated.settings === "object"
        ? (updated.settings as Record<string, unknown>)
        : {};

    return {
      id: updated.id,
      name: updated.name,
      industry: updated.industry,
      country: updated.country,
      defaultLanguage: updated.default_language,
      timezone: updated.timezone,
      currency: updated.currency,
      phone: typeof updatedSettings.phone === "string" ? updatedSettings.phone : undefined,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }
}
