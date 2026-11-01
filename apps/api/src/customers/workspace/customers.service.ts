import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";

import {
  type Address,
  type CustomerProfileResponse,
  CustomerProfileResponseSchema,
  normalizePhone,
} from "@app/shared";

import { AuditService } from "../../businesses/audit/audit.service";
import { prisma as defaultPrisma } from "../../lib/prisma";
import { assertUuid, toValidationException } from "../../platform/core/errors";
import { InjectPrisma } from "../../platform/core/prisma.token";
import { type UpdateCustomerDto, UpdateCustomerSchema } from "../dto/update-customer.dto";

function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (trimmed.length <= 4) return "****";
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-3)}`;
}

function maskName(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/);
  return parts.map((part) => (part.length > 1 ? `${part[0]}***` : "*")).join(" ");
}

const customerProfileInclude = (businessId: string) => ({
  identities: {
    where: { business_id: businessId },
    orderBy: [{ created_at: "asc" as const }, { id: "asc" as const }],
  },
  tags: {
    where: { business_id: businessId },
    orderBy: [{ tag: "asc" as const }, { id: "asc" as const }],
    select: { tag: true },
  },
  notes: {
    where: { business_id: businessId },
    orderBy: [{ created_at: "desc" as const }, { id: "desc" as const }],
    take: 100,
    select: {
      id: true,
      author_user_id: true,
      body: true,
      created_at: true,
    },
  },
  orders: {
    where: { business_id: businessId, is_test: false },
    orderBy: [{ created_at: "desc" as const }, { id: "desc" as const }],
    take: 50,
  },
});

type RawCustomerProfile = Prisma.CustomerGetPayload<{
  include: ReturnType<typeof customerProfileInclude>;
}>;

@Injectable()
export class CustomersService {
  private readonly prisma: PrismaClient;

  constructor(
    @Optional() @InjectPrisma() prismaClient?: PrismaClient,
    @Optional() private readonly auditService?: AuditService,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  private formatProfile(customer: RawCustomerProfile): CustomerProfileResponse {
    const preferences =
      customer.preferences &&
      typeof customer.preferences === "object" &&
      !Array.isArray(customer.preferences)
        ? (customer.preferences as Record<string, unknown>)
        : null;

    const tags = Array.from(new Set(customer.tags.map(({ tag }) => tag.toLowerCase()))).sort();
    const notes = customer.notes.map((note) => ({
      id: note.id,
      body: note.body,
      authorUserId: note.author_user_id,
      createdAt: note.created_at.toISOString(),
    }));

    const payload: CustomerProfileResponse = {
      id: customer.id,
      businessId: customer.business_id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address as Address | null,
      language: customer.language,
      preferences,
      lifecycleStage: customer.lifecycle_stage,
      confirmedOrderCount: customer.confirmed_order_count,
      lastConfirmedOrderAt: customer.last_confirmed_order_at
        ? customer.last_confirmed_order_at.toISOString()
        : null,
      isTest: customer.is_test,
      createdAt: customer.created_at.toISOString(),
      updatedAt: customer.updated_at.toISOString(),
      tags,
      notes,
      identities: customer.identities.map((i) => ({
        id: i.id,
        businessId: i.business_id,
        customerId: i.customer_id,
        platform: i.platform,
        platformUserId: i.platform_user_id,
        phoneNumber: i.phone_number,
        verifiedAt: i.verified_at ? i.verified_at.toISOString() : null,
        createdAt: i.created_at.toISOString(),
      })),
      orders: customer.orders.map((o) => ({
        id: o.id,
        status: o.status,
        paymentStatus: o.payment_status,
        currency: o.currency,
        subtotal: o.subtotal.toFixed(3),
        deliveryFee: o.delivery_fee.toFixed(3),
        total: o.total.toFixed(3),
        createdAt: o.created_at.toISOString(),
      })),
    };

    const parseResult = CustomerProfileResponseSchema.safeParse(payload);
    if (!parseResult.success) {
      throw toValidationException(
        parseResult.error,
        "Internal error: Malformed customer profile data",
      );
    }

    return parseResult.data;
  }

  async getCustomer(businessId: string, customerId: string): Promise<CustomerProfileResponse> {
    assertUuid(businessId, "businessId");
    assertUuid(customerId, "customerId");

    const include = customerProfileInclude(businessId);
    let customer: RawCustomerProfile | null = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        business_id: businessId,
        erased_at: null,
      },
      include,
    });

    if (!customer) {
      throw new NotFoundException({
        error: {
          code: "customer_not_found",
          message: `Customer ${customerId} not found`,
        },
      });
    }

    if (customer.merged_into_customer_id) {
      let rootId: string | null = customer.merged_into_customer_id;
      const visited = new Set<string>([customer.id]);
      const MAX_DEPTH = 20;
      let depth = 0;

      while (rootId) {
        if (visited.has(rootId) || depth >= MAX_DEPTH) {
          throw new BadRequestException({
            error: {
              code: "customer_merge_cycle",
              message: `Detected cyclic customer merge pointer for customer ${customerId}`,
            },
          });
        }
        depth++;
        visited.add(rootId);

        const parent: RawCustomerProfile | null = await this.prisma.customer.findFirst({
          where: {
            id: rootId,
            business_id: businessId,
            erased_at: null,
          },
          include,
        });

        if (!parent) {
          throw new NotFoundException({
            error: {
              code: "customer_not_found",
              message: `Root customer ${rootId} for merged customer ${customerId} not found`,
            },
          });
        }

        customer = parent;
        rootId = parent.merged_into_customer_id;
      }
    }

    return this.formatProfile(customer);
  }

  async updateCustomer(
    businessId: string,
    userId: string,
    customerId: string,
    body: UpdateCustomerDto,
  ): Promise<CustomerProfileResponse> {
    assertUuid(businessId, "businessId");
    assertUuid(userId, "userId");
    assertUuid(customerId, "customerId");

    const parseResult = UpdateCustomerSchema.safeParse(body);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const data = parseResult.data;

    await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: {
          id: customerId,
          erased_at: null,
        },
        select: {
          id: true,
          business_id: true,
          name: true,
          phone: true,
          merged_into_customer_id: true,
        },
      });

      if (!customer) {
        throw new NotFoundException({
          error: {
            code: "customer_not_found",
            message: `Customer ${customerId} not found`,
          },
        });
      }

      if (customer.business_id !== businessId) {
        throw new ForbiddenException({
          error: {
            code: "forbidden",
            message: `Customer ${customerId} does not belong to the current workspace`,
          },
        });
      }

      if (customer.merged_into_customer_id) {
        throw new ConflictException({
          error: {
            code: "customer_already_merged",
            message: `Customer ${customerId} has been merged into customer ${customer.merged_into_customer_id}`,
            canonical_customer_id: customer.merged_into_customer_id,
          },
        });
      }

      const normalizedExistingPhone = customer.phone ? normalizePhone(customer.phone) : null;
      if (data.phone !== undefined && data.phone !== normalizedExistingPhone) {
        const existingWithPhone = await tx.customer.findFirst({
          where: {
            business_id: businessId,
            phone: data.phone,
            id: { not: customerId },
            erased_at: null,
            merged_into_customer_id: null,
          },
          select: { id: true },
        });

        if (existingWithPhone) {
          throw new ConflictException({
            error: {
              code: "phone_already_in_use",
              message: `Phone number '${data.phone}' is already associated with another customer in this workspace`,
            },
          });
        }
      }

      // Concurrency guard: update customer while ensuring it has not been merged or erased concurrently
      const updateResult = await tx.customer.updateMany({
        where: {
          id: customerId,
          business_id: businessId,
          erased_at: null,
          merged_into_customer_id: null,
        },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          updated_at: new Date(),
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          error: {
            code: "customer_concurrent_modification",
            message: `Customer ${customerId} was modified, merged, or erased concurrently`,
          },
        });
      }

      let finalTagsList: string[] = [];
      let initialTagsList: string[] = [];
      const isTagsUpdated = data.tags !== undefined || data.isVip !== undefined;

      if (isTagsUpdated) {
        const existingTagRows = await tx.customerTag.findMany({
          where: {
            business_id: businessId,
            customer_id: customerId,
          },
          select: { id: true, tag: true },
        });

        // Group rows by lowercased tag name to handle legacy cased rows cleanly
        const existingTagMap = new Map<string, string[]>();
        for (const row of existingTagRows) {
          const lower = row.tag.toLowerCase();
          const ids = existingTagMap.get(lower) ?? [];
          ids.push(row.id);
          existingTagMap.set(lower, ids);
        }

        const currentLowerTags = new Set(existingTagMap.keys());
        initialTagsList = Array.from(currentLowerTags).sort();

        const desiredTags =
          data.tags !== undefined ? new Set(data.tags) : new Set(currentLowerTags);

        if (data.isVip === true) {
          desiredTags.add("vip");
        } else if (data.isVip === false) {
          desiredTags.delete("vip");
        }

        const tagsToDeleteIds: string[] = [];
        for (const [tagLower, rowIds] of existingTagMap.entries()) {
          if (!desiredTags.has(tagLower)) {
            tagsToDeleteIds.push(...rowIds);
          }
        }

        const tagsToCreate: string[] = [];
        for (const tag of desiredTags) {
          if (!currentLowerTags.has(tag)) {
            tagsToCreate.push(tag);
          }
        }

        if (tagsToDeleteIds.length > 0) {
          await tx.customerTag.deleteMany({
            where: {
              business_id: businessId,
              customer_id: customerId,
              id: { in: tagsToDeleteIds },
            },
          });
        }

        if (tagsToCreate.length > 0) {
          await tx.customerTag.createMany({
            data: tagsToCreate.map((tag) => ({
              business_id: businessId,
              customer_id: customerId,
              tag: tag.toLowerCase().trim(),
              created_by_user_id: userId,
            })),
            skipDuplicates: true,
          });
        }

        finalTagsList = Array.from(desiredTags).sort();
      }

      const noteBody = data.note ?? data.notes;
      let createdNoteId: string | null = null;
      if (noteBody !== undefined) {
        const createdNote = await tx.customerNote.create({
          data: {
            business_id: businessId,
            customer_id: customerId,
            author_user_id: userId,
            body: noteBody,
          },
          select: { id: true },
        });
        createdNoteId = createdNote.id;
      }

      if (this.auditService) {
        const beforeState: Record<string, unknown> = {
          name: maskName(customer.name),
          phone: maskPhone(customer.phone),
          ...(isTagsUpdated
            ? {
                tags: initialTagsList,
                is_vip: initialTagsList.includes("vip"),
              }
            : {}),
        };
        const afterName = data.name ?? customer.name;
        const afterPhone = data.phone ?? customer.phone;
        const afterState: Record<string, unknown> = {
          name: maskName(afterName),
          phone: maskPhone(afterPhone),
          ...(isTagsUpdated
            ? {
                tags: finalTagsList,
                is_vip: finalTagsList.includes("vip"),
              }
            : {}),
          ...(createdNoteId ? { note_id: createdNoteId } : {}),
        };

        await this.auditService.record(
          {
            business_id: businessId,
            actor_user_id: userId,
            action: "customer.updated",
            entity_type: "customer",
            entity_id: customerId,
            payload: {
              before: beforeState,
              after: afterState,
            },
          },
          tx,
        );
      }
    });

    return this.getCustomer(businessId, customerId);
  }
}
