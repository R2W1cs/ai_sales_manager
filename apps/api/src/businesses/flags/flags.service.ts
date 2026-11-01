import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { toValidationException } from "../../platform/core/errors";

export const DOMAIN_FEATURE_FLAGS = [
  "whatsapp_enabled",
  "voice_agent",
  "advanced_analytics",
  "vip_auto_handoff",
  "ai_shadow_mode",
] as const;

export type DomainFeatureFlag = (typeof DOMAIN_FEATURE_FLAGS)[number];

export const FeatureFlagKeySchema = z.enum(DOMAIN_FEATURE_FLAGS);

export const UpdateFeatureFlagSchema = z.strictObject({
  key: FeatureFlagKeySchema,
  enabled: z.boolean(),
});

export type UpdateFeatureFlagDto = z.infer<typeof UpdateFeatureFlagSchema>;

export interface FeatureFlagsResponse {
  flags: Record<DomainFeatureFlag, boolean>;
}

@Injectable()
export class FlagsService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * 13 §13 GET /api/v1/businesses/:id/flags or GET /api/v1/feature-flags
   * Resolves feature flags for a business: platform defaults overlaid with business overrides.
   */
  async getFeatureFlags(businessId: string): Promise<FeatureFlagsResponse> {
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
          message: "Business workspace not found or has been deleted",
        },
      });
    }

    const resolvedFlags: Record<DomainFeatureFlag, boolean> = {
      whatsapp_enabled: false,
      voice_agent: false,
      advanced_analytics: false,
      vip_auto_handoff: false,
      ai_shadow_mode: false,
    };

    // 1. Fetch platform-level defaults (business_id IS NULL)
    const platformFlags = await this.prisma.featureFlag.findMany({
      where: { business_id: null },
    });

    for (const platformFlag of platformFlags) {
      if (DOMAIN_FEATURE_FLAGS.includes(platformFlag.feature as DomainFeatureFlag)) {
        resolvedFlags[platformFlag.feature as DomainFeatureFlag] = platformFlag.enabled;
      }
    }

    // 2. Fetch business-specific overrides
    const businessFlags = await this.prisma.featureFlag.findMany({
      where: { business_id: businessId },
    });

    for (const businessFlag of businessFlags) {
      if (DOMAIN_FEATURE_FLAGS.includes(businessFlag.feature as DomainFeatureFlag)) {
        resolvedFlags[businessFlag.feature as DomainFeatureFlag] = businessFlag.enabled;
      }
    }

    return { flags: resolvedFlags };
  }

  /**
   * 13 §13 PATCH /api/v1/businesses/:id/flags or PATCH /api/v1/feature-flags/:feature
   * Updates/toggles a specific feature flag for a business.
   * Rejects unrecognized flag keys with 400 Bad Request.
   */
  async updateFeatureFlag(
    businessId: string,
    keyOrDto: unknown,
    enabledValue?: boolean,
  ): Promise<FeatureFlagsResponse> {
    let key: DomainFeatureFlag;
    let enabled: boolean;

    if (typeof keyOrDto === "string") {
      const keyParse = FeatureFlagKeySchema.safeParse(keyOrDto);
      if (!keyParse.success || typeof enabledValue !== "boolean") {
        throw new BadRequestException({
          error: {
            code: "validation_error",
            message: "Invalid feature flag key or enabled value",
          },
        });
      }
      key = keyParse.data;
      enabled = enabledValue;
    } else {
      const parseResult = UpdateFeatureFlagSchema.safeParse(keyOrDto);
      if (!parseResult.success) {
        throw toValidationException(
          parseResult.error,
          "Invalid feature flag key or payload format",
        );
      }
      key = parseResult.data.key;
      enabled = parseResult.data.enabled;
    }

    await this.prisma.featureFlag.upsert({
      where: {
        business_id_feature: {
          business_id: businessId,
          feature: key,
        },
      },
      create: {
        business_id: businessId,
        feature: key,
        enabled,
      },
      update: {
        enabled,
      },
    });

    return this.getFeatureFlags(businessId);
  }
}
