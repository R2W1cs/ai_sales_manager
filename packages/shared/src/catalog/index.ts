import { z } from "zod";

import { ProductStatusSchema } from "../enums";
import { FaqListSchema } from "../jsonb";
import { CursorSchema } from "../pagination";

/**
 * 13 §12.1 Category validation schemas and DTOs
 */

export const CreateCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(100, "Name must not exceed 100 characters"),
    parentId: z.uuid().nullable().optional(),
    sortOrder: z.number().int().min(0).default(0).optional(),
  })
  .strict();

export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;

export const UpdateCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name cannot be empty")
      .max(100, "Name must not exceed 100 characters")
      .optional(),
    parentId: z.uuid().nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();

export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;

export const CategoryResponseSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  name: z.string(),
  slug: z.string(),
  parentId: z.uuid().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

export type CategoryResponse = z.infer<typeof CategoryResponseSchema>;

export type CategoryTreeNode = CategoryResponse & {
  children: CategoryTreeNode[];
};

/**
 * 13 §12.1 Variant validation schemas and DTOs
 */

export const CreateVariantSchema = z
  .object({
    sku: z.string().trim().min(1).nullable().optional(),
    barcode: z.string().trim().min(1).nullable().optional(),
    attributes: z.record(z.string(), z.string()).default({}).optional(),
    options: z.record(z.string(), z.string()).optional(),
    price: z.coerce.number().min(0, "Price must be non-negative"),
    discountPrice: z.coerce.number().min(0).nullable().optional(),
    discount_price: z.coerce.number().min(0).nullable().optional(),
    stock: z.coerce.number().int().min(0).default(0).optional(),
    isDefault: z.boolean().default(false).optional(),
    is_default: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => {
      const disc = data.discountPrice ?? data.discount_price;
      if (disc !== null && disc !== undefined) {
        return disc < data.price;
      }
      return true;
    },
    {
      message: "Discount price must be less than regular price",
      path: ["discountPrice"],
    },
  );

export type CreateVariantDto = z.infer<typeof CreateVariantSchema>;

export const UpdateVariantSchema = z
  .object({
    sku: z.string().trim().min(1).nullable().optional(),
    barcode: z.string().trim().min(1).nullable().optional(),
    attributes: z.record(z.string(), z.string()).optional(),
    options: z.record(z.string(), z.string()).optional(),
    price: z.coerce.number().min(0, "Price must be non-negative").optional(),
    discountPrice: z.coerce.number().min(0).nullable().optional(),
    discount_price: z.coerce.number().min(0).nullable().optional(),
    stock: z.coerce.number().int().min(0).optional(),
    isDefault: z.boolean().optional(),
    is_default: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => {
      const disc = data.discountPrice ?? data.discount_price;
      if (data.price !== undefined && disc !== null && disc !== undefined) {
        return disc < data.price;
      }
      return true;
    },
    {
      message: "Discount price must be less than regular price",
      path: ["discountPrice"],
    },
  );

export type UpdateVariantDto = z.infer<typeof UpdateVariantSchema>;

export const VariantResponseSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  productId: z.uuid(),
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  attributes: z.record(z.string(), z.string()),
  price: z.union([z.number(), z.string()]),
  discountPrice: z.union([z.number(), z.string()]).nullable(),
  stock: z.number().int(),
  availableStock: z.number().int(),
  isDefault: z.boolean(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

export type VariantResponse = z.infer<typeof VariantResponseSchema>;

/**
 * 13 §12.1 Image validation schemas and DTOs
 */

export const CreateProductImageSchema = z
  .object({
    variantId: z.uuid().nullable().optional(),
    variant_id: z.uuid().nullable().optional(),
    s3Key: z.string().min(1).optional(),
    s3_key: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    altText: z.string().nullable().optional(),
    alt_text: z.string().nullable().optional(),
    sortOrder: z.number().int().min(0).default(0).optional(),
    sort_order: z.number().int().min(0).optional(),
    isPrimary: z.boolean().default(false).optional(),
    is_primary: z.boolean().optional(),
  })
  .strict();

export type CreateProductImageDto = z.infer<typeof CreateProductImageSchema>;

export const UpdateProductImageSchema = z
  .object({
    variantId: z.uuid().nullable().optional(),
    variant_id: z.uuid().nullable().optional(),
    altText: z.string().nullable().optional(),
    alt_text: z.string().nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    sort_order: z.number().int().min(0).optional(),
    isPrimary: z.boolean().optional(),
    is_primary: z.boolean().optional(),
  })
  .strict();

export type UpdateProductImageDto = z.infer<typeof UpdateProductImageSchema>;

export const ProductImageResponseSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  productId: z.uuid(),
  variantId: z.uuid().nullable(),
  s3Key: z.string(),
  url: z.string(),
  altText: z.string().nullable(),
  sortOrder: z.number().int(),
  isPrimary: z.boolean(),
  createdAt: z.union([z.date(), z.string()]),
});

export type ProductImageResponse = z.infer<typeof ProductImageResponseSchema>;

/**
 * 13 §12.1 Product validation schemas and DTOs
 */

export const CreateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().nullable().optional(),
    categoryId: z.uuid().nullable().optional(),
    category_id: z.uuid().nullable().optional(),
    currency: z.string().length(3).default("TND").optional(),
    status: ProductStatusSchema.default("draft").optional(),
    benefits: z.array(z.string()).nullable().optional(),
    sellingPoints: z.array(z.string()).nullable().optional(),
    selling_points: z.array(z.string()).nullable().optional(),
    objections: z.array(z.string()).nullable().optional(),
    faqs: FaqListSchema.nullable().optional(),
    variants: z.array(CreateVariantSchema).optional(),
    images: z.array(z.union([z.string(), CreateProductImageSchema])).optional(),
  })
  .strict()
  .refine((data) => Boolean(data.name || data.title), {
    message: "Product name or title is required",
    path: ["title"],
  });

export type CreateProductDto = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().nullable().optional(),
    categoryId: z.uuid().nullable().optional(),
    category_id: z.uuid().nullable().optional(),
    currency: z.string().length(3).nullable().optional(),
    status: ProductStatusSchema.optional(),
    benefits: z.array(z.string()).nullable().optional(),
    sellingPoints: z.array(z.string()).nullable().optional(),
    selling_points: z.array(z.string()).nullable().optional(),
    objections: z.array(z.string()).nullable().optional(),
    faqs: FaqListSchema.nullable().optional(),
  })
  .strict();

export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

export const ProductResponseSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  categoryId: z.uuid().nullable(),
  name: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: ProductStatusSchema,
  currency: z.string().nullable(),
  benefits: z.array(z.string()).nullable(),
  sellingPoints: z.array(z.string()).nullable(),
  objections: z.array(z.string()).nullable(),
  faqs: FaqListSchema.nullable(),
  variants: z.array(VariantResponseSchema),
  images: z.array(ProductImageResponseSchema),
  category: CategoryResponseSchema.nullable().optional(),
  hasOrders: z.boolean().optional(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

export type ProductResponse = z.infer<typeof ProductResponseSchema>;

export const ListProductsQuerySchema = z.object({
  categoryId: z.uuid().optional(),
  category_id: z.uuid().optional(),
  status: ProductStatusSchema.optional(),
  search: z.string().trim().optional(),
  cursor: CursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
});

export type ListProductsQueryDto = z.infer<typeof ListProductsQuerySchema>;

export const PaginatedProductsResponseSchema = z.object({
  data: z.array(ProductResponseSchema),
  next_cursor: z.string().nullable(),
});

export type PaginatedProductsResponse = z.infer<typeof PaginatedProductsResponseSchema>;
