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

import type {
  CreateProductDto,
  CreateProductImageDto,
  CreateVariantDto,
  ListProductsQueryDto,
  PaginatedProductsResponse,
  ProductImageResponse,
  ProductResponse,
  UpdateProductDto,
  UpdateProductImageDto,
  UpdateVariantDto,
  VariantResponse,
} from "@app/shared";

import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import { ImagesService } from "./images.service";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

@Controller(["api/v1/products", "products"])
@UseGuards(TenantGuard, PermissionsGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly variantsService: VariantsService,
    private readonly imagesService: ImagesService,
  ) {}

  /**
   * 13 §12.1 GET /api/v1/products
   */
  @Get()
  async listProducts(
    @CurrentBusinessId() businessId: string,
    @Query() query: ListProductsQueryDto,
  ): Promise<PaginatedProductsResponse> {
    return this.productsService.listProducts(businessId, query);
  }

  /**
   * 13 §12.1 POST /api/v1/products
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("catalog.write")
  async createProduct(
    @CurrentBusinessId() businessId: string,
    @Body() body: CreateProductDto,
  ): Promise<ProductResponse> {
    return this.productsService.createProduct(businessId, body);
  }

  /**
   * 13 §12.1 GET /api/v1/products/:id
   */
  @Get(":id")
  async getProduct(
    @CurrentBusinessId() businessId: string,
    @Param("id") id: string,
  ): Promise<ProductResponse> {
    return this.productsService.getProduct(businessId, id);
  }

  /**
   * 13 §12.1 PATCH /api/v1/products/:id
   */
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("catalog.write")
  async updateProduct(
    @CurrentBusinessId() businessId: string,
    @Param("id") id: string,
    @Body() body: UpdateProductDto,
  ): Promise<ProductResponse> {
    return this.productsService.updateProduct(businessId, id, body);
  }

  /**
   * 13 §12.1 DELETE /api/v1/products/:id
   * Archival safety: returns 200 OK if deleted, or 409 Conflict if referenced in orders (FR-CAT-012)
   */
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("catalog.write")
  async deleteProduct(
    @CurrentBusinessId() businessId: string,
    @Param("id") id: string,
  ): Promise<{ message: string; status: string; id: string; archived: boolean }> {
    return this.productsService.deleteProduct(businessId, id);
  }

  /**
   * 13 §12.1 POST /api/v1/products/:id/variants
   */
  @Post(":id/variants")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("catalog.write")
  async createVariant(
    @CurrentBusinessId() businessId: string,
    @Param("id") productId: string,
    @Body() body: CreateVariantDto,
  ): Promise<VariantResponse> {
    return this.variantsService.createVariant(businessId, productId, body);
  }

  /**
   * 13 §12.1 GET /api/v1/products/:id/variants
   */
  @Get(":id/variants")
  async listVariants(
    @CurrentBusinessId() businessId: string,
    @Param("id") productId: string,
  ): Promise<VariantResponse[]> {
    return this.variantsService.listVariants(businessId, productId);
  }

  /**
   * 13 §12.1 GET /api/v1/products/:id/variants/:variantId
   */
  @Get(":id/variants/:variantId")
  async getVariant(
    @CurrentBusinessId() businessId: string,
    @Param("id") productId: string,
    @Param("variantId") variantId: string,
  ): Promise<VariantResponse> {
    return this.variantsService.getVariant(businessId, productId, variantId);
  }

  /**
   * 13 §12.1 PATCH /api/v1/products/:id/variants/:variantId
   */
  @Patch(":id/variants/:variantId")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("catalog.write")
  async updateVariant(
    @CurrentBusinessId() businessId: string,
    @Param("id") productId: string,
    @Param("variantId") variantId: string,
    @Body() body: UpdateVariantDto,
  ): Promise<VariantResponse> {
    return this.variantsService.updateVariant(businessId, productId, variantId, body);
  }

  /**
   * 13 §12.1 DELETE /api/v1/products/:id/variants/:variantId
   */
  @Delete(":id/variants/:variantId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("catalog.write")
  async deleteVariant(
    @CurrentBusinessId() businessId: string,
    @Param("id") productId: string,
    @Param("variantId") variantId: string,
  ): Promise<void> {
    return this.variantsService.deleteVariant(businessId, productId, variantId);
  }

  /**
   * 13 §12.1 POST /api/v1/products/:id/images
   */
  @Post(":id/images")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("catalog.write")
  async createImage(
    @CurrentBusinessId() businessId: string,
    @Param("id") productId: string,
    @Body() body: CreateProductImageDto,
  ): Promise<ProductImageResponse> {
    return this.imagesService.createImage(businessId, productId, body);
  }

  /**
   * 13 §12.1 POST /api/v1/products/:id/images/upload-url
   */
  @Post(":id/images/upload-url")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("catalog.write")
  async getUploadUrl(
    @CurrentBusinessId() businessId: string,
    @Param("id") productId: string,
    @Body()
    body: {
      filename?: string;
      contentType?: string;
      variantId?: string;
    },
  ): Promise<{ uploadUrl: string; s3Key: string; url: string }> {
    return this.imagesService.getUploadUrl(businessId, productId, body);
  }

  /**
   * 13 §12.1 GET /api/v1/products/:id/images
   */
  @Get(":id/images")
  async listImages(
    @CurrentBusinessId() businessId: string,
    @Param("id") productId: string,
    @Query("variantId") variantId?: string,
  ): Promise<ProductImageResponse[]> {
    return this.imagesService.listImages(businessId, productId, variantId);
  }

  /**
   * 13 §12.1 PATCH /api/v1/products/:id/images/:imageId
   */
  @Patch(":id/images/:imageId")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("catalog.write")
  async updateImage(
    @CurrentBusinessId() businessId: string,
    @Param("id") productId: string,
    @Param("imageId") imageId: string,
    @Body() body: UpdateProductImageDto,
  ): Promise<ProductImageResponse> {
    return this.imagesService.updateImage(businessId, productId, imageId, body);
  }

  /**
   * 13 §12.1 DELETE /api/v1/products/:id/images/:imageId
   */
  @Delete(":id/images/:imageId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("catalog.write")
  async deleteImage(
    @CurrentBusinessId() businessId: string,
    @Param("id") productId: string,
    @Param("imageId") imageId: string,
  ): Promise<void> {
    return this.imagesService.deleteImage(businessId, productId, imageId);
  }
}
