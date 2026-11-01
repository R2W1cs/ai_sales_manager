import * as crypto from "crypto";

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  Prisma,
  type Conversation,
  type ConversationNote,
  type LifecycleStage,
  type PrismaClient,
} from "@prisma/client";
import { z } from "zod";

import {
  type Address,
  AddressSchema,
  type Channel,
  type CollectedField,
  CollectedFieldSchema,
  type HandoffConfidenceSource,
  HandoffConfidenceSourceSchema,
  type HandoffContext,
  type HandoffTriggeredEvent,
  type OrderResponse,
  areAddressesEqual,
} from "@app/shared";

import { logger } from "../../lib/logger";
import { prisma as defaultPrisma } from "../../lib/prisma";
import { OrdersService } from "../../orders/core/orders.service";
import { assertUuid, toValidationException } from "../../platform/core/errors";
import { BriefingGeneratorService } from "./briefing-generator.service";
import { HandoffService } from "./handoff.service";

export const PurchaseIntentItemSchema = z.strictObject({
  variantId: z.uuid("variantId must be a valid UUID"),
  quantity: z
    .number()
    .int("Quantity must be an integer")
    .positive("Item quantity must be a positive integer")
    .max(1000, "Item quantity cannot exceed 1000"),
  // Advisory metadata fields from upstream extractors (actual prices and names are derived from server catalogue)
  unitPrice: z.number().positive().optional(),
  productName: z.string().max(255).optional(),
  variantName: z.string().max(255).optional(),
  sku: z.string().max(100).optional(),
});

export type PurchaseIntentItem = z.infer<typeof PurchaseIntentItemSchema>;

export const PurchaseIntentCustomerInputSchema = z.strictObject({
  id: z.uuid("customerId must be a valid UUID").optional(),
  name: z.string().trim().min(1).max(255).nullable().optional(),
  phone: z.string().trim().min(1).max(50).nullable().optional(),
  address: AddressSchema.nullable().optional(),
});

export type PurchaseIntentCustomerInput = z.infer<typeof PurchaseIntentCustomerInputSchema>;

export const PurchaseIntentDataSchema = z.strictObject({
  items: z
    .array(PurchaseIntentItemSchema)
    .min(1, "Purchase intent requires at least one item")
    .refine((items) => new Set(items.map((i) => i.variantId)).size === items.length, {
      message: "Duplicate variantId in items array is not allowed",
    })
    .refine((items) => items.reduce((sum, i) => sum + i.quantity, 0) <= 10000, {
      message: "Total quantity across items cannot exceed 10000",
    }),
  customer: PurchaseIntentCustomerInputSchema.optional(),
  deliveryAddress: AddressSchema.nullable().optional(),
  shippingAddress: AddressSchema.nullable().optional(),
  deliveryFee: z.number().min(0).max(100000).optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
  collectedFields: z.array(CollectedFieldSchema).optional(),
  missingFields: z.array(CollectedFieldSchema).optional(),
  notes: z.string().max(2000).optional(),
  actionRequired: z.string().trim().max(500).optional(),
  aiRecommendation: z.string().trim().max(500).optional(),
  customSummary: z.string().trim().max(1000).optional(),
  confidence: z.number().min(0).max(1).nullish(),
  confidenceSource: HandoffConfidenceSourceSchema.nullish(),
  lastMessage: z.string().trim().max(2000).optional(),
  decisionTraceId: z.uuid("decisionTraceId must be a valid UUID").nullable().optional(),
  inboundMessageId: z.uuid("inboundMessageId must be a valid UUID").optional(),
});

export type PurchaseIntentData = z.infer<typeof PurchaseIntentDataSchema>;

export interface HandlePurchaseIntentParams {
  businessId: string;
  conversationId: string;
  intentData: PurchaseIntentData;
}

export interface PurchaseHandoffSuccessResult {
  success: true;
  stockAvailable: true;
  handoffTriggered: true;
  escalationReason: "purchase_handoff";
  priority: "high";
  order: OrderResponse;
  conversation: Conversation;
  briefing: HandoffContext;
  note: ConversationNote | null;
  event: HandoffTriggeredEvent;
}

export interface PurchaseHandoffStockOutageResult {
  success: false;
  stockAvailable: false;
  handoffTriggered: true;
  trigger: "STOCK_OUTAGE";
  escalationReason: "inventory_conflict";
  priority: "high";
  order: null;
  conversation: Conversation;
  briefing: HandoffContext;
  note: ConversationNote | null;
  event: HandoffTriggeredEvent;
  stockError?: string;
}

export type PurchaseHandoffResult = PurchaseHandoffSuccessResult | PurchaseHandoffStockOutageResult;

export interface RealtimeEmitter {
  emitToTenant(businessId: string, event: string, payload: unknown): void;
  emitToConversation(conversationId: string, event: string, payload: unknown): void;
}

function computeDeterministicIdempotencyKey(
  businessId: string,
  conversationId: string,
  items: { variantId: string; quantity: number }[],
): string {
  const sorted = items.toSorted((a, b) => a.variantId.localeCompare(b.variantId));
  const payloadStr = sorted.map((i) => `${i.variantId}:${i.quantity}`).join(";");
  const hash = crypto
    .createHash("sha256")
    .update(`${businessId}:${conversationId}:${payloadStr}`)
    .digest("hex");
  return `purchase_handoff_${conversationId}_${hash}`;
}

export function doOrderItemsMatchIntent(
  existingOrderItems: unknown,
  requestedItems: unknown,
): boolean {
  if (!Array.isArray(existingOrderItems) || !Array.isArray(requestedItems)) {
    return false;
  }
  if (existingOrderItems.length === 0 && requestedItems.length === 0) {
    return true;
  }
  if (existingOrderItems.length === 0 || requestedItems.length === 0) {
    return false;
  }

  const reqMap = new Map<string, number>();
  for (const item of requestedItems) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("variantId" in item) ||
      typeof (item as { variantId: unknown }).variantId !== "string" ||
      !(item as { variantId: string }).variantId.trim()
    ) {
      return false;
    }
    const typed = item as { variantId: string; quantity: unknown };
    if (
      typeof typed.quantity !== "number" ||
      !Number.isInteger(typed.quantity) ||
      typed.quantity <= 0
    ) {
      return false;
    }
    reqMap.set(typed.variantId, (reqMap.get(typed.variantId) ?? 0) + typed.quantity);
  }

  const existingMap = new Map<string, number>();
  for (const item of existingOrderItems) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("variant_id" in item) ||
      typeof (item as { variant_id: unknown }).variant_id !== "string" ||
      !(item as { variant_id: string }).variant_id.trim()
    ) {
      return false;
    }
    const typed = item as { variant_id: string; quantity: unknown };
    if (
      typeof typed.quantity !== "number" ||
      !Number.isInteger(typed.quantity) ||
      typed.quantity <= 0
    ) {
      return false;
    }
    existingMap.set(typed.variant_id, (existingMap.get(typed.variant_id) ?? 0) + typed.quantity);
  }

  if (reqMap.size !== existingMap.size) {
    return false;
  }

  for (const [vId, qty] of reqMap.entries()) {
    if (existingMap.get(vId) !== qty) {
      return false;
    }
  }

  return true;
}

@Injectable()
export class PurchaseHandoffService {
  private readonly prisma: PrismaClient;

  constructor(
    private readonly briefingGenerator: BriefingGeneratorService,
    private readonly handoffService: HandoffService,
    private readonly ordersService: OrdersService,
    @Optional() prismaClient?: PrismaClient,
    @Optional() private readonly realtimeGateway?: RealtimeEmitter,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * 1. Extractor and validator for purchase intent payload using strict Zod schema
   */
  extractAndValidatePurchaseIntent(data: unknown): {
    items: { variantId: string; quantity: number }[];
    customer?: PurchaseIntentCustomerInput;
    deliveryAddress: Address | null;
    deliveryFee?: number;
    currency?: string;
    idempotencyKey?: string;
    collectedFields: CollectedField[];
    missingFields: CollectedField[];
    notes?: string;
    confidence: number | null;
    confidenceSource: HandoffConfidenceSource | null;
    customSummary?: string;
    aiRecommendation?: string;
    actionRequired?: string;
    decisionTraceId?: string | null;
    inboundMessageId?: string;
    lastMessage?: string;
  } {
    const parsed = PurchaseIntentDataSchema.safeParse(data);
    if (!parsed.success) {
      throw toValidationException(parsed.error, "Invalid purchase intent data");
    }

    const validatedData = parsed.data;

    let deliveryAddress: Address | null = null;
    if (validatedData.deliveryAddress) {
      deliveryAddress = validatedData.deliveryAddress;
    }
    if (validatedData.shippingAddress) {
      if (deliveryAddress && !areAddressesEqual(deliveryAddress, validatedData.shippingAddress)) {
        throw new BadRequestException({
          error: {
            code: "address_conflict",
            message: "deliveryAddress and shippingAddress conflict with different locations",
          },
        });
      }
      deliveryAddress ??= validatedData.shippingAddress;
    }

    if (!deliveryAddress && validatedData.customer?.address) {
      deliveryAddress = validatedData.customer.address;
    }

    const collectedFields: CollectedField[] =
      validatedData.collectedFields && Array.isArray(validatedData.collectedFields)
        ? validatedData.collectedFields
        : ["name", "phone", "address", "quantity"];

    const missingFields: CollectedField[] =
      validatedData.missingFields && Array.isArray(validatedData.missingFields)
        ? validatedData.missingFields
        : [];

    const confidence: number | null =
      typeof validatedData.confidence === "number" ? validatedData.confidence : null;

    const confidenceSource: HandoffConfidenceSource | null =
      validatedData.confidenceSource ?? (confidence !== null ? "unknown" : null);

    return {
      items: validatedData.items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
      })),
      customer: validatedData.customer,
      deliveryAddress,
      deliveryFee: validatedData.deliveryFee,
      currency: validatedData.currency,
      idempotencyKey: validatedData.idempotencyKey,
      collectedFields,
      missingFields,
      notes: validatedData.notes,
      confidence,
      confidenceSource,
      customSummary: validatedData.customSummary,
      aiRecommendation: validatedData.aiRecommendation,
      actionRequired: validatedData.actionRequired,
      decisionTraceId: validatedData.decisionTraceId,
      inboundMessageId: validatedData.inboundMessageId,
      lastMessage: validatedData.lastMessage,
    };
  }

  /**
   * 2. Check stock availability across requested items against active unexpired reservations.
   */
  async checkStockAvailability(
    businessId: string,
    items: { variantId: string; quantity: number }[],
    tx?: Prisma.TransactionClient,
  ): Promise<{
    available: boolean;
    variants: {
      id: string;
      product_id: string;
      stock: number;
      sku: string | null;
      name: string;
      price: number;
    }[];
    insufficientVariants: { variantId: string; requested: number; available: number }[];
    errorDetails?: string;
  }> {
    assertUuid(businessId, "businessId");
    const db = tx ?? this.prisma;
    const now = new Date();

    const requestedQtyByVariant = new Map<string, number>();
    for (const item of items) {
      assertUuid(item.variantId, "variantId");
      requestedQtyByVariant.set(
        item.variantId,
        (requestedQtyByVariant.get(item.variantId) ?? 0) + item.quantity,
      );
    }
    const variantIds = Array.from(requestedQtyByVariant.keys());

    const variants = await db.productVariant.findMany({
      where: {
        id: { in: variantIds },
        business_id: businessId,
      },
      select: {
        id: true,
        product_id: true,
        stock: true,
        sku: true,
        price: true,
        discount_price: true,
        product: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const foundIds = new Set(variants.map((v) => v.id));
    const missing = variantIds.filter((id) => !foundIds.has(id));

    const activeReservations = await db.stockReservation.findMany({
      where: {
        business_id: businessId,
        variant_id: { in: Array.from(foundIds) },
        status: "active",
        expires_at: { gt: now },
      },
      select: { variant_id: true, quantity: true },
    });

    const reservedSum = new Map<string, number>();
    for (const res of activeReservations) {
      reservedSum.set(res.variant_id, (reservedSum.get(res.variant_id) ?? 0) + res.quantity);
    }

    const insufficientVariants: { variantId: string; requested: number; available: number }[] = [];

    for (const missingId of missing) {
      insufficientVariants.push({
        variantId: missingId,
        requested: requestedQtyByVariant.get(missingId) ?? 1,
        available: 0,
      });
    }

    const formattedVariants = variants.map((v) => {
      const priceDec = v.discount_price ?? v.price;
      const numPrice = Number(priceDec);
      return {
        id: v.id,
        product_id: v.product_id,
        stock: v.stock,
        sku: v.sku,
        name: v.product.name,
        price: Number.isFinite(numPrice) ? numPrice : 0,
      };
    });

    for (const variant of variants) {
      const reqQty = requestedQtyByVariant.get(variant.id) ?? 0;
      const reserved = reservedSum.get(variant.id) ?? 0;
      const available = Math.max(0, variant.stock - reserved);

      if (reqQty > available) {
        insufficientVariants.push({
          variantId: variant.id,
          requested: reqQty,
          available,
        });
      }
    }

    if (insufficientVariants.length > 0) {
      const details = insufficientVariants
        .map(
          (iv) => `variant ${iv.variantId} (requested ${iv.requested}, available ${iv.available})`,
        )
        .join("; ");
      return {
        available: false,
        variants: formattedVariants,
        insufficientVariants,
        errorDetails:
          missing.length > 0
            ? `Variants not found in catalog: ${missing.join(", ")}`
            : `Insufficient stock for: ${details}`,
      };
    }

    return {
      available: true,
      variants: formattedVariants,
      insufficientVariants,
    };
  }

  /**
   * Unified fallback execution when stock is unavailable (pre-flight or concurrent failure)
   */
  private async executeStockOutageFallback(params: {
    businessId: string;
    conversationId: string;
    conversation: {
      id: string;
      customer_id: string;
      source: string;
      status?: string;
      escalation_reason?: string | null;
      channel_account?: { channel: string } | null;
      last_message_preview?: string | null;
      updated_at?: Date;
      handoff_context?: unknown;
    };
    customer: {
      id: string;
      name?: string | null;
      phone?: string | null;
      lifecycle_stage: string;
    };
    validated: ReturnType<PurchaseHandoffService["extractAndValidatePurchaseIntent"]>;
    errorDetails?: string;
    insufficientVariants?: { variantId: string; requested: number; available: number }[];
    variantMap?: Map<
      string,
      { product_id: string; name: string; sku?: string | null; price?: number }
    >;
  }): Promise<PurchaseHandoffStockOutageResult> {
    const { businessId, conversationId, conversation, customer, validated } = params;
    const customerChannel = (conversation.channel_account?.channel ??
      conversation.source) as Channel;

    const productsDiscussed = validated.items
      .map((item) => {
        const vMeta = params.variantMap?.get(item.variantId);
        if (!vMeta) return null;
        return {
          product_id: vMeta.product_id,
          variant_id: item.variantId,
          name: vMeta.name,
          sku: vMeta.sku ?? null,
          price: vMeta.price ?? 0,
          currency: validated.currency ?? "TND",
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    // If conversation is already in a non-actionable status, abort fallback
    if (
      conversation.status === "RESOLVED" ||
      conversation.status === "ORDER_CONFIRMED" ||
      conversation.status === "HUMAN_HANDLING"
    ) {
      throw new BadRequestException({
        error: {
          code: "conversation_terminal",
          message: `Conversation ${conversationId} is in non-actionable status ${conversation.status}; stock outage fallback aborted.`,
        },
      });
    }

    // If conversation is already in HUMAN_REQUIRED with inventory_conflict, replay existing state without creating duplicate notes/events
    if (
      conversation.status === "HUMAN_REQUIRED" &&
      conversation.escalation_reason === "inventory_conflict"
    ) {
      const existingNote = await this.prisma.conversationNote.findFirst({
        where: {
          conversation_id: conversationId,
          business_id: businessId,
          author_user_id: "system",
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });

      const currentConv = await this.prisma.conversation.findFirstOrThrow({
        where: { id: conversationId, business_id: businessId },
        include: { customer: true, channel_account: true },
      });

      const briefing =
        (currentConv.handoff_context as HandoffContext | null) ??
        this.briefingGenerator.generateBriefing({
          customer: {
            id: customer.id,
            name: customer.name ?? undefined,
            phone: customer.phone ?? undefined,
            channel: customerChannel,
            lifecycle_stage: customer.lifecycle_stage as LifecycleStage,
          },
          trigger: "STOCK_OUTAGE",
          escalationReason: "inventory_conflict",
          priority: "high",
          intent: "purchase_intent",
          productsDiscussed: productsDiscussed.length > 0 ? productsDiscussed : undefined,
          actionRequired: "Resolve stock; customer may still want the original variant",
          aiRecommendation:
            "Check restock schedule or propose closest available catalogue alternatives.",
        });

      const eventPayload: HandoffTriggeredEvent = {
        conversationId,
        businessId,
        trigger: "STOCK_OUTAGE",
        escalationReason: "inventory_conflict",
        priority: "high",
        briefing,
        noteId: existingNote?.id,
        timestamp: currentConv.updated_at.toISOString(),
      };

      return {
        success: false,
        stockAvailable: false,
        handoffTriggered: true,
        trigger: "STOCK_OUTAGE",
        escalationReason: "inventory_conflict",
        priority: "high",
        order: null,
        conversation: currentConv,
        briefing,
        note: existingNote,
        event: eventPayload,
        stockError: params.errorDetails,
      };
    }

    const outageHandoff = await this.handoffService.executeHandoff({
      businessId,
      conversationId,
      trigger: "STOCK_OUTAGE",
      evaluationContext: {
        message: validated.lastMessage ?? conversation.last_message_preview ?? undefined,
        intent: "purchase_intent",
        stockAvailable: false,
        reservationFailed: true,
        customer: {
          id: customer.id,
          name: customer.name ?? undefined,
          phone: customer.phone ?? undefined,
          channel: customerChannel,
          lifecycle_stage: customer.lifecycle_stage as LifecycleStage,
        },
      },
      customBriefing: {
        pendingOrder: null,
        productsDiscussed: productsDiscussed.length > 0 ? productsDiscussed : undefined,
        actionRequired: "Resolve stock; customer may still want the original variant",
        aiRecommendation:
          "Check restock schedule or propose closest available catalogue alternatives.",
      },
    });

    await this.prisma.aiAction
      .create({
        data: {
          business_id: businessId,
          conversation_id: conversationId,
          action_type: "handoff",
          tool_name: "handlePurchaseIntent",
          input: {
            items: validated.items,
            customer: validated.customer,
            deliveryAddress: validated.deliveryAddress,
            notes: validated.notes,
          },
          output: {
            trigger: "STOCK_OUTAGE",
            escalationReason: "inventory_conflict",
            priority: "high",
            insufficientVariants: params.insufficientVariants ?? [],
          },
          success: false,
          error_message: params.errorDetails ?? "Insufficient stock",
        },
      })
      .catch((err: unknown) => logger.warn({ err }, "Failed to log AI action for stock outage"));

    return {
      success: false,
      stockAvailable: false,
      handoffTriggered: true,
      trigger: "STOCK_OUTAGE",
      escalationReason: "inventory_conflict",
      priority: "high",
      order: null,
      conversation: outageHandoff.conversation,
      briefing: outageHandoff.briefing,
      note: outageHandoff.note,
      event: outageHandoff.event,
      stockError: params.errorDetails,
    };
  }

  /**
   * Main Purchase Intent Handoff entrypoint:
   * Handles end-to-end purchase intent handoff flow:
   * - Validates customer & items with strict Zod schema
   * - Scoped strictly to verified tenant businessId
   * - 🔒 Atomic Stock Hold Guarantee: Verifies stock and reserves stock via draft order in ONE transaction
   * - If stock is insufficient -> triggers STOCK_OUTAGE handoff without drafting order
   * - If stock is available -> atomically creates draft order, sets ai_enabled = false,
   *   status = HUMAN_REQUIRED, writes briefing note, and emits notifications/events.
   */
  handlePurchaseIntent(params: HandlePurchaseIntentParams): Promise<PurchaseHandoffResult>;
  handlePurchaseIntent(
    conversationId: string,
    intentData: PurchaseIntentData,
    explicitBusinessId: string,
  ): Promise<PurchaseHandoffResult>;
  async handlePurchaseIntent(
    conversationIdOrParams: string | HandlePurchaseIntentParams,
    intentDataInput?: PurchaseIntentData,
    explicitBusinessId?: string,
  ): Promise<PurchaseHandoffResult> {
    let conversationId: string;
    let intentData: PurchaseIntentData;
    let businessId: string;

    if (typeof conversationIdOrParams === "string") {
      conversationId = conversationIdOrParams;
      if (!intentDataInput) {
        throw new BadRequestException({
          error: {
            code: "intent_data_required",
            message: "intentData is required when conversationId is passed as string",
          },
        });
      }
      intentData = intentDataInput;
      if (!explicitBusinessId) {
        throw new BadRequestException({
          error: {
            code: "business_id_required",
            message: "businessId is required and must be a valid UUID",
          },
        });
      }
      businessId = explicitBusinessId;
    } else {
      conversationId = conversationIdOrParams.conversationId;
      intentData = conversationIdOrParams.intentData;
      businessId = conversationIdOrParams.businessId;
      if (!businessId) {
        throw new BadRequestException({
          error: {
            code: "business_id_required",
            message: "businessId is required and must be a valid UUID",
          },
        });
      }
    }

    assertUuid(businessId, "businessId");
    assertUuid(conversationId, "conversationId");

    // 1. Strict validation of payload
    const validated = this.extractAndValidatePurchaseIntent(intentData);

    // 2. Fetch business currency & settings
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, currency: true },
    });
    if (!business) {
      throw new NotFoundException({
        error: {
          code: "business_not_found",
          message: `Business ${businessId} not found`,
        },
      });
    }

    if (validated.currency && validated.currency !== business.currency) {
      throw new BadRequestException({
        error: {
          code: "currency_mismatch",
          message: `Requested currency '${validated.currency}' does not match business configured currency '${business.currency}'`,
        },
      });
    }
    const resolvedCurrency = business.currency;

    // Compute deterministic idempotency key
    const deterministicKey = computeDeterministicIdempotencyKey(
      businessId,
      conversationId,
      validated.items,
    );
    const resolvedIdempotencyKey = validated.idempotencyKey ?? deterministicKey;

    // 3. 🔒 ATOMIC TRANSACTION WITH PESSIMISTIC LOCK:
    // Lock conversation first, check for idempotent replay under lock, then verify stock & create draft order.
    let txResult:
      | { type: "replay"; result: PurchaseHandoffSuccessResult }
      | {
          type: "created";
          order: OrderResponse;
          conversation: Conversation;
          briefing: HandoffContext;
          note: ConversationNote;
        };

    try {
      txResult = await this.prisma.$transaction(async (tx) => {
        // A. Pessimistic row locking on conversation
        await tx.$queryRaw`
          SELECT id FROM conversations
          WHERE id = ${conversationId}::uuid AND business_id = ${businessId}::uuid
          FOR UPDATE
        `;

        // B. Re-fetch current conversation with lock held
        const currentConv = await tx.conversation.findFirst({
          where: {
            id: conversationId,
            business_id: businessId,
          },
          include: {
            customer: true,
            channel_account: true,
          },
        });

        if (!currentConv) {
          throw new NotFoundException({
            error: {
              code: "conversation_not_found",
              message: `Conversation ${conversationId} not found for business ${businessId}`,
            },
          });
        }

        if (validated.customer?.id && validated.customer.id !== currentConv.customer_id) {
          throw new BadRequestException({
            error: {
              code: "customer_mismatch",
              message: `Explicit customerId ${validated.customer.id} does not match conversation customer ${currentConv.customer_id}`,
            },
          });
        }

        // C. 🛡️ Idempotent Replay Check under conversation lock:
        // If conversation is already HUMAN_REQUIRED, check for an existing pending confirmation order
        if (currentConv.status === "HUMAN_REQUIRED") {
          const existingPendingOrders = await tx.order.findMany({
            where: {
              business_id: businessId,
              conversation_id: conversationId,
              status: "PENDING_CONFIRMATION",
            },
            include: {
              items: true,
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
          });

          if (existingPendingOrders.length > 1) {
            throw new ConflictException({
              error: {
                code: "ambiguous_pending_order",
                message: `Multiple active pending orders (${existingPendingOrders.length}) found for conversation ${conversationId}. Operational reconciliation required.`,
              },
            });
          }

          const existingPendingOrder = existingPendingOrders[0] ?? null;

          if (existingPendingOrder) {
            const itemsMatch = doOrderItemsMatchIntent(existingPendingOrder.items, validated.items);
            const customerMatch = existingPendingOrder.customer_id === currentConv.customer_id;
            const currencyMatch = existingPendingOrder.currency === resolvedCurrency;
            const keyMatch = validated.idempotencyKey
              ? existingPendingOrder.idempotency_key === validated.idempotencyKey
              : existingPendingOrder.idempotency_key === resolvedIdempotencyKey;

            let feeMatch = true;
            if (validated.deliveryFee !== undefined) {
              const reqFee = new Prisma.Decimal(validated.deliveryFee.toFixed(3));
              feeMatch = existingPendingOrder.delivery_fee.equals(reqFee);
            }

            // When deliveryAddress is omitted in the retry intent, it matches the stored order address;
            // when explicitly supplied, it must strictly match.
            let addressMatch = true;
            if (validated.deliveryAddress) {
              addressMatch = areAddressesEqual(
                existingPendingOrder.delivery_address as Address | null,
                validated.deliveryAddress,
              );
            }

            if (
              !itemsMatch ||
              !customerMatch ||
              !currencyMatch ||
              !keyMatch ||
              !feeMatch ||
              !addressMatch
            ) {
              throw new BadRequestException({
                error: {
                  code: "order_intent_conflict",
                  message: `An active pending confirmation order (${existingPendingOrder.id}) exists for conversation ${conversationId} but has different parameters.`,
                },
              });
            }

            logger.info(
              { conversationId, businessId, orderId: existingPendingOrder.id },
              "Conversation already in HUMAN_REQUIRED with matching pending order; replaying idempotent success result inside lock",
            );

            const existingNote = await tx.conversationNote.findFirst({
              where: {
                conversation_id: conversationId,
                business_id: businessId,
                author_user_id: "system",
              },
              orderBy: [{ created_at: "desc" }, { id: "desc" }],
            });

            const orderDto = await this.ordersService.getOrder(
              businessId,
              existingPendingOrder.id,
              tx,
            );
            const customerChannel = (currentConv.channel_account?.channel ??
              currentConv.source) as Channel;

            const briefing =
              (currentConv.handoff_context as HandoffContext | null) ??
              this.briefingGenerator.generateBriefing({
                customer: {
                  id: currentConv.customer.id,
                  name: currentConv.customer.name,
                  phone: currentConv.customer.phone,
                  channel: customerChannel,
                  lifecycle_stage: currentConv.customer.lifecycle_stage,
                },
                trigger: "MANUAL_OVERRIDE",
                escalationReason: "purchase_handoff",
                priority: "high",
                intent: "purchase_intent",
                actionRequired:
                  validated.actionRequired ??
                  "Confirm payment and delivery; mark order CONFIRMED or CANCELLED",
                aiRecommendation:
                  validated.aiRecommendation ??
                  `Confirm COD; delivery ${orderDto.deliveryFee} ${orderDto.currency} per business rules.`,
              });

            const eventPayload: HandoffTriggeredEvent = {
              conversationId,
              businessId,
              trigger: "MANUAL_OVERRIDE",
              escalationReason: "purchase_handoff",
              priority: "high",
              briefing,
              noteId: existingNote?.id,
              timestamp: currentConv.updated_at.toISOString(),
            };

            return {
              type: "replay",
              result: {
                success: true,
                stockAvailable: true,
                handoffTriggered: true,
                escalationReason: "purchase_handoff",
                priority: "high",
                order: orderDto,
                conversation: currentConv,
                briefing,
                note: existingNote,
                event: eventPayload,
              },
            };
          }
        }

        // D. Check conversation eligibility (prevent ordering on non-actionable conversations)
        if (
          currentConv.status === "RESOLVED" ||
          currentConv.status === "ORDER_CONFIRMED" ||
          currentConv.status === "HUMAN_REQUIRED" ||
          currentConv.status === "HUMAN_HANDLING"
        ) {
          throw new BadRequestException({
            error: {
              code: "conversation_terminal",
              message: `Conversation ${conversationId} is already in non-actionable status ${currentConv.status}`,
            },
          });
        }

        // E. Check stock availability inside transaction
        const stockCheck = await this.checkStockAvailability(businessId, validated.items, tx);

        if (!stockCheck.available) {
          throw new BadRequestException({
            error: {
              code: "insufficient_stock",
              message: stockCheck.errorDetails ?? "Insufficient stock for requested variants",
              insufficientVariants: stockCheck.insufficientVariants,
              variants: stockCheck.variants,
            },
          });
        }

        const variantMap = new Map<
          string,
          { product_id: string; name: string; sku?: string | null; price: number }
        >();
        for (const v of stockCheck.variants) {
          variantMap.set(v.id, {
            product_id: v.product_id,
            name: v.name,
            sku: v.sku,
            price: v.price,
          });
        }

        const customer = currentConv.customer;

        // F. Prepare customer updates and merged snapshot
        const customerUpdateData: Prisma.CustomerUpdateInput = {};
        const mergedName = validated.customer?.name?.trim() || customer.name || null;
        const mergedPhone = validated.customer?.phone?.trim() || customer.phone || null;
        const mergedAddress = (validated.deliveryAddress ?? customer.address) as Address | null;
        let mergedLifecycle = customer.lifecycle_stage;

        if (validated.customer?.name) {
          const trimmedName = validated.customer.name.trim();
          if (trimmedName && trimmedName !== customer.name) {
            customerUpdateData.name = trimmedName;
          }
        }
        if (validated.customer?.phone) {
          const trimmedPhone = validated.customer.phone.trim();
          if (trimmedPhone && trimmedPhone !== customer.phone) {
            customerUpdateData.phone = trimmedPhone;
          }
        }
        if (validated.deliveryAddress && !customer.address) {
          customerUpdateData.address = validated.deliveryAddress;
        }
        if (
          customer.lifecycle_stage === "unknown_visitor" ||
          customer.lifecycle_stage === "interested"
        ) {
          customerUpdateData.lifecycle_stage = "qualified_lead";
          mergedLifecycle = "qualified_lead";
        }

        if (Object.keys(customerUpdateData).length > 0) {
          await tx.customer.update({
            where: {
              id_business_id: {
                id: customer.id,
                business_id: businessId,
              },
            },
            data: customerUpdateData,
          });
        }

        // G. Create draft order and stock reservation inside transaction (tx)
        const order = await this.ordersService.createOrder(
          businessId,
          null,
          {
            customerId: customer.id,
            conversationId: currentConv.id,
            items: validated.items,
            customerSnapshot: {
              name: mergedName,
              phone: mergedPhone,
              address: mergedAddress,
            },
            deliveryAddress: mergedAddress,
            deliveryFee: validated.deliveryFee,
            currency: resolvedCurrency,
            idempotencyKey: resolvedIdempotencyKey,
            isTest: currentConv.is_test,
          },
          "ai",
          resolvedIdempotencyKey,
          tx,
        );

        // H. Generate Briefing snapshot with updated customer data & order info
        const productsDiscussed = order.items.map((item) => {
          const vMeta = variantMap.get(item.variantId);
          const parsedPrice = Number(item.unitPrice);
          return {
            product_id: vMeta?.product_id ?? item.variantId,
            variant_id: item.variantId,
            name: item.nameSnapshot,
            sku: item.skuSnapshot,
            price: Number.isFinite(parsedPrice) ? parsedPrice : (vMeta?.price ?? 0),
            currency: order.currency,
          };
        });

        const totalItemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
        const parsedTotal = Number(order.total);
        const pendingOrderSummary = {
          id: order.id,
          amount: Number.isFinite(parsedTotal) ? parsedTotal : 0,
          currency: order.currency,
          item_count: totalItemCount,
        };

        const actionRequired =
          validated.actionRequired ??
          "Confirm payment and delivery; mark order CONFIRMED or CANCELLED";
        const aiRecommendation =
          validated.aiRecommendation ??
          `Confirm COD; delivery ${order.deliveryFee} ${order.currency} per business rules.`;
        const channel = (currentConv.channel_account?.channel ?? currentConv.source) as Channel;
        const customerDisplayName = mergedName || "Customer";
        const notesSuffix = validated.notes ? ` (Notes: ${validated.notes})` : "";
        const defaultSummary = `${customerDisplayName} wants ${productsDiscussed.map((p) => p.name).join(", ")}. Address ${validated.deliveryAddress?.city || "provided"}. Waiting on confirmation (Order #${order.id.slice(0, 8)})${notesSuffix}.`;

        const briefing = this.briefingGenerator.generateBriefing({
          customer: {
            id: customer.id,
            name: mergedName,
            phone: mergedPhone,
            channel,
            lifecycle_stage: mergedLifecycle,
          },
          trigger: "MANUAL_OVERRIDE",
          escalationReason: "purchase_handoff",
          priority: "high",

          intent: "purchase_intent",
          confidence: validated.confidence,
          confidenceSource: validated.confidenceSource,
          lastMessage: validated.lastMessage ?? currentConv.last_message_preview ?? undefined,
          productsDiscussed,
          collectedFields: validated.collectedFields,
          missingFields: validated.missingFields,
          pendingOrder: pendingOrderSummary,
          aiRecommendation,
          actionRequired,
          decisionTraceId: validated.decisionTraceId ?? null,
          customSummary: validated.customSummary ?? defaultSummary,
        });

        const briefingNoteText = this.briefingGenerator.formatBriefingNote(briefing);
        const now = new Date();
        const previousStatus = currentConv.status;

        // I. Update Conversation to HUMAN_REQUIRED and ai_enabled: false
        const updatedConversation = await tx.conversation.update({
          where: {
            id_business_id: {
              id: conversationId,
              business_id: businessId,
            },
          },
          data: {
            ai_enabled: false,
            status: "HUMAN_REQUIRED",
            escalation_reason: "purchase_handoff",
            handoff_priority: "high",
            handoff_context: briefing,
            handoff_at: now,
            summary: briefing.summary,
          },
        });

        // J. Create ConversationStatusEvent
        await tx.conversationStatusEvent.create({
          data: {
            business_id: businessId,
            conversation_id: conversationId,
            from_status: previousStatus,
            to_status: "HUMAN_REQUIRED",
            escalation_reason: "purchase_handoff",
            actor_type: "ai",
            is_test: currentConv.is_test,
          },
        });

        // K. Create ConversationNote
        const note = await tx.conversationNote.create({
          data: {
            business_id: businessId,
            conversation_id: conversationId,
            author_user_id: "system",
            body: briefingNoteText,
          },
        });

        // L. Log AiAction
        await tx.aiAction.create({
          data: {
            business_id: businessId,
            conversation_id: conversationId,
            action_type: "handoff",
            tool_name: "handlePurchaseIntent",
            input: {
              items: validated.items,
              customer: validated.customer,
              deliveryAddress: validated.deliveryAddress,
              notes: validated.notes,
            },
            output: {
              orderId: order.id,
              escalationReason: "purchase_handoff",
              priority: "high",
            },
            success: true,
          },
        });

        // M. Persist AiDecisionTrace if inbound message exists
        // Note: AiDecisionTrace is non-blocking secondary telemetry; failure to record trace does not roll back order placement.
        if (validated.decisionTraceId) {
          assertUuid(validated.decisionTraceId, "decisionTraceId");
        }

        try {
          let inboundMsg = null;
          if (validated.inboundMessageId) {
            inboundMsg = await tx.message.findFirst({
              where: {
                id: validated.inboundMessageId,
                conversation_id: conversationId,
                business_id: businessId,
                direction: "inbound",
              },
            });
          }

          inboundMsg ??= await tx.message.findFirst({
            where: {
              conversation_id: conversationId,
              business_id: businessId,
              direction: "inbound",
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
          });

          if (inboundMsg) {
            const traceData: Prisma.AiDecisionTraceUncheckedCreateInput = {
              business_id: businessId,
              conversation_id: conversationId,
              inbound_message_id: inboundMsg.id,
              decision_trace: {
                schema_version: 1,
                intent: "purchase_intent",
                confidence: validated.confidence,
                confidence_source: validated.confidenceSource,
                decision: "handoff",
                escalation_reason: "purchase_handoff",
                handoff_priority: "high",
                rules_checked: ["purchase_intent_complete"],
                policy_outcomes: {},
                tools_called: ["handlePurchaseIntent"],
              },
            };
            if (validated.decisionTraceId) {
              traceData.id = validated.decisionTraceId;
            }
            await tx.aiDecisionTrace.create({ data: traceData });
          }
        } catch (traceErr) {
          logger.warn(
            { traceErr, conversationId },
            "Failed to persist aiDecisionTrace in purchase handoff",
          );
        }

        return {
          type: "created",
          order,
          conversation: updatedConversation,
          briefing,
          note,
        };
      });
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        const resp: unknown = err.getResponse();
        const respObj =
          typeof resp === "object" && resp !== null ? (resp as Record<string, unknown>) : {};
        const errObj =
          typeof respObj.error === "object" && respObj.error !== null
            ? (respObj.error as Record<string, unknown>)
            : respObj;
        const code = errObj.code;

        if (code === "insufficient_stock" || code === "reservation_expired") {
          logger.warn(
            { err, conversationId, businessId },
            "Stock reservation failed. Falling back to STOCK_OUTAGE handoff.",
          );
          const errorMsg =
            typeof errObj.message === "string"
              ? errObj.message
              : "Insufficient stock for requested variants";

          const conv = await this.prisma.conversation.findFirst({
            where: { id: conversationId, business_id: businessId },
            include: { customer: true, channel_account: true },
          });

          if (conv) {
            return this.executeStockOutageFallback({
              businessId,
              conversationId,
              conversation: conv,
              customer: conv.customer,
              validated,
              errorDetails: errorMsg,
            });
          }
        }
      }
      throw err;
    }

    if (txResult.type === "replay") {
      return txResult.result;
    }

    const { order, conversation: finalConv, briefing, note } = txResult;
    const now = new Date();

    // 6. Non-blocking In-App Notification creation with order-specific dedupe key
    try {
      const dedupeKey = `order_request_${order.id}`;

      const membersToNotify = await this.prisma.businessMember.findMany({
        where: {
          business_id: businessId,
          removed_at: null,
          OR: [
            {
              role: {
                name: { in: ["Owner", "Admin", "owner", "admin"] },
              },
            },
            ...(finalConv.assigned_user_id
              ? [{ user_id: { equals: finalConv.assigned_user_id } }]
              : []),
          ],
        },
        select: { user_id: true },
      });

      const uniqueUserIds = Array.from(new Set(membersToNotify.map((m) => m.user_id)));
      const productSummary = order.items.map((i) => i.nameSnapshot).join(", ");
      const customerDisplayName = briefing.customer.name || "Customer";
      const notificationTitle = "New Order Request";
      const notificationMsg = `Customer: ${customerDisplayName}\nProduct: ${productSummary}\nAmount: ${order.total} ${order.currency}\nStatus: Waiting for confirmation`;

      await Promise.allSettled(
        uniqueUserIds.map((userId) =>
          this.prisma.notification
            .upsert({
              where: {
                user_id_dedupe_key: {
                  user_id: userId,
                  dedupe_key: dedupeKey,
                },
              },
              create: {
                business_id: businessId,
                user_id: userId,
                type: "ORDER_REQUEST",
                handoff_priority: "high",
                title: notificationTitle,
                message: notificationMsg,
                entity_type: "conversation",
                entity_id: conversationId,
                dedupe_key: dedupeKey,
              },
              update: {},
            })
            .catch((notifErr: unknown) => {
              if (
                notifErr instanceof Prisma.PrismaClientKnownRequestError &&
                notifErr.code === "P2002"
              ) {
                logger.debug({ userId, dedupeKey }, "Notification deduplicated");
              } else {
                logger.warn({ notifErr, userId }, "Failed to upsert ORDER_REQUEST notification");
              }
            }),
        ),
      );
    } catch (notifErr) {
      logger.warn(
        { notifErr, conversationId },
        "Failed to query members for ORDER_REQUEST notification",
      );
    }

    const eventPayload: HandoffTriggeredEvent = {
      conversationId,
      businessId,
      trigger: "MANUAL_OVERRIDE",
      escalationReason: "purchase_handoff",
      priority: "high",
      briefing,
      noteId: note.id,
      timestamp: now.toISOString(),
    };

    // 7. Emit Realtime Events safely
    if (this.realtimeGateway) {
      try {
        this.realtimeGateway.emitToTenant(
          businessId,
          "conversation.handoff_triggered",
          eventPayload,
        );
      } catch (err) {
        logger.warn(
          { err, conversationId },
          "Failed to emit realtime conversation.handoff_triggered to tenant",
        );
      }

      try {
        this.realtimeGateway.emitToConversation(
          conversationId,
          "conversation.handoff_triggered",
          eventPayload,
        );
      } catch (err) {
        logger.warn(
          { err, conversationId },
          "Failed to emit realtime conversation.handoff_triggered to conversation",
        );
      }

      try {
        this.realtimeGateway.emitToTenant(businessId, "order.created", order);
      } catch (err) {
        logger.warn({ err, conversationId }, "Failed to emit realtime order.created");
      }
    }

    return {
      success: true,
      stockAvailable: true,
      handoffTriggered: true,
      escalationReason: "purchase_handoff",
      priority: "high",
      order,
      conversation: finalConv,
      briefing,
      note,
      event: eventPayload,
    };
  }
}
