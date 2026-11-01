import { randomUUID } from "node:crypto";

import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import {
  CreateProductImageSchema,
  type CreateProductImageDto,
  type ProductImageResponse,
  UpdateProductImageSchema,
  type UpdateProductImageDto,
} from "@app/shared";

import { prisma } from "../../lib/prisma";
import { deleteFile, getPublicUrl, getUploadUrl as s3GetUploadUrl } from "../../lib/storage";
import { toValidationException } from "../../platform/core/errors";

interface RawProductImageEntity {
  id: string;
  business_id: string;
  product_id: string;
  variant_id: string | null;
  s3_key: string;
  url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: Date;
}

@Injectable()
export class ImagesService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  formatImage(image: RawProductImageEntity): ProductImageResponse {
    return {
      id: image.id,
      businessId: image.business_id,
      productId: image.product_id,
      variantId: image.variant_id,
      s3Key: image.s3_key,
      url: image.url,
      altText: image.alt_text,
      sortOrder: image.sort_order,
      isPrimary: image.is_primary,
      createdAt: image.created_at,
    };
  }

  /**
   * Helper: unsets primary flag on other images in the same product/variant scope
   */
  private async unsetScopePrimary(
    businessId: string,
    productId: string,
    variantId: string | null,
    excludeImageId?: string,
  ): Promise<void> {
    await this.prisma.productImage.updateMany({
      where: {
        business_id: businessId,
        product_id: productId,
        variant_id: variantId,
        is_primary: true,
        ...(excludeImageId ? { NOT: { id: excludeImageId } } : {}),
      },
      data: { is_primary: false },
    });
  }

  /**
   * Generates a signed S3 upload URL for product media
   */
  async getUploadUrl(
    businessId: string,
    productId: string,
    options?: {
      filename?: string;
      contentType?: string;
      variantId?: string;
    },
  ): Promise<{ uploadUrl: string; s3Key: string; url: string }> {
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

    if (options?.variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: {
          id: options.variantId,
          product_id: productId,
          business_id: businessId,
        },
      });
      if (!variant) {
        throw new NotFoundException({
          error: {
            code: "variant_not_found",
            message: "Variant not found for this product",
          },
        });
      }
    }

    const cleanFilename = (options?.filename ?? "image.jpg")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .toLowerCase();
    const s3Key = `businesses/${businessId}/products/${productId}/images/${randomUUID()}-${cleanFilename}`;
    const uploadUrl = await s3GetUploadUrl(s3Key, {
      contentType: options?.contentType ?? "image/jpeg",
      expiresIn: 3600,
    });
    const publicUrl = getPublicUrl(s3Key);

    return {
      uploadUrl,
      s3Key,
      url: publicUrl,
    };
  }

  /**
   * 13 §12.1 POST /api/v1/products/:id/images
   * Attach image metadata record to product / variant
   */
  async createImage(
    businessId: string,
    productId: string,
    body: CreateProductImageDto,
  ): Promise<ProductImageResponse> {
    const parseResult = CreateProductImageSchema.safeParse(body);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const data = parseResult.data;
    const variantId = data.variantId ?? data.variant_id ?? null;

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

    if (variantId) {
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
            code: "variant_not_found",
            message: "Variant not found for this product",
          },
        });
      }
    }

    const s3Key =
      data.s3Key ??
      data.s3_key ??
      `businesses/${businessId}/products/${productId}/images/${randomUUID()}.jpg`;
    const url = data.url ?? getPublicUrl(s3Key);
    const isPrimary = Boolean(data.isPrimary ?? data.is_primary);
    const sortOrder = data.sortOrder ?? data.sort_order ?? 0;
    const altText = data.altText ?? data.alt_text ?? null;

    if (isPrimary) {
      await this.unsetScopePrimary(businessId, productId, variantId);
    }

    const image = await this.prisma.productImage.create({
      data: {
        business_id: businessId,
        product_id: productId,
        variant_id: variantId,
        s3_key: s3Key,
        url,
        alt_text: altText,
        sort_order: sortOrder,
        is_primary: isPrimary,
      },
    });

    return this.formatImage(image);
  }

  /**
   * 13 §12.1 GET /api/v1/products/:id/images
   */
  async listImages(
    businessId: string,
    productId: string,
    variantId?: string,
  ): Promise<ProductImageResponse[]> {
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

    const images = await this.prisma.productImage.findMany({
      where: {
        business_id: businessId,
        product_id: productId,
        ...(variantId !== undefined ? { variant_id: variantId } : {}),
      },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    });

    return images.map((img) => this.formatImage(img));
  }

  /**
   * 13 §12.1 PATCH /api/v1/products/:id/images/:imageId
   */
  async updateImage(
    businessId: string,
    productId: string,
    imageId: string,
    body: UpdateProductImageDto,
  ): Promise<ProductImageResponse> {
    const parseResult = UpdateProductImageSchema.safeParse(body);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const existing = await this.prisma.productImage.findFirst({
      where: {
        id: imageId,
        product_id: productId,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Image not found",
        },
      });
    }

    const data = parseResult.data;
    const isPrimary = data.isPrimary ?? data.is_primary;
    const variantId = data.variantId ?? data.variant_id ?? existing.variant_id;
    const altText = data.altText ?? data.alt_text ?? existing.alt_text;
    const sortOrder = data.sortOrder ?? data.sort_order ?? existing.sort_order;

    if (isPrimary) {
      await this.unsetScopePrimary(businessId, productId, variantId, imageId);
    }

    await this.prisma.productImage.updateMany({
      where: {
        id: imageId,
        product_id: productId,
        business_id: businessId,
      },
      data: {
        ...(data.variantId !== undefined || data.variant_id !== undefined
          ? { variant_id: variantId }
          : {}),
        ...(data.altText !== undefined || data.alt_text !== undefined ? { alt_text: altText } : {}),
        ...(data.sortOrder !== undefined || data.sort_order !== undefined
          ? { sort_order: sortOrder }
          : {}),
        ...(isPrimary !== undefined ? { is_primary: isPrimary } : {}),
      },
    });

    return this.formatImage({
      ...existing,
      variant_id: variantId,
      alt_text: altText,
      sort_order: sortOrder,
      is_primary: isPrimary ?? existing.is_primary,
    });
  }

  /**
   * 13 §12.1 DELETE /api/v1/products/:id/images/:imageId
   */
  async deleteImage(businessId: string, productId: string, imageId: string): Promise<void> {
    const existing = await this.prisma.productImage.findFirst({
      where: {
        id: imageId,
        product_id: productId,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Image not found",
        },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.deleteMany({
        where: {
          id: imageId,
          product_id: productId,
          business_id: businessId,
        },
      });

      if (existing.is_primary) {
        const nextImage = await tx.productImage.findFirst({
          where: {
            product_id: productId,
            business_id: businessId,
            variant_id: existing.variant_id,
          },
          orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
        });

        if (nextImage) {
          await tx.productImage.update({
            where: { id: nextImage.id },
            data: { is_primary: true },
          });
        }
      }
    });

    try {
      await deleteFile(existing.s3_key);
    } catch {
      // Non-blocking cleanup failure
    }
  }
}
