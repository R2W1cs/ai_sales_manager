import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";

import { AuditService } from "../../businesses/audit/audit.service";
import { prisma as defaultPrisma } from "../../lib/prisma";
import { deleteFile } from "../../lib/storage";
import { assertUuid } from "../../platform/core/errors";
import { InjectPrisma } from "../../platform/core/prisma.token";

const REDACTED = "[redacted]";
const DELETED_NAME = "Deleted customer";

/**
 * Customer personal-data erase (NFR-SEC-10 / security design 17 §8.3).
 * Soft-anonymizes the customer; never hard-deletes conversations or order money rows.
 */
@Injectable()
export class EraseService {
  private readonly prisma: PrismaClient;

  constructor(
    @Optional() @InjectPrisma() prismaClient?: PrismaClient,
    @Optional() private readonly auditService?: AuditService,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Idempotent: if erased_at is already set, returns without re-work.
   */
  async eraseCustomer(businessId: string, actorUserId: string, customerId: string): Promise<void> {
    assertUuid(businessId, "businessId");
    assertUuid(actorUserId, "actorUserId");
    assertUuid(customerId, "customerId");

    const existing = await this.prisma.customer.findFirst({
      where: { id: customerId, business_id: businessId },
      select: { id: true, erased_at: true },
    });

    if (!existing) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: `Customer ${customerId} not found`,
        },
      });
    }

    if (existing.erased_at) {
      return;
    }

    const conversationIds = (
      await this.prisma.conversation.findMany({
        where: { business_id: businessId, customer_id: customerId },
        select: { id: true },
      })
    ).map((c) => c.id);

    const attachmentKeys: string[] = [];
    if (conversationIds.length > 0) {
      const messages = await this.prisma.message.findMany({
        where: { business_id: businessId, conversation_id: { in: conversationIds } },
        select: { id: true },
      });
      const messageIds = messages.map((m) => m.id);
      if (messageIds.length > 0) {
        const attachments = await this.prisma.messageAttachment.findMany({
          where: { business_id: businessId, message_id: { in: messageIds } },
          select: { id: true, s3_key: true },
        });
        for (const a of attachments) {
          attachmentKeys.push(a.s3_key);
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          erased_at: new Date(),
          name: DELETED_NAME,
          phone: null,
          email: null,
          address: Prisma.JsonNull,
          preferences: Prisma.JsonNull,
        },
      });

      await tx.customerIdentity.deleteMany({
        where: { business_id: businessId, customer_id: customerId },
      });

      await tx.customerNote.deleteMany({
        where: { business_id: businessId, customer_id: customerId },
      });

      await tx.customerTag.deleteMany({
        where: { business_id: businessId, customer_id: customerId },
      });

      if (conversationIds.length > 0) {
        await tx.message.updateMany({
          where: { business_id: businessId, conversation_id: { in: conversationIds } },
          data: { content: REDACTED },
        });

        await tx.conversationNote.updateMany({
          where: { business_id: businessId, conversation_id: { in: conversationIds } },
          data: { body: REDACTED },
        });

        const messages = await tx.message.findMany({
          where: { business_id: businessId, conversation_id: { in: conversationIds } },
          select: { id: true },
        });
        const messageIds = messages.map((m) => m.id);
        if (messageIds.length > 0) {
          await tx.messageAttachment.deleteMany({
            where: { business_id: businessId, message_id: { in: messageIds } },
          });
        }
      }

      const orders = await tx.order.findMany({
        where: { business_id: businessId, customer_id: customerId },
        select: { id: true, customer_snapshot: true, delivery_address: true },
      });

      for (const order of orders) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            customer_snapshot: stripOrderPii(order.customer_snapshot),
            delivery_address: Prisma.JsonNull,
          },
        });
      }

      if (this.auditService) {
        await this.auditService.record(
          {
            business_id: businessId,
            actor_user_id: actorUserId,
            action: "customer.erase",
            entity_type: "customer",
            entity_id: customerId,
            payload: {
              reason: "shopper_deletion_request",
              after: {
                conversationCount: conversationIds.length,
                orderCount: orders.length,
                attachmentCount: attachmentKeys.length,
              },
            },
          },
          tx,
        );
      }
    });

    for (const key of attachmentKeys) {
      try {
        await deleteFile(key);
      } catch {
        // Best-effort storage cleanup; DB rows already removed.
      }
    }
  }
}

function stripOrderPii(snapshot: Prisma.JsonValue): Prisma.InputJsonValue {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { name: DELETED_NAME };
  }
  const src = snapshot as Record<string, unknown>;
  return {
    name: DELETED_NAME,
    phone: null,
    email: null,
    address: null,
    // Keep non-PII commerce fields if present
    ...(typeof src.currency === "string" ? { currency: src.currency } : {}),
    ...(typeof src.itemCount === "number" ? { itemCount: src.itemCount } : {}),
  };
}
