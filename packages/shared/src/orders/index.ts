import { z } from "zod";

import { OrderStatusSchema, PaymentStatusSchema, ReservationStatusSchema } from "../enums";
import {
  AddressSchema,
  type Address,
  areAddressesEqual,
  CustomerSnapshotSchema,
  type CustomerSnapshot,
} from "../jsonb";

/**
 * 13 §8 Orders validation schemas and DTOs
 */

export const CreateOrderItemSchema = z
  .object({
    variantId: z.uuid({ message: "variantId must be a valid UUID" }),
    quantity: z.preprocess(
      (val) => (typeof val === "string" && /^[1-9]\d*$/.test(val) ? Number(val) : val),
      z.number().int().positive("Quantity must be greater than 0"),
    ),
  })
  .strict();
export type CreateOrderItemDto = z.infer<typeof CreateOrderItemSchema>;

export const DeliveryFeeSchema = z.preprocess((val) => {
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return undefined;
    const num = Number(trimmed);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      return Math.round(num * 1000) / 1000;
    }
    return val;
  }
  if (typeof val === "number" && Number.isFinite(val)) {
    return Math.round(val * 1000) / 1000;
  }
  return val;
}, z.number().min(0, "deliveryFee must be non-negative").max(100000, "deliveryFee exceeds maximum").optional());

const BaseOrderFields = {
  items: z.array(CreateOrderItemSchema).min(1, "Order must contain at least one item"),
  deliveryAddress: AddressSchema.optional().nullable(),
  shippingAddress: AddressSchema.optional().nullable(),
  customerSnapshot: CustomerSnapshotSchema.optional().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code")
    .optional(),
  deliveryFee: DeliveryFeeSchema,
  idempotencyKey: z.string().min(1).max(255).optional(),
  isTest: z.boolean().optional(),
};

const validateUniqueVariants = (items: { variantId: string }[]) => {
  const variantIds = items.map((i) => i.variantId);
  return new Set(variantIds).size === variantIds.length;
};

const validateAddresses = (delivery?: Address | null, shipping?: Address | null) => {
  if (delivery && shipping) {
    return areAddressesEqual(delivery, shipping);
  }
  return true;
};

export const CreateOrderSchema = z
  .object({
    customerId: z.uuid({ message: "customerId must be a valid UUID" }),
    conversationId: z
      .uuid({ message: "conversationId must be a valid UUID" })
      .optional()
      .nullable(),
    ...BaseOrderFields,
  })
  .strict()
  .refine((data) => validateUniqueVariants(data.items), {
    message: "Order items must have unique variant IDs",
    path: ["items"],
  })
  .refine((data) => validateAddresses(data.deliveryAddress, data.shippingAddress), {
    message: "Conflicting deliveryAddress and shippingAddress provided",
    path: ["shippingAddress"],
  });
export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;

export const CreateDraftOrderSchema = z
  .object({
    customerId: z.uuid({ message: "customerId must be a valid UUID" }).optional(),
    ...BaseOrderFields,
  })
  .strict()
  .refine((data) => validateUniqueVariants(data.items), {
    message: "Order items must have unique variant IDs",
    path: ["items"],
  })
  .refine((data) => validateAddresses(data.deliveryAddress, data.shippingAddress), {
    message: "Conflicting deliveryAddress and shippingAddress provided",
    path: ["shippingAddress"],
  });
export type CreateDraftOrderDto = z.infer<typeof CreateDraftOrderSchema>;

export const ConfirmConversationOrderSchema = z
  .object({
    paymentStatus: PaymentStatusSchema.optional(),
  })
  .strict();
export type ConfirmConversationOrderDto = z.infer<typeof ConfirmConversationOrderSchema>;

export const UpdateOrderStatusSchema = z
  .object({
    status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED"]),
    paymentStatus: PaymentStatusSchema.optional(),
  })
  .strict();
export type UpdateOrderStatusDto = z.infer<typeof UpdateOrderStatusSchema>;

export const OrderItemResponseSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  orderId: z.uuid(),
  variantId: z.uuid(),
  quantity: z.number().int(),
  unitPrice: z.string(),
  nameSnapshot: z.string(),
  skuSnapshot: z.string().nullable(),
  attributesSnapshot: z.unknown().nullable(),
  createdAt: z.string(),
});
export type OrderItemResponse = z.infer<typeof OrderItemResponseSchema>;

export const OrderResponseSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  customerId: z.uuid(),
  conversationId: z.uuid().nullable(),
  status: OrderStatusSchema,
  paymentStatus: PaymentStatusSchema,
  currency: z.string(),
  subtotal: z.string(),
  deliveryFee: z.string(),
  total: z.string(),
  customerSnapshot: CustomerSnapshotSchema,
  deliveryAddress: AddressSchema.nullable(),
  createdByType: z.string(),
  createdByUserId: z.string().nullable(),
  idempotencyKey: z.string(),
  isTest: z.boolean(),
  orderConfirmedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(OrderItemResponseSchema).default([]),
});
export type OrderResponse = z.infer<typeof OrderResponseSchema>;

export const ListOrdersQuerySchema = z
  .object({
    status: z
      .union([
        OrderStatusSchema,
        z.array(OrderStatusSchema),
        z.string().transform((val, ctx) => {
          const parts = val
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          if (parts.length === 0) {
            ctx.addIssue({
              code: "custom",
              message: "Empty status list provided",
            });
            return z.NEVER;
          }
          const statuses: OrderStatus[] = [];
          for (const part of parts) {
            const parsed = OrderStatusSchema.safeParse(part);
            if (!parsed.success) {
              ctx.addIssue({
                code: "custom",
                message: `Invalid order status: ${part}`,
              });
              return z.NEVER;
            }
            statuses.push(parsed.data);
          }
          return statuses.length === 1 ? statuses[0] : statuses;
        }),
      ])
      .optional(),
    from: z.string().max(64).optional(),
    to: z.string().max(64).optional(),
    created_by: z.enum(["ai", "user"]).optional(),
    createdBy: z.enum(["ai", "user"]).optional(),
    customerId: z.uuid().optional(),
    customer_id: z.uuid().optional(),
    conversationId: z.uuid().optional(),
    conversation_id: z.uuid().optional(),
    cursor: z.string().max(255).optional(),
    limit: z
      .preprocess(
        (val) =>
          typeof val === "string" && /^[1-9]\d*$/.test(val)
            ? Number(val)
            : val !== undefined
              ? Number(val)
              : 50,
        z.number().int().min(1).max(100),
      )
      .default(50)
      .optional(),
    is_test: z
      .preprocess(
        (val) =>
          val === "true" || val === true
            ? true
            : val === "false" || val === false
              ? false
              : typeof val === "boolean"
                ? val
                : undefined,
        z.boolean({ message: "is_test must be a boolean" }),
      )
      .optional(),
    isTest: z
      .preprocess(
        (val) =>
          val === "true" || val === true
            ? true
            : val === "false" || val === false
              ? false
              : typeof val === "boolean"
                ? val
                : undefined,
        z.boolean({ message: "isTest must be a boolean" }),
      )
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.from) {
        const fromDate = new Date(data.from);
        if (isNaN(fromDate.getTime())) return false;
      }
      if (data.to) {
        const toDate = new Date(data.to);
        if (isNaN(toDate.getTime())) return false;
      }
      if (data.from && data.to) {
        const fromDate = new Date(data.from);
        const toDate = new Date(data.to);
        return fromDate.getTime() <= toDate.getTime();
      }
      return true;
    },
    {
      message: "Invalid date range: 'from' and 'to' must be valid dates with 'from' <= 'to'",
      path: ["from"],
    },
  )
  .refine(
    (data) => {
      if (data.created_by && data.createdBy && data.created_by !== data.createdBy) {
        return false;
      }
      if (data.customer_id && data.customerId && data.customer_id !== data.customerId) {
        return false;
      }
      if (
        data.conversation_id &&
        data.conversationId &&
        data.conversation_id !== data.conversationId
      ) {
        return false;
      }
      if (data.is_test !== undefined && data.isTest !== undefined && data.is_test !== data.isTest) {
        return false;
      }
      return true;
    },
    {
      message: "Conflicting snake_case and camelCase parameters provided",
    },
  );
export type ListOrdersQueryDto = z.infer<typeof ListOrdersQuerySchema>;

export const PaginatedOrdersResponseSchema = z.object({
  items: z.array(OrderResponseSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().min(0),
});
export type PaginatedOrdersResponse = z.infer<typeof PaginatedOrdersResponseSchema>;

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type ReservationStatus = z.infer<typeof ReservationStatusSchema>;

export {
  OrderStatusSchema,
  PaymentStatusSchema,
  ReservationStatusSchema,
  CustomerSnapshotSchema,
  AddressSchema,
  areAddressesEqual,
};
export type { CustomerSnapshot, Address };
