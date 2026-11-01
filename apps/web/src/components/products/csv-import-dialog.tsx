"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export type ImportMode = "merge" | "replace";

export interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  onImportSuccess: () => void;
}

interface ImportRunStatusResponse {
  id: string;
  status: "uploaded" | "validated" | "previewed" | "running" | "succeeded" | "failed";
  totalRows?: number | null;
  successRows?: number | null;
  errorRows?: number | null;
  errors?: Array<{ row: number; message: string }>;
}

interface CsvPreviewItem {
  name: string;
  category?: string;
  sku?: string;
  price: number;
  stock: number;
}

const MAX_CSV_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

function validateCsvFile(selectedFile: File, t: (key: string) => string): string | null {
  const hasCsvExt = selectedFile.name.toLowerCase().endsWith(".csv");
  const isCsvType =
    selectedFile.type === "" ||
    selectedFile.type === "text/csv" ||
    selectedFile.type === "text/plain" ||
    selectedFile.type === "application/vnd.ms-excel" ||
    selectedFile.type.includes("csv");

  if (!hasCsvExt && !isCsvType) {
    return t("errCsvInvalidType");
  }
  if (selectedFile.size === 0) {
    return t("errCsvEmpty");
  }
  if (selectedFile.size > MAX_CSV_SIZE_BYTES) {
    return t("errCsvSizeExceeded");
  }
  return null;
}

async function downloadCsvTemplateFile(): Promise<void> {
  try {
    const token = apiClient.getAccessToken();
    const res = await fetch("/api/v1/products/import/template", {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modele_produits.csv";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      return;
    }
  } catch {
    // Network or auth error fallback
  }

  // Client-side fallback template with standard format
  const sampleCsv =
    "name,category,sku,barcode,price,discount_price,stock,description,options,image_url\n" +
    '"Premium Cotton T-Shirt","Apparel","TSHIRT-BLK-M","123456789012",29.99,24.99,100,"100% organic cotton t-shirt","{\\"size\\":\\"M\\",\\"color\\":\\"Black\\"}","https://example.com/images/tshirt-black.jpg"\n';
  const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modele_produits.csv";
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

function parseClientCsvPreview(text: string): {
  totalRows: number;
  preview: CsvPreviewItem[];
} {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return { totalRows: 0, preview: [] };

  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return { totalRows: 0, preview: [] };

  const firstLine = lines[0] ?? "";
  const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";

  const splitRow = (row: string): string[] => {
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === delimiter && !inQuotes) {
        fields.push(field.trim().replace(/^"|"$/g, ""));
        field = "";
      } else {
        field += c;
      }
    }
    fields.push(field.trim().replace(/^"|"$/g, ""));
    return fields;
  };

  const headers = splitRow(firstLine).map((h) =>
    h
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, ""),
  );

  const getCol = (...names: string[]) => {
    for (const n of names) {
      const idx = headers.indexOf(n);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const nameIdx = getCol("name", "title", "nom", "produit", "designation", "article");
  const catIdx = getCol("category", "categorie", "famille", "rayon");
  const skuIdx = getCol("sku", "code", "reference", "ref");
  const priceIdx = getCol("price", "prix", "tarif", "prixunitaire");
  const stockIdx = getCol("stock", "quantity", "quantite", "qte");

  const preview: CsvPreviewItem[] = [];

  for (let i = 1; i < lines.length && preview.length < 5; i++) {
    const row = splitRow(lines[i] ?? "");
    const name = nameIdx !== -1 ? row[nameIdx] : row[0];
    const cat = catIdx !== -1 ? row[catIdx] : undefined;
    const sku = skuIdx !== -1 ? row[skuIdx] : undefined;
    const rawPrice = priceIdx !== -1 ? row[priceIdx] : undefined;
    const rawStock = stockIdx !== -1 ? row[stockIdx] : undefined;

    let price = 0;
    if (rawPrice) {
      const cleaned = rawPrice
        .replace(/(?:DT|TND|dt|tnd|dinars?|د\.ت|[$€£])/gi, "")
        .trim()
        .replace(",", ".");
      const num = Number(cleaned);
      if (!isNaN(num)) price = num;
    }

    let stock = 0;
    if (rawStock) {
      const num = parseInt(rawStock.replace(/\s+/g, ""), 10);
      if (!isNaN(num)) stock = num;
    }

    if (name) {
      preview.push({ name, category: cat, sku, price, stock });
    }
  }

  return {
    totalRows: lines.length - 1,
    preview,
  };
}

async function pollValidation(runId: string, businessId: string): Promise<ImportRunStatusResponse> {
  const headers = businessId ? { "x-business-id": businessId } : undefined;
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const res = await apiClient.get<ImportRunStatusResponse>(`/api/v1/products/import/${runId}`, {
        headers,
      });
      if (
        res.status === "validated" ||
        res.status === "failed" ||
        res.status === "previewed" ||
        res.status === "succeeded"
      ) {
        return res;
      }
    } catch {
      // Retry polling
    }
  }
  return apiClient.get<ImportRunStatusResponse>(`/api/v1/products/import/${runId}`, { headers });
}

async function runCsvImportWorkflow(
  file: File,
  businessId: string,
  mode: ImportMode,
  onProgress: (status: string) => void,
  t: (key: string, values?: Record<string, string | number>) => string,
): Promise<{ success: boolean; error?: string }> {
  const csvText = await file.text();
  const headers = businessId ? { "x-business-id": businessId } : undefined;

  // 1. Submit CSV import run
  onProgress(t("csvUploading"));
  const run = await apiClient.post<ImportRunStatusResponse>(
    "/api/v1/products/import",
    {
      csv: csvText,
      filename: file.name,
      mode,
    },
    { headers },
  );

  if (!run?.id) {
    throw new Error("Missing import run ID");
  }

  // 2. Poll validation status
  onProgress(t("csvValidating"));
  const validatedRun = await pollValidation(run.id, businessId);

  if (validatedRun.status === "failed") {
    const errCount = validatedRun.errorRows ?? validatedRun.errors?.length ?? 0;
    return { success: false, error: t("csvValidationErrors", { count: errCount }) };
  }

  // 3. Explicit merchant confirmation with selected mode
  onProgress(t("csvProcessing"));
  await apiClient.post(`/api/v1/products/import/${run.id}/confirm`, { mode }, { headers });

  // 4. Poll confirmation execution until complete
  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      const polled = await apiClient.get<ImportRunStatusResponse>(
        `/api/v1/products/import/${run.id}`,
        { headers },
      );
      if (polled.status === "succeeded") {
        return { success: true };
      }
      if (polled.status === "failed") {
        const errCount = polled.errorRows ?? polled.errors?.length ?? 0;
        return { success: false, error: t("csvValidationErrors", { count: errCount }) };
      }
    } catch {
      // Retry polling
    }
  }

  return { success: true };
}

interface CsvDropzoneProps {
  file: File | null;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  selectFileText: string;
  hintText: string;
}

function CsvDropzone({
  file,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  fileInputRef,
  selectFileText,
  hintText,
}: CsvDropzoneProps): React.ReactElement {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-5 text-center transition-colors",
        isDragOver
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/50 hover:bg-muted/20",
        file && "border-primary/60 bg-primary/5",
      )}
    >
      <label className="flex cursor-pointer flex-col items-center justify-center space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFileSelect}
          className="sr-only"
          aria-label={selectFileText}
        />
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {file ? (
            <FileSpreadsheet className="size-5 text-primary" />
          ) : (
            <UploadCloud className="size-5" />
          )}
        </div>
        <div className="space-y-1">
          {file ? (
            <>
              <p className="font-semibold text-foreground">{file.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-foreground">{selectFileText}</p>
              <p className="text-[11px] text-muted-foreground">{hintText}</p>
            </>
          )}
        </div>
      </label>
    </div>
  );
}

interface ImportModeSelectorProps {
  mode: ImportMode;
  onModeChange: (mode: ImportMode) => void;
  disabled: boolean;
  t: (key: string) => string;
}

function ImportModeSelector({
  mode,
  onModeChange,
  disabled,
  t,
}: ImportModeSelectorProps): React.ReactElement {
  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-card p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{t("importModeTitle")}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* Merge option */}
        <button
          type="button"
          data-slot="mode-merge-btn"
          disabled={disabled}
          onClick={() => onModeChange("merge")}
          className={cn(
            "flex cursor-pointer flex-col items-start rounded-md border p-3 text-start transition-all",
            mode === "merge"
              ? "border-primary bg-primary/5 text-foreground shadow-xs ring-1 ring-primary"
              : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span
              className={cn(
                "size-2 rounded-full",
                mode === "merge" ? "bg-primary" : "bg-muted-foreground/40",
              )}
            />
            <span>{t("importModeMergeLabel")}</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t("importModeMergeDesc")}
          </p>
        </button>

        {/* Replace option */}
        <button
          type="button"
          data-slot="mode-replace-btn"
          disabled={disabled}
          onClick={() => onModeChange("replace")}
          className={cn(
            "flex cursor-pointer flex-col items-start rounded-md border p-3 text-start transition-all",
            mode === "replace"
              ? "border-destructive/60 bg-destructive/5 text-foreground shadow-xs ring-1 ring-destructive"
              : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span
              className={cn(
                "size-2 rounded-full",
                mode === "replace" ? "bg-destructive" : "bg-muted-foreground/40",
              )}
            />
            <span>{t("importModeReplaceLabel")}</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t("importModeReplaceDesc")}
          </p>
        </button>
      </div>

      {mode === "replace" && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-2 text-[11px] text-destructive"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>{t("importModeReplaceWarning")}</span>
        </div>
      )}
    </div>
  );
}

interface CsvPreviewTableProps {
  items: CsvPreviewItem[];
  totalRows: number;
  t: (key: string, values?: Record<string, string | number>) => string;
}

function CsvPreviewTable({ items, totalRows, t }: CsvPreviewTableProps): React.ReactElement {
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-foreground">{t("csvPreviewTitle")}</span>
        <span className="text-muted-foreground">{t("csvTotalRows", { count: totalRows })}</span>
      </div>
      <div className="max-h-36 overflow-y-auto rounded-md border border-border text-[11px]">
        <table className="w-full text-start">
          <thead className="sticky top-0 bg-muted/70 text-[10px] font-semibold text-muted-foreground uppercase backdrop-blur-xs">
            <tr>
              <th className="px-2 py-1.5 text-start">{t("colProduct")}</th>
              <th className="px-2 py-1.5 text-start">{t("colCategory")}</th>
              <th className="px-2 py-1.5 text-start">{t("colSku")}</th>
              <th className="px-2 py-1.5 text-end">{t("colPrice")}</th>
              <th className="px-2 py-1.5 text-end">{t("colStock")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item, idx) => (
              <tr key={idx} className="hover:bg-muted/30">
                <td className="max-w-30 truncate px-2 py-1.5 font-medium text-foreground">
                  {item.name}
                </td>
                <td className="max-w-20 truncate px-2 py-1.5 text-muted-foreground">
                  {item.category || "—"}
                </td>
                <td className="max-w-20 truncate px-2 py-1.5 text-muted-foreground">
                  {item.sku || "—"}
                </td>
                <td className="px-2 py-1.5 text-end font-medium text-foreground">
                  {item.price.toFixed(3)} DT
                </td>
                <td className="px-2 py-1.5 text-end text-muted-foreground">{item.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CsvImportDialog({
  open,
  onOpenChange,
  businessId,
  onImportSuccess,
}: CsvImportDialogProps): React.ReactElement {
  const t = useTranslations("products");
  const tCommon = useTranslations("common");

  const [file, setFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [isUploading, setIsUploading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [clientPreview, setClientPreview] = useState<{
    totalRows: number;
    preview: CsvPreviewItem[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setFile(null);
    setImportMode("merge");
    setIsUploading(false);
    setImportStatus(null);
    setErrorMessage(null);
    setClientPreview(null);
    setIsDragOver(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFileSelected(selected: File | null) {
    if (!selected) return;
    const error = validateCsvFile(selected, t);
    if (error) {
      setFile(null);
      setClientPreview(null);
      setErrorMessage(error);
      return;
    }
    setFile(selected);
    setErrorMessage(null);
    selected
      .text()
      .then((txt) => {
        const parsed = parseClientCsvPreview(txt);
        setClientPreview(parsed);
      })
      .catch(() => {
        setClientPreview(null);
      });
  }

  function handleDownloadTemplate() {
    downloadCsvTemplateFile().catch(() => {
      setErrorMessage(tCommon("error"));
    });
  }

  function handleImport() {
    if (!file || !businessId) return;

    const validationError = validateCsvFile(file, t);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    runCsvImportWorkflow(file, businessId, importMode, (status) => setImportStatus(status), t)
      .then((res) => {
        if (!res.success && res.error) {
          setErrorMessage(res.error);
          setImportStatus(null);
          return;
        }
        setImportStatus(t("csvImportSuccess"));
        onImportSuccess();
        setTimeout(() => {
          onOpenChange(false);
          resetState();
        }, 1200);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : tCommon("error");
        setErrorMessage(msg);
        setImportStatus(null);
      })
      .finally(() => {
        setIsUploading(false);
      });
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!isUploading) {
          if (!next) resetState();
          onOpenChange(next);
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs transition-opacity" />
        <DialogPrimitive.Popup
          data-slot="csv-import-dialog"
          className="fixed inset-s-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-2xl outline-none rtl:translate-x-1/2"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border/60 pb-3">
            <div>
              <DialogPrimitive.Title className="text-base font-bold text-foreground">
                {t("csvModalTitle")}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted-foreground">
                {t("csvModalDesc")}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              disabled={isUploading}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={tCommon("close")}
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="mt-4 space-y-4 text-xs">
            {/* Download template CTA */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
              <span className="text-muted-foreground">{t("csvDownloadTemplate")}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-1.5 text-xs"
              >
                <Download className="size-3.5" />
                <span>{tCommon("download")}</span>
              </Button>
            </div>

            {/* Drag & Drop File Zone */}
            <CsvDropzone
              file={file}
              isDragOver={isDragOver}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const dropped = e.dataTransfer.files[0];
                handleFileSelected(dropped ?? null);
              }}
              onFileSelect={(e) => {
                const selected = e.target.files?.[0];
                handleFileSelected(selected ?? null);
              }}
              fileInputRef={fileInputRef}
              selectFileText={t("csvSelectFile")}
              hintText={t("uploaderHint")}
            />

            {/* Mode Selector (Merge vs Replace) */}
            <ImportModeSelector
              mode={importMode}
              onModeChange={setImportMode}
              disabled={isUploading}
              t={t}
            />

            {/* Data Preview Table */}
            {clientPreview && clientPreview.preview.length > 0 && (
              <CsvPreviewTable
                items={clientPreview.preview}
                totalRows={clientPreview.totalRows}
                t={t}
              />
            )}

            {/* Error Message */}
            {errorMessage && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Status updates */}
            {importStatus && (
              <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
                {isUploading ? (
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4 shrink-0" />
                )}
                <span>{importStatus}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-3">
              {file && !isUploading && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetState}
                  disabled={isUploading}
                >
                  {tCommon("clear")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  resetState();
                }}
                disabled={isUploading}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={importMode === "replace" ? "destructive" : "default"}
                onClick={handleImport}
                disabled={!file || isUploading}
                className="flex items-center gap-1.5"
              >
                {isUploading && <Loader2 className="size-3.5 animate-spin" />}
                <span>
                  {errorMessage
                    ? tCommon("retry")
                    : importMode === "replace"
                      ? t("csvConfirmReplace")
                      : t("csvConfirmImport")}
                </span>
              </Button>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
