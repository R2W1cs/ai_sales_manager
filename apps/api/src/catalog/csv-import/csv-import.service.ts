import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { type PrismaClient, type Prisma, ProductStatus } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma as defaultPrisma } from "../../lib/prisma";
import { uploadFile, downloadFileAsBuffer, getDownloadUrl, getPublicUrl } from "../../lib/storage";
import type {
  CsvImportRowError,
  CsvParsedItem,
  ImportCsvBodyDto,
  ImportMode,
  ImportRunResponseDto,
} from "../dto/csv-import.dto";
import { CatalogIndexerService } from "../indexer/catalog-indexer.service";

export const CANONICAL_CSV_HEADERS = [
  "name",
  "category",
  "sku",
  "barcode",
  "price",
  "discount_price",
  "stock",
  "description",
  "options",
  "image_url",
] as const;

export const SAMPLE_CSV_ROW = [
  '"Premium Cotton T-Shirt"',
  '"Apparel"',
  '"TSHIRT-BLK-M"',
  '"123456789012"',
  "29.99",
  "24.99",
  "100",
  '"100% organic cotton t-shirt"',
  '"{""size"":""M"",""color"":""Black""}"',
  '"https://example.com/images/tshirt-black.jpg"',
].join(",");

type VariantWithProduct = Prisma.ProductVariantGetPayload<{
  include: { product: true };
}>;

const CHUNK_SIZE = 50;

@Injectable()
export class CsvImportService {
  private readonly prisma: PrismaClient;

  constructor(
    @Optional() prismaClient?: PrismaClient,
    @Optional() private readonly indexerService?: CatalogIndexerService,
  ) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Helper: Retrieve run mode ("merge" | "replace") from S3 metadata
   */
  async getRunMode(businessId: string, runId: string): Promise<ImportMode> {
    try {
      const metaBuf = await downloadFileAsBuffer(`imports/${businessId}/${runId}-meta.json`);
      const meta = JSON.parse(metaBuf.toString("utf-8")) as { mode?: ImportMode };
      if (meta?.mode === "replace" || meta?.mode === "merge") {
        return meta.mode;
      }
    } catch {
      // Default to "merge"
    }
    return "merge";
  }

  /**
   * 13 §12.2 GET /products/import/template
   * Returns canonical CSV template header and sample row
   */
  getTemplate(): { csv: string; headers: string[] } {
    const headerLine = CANONICAL_CSV_HEADERS.join(",");
    const csv = `${headerLine}\n${SAMPLE_CSV_ROW}\n`;
    return {
      csv,
      headers: [...CANONICAL_CSV_HEADERS],
    };
  }

  /**
   * Detect delimiter by counting occurrences outside quotes on the first line
   */
  detectDelimiter(csvText: string): string {
    const clean = csvText.replace(/^\uFEFF/, "").trimStart();
    const firstLine = clean.split(/\r?\n/)[0] ?? "";
    let commaCount = 0;
    let semicolonCount = 0;
    let tabCount = 0;
    let inQuotes = false;

    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (char === ",") commaCount++;
        else if (char === ";") semicolonCount++;
        else if (char === "\t") tabCount++;
      }
    }

    if (semicolonCount > commaCount && semicolonCount > tabCount) return ";";
    if (tabCount > commaCount && tabCount > semicolonCount) return "\t";
    return ",";
  }

  /**
   * Parse CSV text conforming to RFC 4180 with auto-detected delimiter
   */
  parseCsvRows(csvText: string, customDelimiter?: string): string[][] {
    const delimiter = customDelimiter ?? this.detectDelimiter(csvText);
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = "";
    let insideQuotes = false;

    // Strip UTF-8 BOM if present
    const cleanText = csvText.replace(/^\uFEFF/, "");

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i] ?? "";
      const nextChar = cleanText[i + 1] ?? "";

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Escaped quote ("")
          currentField += '"';
          i++; // Skip the second quote
        } else {
          // Toggle quote state
          insideQuotes = !insideQuotes;
        }
      } else if (char === delimiter && !insideQuotes) {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if ((char === "\r" || char === "\n") && !insideQuotes) {
        if (char === "\r" && nextChar === "\n") {
          i++; // Skip LF after CR
        }
        currentRow.push(currentField.trim());
        currentField = "";
        // Only push non-empty rows
        if (currentRow.some((field) => field.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += char;
      }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some((field) => field.length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  /**
   * Validate and parse CSV content
   */
  parseAndValidateCsv(csvContent: string): {
    totalRows: number;
    successRows: number;
    errorRows: number;
    validItems: CsvParsedItem[];
    errors: CsvImportRowError[];
  } {
    const rawRows = this.parseCsvRows(csvContent);
    if (rawRows.length === 0) {
      return {
        totalRows: 0,
        successRows: 0,
        errorRows: 0,
        validItems: [],
        errors: [{ row: 1, message: "CSV file is empty or missing headers" }],
      };
    }

    const headerRow = rawRows[0] ?? [];
    const headerMap = new Map<string, number>();

    const normalizeHeader = (col: string): string => {
      return col
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\u0600-\u06FF_]/g, "");
    };

    headerRow.forEach((col, idx) => {
      const normalized = normalizeHeader(col);
      if (normalized) {
        headerMap.set(normalized, idx);
      }
    });

    const getColIndex = (...candidates: string[]): number | undefined => {
      for (const cand of candidates) {
        const norm = normalizeHeader(cand);
        if (headerMap.has(norm)) {
          return headerMap.get(norm);
        }
      }
      return undefined;
    };

    const titleIdx = getColIndex(
      "name",
      "title",
      "nom",
      "produit",
      "product_name",
      "product_title",
      "designation",
      "article",
      "libelle",
      "اسم",
      "الاسم",
      "منتج",
      "المنتج",
      "اسمالمنتج",
    );
    const categoryIdx = getColIndex(
      "category",
      "category_name",
      "cat",
      "categorie",
      "famille",
      "rayon",
      "صنف",
      "الصنف",
      "فئة",
      "الفئة",
    );
    const skuIdx = getColIndex(
      "sku",
      "variant_sku",
      "code",
      "reference",
      "ref",
      "code_art",
      "رمز",
      "الرمز",
    );
    const barcodeIdx = getColIndex(
      "barcode",
      "upc",
      "ean",
      "ean13",
      "code_barre",
      "codebarre",
      "code_barres",
    );
    const priceIdx = getColIndex(
      "price",
      "regular_price",
      "unit_price",
      "prix",
      "tarif",
      "prix_unitaire",
      "prix_vente",
      "prixunitaire",
      "prixvente",
      "سعر",
      "السعر",
    );
    const discountPriceIdx = getColIndex(
      "discount_price",
      "discountprice",
      "sale_price",
      "prix_promo",
      "prixpromo",
      "prix_solde",
      "prixsolde",
      "prix_reduit",
      "discount",
      "remise",
      "تخفيض",
      "سعر_تخفيض",
    );
    const stockIdx = getColIndex(
      "stock",
      "quantity",
      "qty",
      "inventory",
      "quantite",
      "qte",
      "dispo",
      "disponibilite",
      "مخزون",
      "المخزون",
      "كمية",
      "الكمية",
    );
    const descIdx = getColIndex("description", "desc", "detail", "details", "وصف", "الوصف");
    const optionsIdx = getColIndex(
      "options",
      "attributes",
      "attrs",
      "variante",
      "attributs",
      "خيارات",
    );
    const sizeIdx = getColIndex("taille", "size", "pointure", "حجم", "مقاس", "المقاس");
    const colorIdx = getColIndex("couleur", "color", "couleurs", "لون", "اللون");
    const imageIdx = getColIndex(
      "image_url",
      "image",
      "images",
      "imageUrl",
      "photo",
      "url_image",
      "lien_image",
      "visuel",
      "صورة",
      "الصورة",
    );
    const statusIdx = getColIndex("status", "statut", "etat", "حالة");

    // FR-CAT-020: Required columns are name/title and price
    if (titleIdx === undefined || priceIdx === undefined) {
      return {
        totalRows: 0,
        successRows: 0,
        errorRows: 0,
        validItems: [],
        errors: [{ row: 1, message: "CSV headers must contain name (or title) and price" }],
      };
    }

    const parsePrice = (raw: string | undefined): number | null => {
      if (!raw) return null;
      const trimmed = raw.trim();
      if (!trimmed) return null;

      const stripped = trimmed.replace(/(?:DT|TND|dt|tnd|dinars?|د\.ت|[$€£])/gi, "").trim();
      if (!stripped) return null;

      let normalized = stripped;
      if (normalized.includes(",") && normalized.includes(".")) {
        if (normalized.indexOf(",") < normalized.indexOf(".")) {
          normalized = normalized.replace(/,/g, "");
        } else {
          normalized = normalized.replace(/\./g, "").replace(",", ".");
        }
      } else if (normalized.includes(",")) {
        normalized = normalized.replace(",", ".");
      }

      normalized = normalized.replace(/\s+/g, "");
      const num = Number(normalized);
      if (isNaN(num) || num < 0) return null;
      return num;
    };

    const parseStock = (raw: string | undefined): number | null => {
      if (raw === undefined || raw.trim() === "") return null;
      const cleaned = raw.trim().replace(/\s+/g, "");
      const num = Number(cleaned);
      if (isNaN(num) || !Number.isInteger(num) || num < 0) return null;
      return num;
    };

    const dataRows = rawRows.slice(1);
    const validItems: CsvParsedItem[] = [];
    const errors: CsvImportRowError[] = [];

    dataRows.forEach((row, dataIdx) => {
      const lineNo = dataIdx + 2; // 1-indexed, header is line 1
      const rowErrors: string[] = [];

      const getVal = (idx?: number): string | undefined => {
        if (idx === undefined || idx >= row.length) return undefined;
        let v = row[idx]?.trim();
        if (v && v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
          v = v.slice(1, -1).trim();
        }
        return v === "" ? undefined : v;
      };

      const title = getVal(titleIdx);
      if (!title) {
        errors.push({
          row: lineNo,
          column: "title",
          message: "Product title/name is required",
          raw: row.join(","),
        });
        rowErrors.push("title");
      }

      const rawPrice = getVal(priceIdx);
      const parsedPrice = parsePrice(rawPrice);
      if (parsedPrice === null) {
        errors.push({
          row: lineNo,
          column: "price",
          message: "Price is required and must be a valid non-negative number",
          raw: row.join(","),
        });
        rowErrors.push("price");
      }

      const rawDiscountPrice = getVal(discountPriceIdx);
      let parsedDiscountPrice: number | null = null;
      if (rawDiscountPrice !== undefined) {
        const discNum = parsePrice(rawDiscountPrice);
        if (discNum === null) {
          errors.push({
            row: lineNo,
            column: "discount_price",
            message: "Discount price must be a non-negative number",
            raw: row.join(","),
          });
          rowErrors.push("discount_price");
        } else if (parsedPrice !== null && discNum >= parsedPrice) {
          errors.push({
            row: lineNo,
            column: "discount_price",
            message: "Discount price must be less than regular price",
            raw: row.join(","),
          });
          rowErrors.push("discount_price");
        } else {
          parsedDiscountPrice = discNum;
        }
      }

      const rawStock = getVal(stockIdx);
      let parsedStock = 0;
      if (rawStock !== undefined) {
        const stockNum = parseStock(rawStock);
        if (stockNum === null) {
          errors.push({
            row: lineNo,
            column: "stock",
            message: "Stock must be a non-negative integer",
            raw: row.join(","),
          });
          rowErrors.push("stock");
        } else {
          parsedStock = stockNum;
        }
      }

      const rawOptions = getVal(optionsIdx);
      let parsedAttributes: Record<string, string> = {};
      if (rawOptions) {
        try {
          if (rawOptions.startsWith("{")) {
            const parsed = JSON.parse(rawOptions) as unknown;
            if (typeof parsed === "object" && parsed !== null) {
              parsedAttributes = { ...(parsed as Record<string, string>) };
            }
          } else if (rawOptions.includes(":") || rawOptions.includes("=")) {
            // key:value;key2:value2 format
            rawOptions.split(/[;,]/).forEach((part) => {
              const [k, v] = part.split(/[:=]/);
              if (k && v) {
                parsedAttributes[k.trim()] = v.trim();
              }
            });
          } else {
            parsedAttributes.option = rawOptions;
          }
        } catch {
          errors.push({
            row: lineNo,
            column: "options",
            message: "Invalid format for options/attributes",
            raw: row.join(","),
          });
          rowErrors.push("options");
        }
      }

      // Merge explicit size and color columns if provided
      if (sizeIdx !== undefined) {
        const sizeVal = getVal(sizeIdx);
        if (sizeVal) {
          parsedAttributes.size = sizeVal;
        }
      }
      if (colorIdx !== undefined) {
        const colorVal = getVal(colorIdx);
        if (colorVal) {
          parsedAttributes.color = colorVal;
        }
      }

      if (rowErrors.length === 0 && title && parsedPrice !== null) {
        validItems.push({
          title,
          category: getVal(categoryIdx),
          sku: getVal(skuIdx),
          barcode: getVal(barcodeIdx),
          price: parsedPrice,
          discountPrice: parsedDiscountPrice,
          stock: parsedStock,
          description: getVal(descIdx),
          attributes: parsedAttributes,
          imageUrl: getVal(imageIdx),
          status: getVal(statusIdx) ?? "active",
        });
      }
    });

    return {
      totalRows: dataRows.length,
      successRows: validItems.length,
      errorRows: dataRows.length - validItems.length,
      validItems,
      errors,
    };
  }

  /**
   * 13 §12.2 POST /products/import
   * Upload CSV, persist to S3, record catalog_import_runs row in "uploaded" status
   * Invariant: Returns 202 Accepted, NO catalog writes.
   */
  async createImportRun(
    businessId: string,
    userId: string,
    body: ImportCsvBodyDto,
    fileBuffer?: Buffer,
  ): Promise<ImportRunResponseDto> {
    const csvContent = fileBuffer ? fileBuffer.toString("utf-8") : body.csv;
    const s3Key =
      body.s3Key ??
      body.s3_key ??
      `imports/${businessId}/${Date.now()}-${body.filename ?? "import.csv"}`;

    // Persist file to S3
    if (csvContent) {
      try {
        await uploadFile(s3Key, csvContent, { contentType: "text/csv" });
      } catch (err) {
        logger.warn({ err, s3Key }, "Could not upload CSV to S3; proceeding");
      }
    }

    // Invariant: Create catalog_import_runs row in "uploaded" status
    const run = await this.prisma.catalogImportRun.create({
      data: {
        business_id: businessId,
        uploaded_by_user_id: userId,
        s3_key: s3Key,
        status: "uploaded",
      },
    });

    const mode: ImportMode = body.mode ?? "merge";
    try {
      await uploadFile(`imports/${businessId}/${run.id}-meta.json`, JSON.stringify({ mode }), {
        contentType: "application/json",
      });
    } catch (err) {
      logger.warn({ err, runId: run.id }, "Could not persist import run metadata to S3");
    }

    return {
      id: run.id,
      jobId: run.id,
      businessId: run.business_id,
      status: run.status,
      mode,
      totalRows: run.total_rows,
      successRows: run.success_rows,
      errorRows: run.error_rows,
      createdAt: run.created_at,
      finishedAt: run.finished_at,
    };
  }

  /**
   * Worker/Service method to validate an uploaded CSV run and persist error reports to S3
   */
  async processValidateRun(
    businessId: string,
    runId: string,
    inlineCsvContent?: string,
  ): Promise<ImportRunResponseDto> {
    const run = await this.prisma.catalogImportRun.findFirst({
      where: { id: runId, business_id: businessId },
    });

    if (!run) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Import run not found" },
      });
    }

    let csvContent = inlineCsvContent;
    if (!csvContent) {
      try {
        const buffer = await downloadFileAsBuffer(run.s3_key);
        csvContent = buffer.toString("utf-8");
      } catch (err) {
        logger.error({ err, s3Key: run.s3_key }, "Failed to download CSV for validation");
      }
    }

    if (!csvContent) {
      const failedRun = await this.prisma.catalogImportRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          total_rows: 0,
          success_rows: 0,
          error_rows: 0,
          finished_at: new Date(),
        },
      });
      return {
        id: failedRun.id,
        jobId: failedRun.id,
        businessId: failedRun.business_id,
        status: failedRun.status,
        totalRows: 0,
        successRows: 0,
        errorRows: 0,
        createdAt: failedRun.created_at,
        finishedAt: failedRun.finished_at,
      };
    }

    const validationResult = this.parseAndValidateCsv(csvContent);
    const isFailed = validationResult.totalRows === 0 && validationResult.errors.length > 0;
    const newStatus = isFailed ? "failed" : "validated";

    let errorS3Key: string | null = null;
    if (validationResult.errors.length > 0) {
      errorS3Key = `imports/${businessId}/${run.id}-errors.json`;
      try {
        await uploadFile(errorS3Key, JSON.stringify(validationResult.errors), {
          contentType: "application/json",
        });
      } catch (err) {
        logger.warn({ err, errorS3Key }, "Failed to persist error report to S3");
      }
    }

    const updated = await this.prisma.catalogImportRun.update({
      where: { id: run.id },
      data: {
        status: newStatus,
        total_rows: validationResult.totalRows,
        success_rows: validationResult.successRows,
        error_rows: validationResult.errorRows,
        error_s3_key: errorS3Key,
      },
    });

    const mode = await this.getRunMode(businessId, run.id);

    return {
      id: updated.id,
      jobId: updated.id,
      businessId: updated.business_id,
      status: newStatus,
      mode,
      totalRows: validationResult.totalRows,
      successRows: validationResult.successRows,
      errorRows: validationResult.errorRows,
      errorS3Key,
      errors: validationResult.errors,
      preview: validationResult.validItems.slice(0, 10),
      createdAt: updated.created_at,
      finishedAt: updated.finished_at,
    };
  }

  /**
   * 13 §12.2 GET /products/import/:id
   * Poll status, row error summary, and parsed item preview
   */
  async getImportRun(businessId: string, id: string): Promise<ImportRunResponseDto> {
    const run = await this.prisma.catalogImportRun.findFirst({
      where: {
        id,
        business_id: businessId,
      },
    });

    if (!run) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Import run not found",
        },
      });
    }

    const mode = await this.getRunMode(businessId, id);

    let errorFileUrl: string | null = null;
    if (run.error_s3_key) {
      try {
        errorFileUrl = await getDownloadUrl(run.error_s3_key);
      } catch {
        errorFileUrl = getPublicUrl(run.error_s3_key);
      }
    }

    let errors: CsvImportRowError[] | undefined;
    let preview: CsvParsedItem[] | undefined;

    // Load error and preview report from S3 or source CSV
    if (run.error_s3_key) {
      try {
        const errorBuf = await downloadFileAsBuffer(run.error_s3_key);
        errors = JSON.parse(errorBuf.toString("utf-8")) as CsvImportRowError[];
      } catch {
        // Fallback gracefully
      }
    }

    if (!preview && run.s3_key) {
      try {
        const csvBuf = await downloadFileAsBuffer(run.s3_key);
        const parsed = this.parseAndValidateCsv(csvBuf.toString("utf-8"));
        preview = parsed.validItems.slice(0, 10);
        errors ??= parsed.errors;
      } catch {
        // Fallback gracefully
      }
    }

    return {
      id: run.id,
      jobId: run.id,
      businessId: run.business_id,
      status: run.status,
      mode,
      totalRows: run.total_rows,
      successRows: run.success_rows,
      errorRows: run.error_rows,
      errorS3Key: run.error_s3_key,
      errorFileUrl,
      errors,
      preview,
      createdAt: run.created_at,
      finishedAt: run.finished_at,
    };
  }

  /**
   * 13 §12.2 POST /products/import/:id/confirm
   * Initiates confirmation transition and sets status to running
   */
  async confirmImport(
    businessId: string,
    id: string,
    mode?: ImportMode,
  ): Promise<ImportRunResponseDto> {
    const run = await this.prisma.catalogImportRun.findFirst({
      where: {
        id,
        business_id: businessId,
      },
    });

    if (!run) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Import run not found",
        },
      });
    }

    if (run.status === "succeeded") {
      return this.getImportRun(businessId, id);
    }

    if (run.status === "running") {
      throw new ConflictException({
        error: {
          code: "conflict",
          message: "Import run is currently executing",
        },
      });
    }

    if (run.status === "failed") {
      throw new BadRequestException({
        error: {
          code: "bad_request",
          message: "Cannot confirm an import run that failed validation",
        },
      });
    }

    if (mode) {
      try {
        await uploadFile(`imports/${businessId}/${run.id}-meta.json`, JSON.stringify({ mode }), {
          contentType: "application/json",
        });
      } catch (err) {
        logger.warn({ err, runId: run.id }, "Could not persist import run metadata to S3");
      }
    }

    const effectiveMode = mode ?? (await this.getRunMode(businessId, id));

    // Set status to running
    const updated = await this.prisma.catalogImportRun.update({
      where: { id: run.id },
      data: { status: "running" },
    });

    return {
      id: updated.id,
      jobId: updated.id,
      businessId: updated.business_id,
      status: updated.status,
      mode: effectiveMode,
      totalRows: updated.total_rows,
      successRows: updated.success_rows,
      errorRows: updated.error_rows,
      errorS3Key: updated.error_s3_key,
      createdAt: updated.created_at,
      finishedAt: updated.finished_at,
    };
  }

  /**
   * Worker/Service execution for chunked transactional SKU upsert
   */
  async processConfirmRun(
    businessId: string,
    runId: string,
    inlineCsvContent?: string,
    overrideMode?: ImportMode,
  ): Promise<ImportRunResponseDto> {
    const run = await this.prisma.catalogImportRun.findFirst({
      where: { id: runId, business_id: businessId },
    });

    if (!run) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Import run not found" },
      });
    }

    try {
      const effectiveMode: ImportMode = overrideMode ?? (await this.getRunMode(businessId, runId));

      let csvContent = inlineCsvContent || "";
      if (!csvContent) {
        try {
          const buffer = await downloadFileAsBuffer(run.s3_key);
          csvContent = buffer.toString("utf-8");
        } catch (err) {
          logger.error({ err, s3Key: run.s3_key }, "Failed to read CSV from storage");
        }
      }
      const parsed = csvContent ? this.parseAndValidateCsv(csvContent) : null;
      const validItems = parsed?.validItems ?? [];

      if (validItems.length === 0 && effectiveMode === "replace") {
        throw new BadRequestException({
          error: {
            code: "bad_request",
            message: "Cannot confirm import: no valid items found in CSV data to replace catalog",
          },
        });
      }

      // Set to track created products in this run to avoid duplicate is_default variants
      const productHasDefaultMap = new Set<string>();

      // In replace mode, retrieve all existing products for this business before import
      const existingProducts =
        effectiveMode === "replace"
          ? await this.prisma.product.findMany({
              where: { business_id: businessId },
              include: { variants: true },
            })
          : [];
      const touchedProductIds = new Set<string>();

      // Process SKU upsert in transactional chunks (CHUNK_SIZE = 50)
      for (let i = 0; i < validItems.length; i += CHUNK_SIZE) {
        const chunk = validItems.slice(i, i + CHUNK_SIZE);

        await this.prisma.$transaction(async (tx) => {
          for (const item of chunk) {
            let categoryId: string | null = null;
            if (item.category) {
              let cat = await tx.productCategory.findFirst({
                where: {
                  business_id: businessId,
                  name: item.category,
                },
              });
              cat ??= await tx.productCategory.create({
                data: {
                  business_id: businessId,
                  name: item.category,
                },
              });
              categoryId = cat.id;
            }

            let existingVariant: VariantWithProduct | null = null;
            if (item.sku) {
              existingVariant = await tx.productVariant.findFirst({
                where: {
                  business_id: businessId,
                  sku: item.sku,
                },
                include: { product: true },
              });
            }

            if (existingVariant) {
              // Idempotent update by SKU (FR-CAT-026)
              await tx.productVariant.update({
                where: { id: existingVariant.id },
                data: {
                  price: item.price,
                  discount_price: item.discountPrice,
                  stock: item.stock,
                  barcode: item.barcode ?? existingVariant.barcode,
                  attributes: item.attributes,
                },
              });

              await tx.product.update({
                where: { id: existingVariant.product_id },
                data: {
                  status: ProductStatus.active,
                  ...(item.description || categoryId
                    ? {
                        category_id: categoryId ?? existingVariant.product.category_id,
                        description: item.description ?? existingVariant.product.description,
                      }
                    : {}),
                },
              });

              touchedProductIds.add(existingVariant.product_id);

              if (item.imageUrl) {
                const existingImage = await tx.productImage.findFirst({
                  where: {
                    business_id: businessId,
                    variant_id: existingVariant.id,
                    url: item.imageUrl,
                  },
                });
                if (!existingImage) {
                  await tx.productImage.create({
                    data: {
                      business_id: businessId,
                      product_id: existingVariant.product_id,
                      variant_id: existingVariant.id,
                      s3_key: item.imageUrl,
                      url: item.imageUrl,
                      is_primary: false,
                      sort_order: 0,
                    },
                  });
                }
              }
            } else {
              // Find existing product by title or create new
              let product = await tx.product.findFirst({
                where: {
                  business_id: businessId,
                  name: item.title,
                },
                include: { variants: true },
              });

              if (!product) {
                product = await tx.product.create({
                  data: {
                    business_id: businessId,
                    name: item.title,
                    category_id: categoryId,
                    description: item.description,
                    status: ProductStatus.active,
                    currency: "TND",
                  },
                  include: { variants: true },
                });
              }

              if (product) {
                if (product.id) {
                  touchedProductIds.add(product.id);
                  await tx.product.update({
                    where: { id: product.id },
                    data: {
                      status: ProductStatus.active,
                      ...(categoryId ? { category_id: categoryId } : {}),
                      ...(item.description ? { description: item.description } : {}),
                    },
                  });
                }

                // Update existing default variant if no SKU was provided to avoid duplicate variants on re-import
                let variantId: string | null = null;
                const variantsList = product.variants ?? [];
                if (!item.sku && variantsList.length > 0) {
                  const defaultVar = variantsList.find((v) => v.is_default) ?? variantsList[0];
                  if (defaultVar) {
                    const updatedVar = await tx.productVariant.update({
                      where: { id: defaultVar.id },
                      data: {
                        price: item.price,
                        discount_price: item.discountPrice ?? null,
                        stock: item.stock,
                        barcode: item.barcode ?? defaultVar.barcode,
                        attributes: item.attributes,
                      },
                    });
                    variantId = updatedVar?.id ?? defaultVar.id;
                  }
                }

                if (!variantId) {
                  const hasExistingVariants =
                    variantsList.length > 0 ||
                    (product.id ? productHasDefaultMap.has(product.id) : false);
                  const isDefaultVariant = !hasExistingVariants;
                  if (isDefaultVariant && product.id) {
                    productHasDefaultMap.add(product.id);
                  }

                  const createdVar = await tx.productVariant.create({
                    data: {
                      business_id: businessId,
                      product_id: product.id,
                      sku: item.sku ?? null,
                      barcode: item.barcode ?? null,
                      price: item.price,
                      discount_price: item.discountPrice ?? null,
                      stock: item.stock,
                      attributes: item.attributes,
                      is_default: isDefaultVariant,
                    },
                  });
                  variantId = createdVar?.id ?? null;
                }

                if (item.imageUrl && variantId) {
                  await tx.productImage.create({
                    data: {
                      business_id: businessId,
                      product_id: product.id,
                      variant_id: variantId,
                      s3_key: item.imageUrl,
                      url: item.imageUrl,
                      is_primary: true,
                      sort_order: 0,
                    },
                  });
                }
              }
            }
          }
        });
      }

      // Handle replace mode: remove or archive products not in the new CSV
      if (effectiveMode === "replace") {
        const untouchedProducts = existingProducts.filter((p) => !touchedProductIds.has(p.id));

        for (const oldProd of untouchedProducts) {
          const oldVarIds = oldProd.variants.map((v) => v.id);
          let hasOrders = false;
          if (
            oldVarIds.length > 0 &&
            "orderItem" in this.prisma &&
            typeof (this.prisma as unknown as { orderItem?: { count: unknown } }).orderItem
              ?.count === "function"
          ) {
            try {
              const orderCount = await (
                this.prisma as unknown as {
                  orderItem: { count: (arg: unknown) => Promise<number> };
                }
              ).orderItem.count({
                where: {
                  business_id: businessId,
                  variant_id: { in: oldVarIds },
                },
              });
              hasOrders = orderCount > 0;
            } catch {
              hasOrders = false;
            }
          }

          if (hasOrders) {
            // Archive product safely (FR-CAT-012)
            await this.prisma.product.update({
              where: {
                id_business_id: {
                  id: oldProd.id,
                  business_id: businessId,
                },
              },
              data: { status: ProductStatus.archived },
            });
          } else {
            // Hard delete product and cascade relations
            await this.prisma.$transaction(async (tx) => {
              await tx.productImage.deleteMany({
                where: { product_id: oldProd.id, business_id: businessId },
              });
              if (oldVarIds.length > 0) {
                await tx.stockReservation.deleteMany({
                  where: { variant_id: { in: oldVarIds }, business_id: businessId },
                });
                await tx.productVariant.deleteMany({
                  where: { product_id: oldProd.id, business_id: businessId },
                });
              }
              await tx.product.delete({
                where: {
                  id_business_id: {
                    id: oldProd.id,
                    business_id: businessId,
                  },
                },
              });
            });
          }

          if (this.indexerService) {
            void this.indexerService.publishProductUpdated({
              businessId,
              productId: oldProd.id,
              mutationType: "deleted",
            });
          }
        }
      }

      // Re-index touched products
      if (this.indexerService) {
        for (const pid of touchedProductIds) {
          void this.indexerService.publishProductUpdated({
            businessId,
            productId: pid,
            mutationType: "updated",
          });
        }
      }

      // Mark onboarding step complete (FR-CAT-025)
      try {
        await this.prisma.businessOnboarding.updateMany({
          where: { business_id: businessId },
          data: { products_imported: true },
        });
      } catch {
        // Non-fatal if onboarding update fails
      }

      const finishedAt = new Date();
      const updatedRun = await this.prisma.catalogImportRun.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          total_rows: parsed?.totalRows ?? run.total_rows,
          success_rows: parsed?.successRows ?? run.success_rows,
          error_rows: parsed?.errorRows ?? run.error_rows,
          finished_at: finishedAt,
        },
      });

      return {
        id: updatedRun.id,
        jobId: updatedRun.id,
        businessId: updatedRun.business_id,
        status: updatedRun.status,
        mode: effectiveMode,
        totalRows: updatedRun.total_rows,
        successRows: updatedRun.success_rows,
        errorRows: updatedRun.error_rows,
        createdAt: updatedRun.created_at,
        finishedAt: updatedRun.finished_at,
      };
    } catch (err) {
      logger.error({ err, runId: run.id }, "Import run execution failed");
      await this.prisma.catalogImportRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          finished_at: new Date(),
        },
      });
      throw err;
    }
  }

  /**
   * Escape a field for CSV export according to RFC 4180
   */
  private escapeCsvField(val: unknown): string {
    if (val === null || val === undefined) return "";
    const str =
      typeof val === "object"
        ? JSON.stringify(val)
        : typeof val === "string"
          ? val
          : typeof val === "number" || typeof val === "boolean"
            ? String(val)
            : "";
    if (str.includes(",") || str.includes("\n") || str.includes("\r") || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * 13 §12.2 GET /products/export
   * Generates CSV export matching active catalog products and variants
   */
  async exportProductsCsv(businessId: string): Promise<string> {
    const products = await this.prisma.product.findMany({
      where: {
        business_id: businessId,
        status: ProductStatus.active,
      },
      include: {
        category: true,
        variants: {
          include: {
            stock_reservations: {
              where: {
                status: "active",
                expires_at: { gt: new Date() },
              },
            },
          },
          orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
        },
        images: {
          orderBy: { sort_order: "asc" },
        },
      },
      orderBy: { created_at: "desc" },
    });

    const headers = [
      "name",
      "category",
      "sku",
      "barcode",
      "price",
      "discount_price",
      "stock",
      "available_stock",
      "options",
      "description",
      "image_url",
      "status",
    ];

    const lines: string[] = [headers.join(",")];

    for (const product of products) {
      const primaryImage = product.images.find((img) => img.is_primary) ?? product.images[0];
      const categoryName = product.category?.name ?? "";

      if (product.variants.length === 0) {
        lines.push(
          [
            this.escapeCsvField(product.name),
            this.escapeCsvField(categoryName),
            "",
            "",
            "0",
            "",
            "0",
            "0",
            "{}",
            this.escapeCsvField(product.description),
            this.escapeCsvField(primaryImage?.url ?? ""),
            this.escapeCsvField(product.status),
          ].join(","),
        );
      } else {
        for (const variant of product.variants) {
          const reservedCount = variant.stock_reservations.reduce(
            (acc, res) => acc + res.quantity,
            0,
          );
          const availableStock = Math.max(0, variant.stock - reservedCount);

          lines.push(
            [
              this.escapeCsvField(product.name),
              this.escapeCsvField(categoryName),
              this.escapeCsvField(variant.sku),
              this.escapeCsvField(variant.barcode),
              this.escapeCsvField(variant.price.toString()),
              this.escapeCsvField(variant.discount_price ? variant.discount_price.toString() : ""),
              this.escapeCsvField(variant.stock),
              this.escapeCsvField(availableStock),
              this.escapeCsvField(variant.attributes),
              this.escapeCsvField(product.description),
              this.escapeCsvField(primaryImage?.url ?? ""),
              this.escapeCsvField(product.status),
            ].join(","),
          );
        }
      }
    }

    return lines.join("\n") + "\n";
  }
}
