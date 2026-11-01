import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { toValidationException } from "../../platform/core/errors";
import type {
  CategoryResponse,
  CategoryTreeNode,
  CreateCategoryDto,
} from "../dto/create-category.dto";
import { CreateCategorySchema } from "../dto/create-category.dto";
import type { UpdateCategoryDto } from "../dto/update-category.dto";
import { UpdateCategorySchema } from "../dto/update-category.dto";

export function slugify(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "category"
  );
}

interface RawCategoryEntity {
  id: string;
  business_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class CategoriesService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * Deterministically assigns unique slugs to a set of categories for a tenant.
   * Categories are sorted by created_at, then id to guarantee idempotency.
   */
  private assignUniqueSlugs(categories: RawCategoryEntity[]): Map<string, string> {
    const sorted = categories.toSorted((a, b) => {
      const timeDiff = a.created_at.getTime() - b.created_at.getTime();
      return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
    });

    const slugCount = new Map<string, number>();
    const idToSlug = new Map<string, string>();

    for (const cat of sorted) {
      const baseSlug = slugify(cat.name);
      const count = slugCount.get(baseSlug) ?? 0;
      if (count === 0) {
        idToSlug.set(cat.id, baseSlug);
        slugCount.set(baseSlug, 1);
      } else {
        const uniqueSlug = `${baseSlug}-${count}`;
        idToSlug.set(cat.id, uniqueSlug);
        slugCount.set(baseSlug, count + 1);
      }
    }

    return idToSlug;
  }

  /**
   * Helper: format DB entity to CategoryResponse
   */
  private formatCategory(category: RawCategoryEntity, slug: string): CategoryResponse {
    return {
      id: category.id,
      businessId: category.business_id,
      name: category.name,
      slug,
      parentId: category.parent_id,
      sortOrder: category.sort_order,
      createdAt: category.created_at,
      updatedAt: category.updated_at,
    };
  }

  /**
   * 13 §12.1 POST /api/v1/product-categories
   * Create a new category within the tenant.
   */
  async createCategory(businessId: string, body: CreateCategoryDto): Promise<CategoryResponse> {
    const parseResult = CreateCategorySchema.safeParse(body);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const data = parseResult.data;
    const parentId = data.parentId ?? null;

    if (parentId) {
      const parent = await this.prisma.productCategory.findFirst({
        where: {
          id: parentId,
          business_id: businessId,
        },
      });

      if (!parent) {
        throw new NotFoundException({
          error: {
            code: "parent_not_found",
            message: "Parent category not found in this business",
          },
        });
      }
    }

    const category = await this.prisma.productCategory.create({
      data: {
        business_id: businessId,
        name: data.name,
        parent_id: parentId,
        sort_order: data.sortOrder ?? 0,
      },
    });

    const allCategories = await this.prisma.productCategory.findMany({
      where: { business_id: category.business_id },
    });
    const slugMap = this.assignUniqueSlugs(allCategories);
    const slug = slugMap.get(category.id) ?? slugify(category.name);

    return this.formatCategory(category, slug);
  }

  /**
   * 13 §12.1 GET /api/v1/product-categories
   * Retrieve category hierarchy tree or flat list for the tenant.
   */
  async listCategories(
    businessId: string,
    options?: { flat?: boolean },
  ): Promise<CategoryTreeNode[] | CategoryResponse[]> {
    const categories = await this.prisma.productCategory.findMany({
      where: {
        business_id: businessId,
      },
      orderBy: [{ sort_order: "asc" }, { name: "asc" }],
    });

    const slugMap = this.assignUniqueSlugs(categories);

    const formattedList: CategoryResponse[] = categories.map((cat) =>
      this.formatCategory(cat, slugMap.get(cat.id) ?? slugify(cat.name)),
    );

    if (options?.flat) {
      return formattedList;
    }

    return this.buildTree(formattedList);
  }

  /**
   * Helper: build nested tree from flat list of categories
   */
  buildTree(categories: CategoryResponse[]): CategoryTreeNode[] {
    const categoryMap = new Map<string, CategoryTreeNode>();

    for (const cat of categories) {
      categoryMap.set(cat.id, { ...cat, children: [] });
    }

    const tree: CategoryTreeNode[] = [];

    for (const cat of categories) {
      const node = categoryMap.get(cat.id);
      if (!node) continue;

      if (cat.parentId && categoryMap.has(cat.parentId)) {
        const parentNode = categoryMap.get(cat.parentId);
        if (parentNode) {
          parentNode.children.push(node);
        } else {
          tree.push(node);
        }
      } else {
        tree.push(node);
      }
    }

    return tree;
  }

  /**
   * 13 §12.1 GET /api/v1/product-categories/:id
   * Retrieve a single category by ID.
   */
  async getCategory(businessId: string, categoryId: string): Promise<CategoryResponse> {
    const category = await this.prisma.productCategory.findFirst({
      where: {
        id: categoryId,
        business_id: businessId,
      },
    });

    if (!category) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Category not found",
        },
      });
    }

    const allCategories = await this.prisma.productCategory.findMany({
      where: { business_id: businessId },
    });
    const slugMap = this.assignUniqueSlugs(allCategories);
    const slug = slugMap.get(category.id) ?? slugify(category.name);

    return this.formatCategory(category, slug);
  }

  /**
   * 13 §12.1 PATCH /api/v1/product-categories/:id
   * Update category name, sortOrder, or parent. Prevents cycles.
   */
  async updateCategory(
    businessId: string,
    categoryId: string,
    body: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    const parseResult = UpdateCategorySchema.safeParse(body);
    if (!parseResult.success) {
      throw toValidationException(parseResult.error);
    }

    const existing = await this.prisma.productCategory.findFirst({
      where: {
        id: categoryId,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Category not found",
        },
      });
    }

    const data = parseResult.data;
    const newParentId = data.parentId;

    // Cycle check: cannot be its own parent
    if (newParentId === categoryId) {
      throw new BadRequestException({
        error: {
          code: "cyclic_relationship",
          message: "Category cannot be its own parent",
        },
      });
    }

    if (newParentId) {
      const parent = await this.prisma.productCategory.findFirst({
        where: {
          id: newParentId,
          business_id: businessId,
        },
      });

      if (!parent) {
        throw new NotFoundException({
          error: {
            code: "parent_not_found",
            message: "Parent category not found in this business",
          },
        });
      }

      // Cycle check: new parent must not be a descendant of categoryId
      let currentParentId: string | null = parent.parent_id;
      const visited = new Set<string>();
      while (currentParentId) {
        if (currentParentId === categoryId) {
          throw new BadRequestException({
            error: {
              code: "cyclic_relationship",
              message: "Cyclic category hierarchy detected",
            },
          });
        }
        visited.add(currentParentId);
        const ancestor = await this.prisma.productCategory.findFirst({
          where: {
            id: currentParentId,
            business_id: businessId,
          },
        });
        if (!ancestor?.parent_id || visited.has(ancestor.parent_id)) {
          break;
        }
        currentParentId = ancestor.parent_id;
      }
    }

    const updated = await this.prisma.productCategory.update({
      where: {
        id_business_id: {
          id: categoryId,
          business_id: businessId,
        },
      },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(newParentId !== undefined ? { parent_id: newParentId } : {}),
        ...(data.sortOrder !== undefined ? { sort_order: data.sortOrder } : {}),
      },
    });

    const allCategories = await this.prisma.productCategory.findMany({
      where: { business_id: updated.business_id },
    });
    const slugMap = this.assignUniqueSlugs(allCategories);
    const slug = slugMap.get(updated.id) ?? slugify(updated.name);

    return this.formatCategory(updated, slug);
  }

  /**
   * 13 §12.1 DELETE /api/v1/product-categories/:id
   * Delete category. Checks for child products and child categories.
   */
  async deleteCategory(businessId: string, categoryId: string): Promise<void> {
    const existing = await this.prisma.productCategory.findFirst({
      where: {
        id: categoryId,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Category not found",
        },
      });
    }

    // Check associated products
    const productCount = await this.prisma.product.count({
      where: {
        business_id: businessId,
        category_id: categoryId,
      },
    });

    if (productCount > 0) {
      throw new ConflictException({
        error: {
          code: "category_in_use",
          message: "Cannot delete category with associated products",
        },
      });
    }

    // Check child categories
    const childCount = await this.prisma.productCategory.count({
      where: {
        business_id: businessId,
        parent_id: categoryId,
      },
    });

    if (childCount > 0) {
      throw new ConflictException({
        error: {
          code: "category_has_children",
          message: "Cannot delete category with child categories",
        },
      });
    }

    await this.prisma.productCategory.delete({
      where: {
        id_business_id: {
          id: categoryId,
          business_id: businessId,
        },
      },
    });
  }
}
