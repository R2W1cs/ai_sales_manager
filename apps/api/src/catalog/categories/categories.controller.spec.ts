import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PrismaClient } from "@prisma/client";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CategoriesController } from "./categories.controller";
import { CategoriesService, slugify } from "./categories.service";

describe("Categories CRUD API (`/categories`) (T-CAT-01)", () => {
  let controller: CategoriesController;
  let service: CategoriesService;
  let prismaMock: {
    productCategory: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    product: {
      count: jest.Mock;
    };
    businessMember: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const businessId = "11111111-1111-4111-a111-111111111111";
  const parentId = "22222222-2222-4222-a222-222222222222";
  const childId = "33333333-3333-4333-a333-333333333333";
  const now = new Date("2026-08-19T00:00:00Z");
  const later = new Date("2026-08-19T01:00:00Z");

  beforeEach(() => {
    prismaMock = {
      productCategory: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      product: {
        count: jest.fn(),
      },
      businessMember: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new CategoriesService(prismaMock as unknown as PrismaClient);
    controller = new CategoriesController(service);
  });

  describe("Acceptance Criteria & Hierarchy", () => {
    it("Create & List: Parent and child categories create and return hierarchical tree.", async () => {
      // 1. Create parent category
      prismaMock.productCategory.create.mockResolvedValueOnce({
        id: parentId,
        business_id: businessId,
        name: "Vêtements",
        parent_id: null,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      });
      prismaMock.productCategory.findMany.mockResolvedValueOnce([
        {
          id: parentId,
          business_id: businessId,
          name: "Vêtements",
          parent_id: null,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        },
      ]);

      const parentResult = await controller.createCategory(businessId, {
        name: "Vêtements",
      });

      expect(parentResult).toEqual({
        id: parentId,
        businessId,
        name: "Vêtements",
        slug: "vetements",
        parentId: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });

      // 2. Create child category with parentId
      prismaMock.productCategory.findFirst.mockResolvedValueOnce({
        id: parentId,
        business_id: businessId,
        name: "Vêtements",
      });
      prismaMock.productCategory.create.mockResolvedValueOnce({
        id: childId,
        business_id: businessId,
        name: "Robes",
        parent_id: parentId,
        sort_order: 1,
        created_at: later,
        updated_at: later,
      });
      prismaMock.productCategory.findMany.mockResolvedValueOnce([
        {
          id: parentId,
          business_id: businessId,
          name: "Vêtements",
          parent_id: null,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        },
        {
          id: childId,
          business_id: businessId,
          name: "Robes",
          parent_id: parentId,
          sort_order: 1,
          created_at: later,
          updated_at: later,
        },
      ]);

      const childResult = await controller.createCategory(businessId, {
        name: "Robes",
        parentId,
        sortOrder: 1,
      });

      expect(childResult).toEqual({
        id: childId,
        businessId,
        name: "Robes",
        slug: "robes",
        parentId,
        sortOrder: 1,
        createdAt: later,
        updatedAt: later,
      });

      // 3. List categories returning nested tree
      prismaMock.productCategory.findMany.mockResolvedValueOnce([
        {
          id: parentId,
          business_id: businessId,
          name: "Vêtements",
          parent_id: null,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        },
        {
          id: childId,
          business_id: businessId,
          name: "Robes",
          parent_id: parentId,
          sort_order: 1,
          created_at: later,
          updated_at: later,
        },
      ]);

      const treeResult = (await controller.listCategories(businessId)) as any[];

      expect(treeResult).toHaveLength(1);
      expect(treeResult[0].id).toBe(parentId);
      expect(treeResult[0].name).toBe("Vêtements");
      expect(treeResult[0].slug).toBe("vetements");
      expect(treeResult[0].children).toHaveLength(1);
      expect(treeResult[0].children[0].id).toBe(childId);
      expect(treeResult[0].children[0].name).toBe("Robes");
      expect(treeResult[0].children[0].slug).toBe("robes");
      expect(treeResult[0].children[0].parentId).toBe(parentId);
    });

    it("Unique Slug: Duplicate category name within same tenant generates unique slug or 409.", async () => {
      // First category created
      prismaMock.productCategory.create.mockResolvedValueOnce({
        id: parentId,
        business_id: businessId,
        name: "Chaussures",
        parent_id: null,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      });
      prismaMock.productCategory.findMany.mockResolvedValueOnce([
        {
          id: parentId,
          business_id: businessId,
          name: "Chaussures",
          parent_id: null,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        },
      ]);

      const firstResult = await controller.createCategory(businessId, {
        name: "Chaussures",
      });
      expect(firstResult.slug).toBe("chaussures");

      // Second category with identical name in same tenant
      prismaMock.productCategory.create.mockResolvedValueOnce({
        id: childId,
        business_id: businessId,
        name: "Chaussures",
        parent_id: null,
        sort_order: 1,
        created_at: later,
        updated_at: later,
      });
      prismaMock.productCategory.findMany.mockResolvedValueOnce([
        {
          id: parentId,
          business_id: businessId,
          name: "Chaussures",
          parent_id: null,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        },
        {
          id: childId,
          business_id: businessId,
          name: "Chaussures",
          parent_id: null,
          sort_order: 1,
          created_at: later,
          updated_at: later,
        },
      ]);

      const secondResult = await controller.createCategory(businessId, {
        name: "Chaussures",
        sortOrder: 1,
      });
      expect(secondResult.slug).toBe("chaussures-1");
    });

    it("Employee (403): Employee role receives 403 Forbidden on create/update/delete.", async () => {
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
        getClass: () => CategoriesController,
      } as any;

      await expect(guard.canActivate(employeeContext)).rejects.toThrow(ForbiddenException);

      // Owner and Admin are allowed
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
        getClass: () => CategoriesController,
      } as any;

      expect(await guard.canActivate(ownerContext)).toBe(true);
    });
  });

  describe("CRUD Operations & Invariants", () => {
    it("Get single category: returns category when found with consistent slug", async () => {
      prismaMock.productCategory.findFirst.mockResolvedValueOnce({
        id: parentId,
        business_id: businessId,
        name: "Accessoires",
        parent_id: null,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      });
      prismaMock.productCategory.findMany.mockResolvedValueOnce([
        {
          id: parentId,
          business_id: businessId,
          name: "Accessoires",
          parent_id: null,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        },
      ]);

      const result = await controller.getCategory(businessId, parentId);

      expect(prismaMock.productCategory.findFirst).toHaveBeenCalledWith({
        where: { id: parentId, business_id: businessId },
      });
      expect(result.name).toBe("Accessoires");
      expect(result.slug).toBe("accessoires");
    });

    it("Get single category (404): throws NotFoundException if category does not exist", async () => {
      prismaMock.productCategory.findFirst.mockResolvedValueOnce(null);

      await expect(
        controller.getCategory(businessId, "11111111-2222-4333-a444-555555555555"),
      ).rejects.toThrow(NotFoundException);
    });

    it("List flat categories: returns flat array when flat=true", async () => {
      prismaMock.productCategory.findMany.mockResolvedValueOnce([
        {
          id: parentId,
          business_id: businessId,
          name: "Vêtements",
          parent_id: null,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        },
        {
          id: childId,
          business_id: businessId,
          name: "Robes",
          parent_id: parentId,
          sort_order: 1,
          created_at: later,
          updated_at: later,
        },
      ]);

      const result = (await controller.listCategories(businessId, "true")) as any[];
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(parentId);
      expect(result[1].id).toBe(childId);
    });

    it("Update category: updates name and sort order", async () => {
      prismaMock.productCategory.findFirst.mockResolvedValueOnce({
        id: parentId,
        business_id: businessId,
        name: "Old Name",
        parent_id: null,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      });

      prismaMock.productCategory.update.mockResolvedValueOnce({
        id: parentId,
        business_id: businessId,
        name: "New Name",
        parent_id: null,
        sort_order: 2,
        created_at: now,
        updated_at: later,
      });

      prismaMock.productCategory.findMany.mockResolvedValueOnce([
        {
          id: parentId,
          business_id: businessId,
          name: "New Name",
          parent_id: null,
          sort_order: 2,
          created_at: now,
          updated_at: later,
        },
      ]);

      const result = await controller.updateCategory(businessId, parentId, {
        name: "New Name",
        sortOrder: 2,
      });

      expect(prismaMock.productCategory.update).toHaveBeenCalledWith({
        where: {
          id_business_id: {
            id: parentId,
            business_id: businessId,
          },
        },
        data: {
          name: "New Name",
          sort_order: 2,
        },
      });
      expect(result.name).toBe("New Name");
      expect(result.slug).toBe("new-name");
    });

    it("Update category (Cyclic prevention): throws BadRequestException when setting self as parent", async () => {
      prismaMock.productCategory.findFirst.mockResolvedValueOnce({
        id: parentId,
        business_id: businessId,
        name: "Vêtements",
      });

      await expect(
        controller.updateCategory(businessId, parentId, {
          parentId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Update category (Cyclic prevention): throws BadRequestException when ancestor cycle is detected", async () => {
      // Category A (parentId) has child Category B (childId)
      // Attempt to update A to have parent B
      prismaMock.productCategory.findFirst
        // 1. find existing A
        .mockResolvedValueOnce({
          id: parentId,
          business_id: businessId,
          name: "Category A",
          parent_id: null,
        })
        // 2. find new parent B
        .mockResolvedValueOnce({
          id: childId,
          business_id: businessId,
          name: "Category B",
          parent_id: parentId, // B's parent is A!
        });

      await expect(
        controller.updateCategory(businessId, parentId, {
          parentId: childId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("Delete category: successfully deletes when no products or children exist", async () => {
      prismaMock.productCategory.findFirst.mockResolvedValueOnce({
        id: parentId,
        business_id: businessId,
        name: "To Delete",
      });
      prismaMock.product.count.mockResolvedValueOnce(0);
      prismaMock.productCategory.count.mockResolvedValueOnce(0);
      prismaMock.productCategory.delete.mockResolvedValueOnce({});

      await controller.deleteCategory(businessId, parentId);

      expect(prismaMock.productCategory.delete).toHaveBeenCalledWith({
        where: {
          id_business_id: {
            id: parentId,
            business_id: businessId,
          },
        },
      });
    });

    it("Delete category (Conflict 409): throws ConflictException when associated products exist", async () => {
      prismaMock.productCategory.findFirst.mockResolvedValueOnce({
        id: parentId,
        business_id: businessId,
        name: "Has Products",
      });
      prismaMock.product.count.mockResolvedValueOnce(3); // 3 products attached

      await expect(controller.deleteCategory(businessId, parentId)).rejects.toThrow(
        ConflictException,
      );
    });

    it("Delete category (Conflict 409): throws ConflictException when child categories exist", async () => {
      prismaMock.productCategory.findFirst.mockResolvedValueOnce({
        id: parentId,
        business_id: businessId,
        name: "Has Children",
      });
      prismaMock.product.count.mockResolvedValueOnce(0);
      prismaMock.productCategory.count.mockResolvedValueOnce(2); // 2 subcategories attached

      await expect(controller.deleteCategory(businessId, parentId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("Slug Utility", () => {
    it("converts accented and special characters to clean slug", () => {
      expect(slugify("Vêtements & Accessoires d'Été")).toBe("vetements-accessoires-d-ete");
      expect(slugify("  Chaussures de Sport (Homme)  ")).toBe("chaussures-de-sport-homme");
      expect(slugify("")).toBe("category");
    });
  });
});
