import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";

import {
  CreateVariantSchema,
  type CreateVariantDto,
  UpdateVariantSchema,
  type UpdateVariantDto,
  type VariantResponse,
} from "@app/shared";

import { prisma } from "../../lib/prisma";
import { toValidationException } from "../../platform/core/errors";

interface RawVariantEntity {
  id: string;
  business_id: string;
  product_id: string;
  sku: string | null;
  barcode: string | null;
  attributes: Prisma.JsonValue;
  price: Prisma.Decimal | number;
  discount_price: Prisma.Decimal | number | null;
  stock: number;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class VariantsService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * Helper: calculate available stock for a batch of variants in real-time
   * Formula: availableStock = physicalStock - SUM(active reservations where expires_at > now())
   */
  async calculateAvailableStockBatch(
    businessId: string,
    variants: { id: string; stock: number }[],
  ): Promise<Map<string, number>> {
    const stockMap = new Map<string, number>();
    if (variants.length === 0) return stockMap;

    const variantIds = variants.map((v) => v.id);
    const now = new Date();

    const activeReservations = await this.prisma.stockReservation.findMany({
      where: {
        business_id: businessId,
        variant_id: { in: variantIds },
        status: "active",
        expires_at: { gt: now },
      },
      select: {
        variant_id: true,
        quantity: true,
      },
    });

    const reservedSum = new Map<string, number>();
    for (const res of activeReservations) {
      const current = reservedSum.get(res.variant_id) ?? 0;
      reservedSum.set(res.variant_id, current + res.quantity);
    }

    for (const v of variants) {
      const reserved = reservedSum.get(v.id) ?? 0;
      const available = Math.max(0, v.stock - reserved);
      stockMap.set(v.id, available);
    }

    return stockMap;
  }

  /**
   * Helper: format DB entity to VariantResponse
   */
  formatVariant(variant: RawVariantEntity, availableStock: number): VariantResponse {
    const priceNum =
      typeof variant.price === "number" ? variant.price : Number(variant.price.toString());

    const discountPriceNum =
      variant.discount_price !== null
        ? typeof variant.discount_price === "number"
          ? variant.discount_price
          : Number(variant.discount_price.toString())
        : null;

    const attributes =
      typeof variant.attributes === "object" && variant.attributes !== null
        ? (variant.attributes as Record<string, string>)
        : {};

    return {
      id: variant.id,
      businessId: variant.business_id,
      productId: variant.product_id,
      sku: variant.sku,
      barcode: variant.barcode,
      attributes,
      price: priceNum,
      discountPrice: discountPriceNum,
      stock: variant.stock,
      availableStock,
      isDefault: variant.is_default,
      createdAt: variant.created_at,
      updatedAt: variant.updated_at,
    };
  }

  /**
   * 13 §12.1 POST /api/v1/products/:id/variants
   */
  async createVariant(
    businessId: string,
    productId: string,
    body: CreateVariantDto,
  ): Promise<VariantResponse> {
    const parseResult = CreateVariantSchema.safeParse(body);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const data = parseResult.data;

    const product = await this.prisma.product.findFirst({
      where: { id: productId, business_id: businessId },
    });

    if (!product) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Product not found",
        },
      });
    }

    const sku = data.sku ? data.sku.trim() : null;
    if (sku) {
      const existingSku = await this.prisma.productVariant.findFirst({
        where: {
          business_id: businessId,
          sku,
        },
      });

      if (existingSku) {
        throw new ConflictException({
          error: {
            code: "sku_conflict",
            message: `Variant with SKU '${sku}' already exists in this business`,
          },
        });
      }
    }

    const existingVariantsCount = await this.prisma.productVariant.count({
      where: {
        product_id: productId,
        business_id: businessId,
      },
    });

    let isDefault = Boolean(data.isDefault ?? data.is_default);
    if (existingVariantsCount === 0) {
      isDefault = true;
    }

    const attributes = data.attributes ?? data.options ?? {};
    const price = data.price;
    const discountPrice = data.discountPrice ?? data.discount_price ?? null;
    const stock = data.stock ?? 0;
    const barcode = data.barcode ? data.barcode.trim() : null;

    if (discountPrice !== null && discountPrice >= price) {
      throw new BadRequestException({
        error: {
          code: "invalid_discount_price",
          message: "Discount price must be strictly less than price",
        },
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.productVariant.updateMany({
          where: {
            product_id: productId,
            business_id: businessId,
            is_default: true,
          },
          data: { is_default: false },
        });
      }

      return tx.productVariant.create({
        data: {
          business_id: businessId,
          product_id: productId,
          sku,
          barcode,
          attributes,
          price: new Prisma.Decimal(price),
          discount_price: discountPrice !== null ? new Prisma.Decimal(discountPrice) : null,
          stock,
          is_default: isDefault,
        },
      });
    });

    const stockMap = await this.calculateAvailableStockBatch(businessId, [
      { id: created.id, stock: created.stock },
    ]);

    return this.formatVariant(created, stockMap.get(created.id) ?? created.stock);
  }

  /**
   * 13 §12.1 GET /api/v1/products/:id/variants
   */
  async listVariants(businessId: string, productId: string): Promise<VariantResponse[]> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, business_id: businessId },
    });

    if (!product) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Product not found",
        },
      });
    }

    const variants = await this.prisma.productVariant.findMany({
      where: {
        product_id: productId,
        business_id: businessId,
      },
      orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
    });

    const stockMap = await this.calculateAvailableStockBatch(
      businessId,
      variants.map((v) => ({ id: v.id, stock: v.stock })),
    );

    return variants.map((v) => this.formatVariant(v, stockMap.get(v.id) ?? v.stock));
  }

  /**
   * 13 §12.1 GET /api/v1/products/:id/variants/:variantId
   */
  async getVariant(
    businessId: string,
    productId: string,
    variantId: string,
  ): Promise<VariantResponse> {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        product_id: productId,
        business_id: businessId,
      },
    });

    if (!variant) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Variant not found",
        },
      });
    }

    const stockMap = await this.calculateAvailableStockBatch(businessId, [
      { id: variant.id, stock: variant.stock },
    ]);

    return this.formatVariant(variant, stockMap.get(variant.id) ?? variant.stock);
  }

  /**
   * 13 §12.1 PATCH /api/v1/products/:id/variants/:variantId
   */
  async updateVariant(
    businessId: string,
    productId: string,
    variantId: string,
    body: UpdateVariantDto,
  ): Promise<VariantResponse> {
    // Negative Invariant: availableStock is NEVER accepted on PATCH
    if ("availableStock" in body || "available_stock" in body) {
      throw new BadRequestException({
        error: {
          code: "forbidden_field",
          message: "availableStock is a computed field and cannot be updated directly",
        },
      });
    }

    const parseResult = UpdateVariantSchema.safeParse(body);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const data = parseResult.data;

    const existing = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        product_id: productId,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Variant not found",
        },
      });
    }

    const newSku = data.sku !== undefined ? (data.sku ? data.sku.trim() : null) : undefined;
    if (newSku !== undefined && newSku !== null && newSku !== existing.sku) {
      const existingSku = await this.prisma.productVariant.findFirst({
        where: {
          business_id: businessId,
          sku: newSku,
          NOT: { id: variantId },
        },
      });

      if (existingSku) {
        throw new ConflictException({
          error: {
            code: "sku_conflict",
            message: `Variant with SKU '${newSku}' already exists in this business`,
          },
        });
      }
    }

    const newPrice = data.price ?? Number(existing.price.toString());
    let newDiscountPrice: number | null = null;
    if (data.discountPrice !== undefined) {
      newDiscountPrice = data.discountPrice;
    } else if (data.discount_price !== undefined) {
      newDiscountPrice = data.discount_price;
    } else if (existing.discount_price !== null) {
      newDiscountPrice = Number(existing.discount_price.toString());
    }

    if (newDiscountPrice !== null && newDiscountPrice >= newPrice) {
      throw new BadRequestException({
        error: {
          code: "invalid_discount_price",
          message: "Discount price must be strictly less than price",
        },
      });
    }

    const isDefault = data.isDefault ?? data.is_default;
    const attributes = data.attributes ?? data.options;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.productVariant.updateMany({
          where: {
            product_id: productId,
            business_id: businessId,
            is_default: true,
            NOT: { id: variantId },
          },
          data: { is_default: false },
        });
      }

      return tx.productVariant.update({
        where: {
          id_business_id: {
            id: variantId,
            business_id: businessId,
          },
        },
        data: {
          ...(newSku !== undefined ? { sku: newSku } : {}),
          ...(data.barcode !== undefined ? { barcode: data.barcode } : {}),
          ...(attributes !== undefined ? { attributes } : {}),
          ...(data.price !== undefined ? { price: new Prisma.Decimal(data.price) } : {}),
          ...(newDiscountPrice !== null
            ? { discount_price: new Prisma.Decimal(newDiscountPrice) }
            : { discount_price: null }),
          ...(data.stock !== undefined ? { stock: data.stock } : {}),
          ...(isDefault !== undefined ? { is_default: isDefault } : {}),
        },
      });
    });

    const stockMap = await this.calculateAvailableStockBatch(businessId, [
      { id: updated.id, stock: updated.stock },
    ]);

    return this.formatVariant(updated, stockMap.get(updated.id) ?? updated.stock);
  }

  /**
   * 13 §12.1 DELETE /api/v1/products/:id/variants/:variantId
   */
  async deleteVariant(businessId: string, productId: string, variantId: string): Promise<void> {
    const existing = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        product_id: productId,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Variant not found",
        },
      });
    }

    // Check if variant has order items
    const orderItemsCount = await this.prisma.orderItem.count({
      where: {
        variant_id: variantId,
        business_id: businessId,
      },
    });

    if (orderItemsCount > 0) {
      throw new ConflictException({
        error: {
          code: "variant_in_order",
          message: "Cannot delete variant referenced in order items",
        },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.deleteMany({
        where: {
          variant_id: variantId,
          business_id: businessId,
        },
      });

      await tx.stockReservation.deleteMany({
        where: {
          variant_id: variantId,
          business_id: businessId,
        },
      });

      await tx.productVariant.delete({
        where: {
          id_business_id: {
            id: variantId,
            business_id: businessId,
          },
        },
      });

      // Preserve default invariant: if deleted variant was default, promote next variant
      if (existing.is_default) {
        const nextVariant = await tx.productVariant.findFirst({
          where: {
            product_id: productId,
            business_id: businessId,
          },
          orderBy: { created_at: "asc" },
        });

        if (nextVariant) {
          await tx.productVariant.update({
            where: {
              id_business_id: {
                id: nextVariant.id,
                business_id: businessId,
              },
            },
            data: { is_default: true },
          });
        }
      }
    });
  }
}
