import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import type {
  CategoryResponse,
  CategoryTreeNode,
  CreateCategoryDto,
} from "../dto/create-category.dto";
import type { UpdateCategoryDto } from "../dto/update-category.dto";
import { CategoriesService } from "./categories.service";

@Controller(["api/v1/product-categories", "api/v1/categories"])
@UseGuards(TenantGuard, PermissionsGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * 13 §12.1 GET /api/v1/product-categories or /categories
   * Retrieve categories as hierarchical tree (default) or flat list with ?flat=true or ?tree=false.
   */
  @Get()
  async listCategories(
    @CurrentBusinessId() businessId: string,
    @Query("flat") flatQuery?: string,
    @Query("tree") treeQuery?: string,
  ): Promise<CategoryTreeNode[] | CategoryResponse[]> {
    const isFlat = flatQuery === "true" || treeQuery === "false";
    return this.categoriesService.listCategories(businessId, { flat: isFlat });
  }

  /**
   * 13 §12.1 GET /api/v1/product-categories/:id or /categories/:id
   * Retrieve a single category by ID.
   */
  @Get(":id")
  async getCategory(
    @CurrentBusinessId() businessId: string,
    @Param("id") categoryId: string,
  ): Promise<CategoryResponse> {
    return this.categoriesService.getCategory(businessId, categoryId);
  }

  /**
   * 13 §12.1 POST /api/v1/product-categories or /categories
   * Create a new category.
   * Guarded by catalog.write.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("catalog.write")
  async createCategory(
    @CurrentBusinessId() businessId: string,
    @Body() body: CreateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.categoriesService.createCategory(businessId, body);
  }

  /**
   * 13 §12.1 PATCH /api/v1/product-categories/:id or /categories/:id
   * Update category name, sortOrder, or parent.
   * Guarded by catalog.write.
   */
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("catalog.write")
  async updateCategory(
    @CurrentBusinessId() businessId: string,
    @Param("id") categoryId: string,
    @Body() body: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.categoriesService.updateCategory(businessId, categoryId, body);
  }

  /**
   * 13 §12.1 DELETE /api/v1/product-categories/:id or /categories/:id
   * Delete category if no associated products or child categories exist.
   * Guarded by catalog.write.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("catalog.write")
  async deleteCategory(
    @CurrentBusinessId() businessId: string,
    @Param("id") categoryId: string,
  ): Promise<void> {
    return this.categoriesService.deleteCategory(businessId, categoryId);
  }
}
