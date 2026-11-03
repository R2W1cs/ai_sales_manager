import { z } from "zod";

/**
 * 13 §2.8 Money, dates, enums
 */

// Money: JSON string matching Prisma Decimal(12,3), e.g. "12.540"
export const MoneySchema = z.string().regex(/^\d+\.\d{3}$/);

// Dates: ISO-8601 timestamptz in UTC
export const DateSchema = z.iso.datetime();
