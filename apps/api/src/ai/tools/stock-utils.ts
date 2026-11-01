import { type PrismaClient, ReservationStatus } from "@prisma/client";

export interface VariantStockInfo {
  variantId: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  inStock: boolean;
}

/**
 * Calculates sum of active, unexpired reservations for a list of variant IDs.
 * Enforces strict tenant isolation by businessId.
 */
export async function getReservedStockForVariants(
  prisma: PrismaClient,
  businessId: string,
  variantIds: string[],
): Promise<Map<string, number>> {
  if (variantIds.length === 0) {
    return new Map<string, number>();
  }

  const now = new Date();
  const activeReservations = await prisma.stockReservation.findMany({
    where: {
      business_id: businessId,
      variant_id: { in: variantIds },
      status: ReservationStatus.active,
      expires_at: { gt: now },
    },
    select: {
      variant_id: true,
      quantity: true,
    },
  });

  const reservedMap = new Map<string, number>();
  for (const res of activeReservations) {
    const current = reservedMap.get(res.variant_id) ?? 0;
    reservedMap.set(res.variant_id, current + res.quantity);
  }

  return reservedMap;
}
