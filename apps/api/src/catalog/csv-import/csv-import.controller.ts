import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";

import type { HttpReply } from "../../platform/core/http";
import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, CurrentUser, TenantGuard } from "../../platform/security/tenant.guard";
import type {
  ConfirmImportBodyDto,
  ImportCsvBodyDto,
  ImportRunResponseDto,
} from "../dto/csv-import.dto";
import { CsvImportProcessor } from "./csv-import.processor";
import { CsvImportService } from "./csv-import.service";

@Controller(["api/v1/products", "products"])
@UseGuards(TenantGuard, PermissionsGuard)
export class CsvImportController {
  constructor(
    private readonly csvImportService: CsvImportService,
    private readonly csvImportProcessor: CsvImportProcessor,
  ) {}

  /**
   * 13 §12.2 GET /products/import/template
   * Returns canonical CSV template header and sample row
   */
  @Get("import/template")
  @HttpCode(HttpStatus.OK)
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="catalog-import-template.csv"')
  getTemplate(): string {
    // Returned rather than written through `@Res()`: the declared `@Header`
    // values are then applied by Nest on both adapters.
    return this.csvImportService.getTemplate().csv;
  }

  /**
   * 13 §12.2 POST /products/import and POST /products/import/csv
   * Uploads CSV, creates catalog_import_runs row, enqueues validation job
   * Invariant: Returns 202 Accepted, NO catalog writes.
   */
  @Post(["import", "import/csv"])
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission("catalog.write")
  async uploadImport(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: { id: string; sub: string },
    @Body() body: ImportCsvBodyDto,
  ): Promise<ImportRunResponseDto> {
    const userId = user.id;
    const run = await this.csvImportService.createImportRun(businessId, userId, body);

    // Enqueue background processing if BullMQ is active
    await this.csvImportProcessor.enqueueValidate({
      importRunId: run.id,
      businessId,
      userId,
      s3Key: body.s3Key ?? body.s3_key ?? undefined,
      csvContent: body.csv,
    });

    return run;
  }

  /**
   * 13 §12.2 GET /products/import/:id
   * Poll status, row error summary, and parsed item preview
   */
  @Get("import/:id")
  @HttpCode(HttpStatus.OK)
  async getImportRun(
    @CurrentBusinessId() businessId: string,
    @Param("id") id: string,
  ): Promise<ImportRunResponseDto> {
    return this.csvImportService.getImportRun(businessId, id);
  }

  /**
   * 13 §12.2 POST /products/import/:id/confirm
   * Explicit merchant confirmation: executes SKU upsert in transaction
   * Invariant: Returns 202 Accepted.
   */
  @Post("import/:id/confirm")
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission("catalog.write")
  async confirmImport(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: { id: string; sub: string },
    @Param("id") id: string,
    @Body() body?: ConfirmImportBodyDto,
  ): Promise<ImportRunResponseDto> {
    const userId = user.id;
    const mode = body?.mode;

    // Enqueue confirm job if BullMQ worker is active
    await this.csvImportProcessor.enqueueConfirm({
      importRunId: id,
      businessId,
      userId,
      mode,
    });

    return this.csvImportService.confirmImport(businessId, id, mode);
  }

  /**
   * 13 §12.2 GET /products/export
   * Streams CSV file of all active products and variants
   */
  @Get("export")
  @HttpCode(HttpStatus.OK)
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exportCatalog(
    @CurrentBusinessId() businessId: string,
    @Res({ passthrough: true }) res: HttpReply,
  ): Promise<string> {
    const csvContent = await this.csvImportService.exportProductsCsv(businessId);
    // Filename is per-tenant, so this one header cannot be a static decorator.
    // `passthrough` keeps Nest in charge of serialising the response.
    void res.header(
      "Content-Disposition",
      `attachment; filename="catalog-export-${businessId}.csv"`,
    );
    return csvContent;
  }
}
