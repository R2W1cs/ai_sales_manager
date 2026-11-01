import { Injectable, Optional } from "@nestjs/common";
import { type PrismaClient, ProductStatus } from "@prisma/client";

import { prisma as defaultPrisma } from "../../lib/prisma";
import { getReservedStockForVariants } from "./stock-utils";

export interface StockCheckInput {
  variantId?: string;
  productId?: string;
  sku?: string;
  quantity?: number;
}

export interface StockCheckItem {
  variantId: string;
  productId: string;
  productName: string;
  sku: string | null;
  attributes: Record<string, string>;
  price: number;
  discountPrice: number | null;
  currency: string;
  availableStock: number;
  inStock: boolean;
  reservable: boolean;
}

export interface StockCheckOutput {
  items: StockCheckItem[];
  textSummary: string;
}

@Injectable()
export class StockCheckTool {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  async checkStock(businessId: string, input: StockCheckInput): Promise<StockCheckOutput> {
    const requiredQty = Math.max(input.quantity ?? 1, 1);

    if (!input.variantId && !input.sku && !input.productId) {
      return {
        items: [],
        textSummary: "No variant, SKU, or product ID specified for stock check.",
      };
    }

    const whereClause: Record<string, unknown> = {
      business_id: businessId,
      product: {
        status: ProductStatus.active,
      },
    };

    if (input.variantId) {
      whereClause.id = input.variantId;
    } else if (input.sku) {
      whereClause.sku = input.sku.trim();
    } else if (input.productId) {
      whereClause.product_id = input.productId;
    }

    const variants = await this.prisma.productVariant.findMany({
      where: whereClause,
      include: {
        product: true,
      },
    });

    if (variants.length === 0) {
      return {
        items: [],
        textSummary: "No variant found for the requested stock check.",
      };
    }

    const variantIds = variants.map((v) => v.id);
    const reservedMap = await getReservedStockForVariants(this.prisma, businessId, variantIds);

    const items: StockCheckItem[] = variants.map((v) => {
      const reserved = reservedMap.get(v.id) ?? 0;
      const availableStock = Math.max(0, v.stock - reserved);
      const priceNum = Number(v.price);
      const discountNum = v.discount_price !== null ? Number(v.discount_price) : null;
      const currency = v.product.currency ?? "TND";
      const rawAttrs = v.attributes;
      const attributes =
        rawAttrs && typeof rawAttrs === "object" && !Array.isArray(rawAttrs)
          ? (rawAttrs as Record<string, string>)
          : {};

      return {
        variantId: v.id,
        productId: v.product_id,
        productName: v.product.name,
        sku: v.sku,
        attributes,
        price: priceNum,
        discountPrice: discountNum,
        currency,
        availableStock,
        inStock: availableStock > 0,
        reservable: availableStock >= requiredQty,
      };
    });

    const summaryLines = items.map((item) => {
      const attrEntries = Object.entries(item.attributes);
      const attrStr = attrEntries.map(([k, val]) => `${k}: ${val}`).join(", ");
      const effectivePrice = item.discountPrice ?? item.price;
      const statusStr = item.inStock
        ? `${item.availableStock} available (${item.reservable ? `can fulfill quantity of ${requiredQty}` : `insufficient for quantity ${requiredQty}`})`
        : "OUT OF STOCK";

      return `Product: "${item.productName}" | Variant: ${item.sku ?? item.variantId} ${attrStr ? `(${attrStr})` : ""} | Price: ${effectivePrice.toFixed(3)} ${item.currency} | Status: ${statusStr}`;
    });

    return {
      items,
      textSummary: summaryLines.join("\n"),
    };
  }
}
