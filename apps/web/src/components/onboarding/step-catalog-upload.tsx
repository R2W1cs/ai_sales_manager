"use client";

import {
  PackageCheck,
  Download,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Check,
  RefreshCw,
  PlusCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useState, useEffect } from "react";

import { ManualProductForm } from "@/components/onboarding/manual-product-form";
import { StepNavigationButtons } from "@/components/onboarding/step-navigation-buttons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface CsvParsedPreviewItem {
  sku?: string;
  title: string;
  price: number;
  stock: number;
  category?: string;
}

interface ImportRunResponse {
  id: string;
  status: string;
  mode?: "merge" | "replace";
  totalRows?: number | null;
  successRows?: number | null;
  errorRows?: number | null;
  preview?: CsvParsedPreviewItem[];
  errors?: Array<{ row: number; column?: string; message: string }>;
}

export interface ExistingProductItem {
  id: string;
  name: string;
  category?: string;
  price: number;
  stock: number;
  sku?: string;
}

export interface StepCatalogUploadProps {
  businessId: string;
  onNext: () => void;
  onPrev: () => void;
}

const IMPORT_MODES = [
  {
    value: "merge" as const,
    slot: "mode-merge-btn",
    label: "Ajouter & Mettre à jour",
    desc: "Conserve le catalogue existant. Met à jour les prix/stocks des SKUs correspondants et ajoute les nouveaux articles.",
    dotActive: "bg-primary",
    borderActive: "border-primary bg-primary/10 ring-primary",
  },
  {
    value: "replace" as const,
    slot: "mode-replace-btn",
    label: "Remplacer tout le catalogue",
    desc: "Remplace le catalogue existant. Les articles actuels qui ne figurent pas dans ce fichier seront archivés.",
    dotActive: "bg-destructive",
    borderActive: "border-destructive bg-destructive/10 ring-destructive",
  },
];

interface ExistingProductsTableProps {
  existingProducts: ExistingProductItem[];
}

function ExistingProductsTable({
  existingProducts,
}: ExistingProductsTableProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <span className="text-xs font-semibold text-foreground">
          {tOnboarding("catalogAvailableTitle")}
        </span>
        <span className="text-xs text-muted-foreground">
          {tOnboarding("catalogRefCount", { count: existingProducts.length })}
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-md border border-border text-xs">
        <table className="w-full text-start">
          <thead className="sticky top-0 bg-muted/70 text-[11px] font-semibold text-muted-foreground uppercase backdrop-blur-sm">
            <tr>
              <th className="px-3 py-2">{tOnboarding("colProduct")}</th>
              <th className="px-3 py-2">{tOnboarding("colCategory")}</th>
              <th className="px-3 py-2">{tOnboarding("colSku")}</th>
              <th className="px-3 py-2 text-end">{tOnboarding("colPrice")}</th>
              <th className="px-3 py-2 text-end">{tOnboarding("colStock")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {existingProducts.map((item) => (
              <tr key={item.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{item.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{item.category || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{item.sku || "—"}</td>
                <td className="px-3 py-2 text-end font-medium">{item.price.toFixed(3)} DT</td>
                <td className="px-3 py-2 text-end font-medium">
                  {item.stock > 0 ? (
                    <span className="text-success">{item.stock}</span>
                  ) : (
                    <span className="font-semibold text-destructive">
                      {tOnboarding("stockOut")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ConfirmedCatalogViewProps {
  existingProducts: ExistingProductItem[];
  onStartCsvReimport: () => void;
  onStartManualReimport: () => void;
}

function ConfirmedCatalogView({
  existingProducts,
  onStartCsvReimport,
  onStartManualReimport,
}: ConfirmedCatalogViewProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-success/30 bg-success/10 p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/20 text-success">
          <Check className="size-6" />
        </div>
        <h4 className="mt-3 text-sm font-semibold text-foreground">
          {tOnboarding("existingCatalogCount", { count: existingProducts.length })}
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">{tOnboarding("catalogDesc")}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onStartCsvReimport}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className="size-3.5" />
            <span>{tOnboarding("tabCsvUpload")}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onStartManualReimport}
            className="gap-1.5 text-xs"
          >
            <PlusCircle className="size-3.5" />
            <span>{tOnboarding("tabManualAdd")}</span>
          </Button>
        </div>
      </div>

      {existingProducts.length > 0 && <ExistingProductsTable existingProducts={existingProducts} />}
    </div>
  );
}

interface CsvDropzoneProps {
  fileName: string | null;
  disabled: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function CsvDropzone({ fileName, disabled, onFileChange }: CsvDropzoneProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div
      data-slot="csv-dropzone"
      className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 p-8 text-center transition-colors hover:bg-muted/40"
    >
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label={tOnboarding("selectCsvAria")}
        onChange={onFileChange}
        disabled={disabled}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UploadCloud className="size-6" />
      </div>
      <div className="mt-3">
        <p className="text-sm font-medium text-foreground">
          {fileName || tOnboarding("dropzonePrompt")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{tOnboarding("dropzoneSub")}</p>
      </div>
    </div>
  );
}

interface ImportModeSelectorProps {
  importMode: "merge" | "replace";
  setImportMode: (mode: "merge" | "replace") => void;
  existingProductCount: number;
}

function ImportModeSelector({
  importMode,
  setImportMode,
  existingProductCount,
}: ImportModeSelectorProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div
      data-slot="import-mode-selector"
      className="space-y-2 rounded-lg border border-border bg-card p-3.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">
          {tOnboarding("importModeTitle")}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {importMode === "merge"
            ? tOnboarding("importModeMergeActive")
            : tOnboarding("importModeReplaceActive")}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {IMPORT_MODES.map((mode) => {
          const isSelected = importMode === mode.value;
          const label =
            mode.value === "merge"
              ? tOnboarding("modeMergeLabel")
              : tOnboarding("modeReplaceLabel");
          const desc =
            mode.value === "merge" ? tOnboarding("modeMergeDesc") : tOnboarding("modeReplaceDesc");
          return (
            <button
              key={mode.value}
              type="button"
              data-slot={mode.slot}
              onClick={() => setImportMode(mode.value)}
              className={cn(
                "flex cursor-pointer flex-col items-start rounded-md border p-2.5 text-start transition-all",
                isSelected
                  ? cn("text-foreground shadow-xs ring-1", mode.borderActive)
                  : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    isSelected ? mode.dotActive : "bg-muted-foreground/40",
                  )}
                />
                <span>{label}</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
            </button>
          );
        })}
      </div>
      {importMode === "replace" && existingProductCount > 0 && (
        <div className="flex items-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/5 p-2 text-[11px] text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{tOnboarding("modeReplaceWarning", { count: existingProductCount })}</span>
        </div>
      )}
    </div>
  );
}

interface ValidationSummaryTableProps {
  importRun: ImportRunResponse;
  importMode: "merge" | "replace";
  isConfirming: boolean;
  onConfirm: () => void;
}

function ValidationSummaryTable({
  importRun,
  importMode,
  isConfirming,
  onConfirm,
}: ValidationSummaryTableProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="size-4 text-primary" />
          <span className="text-xs font-semibold">{tOnboarding("preValidationReport")}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="font-medium text-success">
            ✓{" "}
            {tOnboarding("validRows", {
              count: importRun.successRows ?? importRun.preview?.length ?? 0,
            })}
          </span>
          {Boolean(importRun.errorRows) && (
            <span className="font-medium text-destructive">
              ⚠ {tOnboarding("errorRows", { count: importRun.errorRows ?? 0 })}
            </span>
          )}
        </div>
      </div>

      {importRun.preview && importRun.preview.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-border text-xs">
          <table className="w-full text-start">
            <thead className="bg-muted/50 text-[11px] font-semibold text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2">{tOnboarding("colProduct")}</th>
                <th className="px-3 py-2">{tOnboarding("colSku")}</th>
                <th className="px-3 py-2 text-end">{tOnboarding("colPrice")}</th>
                <th className="px-3 py-2 text-end">{tOnboarding("colStock")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {importRun.preview.slice(0, 5).map((item) => (
                <tr key={item.sku || item.title} className="hover:bg-muted/30">
                  <td className="px-3 py-1.5 font-medium">{item.title}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{item.sku || "—"}</td>
                  <td className="px-3 py-1.5 text-end font-medium">{item.price} DT</td>
                  <td className="px-3 py-1.5 text-end font-medium">{item.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-muted-foreground">
          {importMode === "replace"
            ? "Confirmer le remplacement du catalogue complet par ce fichier."
            : "Confirmer la mise à jour et l'ajout de ces produits dans votre catalogue."}
        </span>
        <Button
          size="sm"
          onClick={onConfirm}
          loading={isConfirming}
          variant={importMode === "replace" ? "destructive" : "default"}
          data-slot="btn-confirm-import"
          className="gap-1.5 text-xs"
        >
          <CheckCircle2 className="size-3.5" />
          <span>
            {importMode === "replace" ? "Remplacer le catalogue" : "Confirmer l'importation"}
          </span>
        </Button>
      </div>
    </div>
  );
}

function downloadCatalogTemplate(): void {
  fetch("/api/v1/products/import/template", {
    headers: {
      Authorization: `Bearer ${apiClient.getAccessToken() || ""}`,
    },
  })
    .then((res) => {
      if (!res.ok) throw new Error("Impossible de télécharger le gabarit CSV");
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "catalog-import-template.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    })
    .catch(() => {
      const csvHeader =
        "nom,description,prix,stock,taille,couleur,sku\nChemise Oxford Slim,Chemise en coton d'Égypte premium,89.0,15,M,Blanc,SHIRT-OX-WHT-M\nRobe Soie Fleurie,Robe longue d'été imprimé floral,145.0,8,S,Bleu,DRS-SLK-BLU-S\n";
      const blob = new Blob([csvHeader], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "gabarit-catalogue-ia.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
}

interface CatalogTabsHeaderProps {
  activeTab: "csv" | "manual";
  onSelectTab: (tab: "csv" | "manual") => void;
}

function CatalogTabsHeader({ activeTab, onSelectTab }: CatalogTabsHeaderProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <div className="flex border-b border-border">
      <button
        type="button"
        data-slot="tab-csv"
        onClick={() => onSelectTab("csv")}
        className={cn(
          "flex cursor-pointer items-center gap-2 border-b-2 px-4 py-2 text-xs font-medium transition-colors",
          activeTab === "csv"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <FileSpreadsheet className="size-4" />
        <span>{tOnboarding("tabCsvUpload")}</span>
      </button>
      <button
        type="button"
        data-slot="tab-manual"
        onClick={() => onSelectTab("manual")}
        className={cn(
          "flex cursor-pointer items-center gap-2 border-b-2 px-4 py-2 text-xs font-medium transition-colors",
          activeTab === "manual"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <PlusCircle className="size-4" />
        <span>{tOnboarding("tabManualAdd")}</span>
      </button>
    </div>
  );
}

interface CsvUploadSectionProps {
  fileName: string | null;
  disabled: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importMode: "merge" | "replace";
  setImportMode: (mode: "merge" | "replace") => void;
  existingProductCount: number;
  isReimporting: boolean;
  onCancelReimport: () => void;
  importRun: ImportRunResponse | null;
  isConfirming: boolean;
  onConfirmImport: () => void;
}

function CsvUploadSection({
  fileName,
  disabled,
  onFileChange,
  importMode,
  setImportMode,
  existingProductCount,
  isReimporting,
  onCancelReimport,
  importRun,
  isConfirming,
  onConfirmImport,
}: CsvUploadSectionProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");

  return (
    <>
      <CsvDropzone fileName={fileName} disabled={disabled} onFileChange={onFileChange} />

      <ImportModeSelector
        importMode={importMode}
        setImportMode={setImportMode}
        existingProductCount={existingProductCount}
      />

      {isReimporting && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancelReimport}
            className="text-xs text-muted-foreground"
          >
            {tOnboarding("cancelReimport")}
          </Button>
        </div>
      )}

      {importRun && (
        <ValidationSummaryTable
          importRun={importRun}
          importMode={importMode}
          isConfirming={isConfirming}
          onConfirm={onConfirmImport}
        />
      )}
    </>
  );
}

export function StepCatalogUpload({
  businessId,
  onNext,
  onPrev,
}: StepCatalogUploadProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "confirming" | "confirmed">("idle");
  const [importRun, setImportRun] = useState<ImportRunResponse | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [existingProducts, setExistingProducts] = useState<ExistingProductItem[]>([]);
  const [isReimporting, setIsReimporting] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<"csv" | "manual">("csv");

  const isUploading = status === "uploading";
  const isConfirming = status === "confirming";
  const isConfirmed = status === "confirmed" || existingProducts.length > 0;

  function fetchCatalog(bizId: string) {
    if (!bizId) return;
    apiClient
      .get<{
        data: Array<{
          id: string;
          name: string;
          status?: string;
          category?: { name: string } | null;
          variants?: Array<{ price: number; stock: number; sku?: string | null }>;
        }>;
      }>("/api/v1/products?status=active&limit=50", {
        headers: { "x-business-id": bizId },
      })
      .then((res) => {
        if (!res?.data) return;
        const activeOnly = res.data.filter((p) => !p.status || p.status === "active");
        const mapped: ExistingProductItem[] = activeOnly.map((p) => {
          const v = p.variants?.[0];
          return {
            id: p.id,
            name: p.name,
            category: p.category?.name,
            price: v ? Number(v.price) : 0,
            stock: v ? Number(v.stock) : 0,
            sku: v?.sku ?? undefined,
          };
        });
        setExistingProducts(mapped);
        setStatus(mapped.length > 0 ? "confirmed" : "idle");
      })
      .catch(() => {});
  }

  useEffect(() => {
    fetchCatalog(businessId);
  }, [businessId]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFileName(selected.name);
    setErrorMessage(null);
    setImportRun(null);
    setStatus("uploading");

    try {
      const text = await selected.text();
      let run = await apiClient.post<ImportRunResponse>(
        "/api/v1/products/import",
        {
          csv: text,
          filename: selected.name,
          mode: importMode,
        },
        {
          headers: businessId ? { "x-business-id": businessId } : undefined,
        },
      );

      if (run.status === "uploaded") {
        for (let i = 0; i < 15; i++) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          try {
            const polled = await apiClient.get<ImportRunResponse>(
              `/api/v1/products/import/${run.id}`,
              {
                headers: businessId ? { "x-business-id": businessId } : undefined,
              },
            );
            if (polled.status === "validated" || polled.status === "failed") {
              run = polled;
              break;
            }
          } catch {}
        }
      }

      setImportRun(run);
      setStatus("idle");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Erreur lors du traitement et de la validation du fichier CSV.";
      setErrorMessage(msg);
      setStatus("idle");
    }
  }

  async function handleConfirmImport() {
    if (!importRun?.id) return;
    setStatus("confirming");
    setErrorMessage(null);

    try {
      let run = await apiClient.post<ImportRunResponse>(
        `/api/v1/products/import/${importRun.id}/confirm`,
        {
          mode: importMode,
        },
        {
          headers: businessId ? { "x-business-id": businessId } : undefined,
        },
      );

      if (run.status === "running") {
        for (let i = 0; i < 20; i++) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          try {
            const polled = await apiClient.get<ImportRunResponse>(
              `/api/v1/products/import/${run.id}`,
              {
                headers: businessId ? { "x-business-id": businessId } : undefined,
              },
            );
            if (polled.status === "succeeded" || polled.status === "failed") {
              run = polled;
              break;
            }
          } catch {}
        }
      }

      if (run.status === "succeeded") {
        setStatus("confirmed");
        setIsReimporting(false);
        fetchCatalog(businessId);
      } else {
        setErrorMessage("L'importation n'a pas pu être confirmée. Veuillez réessayer.");
        setStatus("idle");
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Erreur lors de la confirmation de l'importation.";
      setErrorMessage(msg);
      setStatus("idle");
    }
  }

  return (
    <div data-slot="step-catalog-upload" className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <PackageCheck className="size-5" />
              <CardTitle>{tOnboarding("catalogTitle")}</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadCatalogTemplate}
              className="gap-1.5 text-xs"
            >
              <Download className="size-3.5" />
              <span>CSV</span>
            </Button>
          </div>
          <CardDescription>{tOnboarding("catalogDesc")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isConfirmed && !isReimporting ? (
            <ConfirmedCatalogView
              existingProducts={existingProducts}
              onStartCsvReimport={() => {
                setActiveTab("csv");
                setIsReimporting(true);
              }}
              onStartManualReimport={() => {
                setActiveTab("manual");
                setIsReimporting(true);
              }}
            />
          ) : (
            <>
              <CatalogTabsHeader
                activeTab={activeTab}
                onSelectTab={(tab) => {
                  setActiveTab(tab);
                  setErrorMessage(null);
                }}
              />

              {activeTab === "manual" ? (
                <ManualProductForm
                  businessId={businessId || ""}
                  onProductCreated={() => fetchCatalog(businessId || "")}
                  onBack={() => setIsReimporting(false)}
                  isReimporting={isReimporting}
                />
              ) : (
                <CsvUploadSection
                  fileName={fileName}
                  disabled={isUploading || isConfirming}
                  onFileChange={handleFileChange}
                  importMode={importMode}
                  setImportMode={setImportMode}
                  existingProductCount={existingProducts.length}
                  isReimporting={isReimporting}
                  onCancelReimport={() => setIsReimporting(false)}
                  importRun={importRun}
                  isConfirming={isConfirming}
                  onConfirmImport={handleConfirmImport}
                />
              )}
            </>
          )}

          <StepNavigationButtons onPrev={onPrev} onNext={onNext} />
        </CardContent>
      </Card>
    </div>
  );
}
