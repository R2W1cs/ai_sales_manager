import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma, type PrismaClient, ProductStatus } from "@prisma/client";

import {
  CreateProductSchema,
  type CreateProductDto,
  type ListProductsQueryDto,
  type PaginatedProductsResponse,
  type ProductResponse,
  UpdateProductSchema,
  type UpdateProductDto,
  type CategoryResponse,
  type FaqList,
} from "@app/shared";

import { prisma } from "../../lib/prisma";
import { toValidationException } from "../../platform/core/errors";
import { slugify } from "../categories/categories.service";
import { CatalogIndexerProcessor } from "../indexer/catalog-indexer.processor";
import { ImagesService } from "./images.service";
import { VariantsService } from "./variants.service";

interface DecodedCursor {
  t: string;
  id: string;
}

interface RawProductWithRelations {
  id: string;
  business_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  status: ProductStatus;
  currency: string | null;
  benefits: Prisma.JsonValue | null;
  selling_points: Prisma.JsonValue | null;
  objections: Prisma.JsonValue | null;
  faqs: Prisma.JsonValue | null;
  created_at: Date;
  updated_at: Date;
  variants: {
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
  }[];
  images: {
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
  }[];
  category?: {
    id: string;
    business_id: string;
    name: string;
    parent_id: string | null;
    sort_order: number;
    created_at: Date;
    updated_at: Date;
  } | null;
}

@Injectable()
export class ProductsService {
  private readonly prisma: PrismaClient;

  constructor(
    private readonly variantsService: VariantsService,
    private readonly imagesService: ImagesService,
    @Optional() prismaClient?: PrismaClient,
    @Optional() private readonly indexerProcessor?: CatalogIndexerProcessor,
  ) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * Helper: format DB Product entity into ProductResponse
   */
  private formatProduct(
    product: RawProductWithRelations,
    availableStockMap: Map<string, number>,
    hasOrders?: boolean,
  ): ProductResponse {
    const formattedVariants = product.variants.map((v) =>
      this.variantsService.formatVariant(v, availableStockMap.get(v.id) ?? v.stock),
    );

    const formattedImages = product.images.map((img) => this.imagesService.formatImage(img));

    let categoryResponse: CategoryResponse | null = null;
    if (product.category) {
      categoryResponse = {
        id: product.category.id,
        businessId: product.category.business_id,
        name: product.category.name,
        slug: slugify(product.category.name),
        parentId: product.category.parent_id,
        sortOrder: product.category.sort_order,
        createdAt: product.category.created_at,
        updatedAt: product.category.updated_at,
      };
    }

    return {
      id: product.id,
      businessId: product.business_id,
      categoryId: product.category_id,
      name: product.name,
      title: product.name,
      description: product.description,
      status: product.status,
      currency: product.currency,
      benefits: Array.isArray(product.benefits) ? (product.benefits as string[]) : null,
      sellingPoints: Array.isArray(product.selling_points)
        ? (product.selling_points as string[])
        : null,
      objections: Array.isArray(product.objections) ? (product.objections as string[]) : null,
      faqs: Array.isArray(product.faqs) ? (product.faqs as FaqList) : null,
      variants: formattedVariants,
      images: formattedImages,
      category: categoryResponse,
      hasOrders: hasOrders ?? false,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
    };
  }

  /**
   * 13 §12.1 POST /api/v1/products
   * Create a new product with variants and optional images in an atomic transaction.
   */
  async createProduct(businessId: string, body: CreateProductDto): Promise<ProductResponse> {
    const parseResult = CreateProductSchema.safeParse(body);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const data = parseResult.data;
    const rawName = data.name ?? data.title ?? "";
    const name = rawName.trim();
    const categoryId = data.categoryId ?? data.category_id ?? null;

    if (categoryId) {
      const cat = await this.prisma.productCategory.findFirst({
        where: { id: categoryId, business_id: businessId },
      });
      if (!cat) {
        throw new NotFoundException({
          error: {
            code: "category_not_found",
            message: "Category not found in this business",
          },
        });
      }
    }

    // Default variant if none provided
    const variantsInput =
      data.variants && data.variants.length > 0
        ? data.variants
        : [
            {
              price: 0,
              stock: 0,
              isDefault: true,
            },
          ];

    // Check SKU conflicts across proposed variants and existing DB in bulk
    const skusToCheck = variantsInput
      .map((v) => v.sku?.trim())
      .filter((s): s is string => Boolean(s));

    if (skusToCheck.length > 0) {
      const existing = await this.prisma.productVariant.findFirst({
        where: {
          business_id: businessId,
          sku: { in: skusToCheck },
        },
      });
      if (existing) {
        throw new ConflictException({
          error: {
            code: "sku_conflict",
            message: `Variant with SKU '${existing.sku}' already exists in this business`,
          },
        });
      }
    }

    // Determine default variant flag: exactly one should be default
    const hasDefault = variantsInput.some((v) => Boolean(v.isDefault ?? v.is_default));

    const createdProduct = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          business_id: businessId,
          category_id: categoryId,
          name,
          description: data.description ?? null,
          status: data.status ?? ProductStatus.draft,
          currency: data.currency ?? "TND",
          benefits: data.benefits ? (data.benefits as Prisma.InputJsonValue) : Prisma.DbNull,
          selling_points:
            (data.sellingPoints ?? data.selling_points)
              ? ((data.sellingPoints ?? data.selling_points) as Prisma.InputJsonValue)
              : Prisma.DbNull,
          objections: data.objections ? (data.objections as Prisma.InputJsonValue) : Prisma.DbNull,
          faqs: data.faqs ? (data.faqs as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });

      // Validate variants discount price before creation
      for (const v of variantsInput) {
        const discountPrice = v.discountPrice ?? v.discount_price ?? null;
        if (discountPrice !== null && discountPrice >= v.price) {
          throw new BadRequestException({
            error: {
              code: "invalid_discount_price",
              message: "Discount price must be strictly less than price",
            },
          });
        }
      }

      // Create variants concurrently
      await Promise.all(
        variantsInput.map(async (v, i) => {
          const isDef = hasDefault ? Boolean(v.isDefault ?? v.is_default) : i === 0;
          const discountPrice = v.discountPrice ?? v.discount_price ?? null;

          return tx.productVariant.create({
            data: {
              business_id: businessId,
              product_id: product.id,
              sku: v.sku ? v.sku.trim() : null,
              barcode: v.barcode ? v.barcode.trim() : null,
              attributes: v.attributes ?? v.options ?? {},
              price: new Prisma.Decimal(v.price),
              discount_price: discountPrice !== null ? new Prisma.Decimal(discountPrice) : null,
              stock: v.stock ?? 0,
              is_default: isDef,
            },
          });
        }),
      );

      // Create images concurrently if provided
      if (data.images && data.images.length > 0) {
        await Promise.all(
          data.images.map(async (img, i) => {
            if (typeof img === "string") {
              return tx.productImage.create({
                data: {
                  business_id: businessId,
                  product_id: product.id,
                  variant_id: null,
                  s3_key: `businesses/${businessId}/products/${product.id}/images/${i + 1}.jpg`,
                  url: img,
                  alt_text: `${name} image ${i + 1}`,
                  sort_order: i,
                  is_primary: i === 0,
                },
              });
            }
            return tx.productImage.create({
              data: {
                business_id: businessId,
                product_id: product.id,
                variant_id: img.variantId ?? img.variant_id ?? null,
                s3_key:
                  img.s3Key ??
                  img.s3_key ??
                  `businesses/${businessId}/products/${product.id}/images/${i + 1}.jpg`,
                url: img.url ?? "",
                alt_text: img.altText ?? img.alt_text ?? null,
                sort_order: img.sortOrder ?? img.sort_order ?? i,
                is_primary: img.isPrimary ?? img.is_primary ?? i === 0,
              },
            });
          }),
        );
      }

      return product;
    });

    const result = await this.getProduct(businessId, createdProduct.id);
    void this.indexerProcessor?.enqueueSync(businessId, createdProduct.id, {
      mutationType: "created",
    });
    return result;
  }

  /**
   * 13 §12.1 GET /api/v1/products
   * List paginated products with filters (search, category, status) and cursor pagination
   */
  async listProducts(
    businessId: string,
    query: ListProductsQueryDto = {},
  ): Promise<PaginatedProductsResponse> {
    const rawLimit = query.limit ?? 50;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;

    const categoryId = query.categoryId ?? query.category_id;
    const status = query.status;
    const search = query.search?.trim();

    let cursorDecoded: DecodedCursor | null = null;
    if (query.cursor) {
      try {
        const decodedStr = Buffer.from(query.cursor, "base64url").toString("utf-8");
        const parsed = JSON.parse(decodedStr) as DecodedCursor;
        if (parsed.t && parsed.id) {
          cursorDecoded = parsed;
        } else {
          throw new Error("Missing required cursor fields");
        }
      } catch {
        throw new BadRequestException({
          error: {
            code: "invalid_cursor",
            message: "Invalid pagination cursor",
          },
        });
      }
    }

    const where: Prisma.ProductWhereInput = {
      business_id: businessId,
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(status ? { status } : {}),
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (cursorDecoded) {
      const cursorDate = new Date(cursorDecoded.t);
      if (!isNaN(cursorDate.getTime())) {
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
    }

    const products = (await this.prisma.product.findMany({
      where,
      take: limit + 1,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      include: {
        category: true,
        variants: {
          orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
        },
        images: {
          orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
        },
      },
    })) as unknown as RawProductWithRelations[];

    const hasMore = products.length > limit;
    const pageItems = hasMore ? products.slice(0, limit) : products;

    // Collect all variants across all products on this page to batch calculate availableStock
    const allVariants: { id: string; stock: number }[] = [];
    for (const p of pageItems) {
      for (const v of p.variants) {
        allVariants.push({ id: v.id, stock: v.stock });
      }
    }

    const availableStockMap = await this.variantsService.calculateAvailableStockBatch(
      businessId,
      allVariants,
    );

    let orderedVariantIds = new Set<string>();
    if (allVariants.length > 0) {
      const orderItems = await this.prisma.orderItem.findMany({
        where: {
          business_id: businessId,
          variant_id: { in: allVariants.map((v) => v.id) },
        },
        select: { variant_id: true },
        distinct: ["variant_id"],
      });
      orderedVariantIds = new Set(orderItems.map((oi) => oi.variant_id));
    }

    let nextCursor: string | null = null;
    if (hasMore && pageItems.length > 0) {
      const lastItem = pageItems[pageItems.length - 1];
      if (lastItem) {
        nextCursor = Buffer.from(
          JSON.stringify({
            t: lastItem.created_at.toISOString(),
            id: lastItem.id,
          }),
        ).toString("base64url");
      }
    }

    return {
      data: pageItems.map((p) =>
        this.formatProduct(
          p,
          availableStockMap,
          p.variants.some((v) => orderedVariantIds.has(v.id)),
        ),
      ),
      next_cursor: nextCursor,
    };
  }

  /**
   * 13 §12.1 GET /api/v1/products/:id
   */
  async getProduct(businessId: string, productId: string): Promise<ProductResponse> {
    const product = (await this.prisma.product.findFirst({
      where: {
        id: productId,
        business_id: businessId,
      },
      include: {
        category: true,
        variants: {
          orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
        },
        images: {
          orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
        },
      },
    })) as unknown as RawProductWithRelations | null;

    if (!product) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Product not found",
        },
      });
    }

    const stockMap = await this.variantsService.calculateAvailableStockBatch(
      businessId,
      product.variants.map((v) => ({ id: v.id, stock: v.stock })),
    );

    const variantIds = product.variants.map((v) => v.id);
    let hasOrders = false;
    if (variantIds.length > 0) {
      const orderCount = await this.prisma.orderItem.count({
        where: {
          business_id: businessId,
          variant_id: { in: variantIds },
        },
      });
      hasOrders = orderCount > 0;
    }

    return this.formatProduct(product, stockMap, hasOrders);
  }

  /**
   * 13 §12.1 PATCH /api/v1/products/:id
   */
  async updateProduct(
    businessId: string,
    productId: string,
    body: UpdateProductDto,
  ): Promise<ProductResponse> {
    const parseResult = UpdateProductSchema.safeParse(body);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const existing = await this.prisma.product.findFirst({
      where: {
        id: productId,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Product not found",
        },
      });
    }

    const data = parseResult.data;
    const name = data.name ?? data.title;
    const categoryId = data.categoryId ?? data.category_id;

    if (categoryId) {
      const cat = await this.prisma.productCategory.findFirst({
        where: { id: categoryId, business_id: businessId },
      });
      if (!cat) {
        throw new NotFoundException({
          error: {
            code: "category_not_found",
            message: "Category not found in this business",
          },
        });
      }
    }

    await this.prisma.product.update({
      where: {
        id_business_id: {
          id: productId,
          business_id: businessId,
        },
      },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(categoryId !== undefined ? { category_id: categoryId } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.benefits !== undefined
          ? {
              benefits: data.benefits ? (data.benefits as Prisma.InputJsonValue) : Prisma.DbNull,
            }
          : {}),
        ...(data.sellingPoints !== undefined || data.selling_points !== undefined
          ? {
              selling_points:
                (data.sellingPoints ?? data.selling_points)
                  ? ((data.sellingPoints ?? data.selling_points) as Prisma.InputJsonValue)
                  : Prisma.DbNull,
            }
          : {}),
        ...(data.objections !== undefined
          ? {
              objections: data.objections
                ? (data.objections as Prisma.InputJsonValue)
                : Prisma.DbNull,
            }
          : {}),
        ...(data.faqs !== undefined
          ? {
              faqs: data.faqs ? (data.faqs as Prisma.InputJsonValue) : Prisma.DbNull,
            }
          : {}),
      },
    });

    const result = await this.getProduct(businessId, productId);
    void this.indexerProcessor?.enqueueSync(businessId, productId, {
      mutationType: "updated",
    });
    return result;
  }

  /**
   * 13 §12.1 DELETE /api/v1/products/:id
   * Archival Safety: If any variant of the product appears on historical orders (order_items),
   * throw 409 Conflict per FR-CAT-012; the product must be archived instead.
   */
  async deleteProduct(
    businessId: string,
    productId: string,
  ): Promise<{ message: string; status: string; id: string; archived: boolean }> {
    const existing = await this.prisma.product.findFirst({
      where: {
        id: productId,
        business_id: businessId,
      },
      include: {
        variants: true,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Product not found",
        },
      });
    }

    const variantIds = existing.variants.map((v) => v.id);

    // Check if any variant is referenced in order items
    let hasOrderItems = false;
    if (variantIds.length > 0) {
      const orderItemCount = await this.prisma.orderItem.count({
        where: {
          business_id: businessId,
          variant_id: { in: variantIds },
        },
      });
      hasOrderItems = orderItemCount > 0;
    }

    if (hasOrderItems) {
      throw new ConflictException({
        error: {
          code: "product_has_orders",
          message:
            "Product appears on existing orders and cannot be deleted. Please archive it instead.",
        },
      });
    }

    if (variantIds.length > 0) {
      const activeReservations = await this.prisma.stockReservation.count({
        where: {
          business_id: businessId,
          variant_id: { in: variantIds },
          status: "active",
          expires_at: { gt: new Date() },
        },
      });
      if (activeReservations > 0) {
        throw new ConflictException({
          error: {
            code: "product_has_active_reservations",
            message:
              "Product has active checkout reservations in progress and cannot be deleted. Please try again later or archive it.",
          },
        });
      }
    }

    // Hard delete when no orders or active reservations exist
    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.deleteMany({
        where: {
          product_id: productId,
          business_id: businessId,
        },
      });

      if (variantIds.length > 0) {
        await tx.stockReservation.deleteMany({
          where: {
            variant_id: { in: variantIds },
            business_id: businessId,
          },
        });

        await tx.inventoryMovement.deleteMany({
          where: {
            variant_id: { in: variantIds },
            business_id: businessId,
          },
        });

        await tx.productVariant.deleteMany({
          where: {
            product_id: productId,
            business_id: businessId,
          },
        });
      }

      await tx.product.delete({
        where: {
          id_business_id: {
            id: productId,
            business_id: businessId,
          },
        },
      });
    });

    void this.indexerProcessor?.enqueueSync(businessId, productId, {
      mutationType: "deleted",
    });

    return {
      message: "Product deleted successfully",
      status: "deleted",
      id: productId,
      archived: false,
    };
  }
}
