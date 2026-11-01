import { Module } from "@nestjs/common";

import { KnowledgeModule } from "../knowledge/knowledge.module";
import { CategoriesController } from "./categories/categories.controller";
import { CategoriesService } from "./categories/categories.service";
import { CsvImportController } from "./csv-import/csv-import.controller";
import { CsvImportProcessor } from "./csv-import/csv-import.processor";
import { CsvImportService } from "./csv-import/csv-import.service";
import { CatalogIndexerProcessor } from "./indexer/catalog-indexer.processor";
import { CatalogIndexerService } from "./indexer/catalog-indexer.service";
import { ImagesService } from "./products/images.service";
import { ProductsController } from "./products/products.controller";
import { ProductsService } from "./products/products.service";
import { VariantsService } from "./products/variants.service";

@Module({
  imports: [KnowledgeModule],
  controllers: [CsvImportController, CategoriesController, ProductsController],
  providers: [
    CategoriesService,
    ProductsService,
    VariantsService,
    ImagesService,
    CsvImportService,
    CsvImportProcessor,
    CatalogIndexerService,
    CatalogIndexerProcessor,
  ],
  exports: [
    CategoriesService,
    ProductsService,
    VariantsService,
    ImagesService,
    CsvImportService,
    CsvImportProcessor,
    CatalogIndexerService,
    CatalogIndexerProcessor,
  ],
})
export class CatalogModule {}
