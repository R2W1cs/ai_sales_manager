import { createHash } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
} from "@nestjs/common";
import { Prisma, type Customer, type LifecycleStage, type PrismaClient } from "@prisma/client";

import { AuditService } from "../../businesses/audit/audit.service";
import { prisma as defaultPrisma } from "../../lib/prisma";
import { assertUuid, toValidationException } from "../../platform/core/errors";
import { InjectPrisma } from "../../platform/core/prisma.token";
import {
  type MergeCustomersDto,
  type MergedField,
  MergeCustomersResponseSchema,
  MergeCustomersSchema,
} from "../dto/merge-customers.dto";
import { LifecycleService } from "../lifecycle/lifecycle.service";

export interface MergeCustomersResponse {
  survivorId: string;
  duplicateId: string;
  ordersMoved: number;
  conversationsMoved: number;
  identitiesMoved: number;
  fieldsMerged: MergedField[];
}

type MergeCustomer = Pick<
  Customer,
  | "id"
  | "name"
  | "phone"
  | "email"
  | "address"
  | "language"
  | "lifecycle_stage"
  | "merged_into_customer_id"
  | "erased_at"
  | "is_test"
> & {
  identities: {
    id: string;
    platform: string;
    platform_user_id: string;
    phone_number: string | null;
    verified_at: Date | null;
  }[];
  tags: {
    id: string;
    tag: string;
    created_by_user_id: string | null;
  }[];
  notes: { id: string; body?: string | null; created_at?: Date | null }[];
};

type MergedProfile = Pick<
  Customer,
  "name" | "phone" | "email" | "address" | "language" | "lifecycle_stage"
>;

const LIFECYCLE_STAGE_RANK: Record<LifecycleStage, number> = {
  unknown_visitor: 0,
  interested: 1,
  qualified_lead: 2,
  order_pending: 3,
  customer: 4,
  returning_customer: 5,
  vip: 6,
};

function selectHighestLifecycleStage(
  ...stages: (LifecycleStage | undefined | null)[]
): LifecycleStage {
  let highest: LifecycleStage = "unknown_visitor";
  for (const stage of stages) {
    if (stage && LIFECYCLE_STAGE_RANK[stage] > LIFECYCLE_STAGE_RANK[highest]) {
      highest = stage;
    }
  }
  return highest;
}

@Injectable()
export class MergeService {
  private readonly prisma: PrismaClient;
  private readonly lifecycleService: LifecycleService;

  constructor(
    @Optional() @InjectPrisma() prismaClient?: PrismaClient,
    @Optional() private readonly auditService?: AuditService,
    @Optional() lifecycleService?: LifecycleService,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
    this.lifecycleService = lifecycleService ?? new LifecycleService(this.prisma);
  }

  async merge(
    businessId: string,
    actorUserId: string,
    survivorId: string,
    body: MergeCustomersDto,
    idempotencyKey: string,
  ): Promise<MergeCustomersResponse> {
    assertUuid(businessId, "businessId");
    assertUuid(actorUserId, "actorUserId");
    assertUuid(survivorId, "survivorId");

    const parsed = MergeCustomersSchema.safeParse(body);
    if (!parsed.success) {
      throw toValidationException(parsed.error);
    }

    const duplicateId = parsed.data.sourceCustomerId;
    if (survivorId === duplicateId) {
      throw new BadRequestException({
        error: {
          code: "customer_self_merge",
          message: "A customer cannot be merged into itself",
        },
      });
    }

    const requestHash = createHash("sha256")
      .update(JSON.stringify({ businessId, duplicateId, survivorId }))
      .digest("hex");

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingKey = await tx.idempotencyKey.findUnique({
          where: { business_id_key: { business_id: businessId, key: idempotencyKey } },
        });
        if (existingKey) {
          return this.resolveIdempotentReplay(existingKey, requestHash);
        }

        await tx.idempotencyKey.create({
          data: {
            business_id: businessId,
            key: idempotencyKey,
            request_hash: requestHash,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });

        const lockedRows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id
          FROM customers
          WHERE business_id = ${businessId}::uuid
            AND id IN (${survivorId}::uuid, ${duplicateId}::uuid)
          ORDER BY id
          FOR UPDATE
        `;

        if (lockedRows.length !== 2) {
          throw new ForbiddenException({
            error: {
              code: "forbidden",
              message: "Both customers must belong to the current workspace",
            },
          });
        }

        const customers = (await tx.customer.findMany({
          where: {
            business_id: businessId,
            id: { in: [survivorId, duplicateId] },
          },
          include: {
            identities: { where: { business_id: businessId } },
            tags: { where: { business_id: businessId } },
            notes: {
              where: { business_id: businessId },
              select: { id: true, body: true, created_at: true },
            },
          },
        })) as MergeCustomer[];
        const survivor = customers.find((customer) => customer.id === survivorId);
        const duplicate = customers.find((customer) => customer.id === duplicateId);

        if (!survivor || !duplicate) {
          throw new ForbiddenException({
            error: {
              code: "forbidden",
              message: "Both customers must belong to the current workspace",
            },
          });
        }

        this.assertMergeable(survivor, "survivor");
        this.assertMergeable(duplicate, "duplicate");

        const survivorIdentityByKey = new Map(
          survivor.identities.map((identity) => [
            `${identity.platform}:${identity.platform_user_id}`,
            identity,
          ]),
        );
        const survivorIdentityByPhone = new Map(
          survivor.identities.flatMap((identity) =>
            identity.phone_number ? [[identity.phone_number, identity]] : [],
          ),
        );

        const discardedIdentities: MergeCustomer["identities"] = [];
        const phoneNulledIdentities: MergeCustomer["identities"] = [];
        const cleanMovedIdentities: MergeCustomer["identities"] = [];
        const survivorIdentityUpdates = new Map<string, Date>();

        for (const dupIdentity of duplicate.identities) {
          const platformKey = `${dupIdentity.platform}:${dupIdentity.platform_user_id}`;
          const matchingPlatformSurvivor = survivorIdentityByKey.get(platformKey);

          if (matchingPlatformSurvivor) {
            if (dupIdentity.verified_at) {
              const dupTime = new Date(dupIdentity.verified_at).getTime();
              const survivorTime = matchingPlatformSurvivor.verified_at
                ? new Date(matchingPlatformSurvivor.verified_at).getTime()
                : null;
              if (survivorTime === null || dupTime < survivorTime) {
                matchingPlatformSurvivor.verified_at = dupIdentity.verified_at;
                survivorIdentityUpdates.set(matchingPlatformSurvivor.id, dupIdentity.verified_at);
              }
            }
            discardedIdentities.push(dupIdentity);
          } else if (
            dupIdentity.phone_number &&
            survivorIdentityByPhone.has(dupIdentity.phone_number)
          ) {
            const matchingPhoneSurvivor = survivorIdentityByPhone.get(dupIdentity.phone_number);
            if (dupIdentity.verified_at && matchingPhoneSurvivor) {
              const dupTime = new Date(dupIdentity.verified_at).getTime();
              const survivorTime = matchingPhoneSurvivor.verified_at
                ? new Date(matchingPhoneSurvivor.verified_at).getTime()
                : null;
              if (survivorTime === null || dupTime < survivorTime) {
                matchingPhoneSurvivor.verified_at = dupIdentity.verified_at;
                survivorIdentityUpdates.set(matchingPhoneSurvivor.id, dupIdentity.verified_at);
              }
            }
            phoneNulledIdentities.push(dupIdentity);
          } else {
            cleanMovedIdentities.push(dupIdentity);
          }
        }

        if (survivorIdentityUpdates.size > 0) {
          await Promise.all(
            Array.from(survivorIdentityUpdates.entries()).map(([id, verified_at]) =>
              tx.customerIdentity.update({
                where: { id },
                data: { verified_at },
              }),
            ),
          );
        }

        const discardedIdentityIds = discardedIdentities.map((identity) => identity.id);
        const phoneNulledIdentityIds = phoneNulledIdentities.map((identity) => identity.id);
        const cleanMovedIdentityIds = cleanMovedIdentities.map((identity) => identity.id);
        const identitiesMovedCount = phoneNulledIdentityIds.length + cleanMovedIdentityIds.length;

        if (discardedIdentityIds.length > 0) {
          await tx.customerIdentity.deleteMany({
            where: {
              business_id: businessId,
              customer_id: duplicateId,
              id: { in: discardedIdentityIds },
            },
          });
        }
        if (phoneNulledIdentityIds.length > 0) {
          await tx.customerIdentity.updateMany({
            where: {
              business_id: businessId,
              customer_id: duplicateId,
              id: { in: phoneNulledIdentityIds },
            },
            data: {
              customer_id: survivorId,
              phone_number: null,
            },
          });
        }
        if (cleanMovedIdentityIds.length > 0) {
          await tx.customerIdentity.updateMany({
            where: {
              business_id: businessId,
              customer_id: duplicateId,
              id: { in: cleanMovedIdentityIds },
            },
            data: { customer_id: survivorId },
          });
        }

        const [ordersMoved, conversationsMoved] = await Promise.all([
          tx.order.updateMany({
            where: { business_id: businessId, customer_id: duplicateId },
            data: { customer_id: survivorId },
          }),
          tx.conversation.updateMany({
            where: { business_id: businessId, customer_id: duplicateId },
            data: { customer_id: survivorId },
          }),
          tx.customerNote.updateMany({
            where: { business_id: businessId, customer_id: duplicateId },
            data: { customer_id: survivorId },
          }),
        ]);

        // Create a merge-separator note on the survivor so notes from both profiles
        // are visible in chronological order with a clear boundary marker (spec §notes)
        if (duplicate.notes.length > 0) {
          const mergedDate = new Date().toISOString();
          await tx.customerNote.create({
            data: {
              business_id: businessId,
              customer_id: survivorId,
              author_user_id: actorUserId,
              body: `\n--- Merged from customer ${duplicateId} on ${mergedDate} ---\n`,
            },
          });
        }

        if (duplicate.tags.length > 0) {
          await tx.customerTag.createMany({
            data: duplicate.tags.map((tag) => ({
              business_id: businessId,
              customer_id: survivorId,
              tag: tag.tag,
              created_by_user_id: tag.created_by_user_id,
            })),
            skipDuplicates: true,
          });
          await tx.customerTag.deleteMany({
            where: { business_id: businessId, customer_id: duplicateId },
          });
        }

        const profileUpdate = this.mergeProfileFields(survivor, duplicate);
        const orderMetrics = await tx.order.aggregate({
          where: {
            business_id: businessId,
            customer_id: survivorId,
            status: { in: ["CONFIRMED", "COMPLETED"] },
            is_test: false,
          },
          _count: { _all: true },
          _max: { order_confirmed_at: true },
        });
        const confirmedOrderCount = orderMetrics._count._all;
        const hasVipTag =
          survivor.tags.some(({ tag }) => tag.toLowerCase() === "vip") ||
          duplicate.tags.some(({ tag }) => tag.toLowerCase() === "vip");

        const orderDerivedStage: LifecycleStage = this.lifecycleService.classifyStage({
          confirmedOrderCount,
          lastConfirmedOrderAt: orderMetrics._max.order_confirmed_at,
          hasVipTag,
          currentStage: survivor.lifecycle_stage,
        }).dbStage;

        const lifecycleStage: LifecycleStage = selectHighestLifecycleStage(
          hasVipTag ? "vip" : undefined,
          survivor.lifecycle_stage,
          duplicate.lifecycle_stage,
          orderDerivedStage,
        );

        const survivorUpdate = await tx.customer.updateMany({
          where: {
            id: survivorId,
            business_id: businessId,
            erased_at: null,
            merged_into_customer_id: null,
          },
          data: {
            ...profileUpdate,
            address:
              profileUpdate.address === null
                ? Prisma.DbNull
                : (profileUpdate.address as Prisma.InputJsonValue),
            lifecycle_stage: lifecycleStage,
            confirmed_order_count: confirmedOrderCount,
            last_confirmed_order_at: orderMetrics._max.order_confirmed_at,
          },
        });
        if (survivorUpdate.count !== 1) {
          throw new ConflictException({
            error: {
              code: "customer_merge_conflict",
              message: "The survivor customer changed during the merge",
            },
          });
        }

        const loserUpdate = await tx.customer.updateMany({
          where: {
            id: duplicateId,
            business_id: businessId,
            erased_at: null,
            merged_into_customer_id: null,
          },
          data: { merged_into_customer_id: survivorId },
        });
        if (loserUpdate.count !== 1) {
          throw new ConflictException({
            error: {
              code: "customer_merge_conflict",
              message: "The duplicate customer changed during the merge",
            },
          });
        }

        const fieldsMerged = this.fieldsMerged(survivor, duplicate, profileUpdate, lifecycleStage);
        const response: MergeCustomersResponse = {
          survivorId,
          duplicateId,
          ordersMoved: ordersMoved.count,
          conversationsMoved: conversationsMoved.count,
          identitiesMoved: identitiesMovedCount,
          fieldsMerged,
        };

        const mergedTags = Array.from(
          new Set([...survivor.tags.map((t) => t.tag), ...duplicate.tags.map((t) => t.tag)]),
        );

        if (this.auditService) {
          await this.auditService.record(
            {
              business_id: businessId,
              actor_user_id: actorUserId,
              action: "customer.merge",
              entity_type: "customer",
              entity_id: survivorId,
              payload: {
                // before: pre-merge snapshot of both profiles
                before: {
                  survivor: {
                    id: survivor.id,
                    name: survivor.name,
                    phone: survivor.phone,
                    email: survivor.email,
                    address: survivor.address,
                    language: survivor.language,
                    lifecycle_stage: survivor.lifecycle_stage,
                    tags: survivor.tags.map((t) => t.tag),
                  },
                  duplicate: {
                    id: duplicate.id,
                    name: duplicate.name,
                    phone: duplicate.phone,
                    email: duplicate.email,
                    address: duplicate.address,
                    language: duplicate.language,
                    lifecycle_stage: duplicate.lifecycle_stage,
                    tags: duplicate.tags.map((t) => t.tag),
                  },
                },
                // after: flat spec-required fields + post-merge survivor state
                after: {
                  // Flat required fields per spec §3 audit log payload
                  survivorId,
                  duplicateId,
                  ordersMoved: ordersMoved.count,
                  conversationsMoved: conversationsMoved.count,
                  identitiesMoved: identitiesMovedCount,
                  fieldsMerged,
                  // Post-merge survivor state
                  survivor: {
                    id: survivor.id,
                    name: profileUpdate.name ?? survivor.name,
                    phone: profileUpdate.phone ?? survivor.phone,
                    email: profileUpdate.email ?? survivor.email,
                    address: profileUpdate.address ?? survivor.address,
                    language: profileUpdate.language ?? survivor.language,
                    lifecycle_stage: lifecycleStage,
                    tags: mergedTags,
                  },
                  collidingIdentitiesDiscarded: discardedIdentityIds.length,
                  discardedIdentityIds,
                  discardedIdentities: discardedIdentities.map((identity) => ({
                    id: identity.id,
                    platform: identity.platform,
                    platformUserId: identity.platform_user_id,
                    phoneNumber: identity.phone_number,
                  })),
                },
              },
            },
            tx,
          );
        }

        await tx.idempotencyKey.update({
          where: { business_id_key: { business_id: businessId, key: idempotencyKey } },
          data: {
            response_status: 200,
            response_body: response as unknown as Prisma.InputJsonValue,
          },
        });

        return response;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existingKey = await this.prisma.idempotencyKey.findUnique({
          where: { business_id_key: { business_id: businessId, key: idempotencyKey } },
        });
        if (existingKey) {
          return this.resolveIdempotentReplay(existingKey, requestHash);
        }
      }
      throw error;
    }
  }

  private assertMergeable(customer: MergeCustomer, label: "survivor" | "duplicate"): void {
    if (customer.erased_at || customer.merged_into_customer_id) {
      throw new ConflictException({
        error: {
          code: "customer_merge_conflict",
          message: `The ${label} customer is erased or already merged`,
        },
      });
    }
  }

  private mergeProfileFields(survivor: MergeCustomer, duplicate: MergeCustomer): MergedProfile {
    const survivorVerifiedPhone = survivor.identities.find(
      (identity) => identity.verified_at && identity.phone_number,
    )?.phone_number;
    const duplicateVerifiedPhone = duplicate.identities.find(
      (identity) => identity.verified_at && identity.phone_number,
    )?.phone_number;

    return {
      name: survivor.name ?? duplicate.name,
      phone: survivorVerifiedPhone ?? duplicateVerifiedPhone ?? survivor.phone ?? duplicate.phone,
      email: survivor.email ?? duplicate.email,
      address: survivor.address ?? duplicate.address,
      language: survivor.language ?? duplicate.language,
      lifecycle_stage:
        survivor.lifecycle_stage === "unknown_visitor"
          ? duplicate.lifecycle_stage
          : survivor.lifecycle_stage,
    };
  }

  private fieldsMerged(
    survivor: MergeCustomer,
    duplicate: MergeCustomer,
    merged: ReturnType<MergeService["mergeProfileFields"]>,
    finalLifecycleStage: LifecycleStage,
  ): MergedField[] {
    const fields: MergedField[] = [];
    for (const field of ["name", "phone", "email", "address", "language"] as const) {
      if (JSON.stringify(merged[field]) !== JSON.stringify(survivor[field])) fields.push(field);
    }
    if (finalLifecycleStage !== survivor.lifecycle_stage) {
      fields.push("lifecycle_stage");
    }
    if (duplicate.tags.some(({ tag }) => !survivor.tags.some((item) => item.tag === tag))) {
      fields.push("tags");
    }
    if (duplicate.notes.length > 0) fields.push("notes");
    return fields;
  }

  private resolveIdempotentReplay(
    key: { request_hash: string; response_body: Prisma.JsonValue | null },
    requestHash: string,
  ): MergeCustomersResponse {
    if (key.request_hash !== requestHash || !key.response_body) {
      throw new ConflictException({
        error: {
          code: "idempotency_key_conflict",
          message: "Idempotency key already used with a different request or incomplete response",
        },
      });
    }
    const parsed = MergeCustomersResponseSchema.safeParse(key.response_body);
    if (!parsed.success) {
      throw new ConflictException({
        error: {
          code: "idempotency_key_conflict",
          message: "Stored idempotent response payload is invalid",
        },
      });
    }
    return parsed.data;
  }
}
