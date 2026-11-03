import { z } from "zod";

import { LifecycleStageSchema, ChannelSchema } from "../enums";
import { AddressSchema } from "../jsonb";

export const CustomerIdentityResponseSchema = z
  .object({
    id: z.uuid(),
    businessId: z.uuid(),
    customerId: z.uuid(),
    platform: ChannelSchema,
    platformUserId: z.string(),
    phoneNumber: z.string().nullable(),
    verifiedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export type CustomerIdentityResponse = z.infer<typeof CustomerIdentityResponseSchema>;

export const CustomerProfileOrderSummarySchema = z
  .object({
    id: z.uuid(),
    status: z.string(),
    paymentStatus: z.string(),
    currency: z.string(),
    subtotal: z.string(),
    deliveryFee: z.string(),
    total: z.string(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export type CustomerProfileOrderSummary = z.infer<typeof CustomerProfileOrderSummarySchema>;

export const CustomerProfileNoteSchema = z
  .object({
    id: z.uuid(),
    body: z.string().max(10_000),
    authorUserId: z.uuid(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type CustomerProfileNote = z.infer<typeof CustomerProfileNoteSchema>;

export const CustomerProfileResponseSchema = z
  .object({
    id: z.uuid(),
    businessId: z.uuid(),

    name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: AddressSchema.nullable(),
    language: z.string().nullable(),
    preferences: z.record(z.string(), z.unknown()).nullable(),
    lifecycleStage: LifecycleStageSchema,
    confirmedOrderCount: z.number().int().min(0),
    lastConfirmedOrderAt: z.iso.datetime().nullable(),
    isTest: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    tags: z.array(z.string()),
    notes: z.array(CustomerProfileNoteSchema),
    identities: z.array(CustomerIdentityResponseSchema),
    orders: z.array(CustomerProfileOrderSummarySchema),
  })
  .strict();

export type CustomerProfileResponse = z.infer<typeof CustomerProfileResponseSchema>;

export const MergedFieldSchema = z.enum([
  "name",
  "phone",
  "email",
  "address",
  "language",
  "lifecycle_stage",
  "tags",
  "notes",
]);
export type MergedField = z.infer<typeof MergedFieldSchema>;

export const MergeCustomersSchema = z
  .object({
    sourceCustomerId: z.uuid(),
  })
  .strict();

export type MergeCustomersDto = z.infer<typeof MergeCustomersSchema>;

export const MergeCustomersResponseSchema = z
  .object({
    survivorId: z.uuid(),
    duplicateId: z.uuid(),
    ordersMoved: z.number().int().min(0),
    conversationsMoved: z.number().int().min(0),
    identitiesMoved: z.number().int().min(0),
    fieldsMerged: z.array(MergedFieldSchema),
  })
  .strict();

export type MergeCustomersResponse = z.infer<typeof MergeCustomersResponseSchema>;

export const CustomerLifecycleClassificationSchema = z.enum([
  "PROSPECT",
  "FIRST_TIME_BUYER",
  "RETURNING_CUSTOMER",
  "CHURN_RISK",
]);
export type CustomerLifecycleClassification = z.infer<typeof CustomerLifecycleClassificationSchema>;
