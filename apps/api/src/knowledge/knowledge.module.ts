import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module";
import { DocumentsController } from "./documents/documents.controller";
import { DocumentsService } from "./documents/documents.service";
import { BusinessRulesController } from "./rules/business-rules.controller";
import { BusinessRulesService } from "./rules/business-rules.service";
import { EmbeddingProcessor } from "./search/embedding.processor";
import { EmbeddingService } from "./search/embedding.service";
import { SearchController } from "./search/search.controller";
import { VectorSearchService } from "./search/vector-search.service";

@Module({
  imports: [AiModule],
  controllers: [BusinessRulesController, DocumentsController, SearchController],
  providers: [
    BusinessRulesService,
    DocumentsService,
    EmbeddingService,
    EmbeddingProcessor,
    VectorSearchService,
  ],
  exports: [
    BusinessRulesService,
    DocumentsService,
    EmbeddingService,
    EmbeddingProcessor,
    VectorSearchService,
  ],
})
export class KnowledgeModule {}
