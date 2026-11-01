import { Injectable, Optional } from "@nestjs/common";
import { type PrismaClient, ProductStatus } from "@prisma/client";

import { prisma as defaultPrisma } from "../../lib/prisma";
import { getReservedStockForVariants } from "./stock-utils";

export interface CatalogSearchInput {
  query: string;
  category?: string;
  limit?: number;
}

export interface CatalogVariantResult {
  id: string;
  sku: string | null;
  attributes: Record<string, string>;
  price: number;
  discountPrice: number | null;
  stock: number;
  availableStock: number;
  inStock: boolean;
  isDefault: boolean;
}

export interface CatalogProductResult {
  id: string;
  name: string;
  description: string | null;
  categoryName: string | null;
  currency: string;
  variants: CatalogVariantResult[];
  imageUrl: string | null;
}

export interface CatalogSearchOutput {
  products: CatalogProductResult[];
  totalFound: number;
  textSummary: string;
}

const SEARCH_SYNONYMS: Record<string, string[]> = {
  sbabet: ["shoes", "sneakers", "baskets", "chaussures", "sandales"],
  sabbat: ["shoes", "sneakers", "baskets", "chaussures", "sandales"],
  sabate: ["shoes", "sneakers", "baskets", "chaussures", "sandales"],
  سبابط: ["shoes", "sneakers", "baskets", "chaussures"],
  صباط: ["shoes", "sneakers", "baskets", "chaussures"],
  chaussures: ["shoes", "sneakers", "baskets", "sbabet"],
  baskets: ["shoes", "sneakers", "chaussures", "sbabet"],
  sneakers: ["shoes", "baskets", "chaussures", "sbabet"],
  shoes: ["sneakers", "baskets", "chaussures", "sbabet"],
  maryoul: ["t-shirt", "tee", "shirt", "polo", "top"],
  mrioul: ["t-shirt", "tee", "shirt", "polo", "top"],
  chemise: ["shirt", "oxford", "chemisette"],
  shirt: ["chemise", "t-shirt", "polo"],
  tshirt: ["t-shirt", "tee", "maryoul"],
  jacket: ["veste", "denim", "blouson"],
  veste: ["jacket", "denim", "blazer"],
  serwel: ["pants", "jeans", "pantalon"],
  sarwel: ["pants", "jeans", "pantalon"],
  pantalon: ["pants", "jeans", "trousers"],
  jeans: ["pantalon", "denim"],
  sac: ["backpack", "bag", "cartable"],
  sak: ["backpack", "bag"],
  backpack: ["sac", "bag"],
  sa3a: ["watch", "montre"],
  watch: ["montre", "smart watch"],
  kes: ["mug", "cup", "bottle"],
  mug: ["cup", "kes", "tasse"],
  bottle: ["water bottle", "gourde"],
  wallet: ["portefeuille", "bztam", "cuir"],
  headphones: ["écouteurs", "casque", "bluetooth", "chabka"],
};

@Injectable()
export class CatalogSearchTool {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  async searchCatalog(businessId: string, input: CatalogSearchInput): Promise<CatalogSearchOutput> {
    const rawQuery = input.query.trim();
    const category = input.category?.trim();
    const limit = Math.min(Math.max(input.limit ?? 5, 1), 15);

    // Build Prisma where clause with strict businessId tenancy
    const whereClause: Record<string, unknown> = {
      business_id: businessId,
      status: ProductStatus.active,
    };

    if (category) {
      whereClause.category = {
        name: { contains: category, mode: "insensitive" },
      };
    }

    const isGenericQuery =
      !rawQuery ||
      /^(produit|produits|article|articles|catalogue|tout|tous|all|store|shop|boutique|chnowa|chnia|chneya|chnawa|famma|fama|3andkom|sh3andkom|ch3andkom|chfamma|chfama|vos articles|vos produits)$/i.test(
        rawQuery.toLowerCase(),
      );

    if (rawQuery && !isGenericQuery) {
      whereClause.OR = [
        { name: { contains: rawQuery, mode: "insensitive" } },
        { description: { contains: rawQuery, mode: "insensitive" } },
        {
          variants: {
            some: {
              OR: [
                { sku: { contains: rawQuery, mode: "insensitive" } },
                { barcode: { contains: rawQuery, mode: "insensitive" } },
              ],
            },
          },
        },
      ];
    }

    let products = await this.prisma.product.findMany({
      where: whereClause,
      include: {
        category: true,
        images: {
          orderBy: [{ is_primary: "desc" }, { sort_order: "asc" }],
        },
        variants: {
          include: {
            images: true,
          },
        },
      },
      take: limit,
    });

    // If exact query yielded nothing, try matching individual significant words or cross-language synonyms
    if (products.length === 0 && rawQuery && !isGenericQuery) {
      const words = rawQuery
        .split(/\s+/)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length >= 3);

      // Collect synonym terms if available
      const synonymTerms: string[] = [];
      for (const [key, syns] of Object.entries(SEARCH_SYNONYMS)) {
        if (rawQuery.toLowerCase().includes(key) || words.includes(key)) {
          synonymTerms.push(...syns);
        }
      }

      const matchTerms = Array.from(new Set([...words, ...synonymTerms]));

      if (matchTerms.length > 0) {
        const fallbackWhere: Record<string, unknown> = {
          business_id: businessId,
          status: ProductStatus.active,
          OR: matchTerms.flatMap((word) => [
            { name: { contains: word, mode: "insensitive" } },
            { description: { contains: word, mode: "insensitive" } },
          ]),
        };
        if (category) {
          fallbackWhere.category = {
            name: { contains: category, mode: "insensitive" },
          };
        }

        products = await this.prisma.product.findMany({
          where: fallbackWhere,
          include: {
            category: true,
            images: {
              orderBy: [{ is_primary: "desc" }, { sort_order: "asc" }],
            },
            variants: {
              include: {
                images: true,
              },
            },
          },
          take: limit,
        });
      }
    }

    if (products.length === 0) {
      return {
        products: [],
        totalFound: 0,
        textSummary: `No active products found matching "${rawQuery}"${category ? ` in category "${category}"` : ""}.`,
      };
    }

    // Collect all variant IDs to compute available stock batch
    const allVariantIds = products.flatMap((p) => p.variants.map((v) => v.id));

    const reservedMap = await getReservedStockForVariants(this.prisma, businessId, allVariantIds);

    const results: CatalogProductResult[] = [];
    const summaryLines: string[] = [];

    for (const product of products) {
      const primaryImage = product.images.find((img) => img.is_primary) ?? product.images[0];
      const currency = product.currency ?? "TND";

      const variantResults: CatalogVariantResult[] = product.variants.map((v) => {
        const reserved = reservedMap.get(v.id) ?? 0;
        const availableStock = Math.max(0, v.stock - reserved);
        const priceNum = Number(v.price);
        const discountNum = v.discount_price !== null ? Number(v.discount_price) : null;
        const rawAttrs = v.attributes;
        const attributes =
          rawAttrs && typeof rawAttrs === "object" && !Array.isArray(rawAttrs)
            ? (rawAttrs as Record<string, string>)
            : {};

        return {
          id: v.id,
          sku: v.sku,
          attributes,
          price: priceNum,
          discountPrice: discountNum,
          stock: v.stock,
          availableStock,
          inStock: availableStock > 0,
          isDefault: v.is_default,
        };
      });

      results.push({
        id: product.id,
        name: product.name,
        description: product.description,
        categoryName: product.category?.name ?? null,
        currency,
        variants: variantResults,
        imageUrl: primaryImage?.url ?? null,
      });

      // Build summary for grounding
      const variantSummaries = variantResults.map((v) => {
        const attrEntries = Object.entries(v.attributes);
        const attrStr = attrEntries.map(([k, val]) => `${k}: ${val}`).join(", ");
        const priceStr = v.discountPrice
          ? `${v.discountPrice.toFixed(3)} ${currency} (Original: ${v.price.toFixed(3)} ${currency})`
          : `${v.price.toFixed(3)} ${currency}`;
        const stockStr = v.inStock ? `${v.availableStock} in stock` : "OUT OF STOCK";
        return `  - Variant [${v.id}] ${attrStr ? `(${attrStr})` : ""}: ${priceStr} | ${stockStr}`;
      });

      summaryLines.push(
        `Product: "${product.name}" (ID: ${product.id})\n${variantSummaries.join("\n")}`,
      );
    }

    return {
      products: results,
      totalFound: results.length,
      textSummary: summaryLines.join("\n\n"),
    };
  }
}
