import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  Prisma,
  type PrismaClient,
  type OrderStatus,
  type PaymentStatus,
  type LifecycleStage,
} from "@prisma/client";
import { z } from "zod";

import {
  type CreateDraftOrderDto,
  CreateDraftOrderSchema,
  CreateOrderSchema,
  type CreateOrderDto,
  UpdateOrderStatusSchema,
  type UpdateOrderStatusDto,
  ListOrdersQuerySchema,
  type ListOrdersQueryDto,
  type OrderResponse,
  type PaginatedOrdersResponse,
  CustomerSnapshotSchema,
  type CustomerSnapshot,
  AddressSchema,
  type Address,
  areAddressesEqual,
  REALTIME_EVENTS,
  FreeShippingPayloadSchema,
  DeliveryRulePayloadSchema,
  OrderConfirmedEventPayloadSchema,
} from "@app/shared";

import { prisma as defaultPrisma } from "../../lib/prisma";
import { toValidationException, assertUuid } from "../../platform/core/errors";
import { InjectPrisma } from "../../platform/core/prisma.token";
import { RealtimeGateway } from "../../realtime";
import { resolveIdempotencyKey } from "../dto/create-order.dto";

export interface RealtimeEmitter {
  emitToTenant(businessId: string, event: string, payload: unknown): void;
  emitToConversation(conversationId: string, event: string, payload: unknown): void;
}

export { assertUuid };

interface RawOrderItem {
  id: string;
  business_id: string;
  order_id: string;
  variant_id: string;
  quantity: number;
  unit_price: Prisma.Decimal;
  name_snapshot: string;
  sku_snapshot: string | null;
  attributes_snapshot: Prisma.JsonValue | null;
  created_at: Date;
}

interface RawOrderWithItems {
  id: string;
  business_id: string;
  customer_id: string;
  conversation_id: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  currency: string;
  subtotal: Prisma.Decimal;
  delivery_fee: Prisma.Decimal;
  total: Prisma.Decimal;
  customer_snapshot: Prisma.JsonValue;
  delivery_address: Prisma.JsonValue | null;
  created_by_type: string;
  created_by_user_id: string | null;
  idempotency_key: string;
  is_test: boolean;
  order_confirmed_at: Date | null;
  cancelled_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  items?: RawOrderItem[];
}

@Injectable()
export class OrdersService {
  private readonly prisma: PrismaClient;

  constructor(
    @Optional() @InjectPrisma() prismaClient?: PrismaClient,
    @Optional() private readonly realtimeGateway?: RealtimeGateway | RealtimeEmitter,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Helper to verify tenancy and fetch order, or throw 404 accordingly.
   */
  private async findOrderOrThrow(
    businessId: string,
    orderId: string,
    tx?: Prisma.TransactionClient,
    forUpdate = false,
  ): Promise<RawOrderWithItems> {
    assertUuid(orderId, "orderId");
    const db = tx ?? this.prisma;
    if (forUpdate && tx) {
      await tx.$queryRaw`
        SELECT id FROM orders
        WHERE id = ${orderId}::uuid AND business_id = ${businessId}::uuid
        FOR UPDATE
      `;
    }

    const order = await db.order.findFirst({
      where: { id: orderId, business_id: businessId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException({
        error: {
          code: "order_not_found",
          message: `Order ${orderId} not found`,
        },
      });
    }

    return order;
  }

  /**
   * Helper to verify idempotency match across all order parameters.
   */
  private verifyIdempotencyMatch(
    existing: RawOrderWithItems,
    data: CreateDraftOrderDto & { conversationId?: string | null },
    requestedCurrency: string,
    requestedDeliveryFee: Prisma.Decimal,
    requestedAddress: Address | null,
  ): boolean {
    if (data.customerId && existing.customer_id !== data.customerId) return false;
    if ((existing.conversation_id ?? null) !== (data.conversationId ?? null)) return false;
    if (existing.currency !== requestedCurrency) return false;
    if (!existing.delivery_fee.equals(requestedDeliveryFee)) return false;
    if (!areAddressesEqual(existing.delivery_address as Address | null, requestedAddress)) {
      return false;
    }

    const existingItems = existing.items ?? [];
    if (existingItems.length !== data.items.length) return false;

    return data.items.every((reqItem) =>
      existingItems.some(
        (exItem) => exItem.variant_id === reqItem.variantId && exItem.quantity === reqItem.quantity,
      ),
    );
  }

  /**
   * Formats a raw database order into the API response contract.
   */
  private formatOrder(order: RawOrderWithItems): OrderResponse {
    let customerSnapshot: CustomerSnapshot = { name: null, phone: null, address: null };
    if (order.customer_snapshot && typeof order.customer_snapshot === "object") {
      const parsedSnapshot = CustomerSnapshotSchema.safeParse(order.customer_snapshot);
      if (parsedSnapshot.success) {
        customerSnapshot = parsedSnapshot.data;
      } else {
        const snap = order.customer_snapshot as Record<string, unknown>;
        let addr: Address | null = null;
        if (snap.address && typeof snap.address === "object") {
          const parsedAddr = AddressSchema.safeParse(snap.address);
          if (parsedAddr.success) {
            addr = parsedAddr.data;
          }
        }
        customerSnapshot = {
          name: typeof snap.name === "string" ? snap.name : null,
          phone: typeof snap.phone === "string" ? snap.phone : null,
          address: addr,
        };
      }
    }

    let deliveryAddress: Address | null = null;
    if (order.delivery_address && typeof order.delivery_address === "object") {
      const parsedAddr = AddressSchema.safeParse(order.delivery_address);
      if (parsedAddr.success) {
        deliveryAddress = parsedAddr.data;
      }
    }

    return {
      id: order.id,
      businessId: order.business_id,
      customerId: order.customer_id,
      conversationId: order.conversation_id,
      status: order.status,
      paymentStatus: order.payment_status,
      currency: order.currency,
      subtotal: order.subtotal.toFixed(3),
      deliveryFee: order.delivery_fee.toFixed(3),
      total: order.total.toFixed(3),
      customerSnapshot,
      deliveryAddress,
      createdByType: order.created_by_type,
      createdByUserId: order.created_by_user_id,
      idempotencyKey: order.idempotency_key,
      isTest: order.is_test,
      orderConfirmedAt: order.order_confirmed_at ? order.order_confirmed_at.toISOString() : null,
      cancelledAt: order.cancelled_at ? order.cancelled_at.toISOString() : null,
      completedAt: order.completed_at ? order.completed_at.toISOString() : null,
      createdAt: order.created_at.toISOString(),
      updatedAt: order.updated_at.toISOString(),
      items: order.items
        ? order.items.map((item) => ({
            id: item.id,
            businessId: item.business_id,
            orderId: item.order_id,
            variantId: item.variant_id,
            quantity: item.quantity,
            unitPrice: item.unit_price.toFixed(3),
            nameSnapshot: item.name_snapshot,
            skuSnapshot: item.sku_snapshot,
            attributesSnapshot: item.attributes_snapshot,
            createdAt: item.created_at.toISOString(),
          }))
        : [],
    };
  }

  /**
   * 13 §8 POST /api/v1/orders
   * Creates a draft order with status PENDING_CONFIRMATION and creates stock reservation hold.
   */
  async createOrder(
    businessId: string,
    userId: string | null | undefined,
    body: CreateOrderDto,
    createdByType: "ai" | "user" = "user",
    headerIdempotencyKey?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderResponse> {
    const parsed = CreateOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw toValidationException(parsed.error);
    }
    const data = parsed.data;
    const trimmedKey = resolveIdempotencyKey(headerIdempotencyKey, data.idempotencyKey);
    return this.createOrderInternal(businessId, userId, data, createdByType, trimmedKey, tx);
  }

  /**
   * Technical Contract: POST /conversations/:id/orders/draft (T-ORD-04)
   * Creates a draft order linked to an active conversation thread and places a stock reservation hold.
   */
  async createDraftOrder(
    businessId: string,
    conversationId: string,
    userId: string | null | undefined,
    body: CreateDraftOrderDto,
    headerIdempotencyKey?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderResponse> {
    assertUuid(conversationId, "conversationId");

    const parsed = CreateDraftOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw toValidationException(parsed.error);
    }
    const data = parsed.data;
    const idempotencyKey = resolveIdempotencyKey(headerIdempotencyKey, data.idempotencyKey);

    return this.createOrderInternal(
      businessId,
      userId,
      {
        ...data,
        conversationId,
      },
      "user",
      idempotencyKey,
      tx,
    );
  }

  private async createOrderInternal(
    businessId: string,
    userId: string | null | undefined,
    data: CreateDraftOrderDto & { conversationId?: string | null },
    createdByType: "ai" | "user",
    trimmedKey: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderResponse> {
    const db = tx ?? this.prisma;
    // Business currency verification
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: { currency: true },
    });
    if (data.currency && business?.currency && data.currency !== business.currency) {
      throw new BadRequestException({
        error: {
          code: "currency_mismatch",
          message: `Requested currency '${data.currency}' does not match business configured currency '${business.currency}'`,
        },
      });
    }
    // Reject orders when the business currency is not configured — no silent TND default.
    if (!business?.currency) {
      throw new BadRequestException({
        error: {
          code: "business_currency_not_configured",
          message:
            "Business currency is not configured. Please configure a currency before creating orders.",
        },
      });
    }
    const currency = data.currency ?? business.currency;

    // Atomic transaction logic: check idempotency + verify customer/conv + lock variants + stock check + create order & holds
    const runInTransaction = async (tx: Prisma.TransactionClient): Promise<RawOrderWithItems> => {
      // 1. Idempotency check inside transaction
      const existing = await tx.order.findUnique({
        where: {
          business_id_idempotency_key: {
            business_id: businessId,
            idempotency_key: trimmedKey,
          },
        },
        include: { items: true },
      });

      if (existing) {
        const requestedDeliveryFee =
          data.deliveryFee !== undefined
            ? new Prisma.Decimal(data.deliveryFee.toFixed(3))
            : existing.delivery_fee;
        const isMatch = this.verifyIdempotencyMatch(
          existing,
          data,
          currency,
          requestedDeliveryFee,
          data.deliveryAddress ?? data.shippingAddress ?? null,
        );

        if (!isMatch) {
          throw new ConflictException({
            error: {
              code: "idempotency_conflict",
              message:
                "An order already exists with this idempotency key but with different parameters",
            },
          });
        }
        return existing;
      }

      // 2. Verify Conversation if provided
      let conversationIsTest = false;
      let resolvedCustomerId: string | undefined = data.customerId;

      if (data.conversationId) {
        assertUuid(data.conversationId, "conversationId");
        const conversation = await tx.conversation.findFirst({
          where: {
            id: data.conversationId,
            business_id: businessId,
          },
        });
        if (!conversation) {
          throw new NotFoundException({
            error: {
              code: "conversation_not_found",
              message: `Conversation ${data.conversationId} not found`,
            },
          });
        }
        if (
          resolvedCustomerId &&
          conversation.customer_id &&
          resolvedCustomerId !== conversation.customer_id
        ) {
          throw new BadRequestException({
            error: {
              code: "customer_mismatch",
              message: `Explicit customerId ${resolvedCustomerId} does not match conversation customer ${conversation.customer_id}`,
            },
          });
        }
        if (!resolvedCustomerId && conversation.customer_id) {
          resolvedCustomerId = conversation.customer_id;
        }
        if (!conversation.is_test && data.isTest === true) {
          throw new BadRequestException({
            error: {
              code: "invalid_test_flag",
              message: "Cannot mark order as test in a production conversation",
            },
          });
        }
        conversationIsTest = conversation.is_test;
      }

      if (!resolvedCustomerId) {
        throw new BadRequestException({
          error: {
            code: "customer_id_required",
            message: "Could not resolve customer ID for order",
          },
        });
      }

      const finalCustomerId: string = resolvedCustomerId;

      // 3. Verify Customer exists and belongs to tenant
      const customer = await tx.customer.findFirst({
        where: {
          id: finalCustomerId,
          business_id: businessId,
        },
      });
      if (!customer) {
        throw new NotFoundException({
          error: {
            code: "customer_not_found",
            message: `Customer ${finalCustomerId} not found`,
          },
        });
      }

      // If conversation had no customer attached, atomically attach it now!
      if (data.conversationId) {
        const conv = await tx.conversation.findFirst({
          where: { id: data.conversationId, business_id: businessId },
          select: { id: true, customer_id: true },
        });
        if (conv && !conv.customer_id) {
          await tx.conversation.update({
            where: {
              id_business_id: {
                id: data.conversationId,
                business_id: businessId,
              },
            },
            data: { customer_id: customer.id },
          });
        }
      }

      // 4. Determine isTest strictly from customer/conversation context
      const isTest = data.conversationId
        ? conversationIsTest
        : customer.is_test || (data.isTest ?? false);

      // 5. Snapshot verified customer info
      const customerSnapshot: CustomerSnapshot = {
        name:
          customer.name ??
          (typeof data.customerSnapshot?.name === "string" ? data.customerSnapshot.name : null),
        phone:
          customer.phone ??
          (typeof data.customerSnapshot?.phone === "string" ? data.customerSnapshot.phone : null),
        address:
          ((data.deliveryAddress ??
            data.shippingAddress ??
            data.customerSnapshot?.address ??
            customer.address) as Address | null) ?? null,
      };

      // 6. Get reservation TTL from ai_settings (default 30 mins, bounded 1..10080)
      const aiSettings = await tx.aiSettings.findUnique({
        where: { business_id: businessId },
        select: { reservation_ttl_minutes: true },
      });
      let ttlMinutes = aiSettings?.reservation_ttl_minutes ?? 30;
      if (
        typeof ttlMinutes !== "number" ||
        isNaN(ttlMinutes) ||
        ttlMinutes <= 0 ||
        ttlMinutes > 10080
      ) {
        ttlMinutes = 30;
      }

      // 7. Consolidate requested quantities by variant and lock rows
      const requestedQtyByVariant = new Map<string, number>();
      for (const item of data.items) {
        requestedQtyByVariant.set(
          item.variantId,
          (requestedQtyByVariant.get(item.variantId) ?? 0) + item.quantity,
        );
      }
      const uniqueVariantIds = Array.from(requestedQtyByVariant.keys());

      await tx.$queryRaw`
          SELECT id FROM product_variants
          WHERE id IN (${Prisma.join(uniqueVariantIds)})
            AND business_id = ${businessId}::uuid
          FOR UPDATE
        `;

      const variants = await tx.productVariant.findMany({
        where: {
          id: { in: uniqueVariantIds },
          business_id: businessId,
        },
        include: { product: true },
      });

      if (variants.length !== uniqueVariantIds.length) {
        throw new BadRequestException({
          error: {
            code: "variant_not_found",
            message: "One or more requested variants do not exist in this business catalog",
          },
        });
      }

      const variantMap = new Map(variants.map((v) => [v.id, v]));

      // 8. Active unexpired reservations
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

      const activeReservations = await tx.stockReservation.findMany({
        where: {
          business_id: businessId,
          variant_id: { in: uniqueVariantIds },
          status: "active",
          expires_at: { gt: now },
        },
        select: { variant_id: true, quantity: true },
      });

      const reservedSum = new Map<string, number>();
      for (const res of activeReservations) {
        reservedSum.set(res.variant_id, (reservedSum.get(res.variant_id) ?? 0) + res.quantity);
      }

      // Verify stock availability
      for (const [vId, reqQty] of requestedQtyByVariant.entries()) {
        const v = variantMap.get(vId);
        if (!v) {
          throw new BadRequestException({
            error: {
              code: "variant_not_found",
              message: `Variant ${vId} not found`,
            },
          });
        }
        const reserved = reservedSum.get(vId) ?? 0;
        const available = Math.max(0, v.stock - reserved);
        if (reqQty > available) {
          throw new BadRequestException({
            error: {
              code: "insufficient_stock",
              message: `Insufficient stock for variant ${v.sku ?? v.id}. Available: ${available}, requested: ${reqQty}`,
            },
          });
        }
      }

      // 9. Calculate subtotal using Decimal arithmetic and server catalog prices
      let subtotalDecimal = new Prisma.Decimal(0);
      const itemsData = data.items.map((item) => {
        const v = variantMap.get(item.variantId);
        if (!v) {
          throw new BadRequestException({
            error: {
              code: "variant_not_found",
              message: `Variant ${item.variantId} not found`,
            },
          });
        }
        const priceDecimal =
          v.discount_price !== null
            ? new Prisma.Decimal(v.discount_price)
            : new Prisma.Decimal(v.price);
        const lineTotal = priceDecimal.mul(item.quantity);
        subtotalDecimal = subtotalDecimal.plus(lineTotal);

        const nameSnapshot = v.product.name + (v.sku ? ` (${v.sku})` : "");
        return {
          variant_id: v.id,
          quantity: item.quantity,
          unit_price: priceDecimal,
          name_snapshot: nameSnapshot,
          sku_snapshot: v.sku,
          attributes_snapshot: v.attributes,
        };
      });

      // 10. Delivery fee calculation
      let deliveryFeeDecimal = new Prisma.Decimal(0);
      if (data.deliveryFee !== undefined) {
        deliveryFeeDecimal = new Prisma.Decimal(data.deliveryFee.toFixed(3));
      } else {
        // Check free shipping rule
        const freeShippingRule = await tx.businessRule.findFirst({
          where: {
            business_id: businessId,
            rule_type: "free_shipping",
            enabled: true,
          },
          orderBy: { priority: "desc" },
        });

        let isFree = false;
        if (
          freeShippingRule &&
          typeof freeShippingRule.payload === "object" &&
          freeShippingRule.payload !== null
        ) {
          const parsedFs = FreeShippingPayloadSchema.safeParse(freeShippingRule.payload);
          if (parsedFs.success && subtotalDecimal.gte(parsedFs.data.threshold)) {
            deliveryFeeDecimal = new Prisma.Decimal(0);
            isFree = true;
          }
        }

        if (!isFree) {
          const deliveryRule = await tx.businessRule.findFirst({
            where: {
              business_id: businessId,
              rule_type: "delivery",
              enabled: true,
            },
            orderBy: { priority: "desc" },
          });
          if (
            deliveryRule &&
            typeof deliveryRule.payload === "object" &&
            deliveryRule.payload !== null
          ) {
            const parsedDel = DeliveryRulePayloadSchema.safeParse(deliveryRule.payload);
            if (parsedDel.success && parsedDel.data.zones.length > 0) {
              const addressObj = (data.deliveryAddress ?? customer.address) as Address | null;
              const addressCity = addressObj?.city;
              const matchedZone = addressCity
                ? parsedDel.data.zones.find(
                    (z) => z.name.toLowerCase() === addressCity.toLowerCase(),
                  )
                : undefined;
              const firstZone = parsedDel.data.zones[0];
              const zoneFee = matchedZone ? matchedZone.fee : firstZone ? firstZone.fee : 0;
              deliveryFeeDecimal = new Prisma.Decimal(zoneFee.toFixed(3));
            } else {
              const payload = deliveryRule.payload as Record<string, unknown>;
              const fee =
                typeof payload.fee === "number"
                  ? payload.fee
                  : typeof payload.base_fee === "number"
                    ? payload.base_fee
                    : typeof payload.standard_delivery_fee === "number"
                      ? payload.standard_delivery_fee
                      : 0;
              deliveryFeeDecimal = new Prisma.Decimal(fee.toFixed(3));
            }
          }
        }
      }

      const totalDecimal = subtotalDecimal.plus(deliveryFeeDecimal);

      // 11. Create order
      const order = await tx.order.create({
        data: {
          business_id: businessId,
          customer_id: finalCustomerId,
          conversation_id: data.conversationId ?? null,
          status: "PENDING_CONFIRMATION",
          payment_status: "NOT_COMPLETED",
          currency,
          subtotal: subtotalDecimal,
          delivery_fee: deliveryFeeDecimal,
          total: totalDecimal,
          customer_snapshot: customerSnapshot,
          delivery_address: (data.deliveryAddress ??
            data.shippingAddress ??
            null) as Prisma.InputJsonValue,
          created_by_type: createdByType,
          created_by_user_id: userId ?? null,
          idempotency_key: trimmedKey,
          is_test: isTest,
        },
      });

      // 12. Create line items and stock reservations concurrently
      await Promise.all(
        itemsData.flatMap((itemData) => [
          tx.orderItem.create({
            data: {
              business_id: businessId,
              order_id: order.id,
              variant_id: itemData.variant_id,
              quantity: itemData.quantity,
              unit_price: itemData.unit_price,
              name_snapshot: itemData.name_snapshot,
              sku_snapshot: itemData.sku_snapshot,
              attributes_snapshot: (itemData.attributes_snapshot ??
                Prisma.JsonNull) as Prisma.InputJsonValue,
            },
          }),
          tx.stockReservation.create({
            data: {
              business_id: businessId,
              variant_id: itemData.variant_id,
              order_id: order.id,
              conversation_id: data.conversationId ?? null,
              quantity: itemData.quantity,
              status: "active",
              reserved_at: now,
              expires_at: expiresAt,
            },
          }),
        ]),
      );

      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      });
    };

    let createdOrder: RawOrderWithItems;
    try {
      if (tx) {
        createdOrder = await runInTransaction(tx);
      } else {
        createdOrder = await this.prisma.$transaction(runInTransaction);
      }
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // When an outer tx was supplied the caller owns the transaction; that transaction is now
        // aborted after the P2002. Using the root Prisma client here would read state outside
        // the (already-rolled-back) tx. Rethrow immediately so the outer transaction rolls back cleanly.
        if (tx) {
          throw err;
        }

        // For standalone (self-managed) executions, recover using the root client after
        // the internal transaction has fully rolled back.
        const raced = await this.prisma.order.findUnique({
          where: {
            business_id_idempotency_key: {
              business_id: businessId,
              idempotency_key: trimmedKey,
            },
          },
          include: { items: true },
        });
        if (raced) {
          const requestedDeliveryFee =
            data.deliveryFee !== undefined
              ? new Prisma.Decimal(data.deliveryFee.toFixed(3))
              : raced.delivery_fee;
          const isMatch = this.verifyIdempotencyMatch(
            raced,
            data,
            currency,
            requestedDeliveryFee,
            data.deliveryAddress ?? data.shippingAddress ?? null,
          );
          if (!isMatch) {
            throw new ConflictException({
              error: {
                code: "idempotency_conflict",
                message:
                  "An order already exists with this idempotency key but with different parameters",
              },
            });
          }
          return this.formatOrder(raced);
        }
      }
      throw err;
    }

    return this.formatOrder(createdOrder);
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/confirm-order
   * Alias: Resolves pending order via conversation_id + PENDING_CONFIRMATION.
   * Zero rows -> 404, Multiple -> 409 ambiguous_pending_order.
   */
  async confirmConversationOrder(
    businessId: string,
    conversationId: string,
    paymentStatus?: "NOT_COMPLETED" | "COMPLETED",
  ): Promise<OrderResponse> {
    assertUuid(conversationId, "conversationId");

    const confirmedOrder = await this.prisma.$transaction(async (tx) => {
      // 1. Verify conversation exists in caller's tenant
      const conversation = await tx.conversation.findFirst({
        where: {
          id: conversationId,
          business_id: businessId,
        },
        select: { id: true },
      });

      if (!conversation) {
        throw new NotFoundException({
          error: {
            code: "conversation_not_found",
            message: `Conversation ${conversationId} not found`,
          },
        });
      }

      // 2. Fetch pending orders under lock
      const pendingOrders = await tx.order.findMany({
        where: {
          business_id: businessId,
          conversation_id: conversationId,
          status: "PENDING_CONFIRMATION",
        },
        select: { id: true },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 2,
      });

      if (pendingOrders.length === 0) {
        // Idempotency check: see if there is an already confirmed order
        const existingConfirmed = await tx.order.findFirst({
          where: {
            business_id: businessId,
            conversation_id: conversationId,
            status: "CONFIRMED",
          },
          orderBy: [{ order_confirmed_at: "desc" }, { created_at: "desc" }, { id: "desc" }],
          include: { items: true },
        });

        if (existingConfirmed) {
          if (paymentStatus && paymentStatus !== existingConfirmed.payment_status) {
            const updated = await tx.order.update({
              where: { id: existingConfirmed.id },
              data: { payment_status: paymentStatus },
              include: { items: true },
            });
            return updated;
          }
          return existingConfirmed;
        }

        throw new NotFoundException({
          error: {
            code: "pending_order_not_found",
            message: `No pending order found for conversation ${conversationId}`,
          },
        });
      }

      if (pendingOrders.length > 1) {
        throw new ConflictException({
          error: {
            code: "ambiguous_pending_order",
            message: `Multiple pending orders found for conversation ${conversationId}. Use PATCH /api/v1/orders/:id/status instead.`,
          },
        });
      }

      const targetOrder = pendingOrders[0];
      if (!targetOrder) {
        throw new NotFoundException({
          error: {
            code: "pending_order_not_found",
            message: `No pending order found for conversation ${conversationId}`,
          },
        });
      }
      return this.executeConfirmOrderInTx(tx, businessId, targetOrder.id, paymentStatus);
    });

    this.emitOrderRealtimeEvents(businessId, confirmedOrder);
    return this.formatOrder(confirmedOrder);
  }

  /**
   * 13 §8 POST /api/v1/orders/:id/confirm
   * Confirms order, commits reservation hold, and deducts physical stock.
   */
  async confirmOrder(
    businessId: string,
    orderId: string,
    paymentStatus?: "NOT_COMPLETED" | "COMPLETED",
  ): Promise<OrderResponse> {
    assertUuid(orderId, "orderId");
    const confirmedOrder = await this.prisma.$transaction(async (tx) => {
      return this.executeConfirmOrderInTx(tx, businessId, orderId, paymentStatus);
    });

    this.emitOrderRealtimeEvents(businessId, confirmedOrder);
    return this.formatOrder(confirmedOrder);
  }

  private async executeConfirmOrderInTx(
    tx: Prisma.TransactionClient,
    businessId: string,
    orderId: string,
    paymentStatus?: "NOT_COMPLETED" | "COMPLETED",
  ): Promise<RawOrderWithItems> {
    const now = new Date();
    const order = await this.findOrderOrThrow(businessId, orderId, tx, true);

    if (order.status === "CONFIRMED") {
      if (paymentStatus && paymentStatus !== order.payment_status) {
        const updated = await tx.order.update({
          where: { id: order.id },
          data: { payment_status: paymentStatus },
          include: { items: true },
        });
        return updated;
      }
      return order;
    }

    if (order.status !== "PENDING_CONFIRMATION") {
      throw new BadRequestException({
        error: {
          code: "invalid_transition",
          message: `Cannot confirm order in ${order.status} state`,
        },
      });
    }

    const items = order.items ?? [];
    if (items.length > 0) {
      // Consolidate requested quantities by variant to protect against duplicate lines
      const requestedQtyByVariant = new Map<string, number>();
      for (const item of items) {
        requestedQtyByVariant.set(
          item.variant_id,
          (requestedQtyByVariant.get(item.variant_id) ?? 0) + item.quantity,
        );
      }
      const uniqueVariantIds = Array.from(requestedQtyByVariant.keys());

      await tx.$queryRaw`
        SELECT id FROM product_variants
        WHERE id IN (${Prisma.join(uniqueVariantIds)})
          AND business_id = ${businessId}::uuid
        FOR UPDATE
      `;

      // Expire any past-due active reservations for this order
      await tx.stockReservation.updateMany({
        where: {
          business_id: businessId,
          order_id: order.id,
          status: "active",
          expires_at: { lte: now },
        },
        data: { status: "expired" },
      });

      await Promise.all(
        Array.from(requestedQtyByVariant.entries()).map(async ([vId, totalQty]) => {
          // Find unexpired active reservations for this order
          const [orderReservations, variant, otherReservations] = await Promise.all([
            tx.stockReservation.findMany({
              where: {
                business_id: businessId,
                order_id: order.id,
                variant_id: vId,
                status: "active",
                expires_at: { gt: now },
              },
            }),
            tx.productVariant.findFirst({
              where: { id: vId, business_id: businessId },
            }),
            tx.stockReservation.findMany({
              where: {
                business_id: businessId,
                variant_id: vId,
                status: "active",
                expires_at: { gt: now },
                order_id: { not: order.id },
              },
              select: { quantity: true },
            }),
          ]);

          if (!variant) {
            throw new BadRequestException(`Variant ${vId} not found`);
          }

          const reservedByThisOrder = orderReservations.reduce((sum, r) => sum + r.quantity, 0);

          // Invariant: Confirmation MUST fail if reservation hold is expired or missing
          if (reservedByThisOrder < totalQty) {
            throw new BadRequestException({
              error: {
                code: "reservation_expired",
                message: `Reservation for order ${order.id} has expired or is missing for variant ${variant.sku ?? variant.id}. Please place a new order.`,
              },
            });
          }

          const otherReserved = otherReservations.reduce((sum, r) => sum + r.quantity, 0);
          const availableStock = Math.max(0, variant.stock - otherReserved);
          if (totalQty > availableStock) {
            throw new BadRequestException({
              error: {
                code: "insufficient_stock",
                message: `Insufficient stock to confirm order for variant ${variant.sku ?? variant.id}. Available: ${availableStock}, needed: ${totalQty}`,
              },
            });
          }

          // Commit reservations
          const commitResult = await tx.stockReservation.updateMany({
            where: {
              id: { in: orderReservations.map((r) => r.id) },
              business_id: businessId,
              order_id: order.id,
              variant_id: vId,
              status: "active",
            },
            data: { status: "committed" },
          });

          if (commitResult.count !== orderReservations.length) {
            throw new BadRequestException({
              error: {
                code: "reservation_commit_failed",
                message: `Expected to commit ${orderReservations.length} reservation(s) for variant ${vId}, but only ${commitResult.count} were committed. The hold may have expired concurrently.`,
              },
            });
          }

          // Deduct physical stock conditionally
          const stockResult = await tx.$executeRaw`
            UPDATE product_variants
            SET stock = stock - ${totalQty}
            WHERE id = ${vId}::uuid
              AND business_id = ${businessId}::uuid
              AND stock >= ${totalQty}
          `;

          if (stockResult !== 1) {
            throw new BadRequestException({
              error: {
                code: "insufficient_stock",
                message: `Cannot deduct stock for variant ${vId}: stock is insufficient to fulfill the requested quantity of ${totalQty}.`,
              },
            });
          }

          await tx.inventoryMovement.create({
            data: {
              business_id: businessId,
              variant_id: vId,
              delta: -totalQty,
              reason: "order_confirmed",
              order_id: order.id,
            },
          });
        }),
      );
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CONFIRMED",
        order_confirmed_at: now,
        payment_status: paymentStatus ?? order.payment_status,
      },
      include: { items: true },
    });

    // Update customer stats with multi-tenant compound key
    await tx.customer.update({
      where: {
        id_business_id: {
          id: order.customer_id,
          business_id: businessId,
        },
      },
      data: {
        confirmed_order_count: { increment: 1 },
        last_confirmed_order_at: now,
        lifecycle_stage: "customer",
      },
    });

    // If conversation is attached, transition conversation to ORDER_CONFIRMED and audit status event
    if (order.conversation_id) {
      const conv = await tx.conversation.findFirst({
        where: {
          id: order.conversation_id,
          business_id: businessId,
        },
      });
      if (conv && conv.status !== "ORDER_CONFIRMED" && conv.status !== "RESOLVED") {
        await tx.conversation.update({
          where: {
            id_business_id: {
              id: order.conversation_id,
              business_id: businessId,
            },
          },
          data: {
            status: "ORDER_CONFIRMED",
          },
        });

        const actorType = order.created_by_type === "ai" ? "ai" : "user";
        await tx.conversationStatusEvent.create({
          data: {
            business_id: businessId,
            conversation_id: order.conversation_id,
            from_status: conv.status,
            to_status: "ORDER_CONFIRMED",
            actor_type: actorType,
            actor_user_id: order.created_by_user_id,
            is_test: order.is_test,
          },
        });
      }
    }

    return updated;
  }

  private emitOrderRealtimeEvents(businessId: string, confirmedOrder: RawOrderWithItems): void {
    if (this.realtimeGateway) {
      try {
        const payload = {
          businessId,
          orderId: confirmedOrder.id,
          conversationId: confirmedOrder.conversation_id,
          customerId: confirmedOrder.customer_id,
          total: confirmedOrder.total.toFixed(3),
          confirmedAt: confirmedOrder.order_confirmed_at?.toISOString() ?? new Date().toISOString(),
        };
        const parsedPayload = OrderConfirmedEventPayloadSchema.safeParse(payload);
        if (parsedPayload.success) {
          this.realtimeGateway.emitToTenant(
            businessId,
            REALTIME_EVENTS.ORDER_CONFIRMED,
            parsedPayload.data,
          );
        }

        if (confirmedOrder.conversation_id) {
          this.realtimeGateway.emitToConversation(
            confirmedOrder.conversation_id,
            REALTIME_EVENTS.CONVERSATION_STATUS,
            {
              conversationId: confirmedOrder.conversation_id,
              status: "ORDER_CONFIRMED",
            },
          );
        }
      } catch (err) {
        Logger.warn(
          `Failed to emit realtime order.confirmed event: ${String(err)}`,
          "OrdersService",
        );
      }
    }
  }

  /**
   * 13 §8 POST /api/v1/orders/:id/cancel
   * Cancels order and releases stock reservation hold.
   */
  async cancelOrder(businessId: string, orderId: string): Promise<OrderResponse> {
    const cancelledOrder = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const order = await this.findOrderOrThrow(businessId, orderId, tx, true);

      if (order.status === "CANCELLED") {
        return order;
      }

      if (order.status !== "PENDING_CONFIRMATION" && order.status !== "CONFIRMED") {
        throw new BadRequestException({
          error: {
            code: "invalid_transition",
            message: `Cannot cancel an order in ${order.status} state`,
          },
        });
      }

      // Release active or committed stock reservations
      await tx.stockReservation.updateMany({
        where: {
          business_id: businessId,
          order_id: order.id,
          status: { in: ["active", "committed"] },
        },
        data: {
          status: "released",
        },
      });

      // If order was already CONFIRMED and stock deducted, restore physical inventory & reverse customer order count
      if (order.status === "CONFIRMED" && order.items && order.items.length > 0) {
        const confirmedMovements = await tx.inventoryMovement.findMany({
          where: {
            business_id: businessId,
            order_id: order.id,
            reason: "order_confirmed",
          },
        });
        const cancelledMovements = await tx.inventoryMovement.findMany({
          where: {
            business_id: businessId,
            order_id: order.id,
            reason: "order_cancelled",
          },
        });

        // Restore only if confirmed movements exist and have not been cancelled
        if (confirmedMovements.length > 0 && cancelledMovements.length === 0) {
          const variantIds = Array.from(new Set(confirmedMovements.map((m) => m.variant_id)));
          if (variantIds.length > 0) {
            await tx.$queryRaw`
              SELECT id FROM product_variants
              WHERE id IN (${Prisma.join(variantIds)})
                AND business_id = ${businessId}::uuid
              FOR UPDATE
            `;
          }

          await Promise.all(
            order.items.map(async (item) => {
              await tx.productVariant.update({
                where: {
                  id_business_id: {
                    id: item.variant_id,
                    business_id: businessId,
                  },
                },
                data: { stock: { increment: item.quantity } },
              });

              await tx.inventoryMovement.create({
                data: {
                  business_id: businessId,
                  variant_id: item.variant_id,
                  delta: item.quantity,
                  reason: "order_cancelled",
                  order_id: order.id,
                },
              });
            }),
          );
        }

        // Revert customer confirmed order count and recompute lifecycle stage if > 0
        const customer = await tx.customer.findFirst({
          where: { id: order.customer_id, business_id: businessId },
        });
        if (customer && customer.confirmed_order_count > 0) {
          const newCount = customer.confirmed_order_count - 1;
          const otherConfirmed = await tx.order.findMany({
            where: {
              business_id: businessId,
              customer_id: order.customer_id,
              status: { in: ["CONFIRMED", "COMPLETED"] },
              id: { not: order.id },
            },
            orderBy: { order_confirmed_at: "desc" },
            take: 1,
          });
          const lastConfirmedAt = otherConfirmed[0]?.order_confirmed_at ?? null;
          const lifecycleStage: LifecycleStage =
            newCount > 1 ? "returning_customer" : newCount === 1 ? "customer" : "qualified_lead";

          await tx.customer.update({
            where: {
              id_business_id: {
                id: order.customer_id,
                business_id: businessId,
              },
            },
            data: {
              confirmed_order_count: newCount,
              last_confirmed_order_at: lastConfirmedAt,
              lifecycle_stage: lifecycleStage,
            },
          });
        }
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
          cancelled_at: now,
        },
        include: { items: true },
      });

      return updated;
    });

    // Realtime notification emission on cancellation
    if (this.realtimeGateway) {
      const cancelPayload = {
        businessId: cancelledOrder.business_id,
        orderId: cancelledOrder.id,
        conversationId: cancelledOrder.conversation_id,
        reason: "MANUAL_CANCEL",
        cancelledAt: (cancelledOrder.cancelled_at ?? new Date()).toISOString(),
      };

      if (cancelledOrder.conversation_id) {
        try {
          this.realtimeGateway.emitToConversation(
            cancelledOrder.conversation_id,
            REALTIME_EVENTS.ORDER_CANCELLED,
            cancelPayload,
          );
        } catch (err) {
          Logger.warn(
            `Failed to emit realtime conversation cancellation event: ${String(err)}`,
            "OrdersService",
          );
        }
      }

      if (
        "emitToTenant" in this.realtimeGateway &&
        typeof this.realtimeGateway.emitToTenant === "function"
      ) {
        try {
          this.realtimeGateway.emitToTenant(
            cancelledOrder.business_id,
            REALTIME_EVENTS.ORDER_CANCELLED,
            cancelPayload,
          );
        } catch (err) {
          Logger.warn(
            `Failed to emit realtime tenant cancellation event: ${String(err)}`,
            "OrdersService",
          );
        }
      }
    }

    return this.formatOrder(cancelledOrder);
  }

  /**
   * 13 §8 PATCH /api/v1/orders/:id/status
   * Canonical status updater.
   */
  async updateOrderStatus(
    businessId: string,
    orderId: string,
    body: UpdateOrderStatusDto,
  ): Promise<OrderResponse> {
    const parsed = UpdateOrderStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw toValidationException(parsed.error);
    }

    const { status, paymentStatus } = parsed.data;

    if (status === "CONFIRMED") {
      return this.confirmOrder(businessId, orderId, paymentStatus);
    }

    if (status === "CANCELLED") {
      return this.cancelOrder(businessId, orderId);
    }

    // status is COMPLETED
    const completedOrder = await this.prisma.$transaction(async (tx) => {
      const order = await this.findOrderOrThrow(businessId, orderId, tx, true);

      if (order.status === "COMPLETED") {
        if (paymentStatus && paymentStatus !== order.payment_status) {
          return tx.order.update({
            where: { id: order.id },
            data: { payment_status: paymentStatus },
            include: { items: true },
          });
        }
        return order;
      }

      if (order.status !== "CONFIRMED") {
        throw new BadRequestException({
          error: {
            code: "invalid_transition",
            message: "Cannot complete order. Order must be CONFIRMED first.",
          },
        });
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: "COMPLETED",
          completed_at: order.completed_at ?? new Date(),
          payment_status: paymentStatus ?? order.payment_status,
        },
        include: { items: true },
      });

      return updated;
    });

    return this.formatOrder(completedOrder);
  }

  /**
   * 13 §8 GET /api/v1/orders/:id
   */
  async getOrder(
    businessId: string,
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderResponse> {
    const order = await this.findOrderOrThrow(businessId, orderId, tx);
    return this.formatOrder(order);
  }

  /**
   * 13 §8 GET /api/v1/orders
   */
  async listOrders(
    businessId: string,
    query: ListOrdersQueryDto,
  ): Promise<PaginatedOrdersResponse> {
    const parsed = ListOrdersQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw toValidationException(parsed.error);
    }
    const data = parsed.data;

    const where: Prisma.OrderWhereInput = {
      business_id: businessId,
    };

    if (data.status) {
      if (Array.isArray(data.status)) {
        where.status = { in: data.status as OrderStatus[] };
      } else {
        where.status = data.status;
      }
    }

    const createdBy = data.created_by ?? data.createdBy;
    if (createdBy) {
      where.created_by_type = createdBy;
    }

    const customerId = data.customerId ?? data.customer_id;
    if (customerId) {
      where.customer_id = customerId;
    }

    const conversationId = data.conversationId ?? data.conversation_id;
    if (conversationId) {
      where.conversation_id = conversationId;
    }

    const isTest = data.is_test ?? data.isTest;
    if (isTest !== undefined) {
      where.is_test = isTest;
    }

    if (data.from || data.to) {
      where.created_at = {};
      if (data.from) {
        const fromStr = data.from.includes("T") ? data.from : `${data.from}T00:00:00.000Z`;
        where.created_at.gte = new Date(fromStr);
      }
      if (data.to) {
        const toStr = data.to.includes("T") ? data.to : `${data.to}T23:59:59.999Z`;
        where.created_at.lte = new Date(toStr);
      }
    }

    const limit = data.limit ?? 50;

    let cursorDecoded: { t: string; id: string } | null = null;
    let isDirectUuidCursor = false;

    if (data.cursor) {
      const UUID_SCHEMA = z.uuid();
      try {
        const decodedStr = Buffer.from(data.cursor, "base64url").toString("utf-8");
        const parsed = JSON.parse(decodedStr) as unknown;
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "t" in parsed &&
          "id" in parsed &&
          typeof (parsed as { t: unknown }).t === "string" &&
          typeof (parsed as { id: unknown }).id === "string"
        ) {
          const rec = parsed as { t: string; id: string };
          const cursorDate = new Date(rec.t);
          if (isNaN(cursorDate.getTime()) || !UUID_SCHEMA.safeParse(rec.id.trim()).success) {
            throw new BadRequestException({
              error: {
                code: "invalid_cursor",
                message: "The specified pagination cursor is invalid",
              },
            });
          }
          cursorDecoded = { t: rec.t, id: rec.id.trim() };
        } else if (UUID_SCHEMA.safeParse(data.cursor.trim()).success) {
          isDirectUuidCursor = true;
        } else {
          throw new BadRequestException({
            error: {
              code: "invalid_cursor",
              message: "The specified pagination cursor is invalid",
            },
          });
        }
      } catch (err) {
        if (err instanceof BadRequestException) {
          throw err;
        }
        if (UUID_SCHEMA.safeParse(data.cursor.trim()).success) {
          isDirectUuidCursor = true;
        } else {
          throw new BadRequestException({
            error: {
              code: "invalid_cursor",
              message: "The specified pagination cursor is invalid",
            },
          });
        }
      }
    }

    if (cursorDecoded) {
      const cursorDate = new Date(cursorDecoded.t);
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { created_at: { lt: cursorDate } },
            {
              created_at: cursorDate,
              id: { lt: cursorDecoded.id },
            },
          ],
        },
      ];
    }

    try {
      const [total, orders] = await this.prisma.$transaction([
        this.prisma.order.count({ where }),
        this.prisma.order.findMany({
          where,
          include: { items: true },
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: limit + 1,
          ...(isDirectUuidCursor && data.cursor ? { cursor: { id: data.cursor }, skip: 1 } : {}),
        }),
      ]);

      const hasNext = orders.length > limit;
      const pageOrders = hasNext ? orders.slice(0, limit) : orders;
      let nextCursor: string | null = null;
      if (hasNext && pageOrders.length > 0) {
        const last = pageOrders[pageOrders.length - 1];
        if (last) {
          const createdAtIso =
            last.created_at instanceof Date
              ? last.created_at.toISOString()
              : new Date(last.created_at).toISOString();
          nextCursor = Buffer.from(
            JSON.stringify({ t: createdAtIso, id: last.id }),
            "utf-8",
          ).toString("base64url");
        }
      }

      return {
        items: pageOrders.map((o) => this.formatOrder(o as RawOrderWithItems)),
        nextCursor,
        total,
      };
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        throw new BadRequestException({
          error: {
            code: "invalid_cursor",
            message: "The specified pagination cursor does not exist",
          },
        });
      }
      throw err;
    }
  }
}
