import { ImportStatus } from "@prisma/client";
import { z } from "zod";

export const CsvImportRowErrorSchema = z.object({
  row: z.number().int().min(1),
  column: z.string().optional(),
  message: z.string(),
  raw: z.string().optional(),
});

export type CsvImportRowError = z.infer<typeof CsvImportRowErrorSchema>;

export const CsvParsedItemSchema = z.object({
  title: z.string(),
  category: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().min(0),
  discountPrice: z.number().min(0).nullable().optional(),
  stock: z.number().int().min(0).default(0),
  description: z.string().optional(),
  attributes: z.record(z.string(), z.string()).default({}),
  imageUrl: z.string().optional(),
  status: z.string().default("active"),
});

export type CsvParsedItem = z.infer<typeof CsvParsedItemSchema>;

export const ImportModeSchema = z.enum(["merge", "replace"]);
export type ImportMode = z.infer<typeof ImportModeSchema>;

export const ImportCsvBodySchema = z.object({
  csv: z.string().optional(),
  s3Key: z.string().optional(),
  s3_key: z.string().optional(),
  filename: z.string().optional(),
  mode: ImportModeSchema.default("merge").optional(),
});

export type ImportCsvBodyDto = z.infer<typeof ImportCsvBodySchema>;

export const ConfirmImportBodySchema = z.object({
  mode: ImportModeSchema.default("merge").optional(),
});

export type ConfirmImportBodyDto = z.infer<typeof ConfirmImportBodySchema>;

export const ImportRunResponseSchema = z.object({
  id: z.uuid(),
  jobId: z.uuid().optional(),
  businessId: z.uuid(),
  status: z.enum(ImportStatus),
  mode: ImportModeSchema.optional(),
  totalRows: z.number().int().nullable(),
  successRows: z.number().int().nullable(),
  errorRows: z.number().int().nullable(),
  errorS3Key: z.string().nullable().optional(),
  errorFileUrl: z.string().nullable().optional(),
  errors: z.array(CsvImportRowErrorSchema).optional(),
  preview: z.array(CsvParsedItemSchema).optional(),
  createdAt: z.union([z.date(), z.string()]),
  finishedAt: z.union([z.date(), z.string()]).nullable(),
});

export type ImportRunResponseDto = z.infer<typeof ImportRunResponseSchema>;
