import type { ExecutionContext } from "@nestjs/common";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Prisma, type PrismaClient, ProductStatus } from "@prisma/client";

jest.mock("../../lib/storage", () => ({
  s3Client: {},
  getUploadUrl: jest
    .fn()
    .mockImplementation((key: string) =>
      Promise.resolve(`https://s3.example.com/presigned-upload/${key}`),
    ),
  getPublicUrl: jest.fn().mockImplementation((key: string) => `https://s3.example.com/${key}`),
  deleteFile: jest.fn().mockResolvedValue(undefined),
}));

import * as crypto from "node:crypto";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { TenantGuard } from "../../platform/security/tenant.guard";
import { ImagesService } from "./images.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

function createValidAccessToken(
  userId: string,
  secret = "default-access-secret-min-32-chars-long",
): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      typ: "access",
      iss: "aisales",
      aud: "access",
      iat: now,
      exp: now + 900,
    }),
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

interface MockPrisma {
  product: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
  productVariant: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
    count: jest.Mock;
  };
  productImage: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  stockReservation: {
    findMany: jest.Mock;
    deleteMany: jest.Mock;
    count: jest.Mock;
  };
  inventoryMovement: {
    findMany: jest.Mock;
    deleteMany: jest.Mock;
    count: jest.Mock;
  };
  orderItem: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  productCategory: {
    findFirst: jest.Mock;
  };
  businessMember: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

describe("Products & variants domain layer (`/products`, `/variants`, S3 images, pricing/stock) (T-CAT-02)", () => {
  let controller: ProductsController;
  let productsService: ProductsService;
  let variantsService: VariantsService;
  let imagesService: ImagesService;
  let prismaMock: MockPrisma;

  const businessId = "11111111-1111-4111-a111-111111111111";
  const otherBusinessId = "99999999-9999-4999-a999-999999999999";
  const productId = "22222222-2222-4222-a222-222222222222";
  const variantId1 = "33333333-3333-4333-a333-333333333331";
  const variantId2 = "33333333-3333-4333-a333-333333333332";
  const imageId = "44444444-4444-4444-a444-444444444444";
  const categoryId = "55555555-5555-4555-a555-555555555555";
  const now = new Date("2026-08-20T00:00:00Z");

  beforeEach(() => {
    prismaMock = {
      product: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      productVariant: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
      productImage: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      stockReservation: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
      inventoryMovement: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
      orderItem: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      productCategory: {
        findFirst: jest.fn(),
      },
      businessMember: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => unknown) => {
        if (typeof cb === "function") {
          return cb(prismaMock);
        }
        if (Array.isArray(cb)) {
          return Promise.all(cb);
        }
        return Promise.resolve(cb);
      }),
    };

    variantsService = new VariantsService(prismaMock as unknown as PrismaClient);
    imagesService = new ImagesService(prismaMock as unknown as PrismaClient);
    productsService = new ProductsService(
      variantsService,
      imagesService,
      prismaMock as unknown as PrismaClient,
    );
    controller = new ProductsController(productsService, variantsService, imagesService);
  });

  describe("1. Acceptance Criteria & Gold Standard Scenarios", () => {
    it("Happy Path: Product with 2 variants and images creates successfully.", async () => {
      const input = {
        title: "T-Shirt Premium",
        description: "High quality cotton t-shirt",
        categoryId,
        variants: [
          {
            sku: "TSHIRT-BLK-M",
            price: 50.0,
            discountPrice: 45.0,
            stock: 100,
            attributes: { color: "Black", size: "M" },
            isDefault: true,
          },
          {
            sku: "TSHIRT-WHT-L",
            price: 55.0,
            stock: 50,
            attributes: { color: "White", size: "L" },
            isDefault: false,
          },
        ],
        images: ["https://cdn.example.com/tshirt.jpg"],
      };

      prismaMock.productCategory.findFirst.mockResolvedValueOnce({
        id: categoryId,
        business_id: businessId,
        name: "Clothing",
        parent_id: null,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      });

      // SKU check
      prismaMock.productVariant.findFirst.mockResolvedValue(null);

      // Product creation in tx
      prismaMock.product.create.mockResolvedValueOnce({
        id: productId,
        business_id: businessId,
        category_id: categoryId,
        name: "T-Shirt Premium",
        description: "High quality cotton t-shirt",
        status: ProductStatus.draft,
        currency: "TND",
        benefits: null,
        selling_points: null,
        objections: null,
        faqs: null,
        created_at: now,
        updated_at: now,
      });

      prismaMock.productVariant.create
        .mockResolvedValueOnce({
          id: variantId1,
          business_id: businessId,
          product_id: productId,
          sku: "TSHIRT-BLK-M",
          barcode: null,
          attributes: { color: "Black", size: "M" },
          price: new Prisma.Decimal(50.0),
          discount_price: new Prisma.Decimal(45.0),
          stock: 100,
          is_default: true,
          created_at: now,
          updated_at: now,
        })
        .mockResolvedValueOnce({
          id: variantId2,
          business_id: businessId,
          product_id: productId,
          sku: "TSHIRT-WHT-L",
          barcode: null,
          attributes: { color: "White", size: "L" },
          price: new Prisma.Decimal(55.0),
          discount_price: null,
          stock: 50,
          is_default: false,
          created_at: now,
          updated_at: now,
        });

      prismaMock.productImage.create.mockResolvedValueOnce({
        id: imageId,
        business_id: businessId,
        product_id: productId,
        variant_id: null,
        s3_key: `businesses/${businessId}/products/${productId}/images/1.jpg`,
        url: "https://cdn.example.com/tshirt.jpg",
        alt_text: "T-Shirt Premium image 1",
        sort_order: 0,
        is_primary: true,
        created_at: now,
      });

      // getProduct query for response
      prismaMock.product.findFirst.mockResolvedValueOnce({
        id: productId,
        business_id: businessId,
        category_id: categoryId,
        name: "T-Shirt Premium",
        description: "High quality cotton t-shirt",
        status: ProductStatus.draft,
        currency: "TND",
        benefits: null,
        selling_points: null,
        objections: null,
        faqs: null,
        created_at: now,
        updated_at: now,
        category: {
          id: categoryId,
          business_id: businessId,
          name: "Clothing",
          parent_id: null,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        },
        variants: [
          {
            id: variantId1,
            business_id: businessId,
            product_id: productId,
            sku: "TSHIRT-BLK-M",
            barcode: null,
            attributes: { color: "Black", size: "M" },
            price: new Prisma.Decimal(50.0),
            discount_price: new Prisma.Decimal(45.0),
            stock: 100,
            is_default: true,
            created_at: now,
            updated_at: now,
          },
          {
            id: variantId2,
            business_id: businessId,
            product_id: productId,
            sku: "TSHIRT-WHT-L",
            barcode: null,
            attributes: { color: "White", size: "L" },
            price: new Prisma.Decimal(55.0),
            discount_price: null,
            stock: 50,
            is_default: false,
            created_at: now,
            updated_at: now,
          },
        ],
        images: [
          {
            id: imageId,
            business_id: businessId,
            product_id: productId,
            variant_id: null,
            s3_key: `businesses/${businessId}/products/${productId}/images/1.jpg`,
            url: "https://cdn.example.com/tshirt.jpg",
            alt_text: "T-Shirt Premium image 1",
            sort_order: 0,
            is_primary: true,
            created_at: now,
          },
        ],
      });

      // No active reservations
      prismaMock.stockReservation.findMany.mockResolvedValueOnce([]);

      const result = await controller.createProduct(businessId, input);

      expect(result.id).toBe(productId);
      expect(result.name).toBe("T-Shirt Premium");
      expect(result.title).toBe("T-Shirt Premium");
      expect(result.variants).toHaveLength(2);
      expect(result.variants[0]?.sku).toBe("TSHIRT-BLK-M");
      expect(result.variants[0]?.price).toBe(50.0);
      expect(result.variants[0]?.discountPrice).toBe(45.0);
      expect(result.variants[0]?.availableStock).toBe(100);
      expect(result.variants[1]?.sku).toBe("TSHIRT-WHT-L");
      expect(result.variants[1]?.availableStock).toBe(50);
      expect(result.images).toHaveLength(1);
      expect(result.images[0]?.isPrimary).toBe(true);
    });

    it("Dynamic Available Stock: Active reservations deduct from `availableStock` in real time.", async () => {
      prismaMock.product.findFirst.mockResolvedValueOnce({
        id: productId,
        business_id: businessId,
        category_id: null,
        name: "Jeans Denim",
        description: null,
        status: ProductStatus.active,
        currency: "TND",
        benefits: null,
        selling_points: null,
        objections: null,
        faqs: null,
        created_at: now,
        updated_at: now,
        category: null,
        variants: [
          {
            id: variantId1,
            business_id: businessId,
            product_id: productId,
            sku: "JEANS-32",
            barcode: null,
            attributes: { size: "32" },
            price: new Prisma.Decimal(120.0),
            discount_price: null,
            stock: 20, // 20 physical on-hand
            is_default: true,
            created_at: now,
            updated_at: now,
          },
        ],
        images: [],
      });

      // Active reservation of 7 units (expires in future)
      prismaMock.stockReservation.findMany.mockResolvedValueOnce([
        {
          variant_id: variantId1,
          quantity: 7,
        },
      ]);

      const result = await controller.getProduct(businessId, productId);

      expect(result.variants[0]?.stock).toBe(20);
      expect(result.variants[0]?.availableStock).toBe(13); // 20 - 7 = 13
    });

    it("FR-CAT-012: Deleting a product with historical orders is blocked with 409 Conflict.", async () => {
      prismaMock.product.findFirst.mockResolvedValueOnce({
        id: productId,
        business_id: businessId,
        name: "Vintage Jacket",
        variants: [{ id: variantId1 }],
      });

      // Order items reference variantId1
      prismaMock.orderItem.count.mockResolvedValueOnce(3);

      await expect(controller.deleteProduct(businessId, productId)).rejects.toThrow(
        ConflictException,
      );

      // Should NOT delete
      expect(prismaMock.product.delete).not.toHaveBeenCalled();
    });

    it("Hard Delete: Product with NO historical orders is hard-deleted on delete.", async () => {
      prismaMock.product.findFirst.mockResolvedValueOnce({
        id: productId,
        business_id: businessId,
        name: "Unsold Sample",
        variants: [{ id: variantId1 }],
      });

      // 0 order items, 0 active reservations
      prismaMock.orderItem.count.mockResolvedValueOnce(0);
      prismaMock.stockReservation.count.mockResolvedValueOnce(0);

      const result = await controller.deleteProduct(businessId, productId);

      expect(result.archived).toBe(false);
      expect(result.status).toBe("deleted");
      expect(prismaMock.product.delete).toHaveBeenCalledWith({
        where: {
          id_business_id: {
            id: productId,
            business_id: businessId,
          },
        },
      });
    });

    it("Active Reservations: Deleting product with active reservations is blocked with 409 Conflict.", async () => {
      prismaMock.product.findFirst.mockResolvedValueOnce({
        id: productId,
        business_id: businessId,
        name: "Reserved Item",
        variants: [{ id: variantId1 }],
      });

      // 0 order items, but 1 active reservation
      prismaMock.orderItem.count.mockResolvedValueOnce(0);
      prismaMock.stockReservation.count.mockResolvedValueOnce(1);

      await expect(controller.deleteProduct(businessId, productId)).rejects.toThrow(
        ConflictException,
      );

      expect(prismaMock.product.delete).not.toHaveBeenCalled();
    });

    it("Tenancy (403): Accessing another tenant's product returns 403 Forbidden or 404.", async () => {
      // 1. Controller query isolation: querying for product belonging to other tenant
      prismaMock.product.findFirst.mockResolvedValueOnce(null);

      await expect(controller.getProduct(businessId, "other-tenant-product-id")).rejects.toThrow(
        NotFoundException,
      );

      // Verify the query strictly included current tenant businessId
      expect(prismaMock.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "other-tenant-product-id",
            business_id: businessId,
          }),
        }),
      );

      // 2. TenantGuard enforcement: token for businessId trying to access otherBusinessId in header/path
      const guard = new TenantGuard(prismaMock as unknown as PrismaClient);
      const token = createValidAccessToken("user-1");

      const req = {
        headers: {
          authorization: `Bearer ${token}`,
          "x-business-id": otherBusinessId,
        },
        user: { id: "user-1", sub: "user-1" },
        params: {},
      };

      // User does NOT belong to otherBusinessId
      prismaMock.businessMember.findFirst.mockResolvedValueOnce(null);

      const context = {
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => () => undefined,
        getClass: () => ProductsController,
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("Employee (403): Employee role receives 403 Forbidden on write operations.", async () => {
      const reflector = new Reflector();
      const guard = new PermissionsGuard(reflector, prismaMock as unknown as PrismaClient);

      const handler = () => undefined;
      RequirePermission("catalog.write")(handler);

      const employeeReq = {
        membership: {
          role: {
            name: "employee",
            role_permissions: [],
          },
        },
      };

      const employeeContext = {
        switchToHttp: () => ({
          getRequest: () => employeeReq,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => handler,
        getClass: () => ProductsController,
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(employeeContext)).rejects.toThrow(ForbiddenException);

      // Owner and Admin have catalog.write permission
      const ownerReq = {
        membership: {
          role: {
            name: "owner",
            role_permissions: [],
          },
        },
      };

      const ownerContext = {
        switchToHttp: () => ({
          getRequest: () => ownerReq,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => handler,
        getClass: () => ProductsController,
      } as unknown as ExecutionContext;

      expect(await guard.canActivate(ownerContext)).toBe(true);

      const adminReq = {
        membership: {
          role: {
            name: "admin",
            role_permissions: [],
          },
        },
      };

      const adminContext = {
        switchToHttp: () => ({
          getRequest: () => adminReq,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => handler,
        getClass: () => ProductsController,
      } as unknown as ExecutionContext;

      expect(await guard.canActivate(adminContext)).toBe(true);
    });
  });

  describe("2. Invariant & Edge Case Validations", () => {
    it("Negative Invariant: PATCH variant rejects availableStock modification", async () => {
      await expect(
        controller.updateVariant(businessId, productId, variantId1, {
          availableStock: 50,
        } as unknown as { price: number }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Negative Invariant: Variant discount price >= regular price is rejected", async () => {
      prismaMock.product.findFirst.mockResolvedValueOnce({
        id: productId,
        business_id: businessId,
      });

      await expect(
        controller.createVariant(businessId, productId, {
          price: 50.0,
          discountPrice: 60.0, // Invalid: discount > price
          stock: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("SKU Conflict: Creating variant with existing SKU in same business throws 409 Conflict", async () => {
      prismaMock.product.findFirst.mockResolvedValueOnce({
        id: productId,
        business_id: businessId,
      });

      prismaMock.productVariant.findFirst.mockResolvedValueOnce({
        id: "existing-var-id",
        sku: "DUPLICATE-SKU",
        business_id: businessId,
      });

      await expect(
        controller.createVariant(businessId, productId, {
          sku: "DUPLICATE-SKU",
          price: 40.0,
          stock: 10,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("Variant delete conflict: Cannot delete variant present in order items", async () => {
      prismaMock.productVariant.findFirst.mockResolvedValueOnce({
        id: variantId1,
        product_id: productId,
        business_id: businessId,
        is_default: false,
      });

      prismaMock.orderItem.count.mockResolvedValueOnce(2);

      await expect(controller.deleteVariant(businessId, productId, variantId1)).rejects.toThrow(
        ConflictException,
      );
    });

    it("Default Variant Invariant: Deleting default variant promotes next variant to default", async () => {
      prismaMock.productVariant.findFirst
        .mockResolvedValueOnce({
          id: variantId1,
          product_id: productId,
          business_id: businessId,
          is_default: true,
        })
        .mockResolvedValueOnce({
          id: variantId2,
          product_id: productId,
          business_id: businessId,
        });

      prismaMock.orderItem.count.mockResolvedValueOnce(0);
      prismaMock.productVariant.delete.mockResolvedValueOnce({});
      prismaMock.productVariant.update.mockResolvedValueOnce({});

      await expect(
        controller.deleteVariant(businessId, productId, variantId1),
      ).resolves.toBeUndefined();

      expect(prismaMock.productVariant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { is_default: true },
        }),
      );
    });

    it("Cursor Pagination: listProducts returns paginated response with next_cursor", async () => {
      const p1 = {
        id: "p1",
        business_id: businessId,
        name: "Product 1",
        description: "Desc 1",
        status: ProductStatus.active,
        currency: "TND",
        created_at: new Date("2026-08-20T10:00:00Z"),
        updated_at: new Date("2026-08-20T10:00:00Z"),
        category: null,
        variants: [],
        images: [],
      };
      const p2 = {
        id: "p2",
        business_id: businessId,
        name: "Product 2",
        description: "Desc 2",
        status: ProductStatus.active,
        currency: "TND",
        created_at: new Date("2026-08-20T09:00:00Z"),
        updated_at: new Date("2026-08-20T09:00:00Z"),
        category: null,
        variants: [],
        images: [],
      };

      // Mock limit 1 -> returns 2 items so hasMore = true
      prismaMock.product.findMany.mockResolvedValueOnce([p1, p2]);
      prismaMock.stockReservation.findMany.mockResolvedValue([]);

      const result = await controller.listProducts(businessId, { limit: 1 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe("p1");
      expect(result.next_cursor).toBeTruthy();

      const rawCursor = result.next_cursor ?? "";
      const decoded = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf-8")) as {
        id: string;
      };
      expect(decoded.id).toBe("p1");
    });

    it("Image upload URL: Generates presigned S3 upload URL", async () => {
      prismaMock.product.findFirst.mockResolvedValueOnce({
        id: productId,
        business_id: businessId,
      });

      const result = await controller.getUploadUrl(businessId, productId, {
        filename: "test-photo.png",
        contentType: "image/png",
      });

      expect(result.uploadUrl).toBeTruthy();
      expect(result.s3Key).toContain(`businesses/${businessId}/products/${productId}/images/`);
      expect(result.url).toBeTruthy();
    });

    it("Image CRUD: Attach image, update alt text and sort order, delete image", async () => {
      prismaMock.product.findFirst.mockResolvedValue({
        id: productId,
        business_id: businessId,
      });

      prismaMock.productImage.create.mockResolvedValueOnce({
        id: imageId,
        business_id: businessId,
        product_id: productId,
        variant_id: null,
        s3_key: "key-1",
        url: "https://example.com/1.jpg",
        alt_text: "Front view",
        sort_order: 1,
        is_primary: true,
        created_at: now,
      });

      const created = await controller.createImage(businessId, productId, {
        url: "https://example.com/1.jpg",
        s3Key: "key-1",
        altText: "Front view",
        sortOrder: 1,
        isPrimary: true,
      });

      expect(created.id).toBe(imageId);
      expect(created.isPrimary).toBe(true);

      prismaMock.productImage.findFirst.mockResolvedValueOnce({
        id: imageId,
        product_id: productId,
        business_id: businessId,
        is_primary: true,
      });

      prismaMock.productImage.update.mockResolvedValueOnce({
        id: imageId,
        business_id: businessId,
        product_id: productId,
        variant_id: null,
        s3_key: "key-1",
        url: "https://example.com/1.jpg",
        alt_text: "Updated Alt Text",
        sort_order: 2,
        is_primary: false,
        created_at: now,
      });

      const updated = await controller.updateImage(businessId, productId, imageId, {
        altText: "Updated Alt Text",
        sortOrder: 2,
        isPrimary: false,
      });

      expect(updated.altText).toBe("Updated Alt Text");
      expect(updated.sortOrder).toBe(2);

      prismaMock.productImage.findFirst.mockResolvedValueOnce({
        id: imageId,
        product_id: productId,
        business_id: businessId,
        s3_key: "key-1",
        is_primary: false,
      });

      await expect(controller.deleteImage(businessId, productId, imageId)).resolves.toBeUndefined();

      // Deleting primary image promotes next image
      prismaMock.productImage.findFirst
        .mockResolvedValueOnce({
          id: imageId,
          product_id: productId,
          business_id: businessId,
          variant_id: null,
          s3_key: "key-1",
          is_primary: true,
        })
        .mockResolvedValueOnce({
          id: "image-2",
          product_id: productId,
          business_id: businessId,
          variant_id: null,
          is_primary: false,
        });

      await expect(controller.deleteImage(businessId, productId, imageId)).resolves.toBeUndefined();
      expect(prismaMock.productImage.update).toHaveBeenCalledWith({
        where: { id: "image-2" },
        data: { is_primary: true },
      });
    });

    it("Update Product: Update status, description, and marketing fields", async () => {
      prismaMock.product.findFirst
        .mockResolvedValueOnce({
          id: productId,
          business_id: businessId,
        })
        .mockResolvedValueOnce({
          id: productId,
          business_id: businessId,
          category_id: null,
          name: "Updated Name",
          description: "New Description",
          status: ProductStatus.active,
          currency: "TND",
          benefits: ["Lightweight", "Breathable"],
          selling_points: ["100% Organic"],
          objections: ["High price"],
          faqs: [{ q: "How to wash?", a: "Cold wash only" }],
          created_at: now,
          updated_at: now,
          category: null,
          variants: [],
          images: [],
        });

      prismaMock.product.update.mockResolvedValueOnce({
        id: productId,
        business_id: businessId,
      });
      prismaMock.stockReservation.findMany.mockResolvedValue([]);

      const result = await controller.updateProduct(businessId, productId, {
        title: "Updated Name",
        description: "New Description",
        status: "active",
        benefits: ["Lightweight", "Breathable"],
        sellingPoints: ["100% Organic"],
        objections: ["High price"],
        faqs: [{ q: "How to wash?", a: "Cold wash only" }],
      });

      expect(result.name).toBe("Updated Name");
      expect(result.status).toBe("active");
      expect(result.benefits).toEqual(["Lightweight", "Breathable"]);
    });
  });
});
