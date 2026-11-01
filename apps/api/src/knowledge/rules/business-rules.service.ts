import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { BusinessRule, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { toValidationException } from "../../platform/core/errors";
import {
  CreateBusinessRuleSchema,
  UpdateBusinessRuleSchema,
  normalizeRuleType,
  validateRulePayload,
} from "../dto/create-business-rule.dto";
import type {
  BusinessRuleResponse,
  CreateBusinessRuleDto,
  ListBusinessRulesQueryDto,
  RuleType,
  UpdateBusinessRuleDto,
} from "../dto/create-business-rule.dto";

@Injectable()
export class BusinessRulesService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  /** Maps a Prisma BusinessRule entity to the standard API response DTO. */
  private formatRule(rule: BusinessRule, version?: number): BusinessRuleResponse {
    return {
      id: rule.id,
      businessId: rule.business_id,
      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion
      ruleType: rule.rule_type as unknown as RuleType,
      payload: rule.payload as Record<string, unknown>,
      priority: rule.priority,
      enabled: rule.enabled,
      effectiveFrom: rule.effective_from,
      effectiveTo: rule.effective_to,
      createdAt: rule.created_at,
      ...(version !== undefined ? { version } : {}),
    };
  }

  /**
   * Computes the ordinal version number for a specific rule row as the count of
   * same-type rows for this business created at or before its own `created_at`.
   */
  private async computeVersionNumber(
    businessId: string,
    ruleType: RuleType,
    createdAt: Date,
  ): Promise<number> {
    return this.prisma.businessRule.count({
      where: {
        business_id: businessId,
        rule_type: ruleType,
        created_at: { lte: createdAt },
      },
    });
  }

  /**
   * 13 §12.4 POST /api/v1/business-rules
   * Creates a new immutable rule version.
   * Closes all prior active versions by setting `effective_to = NOW()` (wall-clock),
   * then inserts the new row. The new row's `effective_from` is independent of the
   * close timestamp, preventing dual-active-version windows (spec §4 invariant).
   */
  async createRuleVersion(
    businessId: string,
    dto: CreateBusinessRuleDto,
  ): Promise<BusinessRuleResponse> {
    const parseResult = CreateBusinessRuleSchema.safeParse(dto);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const data = parseResult.data;
    const rawType = data.ruleType ?? data.rule_type ?? "";
    const ruleType = normalizeRuleType(rawType);

    // Validate payload against strict Zod definitions (12 §14.8)
    let validatedPayload: unknown;
    try {
      validatedPayload = validateRulePayload(ruleType, data.payload);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        throw toValidationException(err);
      }
      const message = err instanceof Error ? err.message : "Invalid payload for rule type";
      throw new BadRequestException({ error: { code: "validation_error", message } });
    }

    const priority = data.priority ?? 100;
    const enabled = data.enabled ?? data.is_enabled ?? true;
    const effectiveFrom = data.effectiveFrom
      ? new Date(data.effectiveFrom)
      : data.effective_from
        ? new Date(data.effective_from)
        : new Date();

    return this.prisma.$transaction(async (tx) => {
      // Close prior active versions at wall-clock NOW(), not at effectiveFrom.
      // Using effectiveFrom as the close timestamp would create a window where two
      // versions are simultaneously active if effectiveFrom is in the future.
      const closeAt = new Date();
      await tx.businessRule.updateMany({
        where: {
          business_id: businessId,
          rule_type: ruleType,
          OR: [{ effective_to: null }, { effective_to: { gt: closeAt } }],
        },
        data: { effective_to: closeAt },
      });

      // Create the new rule version
      const created = await tx.businessRule.create({
        data: {
          business_id: businessId,
          rule_type: ruleType,
          payload: validatedPayload as Prisma.InputJsonValue,
          priority,
          enabled,
          effective_from: effectiveFrom,
          effective_to: null,
        },
      });

      // Version = total count of same-type rows for this business (including new row)
      const versionCount = await tx.businessRule.count({
        where: { business_id: created.business_id, rule_type: created.rule_type },
      });

      return this.formatRule(created, versionCount);
    });
  }

  /**
   * 13 §12.4 GET /api/v1/business-rules
   * Default: active rules grouped by ruleType (card §3 contract).
   * Pass `flat=true` for a flat array; `history=true` for all versions (always flat).
   */
  async listRules(
    businessId: string,
    query?: ListBusinessRulesQueryDto,
  ): Promise<Record<string, BusinessRuleResponse> | BusinessRuleResponse[]> {
    const rawType = query?.ruleType ?? query?.rule_type;
    const ruleType = rawType ? normalizeRuleType(rawType) : undefined;
    const asOfRaw = query?.effectiveAt ?? query?.effective_at ?? query?.asOf ?? query?.as_of;
    const asOf = asOfRaw ? new Date(asOfRaw) : new Date();
    // NestJS @Query() delivers raw strings — coerce boolean params explicitly
    const coerceBool = (v: boolean | string | undefined): boolean => v === true || v === "true";
    const isHistory = coerceBool(query?.history) || coerceBool(query?.includeHistory);
    const isFlat = coerceBool(query?.flat) || isHistory;

    // Fetch active rules and allRuleMeta concurrently
    const [rules, allRuleMeta] = await Promise.all([
      this.prisma.businessRule.findMany({
        where: {
          business_id: businessId,
          ...(ruleType ? { rule_type: ruleType } : {}),
          ...(!isHistory
            ? {
                effective_from: { lte: asOf },
                OR: [{ effective_to: null }, { effective_to: { gt: asOf } }],
              }
            : {}),
        },
        orderBy: [
          { rule_type: "asc" },
          { priority: "desc" },
          { effective_from: "desc" },
          { created_at: "desc" },
        ],
      }),
      this.prisma.businessRule.findMany({
        where: { business_id: businessId },
        select: { id: true, rule_type: true, created_at: true },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
      }),
    ]);

    const versionMap = new Map<string, number>();
    const typeCount = new Map<string, number>();
    for (const r of allRuleMeta) {
      const count = (typeCount.get(r.rule_type) ?? 0) + 1;
      typeCount.set(r.rule_type, count);
      versionMap.set(r.id, count);
    }

    const formatted = rules.map((r) => this.formatRule(r, versionMap.get(r.id) ?? 1));

    if (isFlat) {
      return formatted;
    }

    // Default: grouped by ruleType (card §3 technical contract)
    const grouped: Record<string, BusinessRuleResponse> = {};
    for (const r of formatted) {
      grouped[r.ruleType] ??= r;
    }
    return grouped;
  }

  /**
   * 13 §12.4 PATCH /api/v1/business-rules/:id
   * Modifies `enabled` or `effective_to` only. In-place payload mutation is forbidden.
   * Uses `updateMany` (not `update`) so that `business_id` can be included in the WHERE
   * clause, satisfying Standard 1 (multi-tenant isolation) on the mutating query itself.
   */
  async updateRule(
    businessId: string,
    ruleId: string,
    dto: UpdateBusinessRuleDto,
  ): Promise<BusinessRuleResponse> {
    const parseResult = UpdateBusinessRuleSchema.safeParse(dto);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const data = parseResult.data;
    const enabled = data.enabled ?? data.is_enabled;
    const effectiveTo =
      data.effectiveTo !== undefined
        ? data.effectiveTo
          ? new Date(data.effectiveTo)
          : null
        : data.effective_to !== undefined
          ? data.effective_to
            ? new Date(data.effective_to)
            : null
          : undefined;

    // updateMany includes business_id in WHERE — Standard 1 (multi-tenant isolation)
    const result = await this.prisma.businessRule.updateMany({
      where: { id: ruleId, business_id: businessId },
      data: {
        ...(enabled !== undefined ? { enabled } : {}),
        ...(effectiveTo !== undefined ? { effective_to: effectiveTo } : {}),
      },
    });

    if (result.count === 0) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Business rule not found" },
      });
    }

    // Refetch updated entity for the canonical response
    const rule = await this.prisma.businessRule.findFirst({
      where: { id: ruleId, business_id: businessId },
    });

    if (!rule) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Business rule not found" },
      });
    }

    const version = await this.computeVersionNumber(businessId, rule.rule_type, rule.created_at);
    return this.formatRule(rule, version);
  }
}
