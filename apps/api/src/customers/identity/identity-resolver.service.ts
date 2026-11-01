import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { Prisma, type Channel, type Customer, type PrismaClient } from "@prisma/client";

import { normalizePhone } from "@app/shared";

import { prisma as defaultPrisma } from "../../lib/prisma";
import { assertUuid } from "../../platform/core/errors";
import { InjectPrisma } from "../../platform/core/prisma.token";

const VALID_CHANNELS = new Set<string>(["instagram", "messenger", "whatsapp"]);

export interface ResolveCustomerOptions {
  phoneVerified?: boolean;
}

@Injectable()
export class IdentityResolverService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() @InjectPrisma() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Recursively follows `merged_into_customer_id` pointers to return the root active customer.
   * Throws if a cycle or broken merge pointer is detected.
   */
  private async followMergePointer(
    tx: Prisma.TransactionClient,
    customer: Customer,
    businessId: string,
  ): Promise<Customer> {
    let current = customer;
    const visited = new Set<string>([current.id]);
    const MAX_DEPTH = 20;
    let depth = 0;

    while (current.merged_into_customer_id) {
      if (visited.has(current.merged_into_customer_id) || depth >= MAX_DEPTH) {
        throw new BadRequestException({
          error: {
            code: "customer_merge_cycle",
            message: `Detected cyclic customer merge pointer for customer ${customer.id}`,
          },
        });
      }
      depth++;
      visited.add(current.merged_into_customer_id);

      const parent = await tx.customer.findFirst({
        where: {
          id: current.merged_into_customer_id,
          business_id: businessId,
          erased_at: null,
        },
      });

      if (!parent) {
        throw new BadRequestException({
          error: {
            code: "customer_merge_broken",
            message: `Target merge customer ${current.merged_into_customer_id} for customer ${current.id} not found or erased`,
          },
        });
      }
      current = parent;
    }
    return current;
  }

  async resolveCustomer(
    businessId: string,
    channelType: Channel,
    externalId: string,
    phone?: string | null,
    options?: ResolveCustomerOptions,
  ): Promise<Customer> {
    assertUuid(businessId, "businessId");

    if (!VALID_CHANNELS.has(channelType)) {
      throw new BadRequestException({
        error: {
          code: "invalid_channel_type",
          message: `Unsupported channel type: '${channelType}'. Must be one of: instagram, messenger, whatsapp`,
        },
      });
    }

    const trimmedExternalId = externalId ? externalId.trim() : "";
    if (!trimmedExternalId || trimmedExternalId.length > 255) {
      throw new BadRequestException({
        error: {
          code: "invalid_external_id",
          message: "externalId must be a non-empty string with max length 255",
        },
      });
    }

    let normalizedPhone: string | null = null;
    if (phone !== undefined && phone !== null && phone.trim().length > 0) {
      normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        throw new BadRequestException({
          error: {
            code: "invalid_phone_number",
            message: `Invalid phone number format: '${phone}'`,
          },
        });
      }
    }

    // For WhatsApp, externalId is the phone number and is verified by default.
    // For other channels, phone is only treated as verified if explicitly signaled.
    const isPhoneVerified = options?.phoneVerified ?? channelType === "whatsapp";
    const verifiedAt = isPhoneVerified && normalizedPhone ? new Date() : null;

    const MAX_RETRIES = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // 1. Check existing identity for this platform and platform_user_id
          const existingIdentity = await tx.customerIdentity.findFirst({
            where: {
              business_id: businessId,
              platform: channelType,
              platform_user_id: trimmedExternalId,
            },
            include: { customer: true },
          });

          if (existingIdentity) {
            const resolvedCustomer = await this.followMergePointer(
              tx,
              existingIdentity.customer,
              businessId,
            );

            if (resolvedCustomer.id !== existingIdentity.customer_id) {
              await tx.customerIdentity.update({
                where: { id: existingIdentity.id },
                data: { customer_id: resolvedCustomer.id },
              });
            }

            if (normalizedPhone) {
              // Update phone on identity if not present or newly verified
              if (
                !existingIdentity.phone_number ||
                (isPhoneVerified && !existingIdentity.verified_at)
              ) {
                await tx.customerIdentity.update({
                  where: { id: existingIdentity.id },
                  data: {
                    phone_number: normalizedPhone,
                    verified_at: isPhoneVerified
                      ? (existingIdentity.verified_at ?? verifiedAt)
                      : null,
                  },
                });
              }

              // Update customer phone if not present and phone is verified
              if (isPhoneVerified && !resolvedCustomer.phone) {
                await tx.customer.update({
                  where: { id_business_id: { id: resolvedCustomer.id, business_id: businessId } },
                  data: { phone: normalizedPhone },
                });
                resolvedCustomer.phone = normalizedPhone;
              }
            }

            return resolvedCustomer;
          }

          let customer: Customer | null = null;
          let verifiedPhoneIdentityExists = false;

          // 2. If phone is provided, check for existing verified identity or active customer (only when trusted/verified)
          if (normalizedPhone) {
            let phoneIdentity = await tx.customerIdentity.findFirst({
              where: {
                business_id: businessId,
                phone_number: normalizedPhone,
                verified_at: { not: null },
              },
              include: { customer: true },
            });

            // If incoming request is verified (e.g. WhatsApp or SMS verification), reconcile unverified matches
            if (!phoneIdentity && isPhoneVerified) {
              phoneIdentity = await tx.customerIdentity.findFirst({
                where: {
                  business_id: businessId,
                  phone_number: normalizedPhone,
                },
                include: { customer: true },
              });
            }

            if (phoneIdentity) {
              customer = await this.followMergePointer(tx, phoneIdentity.customer, businessId);
              verifiedPhoneIdentityExists = true;
              if (isPhoneVerified && !phoneIdentity.verified_at) {
                await tx.customerIdentity.update({
                  where: { id: phoneIdentity.id },
                  data: { verified_at: verifiedAt },
                });
              }
              if (isPhoneVerified && !customer.phone) {
                await tx.customer.update({
                  where: { id_business_id: { id: customer.id, business_id: businessId } },
                  data: { phone: normalizedPhone },
                });
                customer.phone = normalizedPhone;
              }
            } else if (isPhoneVerified) {
              // Only search direct customer if incoming phone is verified
              const directCustomer = await tx.customer.findFirst({
                where: {
                  business_id: businessId,
                  phone: normalizedPhone,
                  erased_at: null,
                  merged_into_customer_id: null,
                },
              });
              if (directCustomer) {
                customer = await this.followMergePointer(tx, directCustomer, businessId);
                verifiedPhoneIdentityExists = true;
              }
            }
          }

          // 3. Create unified customer if not resolved. Only store phone on customer if verified.
          customer ??= await tx.customer.create({
            data: {
              business_id: businessId,
              phone: isPhoneVerified ? normalizedPhone : null,
            },
          });

          // 4. Create channel identity
          await tx.customerIdentity.create({
            data: {
              business_id: businessId,
              customer_id: customer.id,
              platform: channelType,
              platform_user_id: trimmedExternalId,
              phone_number:
                verifiedPhoneIdentityExists && !isPhoneVerified ? null : normalizedPhone,
              verified_at: isPhoneVerified ? verifiedAt : null,
            },
          });

          return customer;
        });
      } catch (err: unknown) {
        lastError = err;
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002" &&
          attempt < MAX_RETRIES
        ) {
          // Concurrency conflict on unique constraint. Retry resolution in a fresh transaction.
          continue;
        }
        throw err;
      }
    }

    throw lastError;
  }
}
