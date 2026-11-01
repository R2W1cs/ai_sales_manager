import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ImportStatus, ProductStatus, type PrismaClient } from "@prisma/client";

import type { HttpReply } from "../../platform/core/http";

const storageMap = new Map<string, Buffer>();

jest.mock("../../lib/storage.js", () => ({
  s3Client: {},
  uploadFile: jest.fn().mockImplementation((key: string, body: unknown) => {
    storageMap.set(key, Buffer.from(typeof body === "string" ? body : ""));
    return Promise.resolve({ key });
  }),
  downloadFileAsBuffer: jest.fn().mockImplementation((key: string) => {
    if (storageMap.has(key)) {
      return Promise.resolve(storageMap.get(key) ?? Buffer.from(""));
    }
    const last = Array.from(storageMap.values()).pop();
    return Promise.resolve(last ?? Buffer.from(""));
  }),
  getUploadUrl: jest.fn().mockResolvedValue("https://s3.example.com/upload"),
  getDownloadUrl: jest.fn().mockResolvedValue("https://s3.example.com/download"),
  getPublicUrl: jest.fn().mockImplementation((key: string) => `https://s3.example.com/${key}`),
  deleteFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../lib/queue.js", () => ({
  connection: {},
}));

import { PERMISSIONS_KEY } from "../../platform/security/permissions";
import { CsvImportController } from "./csv-import.controller";
import { CsvImportProcessor } from "./csv-import.processor";
import { CsvImportService } from "./csv-import.service";

interface MockPrisma {
  catalogImportRun: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  product: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  productCategory: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  productVariant: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
  productImage: {
    findFirst: jest.Mock;
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
  stockReservation: {
    deleteMany: jest.Mock;
  };
  orderItem: {
    count: jest.Mock;
  };
  businessOnboarding: {
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

describe("Catalog CSV bulk import/export worker & API (`/products/import`, `/products/export`) (T-CAT-03)", () => {
  let controller: CsvImportController;
  let service: CsvImportService;
  let processor: CsvImportProcessor;
  let prismaMock: MockPrisma;

  const businessId = "11111111-1111-4111-a111-111111111111";
  const otherBusinessId = "99999999-9999-4999-a999-999999999999";
  const userId = "22222222-2222-4222-a222-222222222222";
  const runId = "33333333-3333-4333-a333-333333333333";

  beforeEach(() => {
    prismaMock = {
      catalogImportRun: {
        findFirst: jest
          .fn()
          .mockImplementation(
            ({
              where,
            }: {
              where?: { id?: string; business_id?: string; status?: ImportStatus };
            }) => {
              if (where?.business_id && where.business_id !== businessId) {
                return Promise.resolve(null);
              }
              return Promise.resolve({
                id: where?.id ?? runId,
                business_id: where?.business_id ?? businessId,
                uploaded_by_user_id: userId,
                s3_key: "imports/test.csv",
                status: where?.status ?? ImportStatus.validated,
                total_rows: 1,
                success_rows: 1,
                error_rows: 0,
                error_s3_key: null,
                created_at: new Date(),
                finished_at: null,
              });
            },
          ),
        findMany: jest.fn(),
        create: jest.fn().mockImplementation(
          ({
            data,
          }: {
            data: {
              business_id: string;
              uploaded_by_user_id: string;
              s3_key: string;
              status?: ImportStatus;
            };
          }) =>
            Promise.resolve({
              id: runId,
              business_id: data.business_id,
              uploaded_by_user_id: data.uploaded_by_user_id,
              s3_key: data.s3_key,
              status: data.status ?? ImportStatus.uploaded,
              total_rows: null,
              success_rows: null,
              error_rows: null,
              error_s3_key: null,
              created_at: new Date(),
              finished_at: null,
            }),
        ),
        update: jest.fn().mockImplementation(
          ({
            data,
          }: {
            where: { id: string };
            data: {
              status?: ImportStatus;
              total_rows?: number;
              success_rows?: number;
              error_rows?: number;
              error_s3_key?: string | null;
              finished_at?: Date | null;
            };
          }) =>
            Promise.resolve({
              id: runId,
              business_id: businessId,
              uploaded_by_user_id: userId,
              s3_key: "imports/test.csv",
              status: data.status ?? ImportStatus.validated,
              total_rows: data.total_rows ?? 1,
              success_rows: data.success_rows ?? 1,
              error_rows: data.error_rows ?? 0,
              error_s3_key: data.error_s3_key ?? null,
              created_at: new Date(),
              finished_at: data.finished_at ?? null,
            }),
        ),
        delete: jest.fn(),
      },
      product: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockResolvedValue({ id: "prod-mock", name: "Mock Product", variants: [] }),
        update: jest.fn().mockResolvedValue({ id: "prod-mock", name: "Mock Product" }),
        delete: jest.fn().mockResolvedValue({}),
      },
      productCategory: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      productVariant: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: "var-mock" }),
        update: jest.fn().mockResolvedValue({ id: "var-mock" }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productImage: {
        findFirst: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      stockReservation: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderItem: {
        count: jest.fn().mockResolvedValue(0),
      },
      businessOnboarding: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(prismaMock)),
    };

    service = new CsvImportService(prismaMock as unknown as PrismaClient);
    processor = new CsvImportProcessor(service);
    controller = new CsvImportController(service, processor);
  });

  describe("1. Template Endpoint", () => {
    it("Template: Returns valid CSV template headers.", () => {
      const template = service.getTemplate();
      expect(template.headers).toContain("name");
      expect(template.headers).toContain("category");
      expect(template.headers).toContain("sku");
      expect(template.headers).toContain("price");
      expect(template.headers).toContain("stock");
      expect(template.headers).toContain("description");
      expect(template.headers).toContain("options");
      expect(template.headers).toContain("image_url");

      const lines = template.csv.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(2); // Header + sample row
      expect(lines[0]).toContain("name,category,sku");
    });

    it("Controller getTemplate returns the CSV body for Nest to serialise", () => {
      // Content-Type / Content-Disposition are declared with @Header, so the
      // adapter applies them; the handler only owns the body.
      expect(controller.getTemplate()).toContain("name,category,sku");
    });
  });

  describe("2. Row Validation", () => {
    it("Row Validation: Invalid rows report exact error messages and line numbers.", () => {
      const invalidCsv = [
        "name,category,sku,price,discount_price,stock,options",
        ",Clothing,SKU-1,10.00,,5,{}", // Row 2: Missing title
        "T-Shirt,Clothing,SKU-2,-5.00,,5,{}", // Row 3: Negative price
        "Jeans,Clothing,SKU-3,abc,,5,{}", // Row 4: Non-numeric price
        "Hat,Clothing,SKU-4,20.00,25.00,5,{}", // Row 5: Discount >= regular price
        "Shoes,Clothing,SKU-5,50.00,40.00,-2,{}", // Row 6: Negative stock
        "Belt,Clothing,SKU-6,15.00,10.00,3.5,{}", // Row 7: Non-integer stock
        'Watch,Accessories,SKU-7,100.00,,10,"{invalid json}"', // Row 8: Malformed options
        "Valid Item,Clothing,SKU-8,30.00,25.00,10,{}", // Row 9: Fully valid
      ].join("\n");

      const result = service.parseAndValidateCsv(invalidCsv);

      expect(result.totalRows).toBe(8);
      expect(result.successRows).toBe(1);
      expect(result.errorRows).toBe(7);
      expect(result.validItems).toHaveLength(1);
      expect(result.validItems[0]?.title).toBe("Valid Item");
      expect(result.validItems[0]?.price).toBe(30);
      expect(result.validItems[0]?.discountPrice).toBe(25);
      expect(result.validItems[0]?.stock).toBe(10);

      // Verify specific line number errors
      const errorMap = new Map(result.errors.map((e) => [e.row, e]));

      expect(errorMap.get(2)?.column).toBe("title");
      expect(errorMap.get(2)?.message).toContain("title");

      expect(errorMap.get(3)?.column).toBe("price");
      expect(errorMap.get(4)?.column).toBe("price");

      expect(errorMap.get(5)?.column).toBe("discount_price");
      expect(errorMap.get(5)?.message).toContain("less than regular price");

      expect(errorMap.get(6)?.column).toBe("stock");
      expect(errorMap.get(7)?.column).toBe("stock");

      expect(errorMap.get(8)?.column).toBe("options");
    });

    it("Parses options in key:value or JSON format", () => {
      const csv = [
        "name,price,options",
        'Item A,10,"{""color"":""red"",""size"":""XL""}"',
        "Item B,20,color:blue;size:M",
      ].join("\n");

      const result = service.parseAndValidateCsv(csv);
      expect(result.successRows).toBe(2);
      expect(result.validItems[0]?.attributes).toEqual({ color: "red", size: "XL" });
      expect(result.validItems[1]?.attributes).toEqual({ color: "blue", size: "M" });
    });

    it("Parses semicolon-delimited CSVs exported from Excel", () => {
      const csv = [
        "nom;prix;stock;categorie;sku",
        "Chemise Oxford;49,900;15;Vêtements;CHEM-OX-01",
        "Pantalon Chino;79,500;8;Vêtements;PANT-CH-02",
      ].join("\n");

      const result = service.parseAndValidateCsv(csv);
      expect(result.errors).toHaveLength(0);
      expect(result.successRows).toBe(2);
      expect(result.validItems[0]?.title).toBe("Chemise Oxford");
      expect(result.validItems[0]?.price).toBe(49.9);
      expect(result.validItems[0]?.stock).toBe(15);
      expect(result.validItems[0]?.category).toBe("Vêtements");
      expect(result.validItems[0]?.sku).toBe("CHEM-OX-01");
    });

    it("Parses French headers with dedicated taille and couleur columns", () => {
      const csv = [
        "nom,description,prix,stock,taille,couleur,sku",
        "Chemise Oxford Slim,Chemise en coton d'Égypte premium,89.0 DT,15,M,Blanc,SHIRT-OX-WHT-M",
        'Robe Soie Fleurie,Robe longue d\'été imprimé floral,"145,000 DT",8,S,Bleu,DRS-SLK-BLU-S',
      ].join("\n");

      const result = service.parseAndValidateCsv(csv);
      expect(result.errors).toHaveLength(0);
      expect(result.successRows).toBe(2);
      expect(result.validItems[0]?.title).toBe("Chemise Oxford Slim");
      expect(result.validItems[0]?.price).toBe(89);
      expect(result.validItems[0]?.attributes).toEqual({ size: "M", color: "Blanc" });
      expect(result.validItems[1]?.title).toBe("Robe Soie Fleurie");
      expect(result.validItems[1]?.price).toBe(145);
      expect(result.validItems[1]?.attributes).toEqual({ size: "S", color: "Bleu" });
    });

    it("Parses Arabic headers accurately", () => {
      const csv = [
        "اسم,سعر,مخزون,صنف,رمز",
        "قميص كتان,35.500,20,ملابس,QMS-01",
        "حذاء رياضي,89,10,أحذية,SHOE-01",
      ].join("\n");

      const result = service.parseAndValidateCsv(csv);
      expect(result.errors).toHaveLength(0);
      expect(result.successRows).toBe(2);
      expect(result.validItems[0]?.title).toBe("قميص كتان");
      expect(result.validItems[0]?.price).toBe(35.5);
      expect(result.validItems[0]?.stock).toBe(20);
      expect(result.validItems[0]?.category).toBe("ملابس");
      expect(result.validItems[0]?.sku).toBe("QMS-01");
    });
  });

  describe("3. Two-Phase Commit Guard & Import Creation", () => {
    it("POST /products/import creates run in uploaded status and writes ZERO catalog records (13 §12.2)", async () => {
      const csv = ["name,category,sku,price,stock", "Polo Shirt,Clothing,POLO-1,45.00,20"].join(
        "\n",
      );

      const response = await controller.uploadImport(
        businessId,
        { id: userId, sub: userId },
        { csv },
      );

      expect(response.id).toBe(runId);
      expect(response.status).toBe("uploaded");

      // Invariant check: ZERO writes to product, productVariant, productCategory
      expect(prismaMock.product.create).not.toHaveBeenCalled();
      expect(prismaMock.productVariant.create).not.toHaveBeenCalled();
      expect(prismaMock.productCategory.create).not.toHaveBeenCalled();
    });

    it("processValidateRun executes validation pipeline and stores error report", async () => {
      const csv = ["name,category,sku,price,stock", "Polo Shirt,Clothing,POLO-1,45.00,20"].join(
        "\n",
      );

      const result = await service.processValidateRun(businessId, runId, csv);
      expect(result.status).toBe("validated");
      expect(result.totalRows).toBe(1);
      expect(result.successRows).toBe(1);
      expect(result.errorRows).toBe(0);
    });

    it("GET /products/import/:id returns 404 if run belongs to another business", async () => {
      prismaMock.catalogImportRun.findFirst.mockResolvedValue(null);

      await expect(controller.getImportRun(otherBusinessId, runId)).rejects.toThrow(
        NotFoundException,
      );

      expect(prismaMock.catalogImportRun.findFirst).toHaveBeenCalledWith({
        where: {
          id: runId,
          business_id: otherBusinessId,
        },
      });
    });
  });

  describe("4. Confirmed Import & SKU Upsert", () => {
    it("POST /products/import/:id/confirm sets status to running and returns 202 Accepted", async () => {
      prismaMock.catalogImportRun.findFirst.mockResolvedValue({
        id: runId,
        business_id: businessId,
        uploaded_by_user_id: userId,
        s3_key: "imports/test.csv",
        status: ImportStatus.validated,
        total_rows: 1,
        success_rows: 1,
        error_rows: 0,
        error_s3_key: null,
        created_at: new Date(),
        finished_at: null,
      });

      const confirmResult = await controller.confirmImport(
        businessId,
        { id: userId, sub: userId },
        runId,
      );

      expect(confirmResult.status).toBe("running");
      expect(prismaMock.catalogImportRun.update).toHaveBeenCalledWith({
        where: { id: runId },
        data: { status: "running" },
      });
    });

    it("processConfirmRun creates products, categories, variants, and images in DB", async () => {
      const validCsv = [
        "name,category,sku,barcode,price,discount_price,stock,description,options,image_url",
        'Smart Watch,Electronics,WATCH-BLK-01,12345678,199.99,149.99,50,High tech watch,"{""color"":""Black""}",https://example.com/watch.jpg',
      ].join("\n");

      await service.createImportRun(businessId, userId, { csv: validCsv });

      prismaMock.catalogImportRun.findFirst.mockResolvedValue({
        id: runId,
        business_id: businessId,
        uploaded_by_user_id: userId,
        s3_key: "imports/test.csv",
        status: ImportStatus.validated,
        total_rows: 1,
        success_rows: 1,
        error_rows: 0,
        error_s3_key: null,
        created_at: new Date(),
        finished_at: null,
      });

      prismaMock.productCategory.findFirst.mockResolvedValue(null);
      prismaMock.productCategory.create.mockResolvedValue({
        id: "cat-1",
        business_id: businessId,
        name: "Electronics",
      });

      prismaMock.productVariant.findFirst.mockResolvedValue(null);
      prismaMock.product.findFirst.mockResolvedValue(null);

      prismaMock.product.create.mockResolvedValue({
        id: "prod-1",
        business_id: businessId,
        name: "Smart Watch",
        category_id: "cat-1",
        variants: [],
      });

      prismaMock.productVariant.create.mockResolvedValue({
        id: "var-1",
        business_id: businessId,
        product_id: "prod-1",
        sku: "WATCH-BLK-01",
        price: 199.99,
        discount_price: 149.99,
        stock: 50,
        is_default: true,
      });

      prismaMock.productImage.create.mockResolvedValue({
        id: "img-1",
        business_id: businessId,
        product_id: "prod-1",
        url: "https://example.com/watch.jpg",
      });

      const confirmResult = await service.processConfirmRun(businessId, runId);

      expect(confirmResult.status).toBe("succeeded");
      expect(prismaMock.productCategory.create).toHaveBeenCalledWith({
        data: {
          business_id: businessId,
          name: "Electronics",
        },
      });
      expect(prismaMock.product.create).toHaveBeenCalled();
      expect(prismaMock.productVariant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          business_id: businessId,
          sku: "WATCH-BLK-01",
          price: 199.99,
          discount_price: 149.99,
          stock: 50,
          is_default: true,
        }),
      });
      expect(prismaMock.productImage.create).toHaveBeenCalled();
      expect(prismaMock.businessOnboarding.updateMany).toHaveBeenCalledWith({
        where: { business_id: businessId },
        data: { products_imported: true },
      });
    });

    it("Idempotent SKU Upsert (FR-CAT-026): updates existing variant and upserts image if SKU exists", async () => {
      const csv = [
        "name,sku,price,stock,image_url",
        "Updated Watch,WATCH-BLK-01,179.99,75,https://example.com/updated-watch.jpg",
      ].join("\n");

      await service.createImportRun(businessId, userId, { csv });

      prismaMock.catalogImportRun.findFirst.mockResolvedValue({
        id: runId,
        business_id: businessId,
        status: ImportStatus.validated,
        total_rows: 1,
        success_rows: 1,
        error_rows: 0,
      });

      // Existing variant found by SKU
      prismaMock.productVariant.findFirst.mockResolvedValue({
        id: "var-existing",
        business_id: businessId,
        product_id: "prod-existing",
        sku: "WATCH-BLK-01",
        price: 199.99,
        stock: 50,
        product: { id: "prod-existing", business_id: businessId },
      });

      prismaMock.productImage.findFirst.mockResolvedValue(null);

      await service.processConfirmRun(businessId, runId);

      // Verify update instead of create for existing SKU
      expect(prismaMock.productVariant.update).toHaveBeenCalledWith({
        where: { id: "var-existing" },
        data: expect.objectContaining({
          price: 179.99,
          stock: 75,
        }),
      });
      expect(prismaMock.productVariant.create).not.toHaveBeenCalled();
      expect(prismaMock.productImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          business_id: businessId,
          variant_id: "var-existing",
          url: "https://example.com/updated-watch.jpg",
        }),
      });
    });

    it("Cannot confirm run that failed validation (throws BadRequestException)", async () => {
      prismaMock.catalogImportRun.findFirst.mockResolvedValue({
        id: runId,
        business_id: businessId,
        status: ImportStatus.failed,
      });

      await expect(
        controller.confirmImport(businessId, { id: userId, sub: userId }, runId),
      ).rejects.toThrow(BadRequestException);
    });

    it("Throws ConflictException if run is already running", async () => {
      prismaMock.catalogImportRun.findFirst.mockResolvedValue({
        id: runId,
        business_id: businessId,
        status: ImportStatus.running,
      });

      await expect(
        controller.confirmImport(businessId, { id: userId, sub: userId }, runId),
      ).rejects.toThrow(ConflictException);
    });

    it("processConfirmRun in 'replace' mode archives products with orders and deletes untouched products", async () => {
      const validCsv = [
        "name,category,sku,price,stock",
        "New Item,Electronics,SKU-NEW-01,99.99,10",
      ].join("\n");

      prismaMock.catalogImportRun.findFirst.mockResolvedValue({
        id: runId,
        business_id: businessId,
        uploaded_by_user_id: userId,
        s3_key: "imports/test.csv",
        status: ImportStatus.validated,
        total_rows: 1,
        success_rows: 1,
        error_rows: 0,
        error_s3_key: null,
        created_at: new Date(),
        finished_at: null,
      });

      const existingProductWithOrders = {
        id: "prod-ordered",
        business_id: businessId,
        name: "Old Ordered Product",
        variants: [{ id: "var-ordered", sku: "SKU-ORDERED" }],
      };
      const existingProductNoOrders = {
        id: "prod-unreferenced",
        business_id: businessId,
        name: "Old Unreferenced Product",
        variants: [{ id: "var-unreferenced", sku: "SKU-UNREF" }],
      };

      prismaMock.product.findMany.mockResolvedValue([
        existingProductWithOrders,
        existingProductNoOrders,
      ]);

      prismaMock.orderItem.count.mockImplementation(
        ({ where }: { where: { variant_id: { in: string[] } } }) => {
          if (where.variant_id.in.includes("var-ordered")) {
            return Promise.resolve(1);
          }
          return Promise.resolve(0);
        },
      );

      prismaMock.productCategory.findFirst.mockResolvedValue({ id: "cat-1", name: "Electronics" });
      prismaMock.productVariant.findFirst.mockResolvedValue(null);
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.product.create.mockResolvedValue({
        id: "prod-new",
        business_id: businessId,
        name: "New Item",
        variants: [],
      });
      prismaMock.productVariant.create.mockResolvedValue({
        id: "var-new",
        product_id: "prod-new",
        sku: "SKU-NEW-01",
      });

      const result = await service.processConfirmRun(businessId, runId, validCsv, "replace");

      expect(result.status).toBe("succeeded");
      expect(result.mode).toBe("replace");

      // Product with orders should be archived
      expect(prismaMock.product.update).toHaveBeenCalledWith({
        where: {
          id_business_id: {
            id: "prod-ordered",
            business_id: businessId,
          },
        },
        data: { status: ProductStatus.archived },
      });

      // Product without orders should be deleted
      expect(prismaMock.product.delete).toHaveBeenCalledWith({
        where: {
          id_business_id: {
            id: "prod-unreferenced",
            business_id: businessId,
          },
        },
      });
    });

    it("processConfirmRun in 'merge' mode preserves untouched existing products", async () => {
      const validCsv = [
        "name,category,sku,price,stock",
        "New Item,Electronics,SKU-NEW-01,99.99,10",
      ].join("\n");

      prismaMock.catalogImportRun.findFirst.mockResolvedValue({
        id: runId,
        business_id: businessId,
        uploaded_by_user_id: userId,
        s3_key: "imports/test.csv",
        status: ImportStatus.validated,
        total_rows: 1,
        success_rows: 1,
        error_rows: 0,
        error_s3_key: null,
        created_at: new Date(),
        finished_at: null,
      });

      prismaMock.productCategory.findFirst.mockResolvedValue({ id: "cat-1", name: "Electronics" });
      prismaMock.productVariant.findFirst.mockResolvedValue(null);
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.product.create.mockResolvedValue({
        id: "prod-new",
        business_id: businessId,
        name: "New Item",
        variants: [],
      });
      prismaMock.productVariant.create.mockResolvedValue({
        id: "var-new",
        product_id: "prod-new",
        sku: "SKU-NEW-01",
      });

      const result = await service.processConfirmRun(businessId, runId, validCsv, "merge");

      expect(result.status).toBe("succeeded");
      expect(result.mode).toBe("merge");
      expect(prismaMock.product.delete).not.toHaveBeenCalled();
    });
  });

  describe("5. Export Endpoint", () => {
    it("Export: Generates valid CSV matching full catalog.", async () => {
      prismaMock.product.findMany.mockResolvedValue([
        {
          id: "prod-1",
          business_id: businessId,
          name: "Leather Jacket",
          description: "Genuine leather jacket",
          status: ProductStatus.active,
          category: { name: "Apparel" },
          variants: [
            {
              id: "var-1",
              sku: "LJ-BLK-L",
              barcode: "987654321",
              price: 249.99,
              discount_price: 199.99,
              stock: 15,
              attributes: { size: "L", color: "Black" },
              is_default: true,
              stock_reservations: [{ quantity: 2, status: "active" }],
            },
          ],
          images: [{ url: "https://example.com/jacket.jpg", is_primary: true, sort_order: 0 }],
        },
      ]);

      const headerMock = jest.fn().mockReturnThis();
      const mockRes = { header: headerMock } as unknown as HttpReply;

      const csv = await controller.exportCatalog(businessId, mockRes);

      // Only the per-tenant filename is set imperatively; Content-Type is a
      // declared @Header applied by the adapter.
      expect(headerMock).toHaveBeenCalledWith(
        "Content-Disposition",
        `attachment; filename="catalog-export-${businessId}.csv"`,
      );

      expect(csv).toEqual(
        expect.stringContaining(
          "name,category,sku,barcode,price,discount_price,stock,available_stock",
        ),
      );
      expect(csv).toEqual(expect.stringContaining("Leather Jacket"));
      expect(csv).toEqual(expect.stringContaining("LJ-BLK-L"));
      // available stock = 15 - 2 = 13
      expect(csv).toEqual(expect.stringContaining(",13,"));
    });
  });

  describe("6. RBAC Permissions Guard", () => {
    it("uploadImport and confirmImport endpoints require catalog.write permission", () => {
      const uploadHandler = Reflect.get(CsvImportController.prototype, "uploadImport") as object;
      const uploadPerms = Reflect.getMetadata(PERMISSIONS_KEY, uploadHandler) as string[];
      expect(uploadPerms).toEqual(["catalog.write"]);

      const confirmHandler = Reflect.get(CsvImportController.prototype, "confirmImport") as object;
      const confirmPerms = Reflect.getMetadata(PERMISSIONS_KEY, confirmHandler) as string[];
      expect(confirmPerms).toEqual(["catalog.write"]);
    });
  });
});
