"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Edit2,
  Filter,
  Image as ImageIcon,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";

import { useTenant } from "@/components/layout/tenant-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack } from "@/components/ui/stack";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { CategoryResponse, ProductResponse, ProductStatus } from "@app/shared";

import { CsvImportDialog } from "./csv-import-dialog";
import { ProductFormDialog } from "./product-form-dialog";
import { VariantDrawer } from "./variant-drawer";

export interface ProductListProps {
  businessId?: string | null;
  initialProducts?: ProductResponse[];
  initialCategories?: CategoryResponse[];
}

function StatusBadge({
  status,
  activeLabel,
  draftLabel,
  archivedLabel,
}: {
  status: ProductStatus;
  activeLabel: string;
  draftLabel: string;
  archivedLabel: string;
}): React.ReactElement {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
        <span className="size-1.5 rounded-full bg-success" />
        {activeLabel}
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
        <span className="size-1.5 rounded-full bg-warning" />
        {draftLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <span className="size-1.5 rounded-full bg-muted-foreground" />
      {archivedLabel}
    </span>
  );
}

function StockBadge({
  physicalStock,
  outOfStockLabel,
  lowStockLabel,
  inStockLabel,
}: {
  physicalStock: number;
  outOfStockLabel: string;
  lowStockLabel: string;
  inStockLabel: string;
}): React.ReactElement {
  if (physicalStock <= 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
        {outOfStockLabel}
      </span>
    );
  }
  if (physicalStock <= 5) {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
        {lowStockLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
      {inStockLabel}
    </span>
  );
}

interface ProductTableRowProps {
  product: ProductResponse;
  canManage: boolean;
  onSelect: (product: ProductResponse) => void;
  onEdit: (product: ProductResponse) => void;
  onArchive: (product: ProductResponse) => void;
  onRestore: (product: ProductResponse) => void;
  onDelete: (product: ProductResponse) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

function ProductTableRow({
  product,
  canManage,
  onSelect,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  t,
}: ProductTableRowProps): React.ReactElement {
  const primaryImg = product.images?.find((img) => img.isPrimary)?.url || product.images?.[0]?.url;
  const physicalStock = (product.variants || []).reduce((acc, v) => acc + (v.stock || 0), 0);
  const availableStock = (product.variants || []).reduce(
    (acc, v) => acc + (v.availableStock ?? v.stock ?? 0),
    0,
  );
  const variantCount = product.variants?.length || 0;

  function computePrice(): string {
    if (!product.variants || product.variants.length === 0) {
      return t("priceCurrency", { price: "0" });
    }
    const prices = product.variants.map((v) =>
      typeof v.price === "string" ? parseFloat(v.price) : v.price,
    );
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) {
      return t("priceCurrency", { price: min.toString() });
    }
    return t("priceRange", { min: min.toString(), max: max.toString() });
  }

  return (
    <tr
      onClick={() => onSelect(product)}
      className="cursor-pointer transition-colors hover:bg-muted/40"
      data-product-id={product.id}
    >
      <td className="px-4 py-3">
        <div className="flex size-10 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
          {primaryImg ? (
            <Image
              src={primaryImg}
              alt={product.name || product.title}
              width={40}
              height={40}
              className="size-full object-cover"
              unoptimized
            />
          ) : (
            <ImageIcon className="size-4 text-muted-foreground" />
          )}
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="font-semibold text-foreground">{product.name || product.title}</div>
        {product.description && (
          <div className="line-clamp-1 max-w-xs text-[11px] text-muted-foreground">
            {product.description}
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        <span className="inline-flex rounded-md bg-muted/60 px-2 py-0.5 text-[11px] text-foreground">
          {product.category?.name || t("uncategorized")}
        </span>
      </td>

      <td className="px-4 py-3">
        <span className="font-medium text-foreground">
          {variantCount === 1
            ? t("variantSingle", { count: 1 })
            : t("variantMultiple", { count: variantCount })}
        </span>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-foreground">{physicalStock}</span>
          <StockBadge
            physicalStock={physicalStock}
            outOfStockLabel={t("outOfStock")}
            lowStockLabel={t("lowStock")}
            inStockLabel={t("inStock")}
          />
        </div>
      </td>

      <td className="px-4 py-3 font-medium text-muted-foreground">{availableStock}</td>
      <td className="px-4 py-3 font-semibold text-foreground">{computePrice()}</td>

      <td className="px-4 py-3">
        <StatusBadge
          status={product.status}
          activeLabel={t("statusActive")}
          draftLabel={t("statusDraft")}
          archivedLabel={t("statusArchived")}
        />
      </td>

      <td className="px-4 py-3 text-end">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canManage}
            title={!canManage ? t("rbacDisabled") : t("editProduct")}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(product);
            }}
            className={cn(
              "size-7 p-0 text-muted-foreground hover:text-foreground",
              !canManage && "cursor-not-allowed opacity-40",
            )}
            aria-label={t("editProduct")}
            data-slot="btn-edit-product"
          >
            <Edit2 className="size-3.5" />
          </Button>

          {product.status === "archived" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canManage}
              title={!canManage ? t("rbacDisabled") : t("restoreProduct")}
              onClick={(e) => {
                e.stopPropagation();
                onRestore(product);
              }}
              className={cn(
                "size-7 p-0 text-muted-foreground hover:text-foreground",
                !canManage && "cursor-not-allowed opacity-40",
              )}
              aria-label={t("restoreProduct")}
              data-slot="btn-restore-product"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canManage}
              title={!canManage ? t("rbacDisabled") : t("archiveProduct")}
              onClick={(e) => {
                e.stopPropagation();
                onArchive(product);
              }}
              className={cn(
                "size-7 p-0 text-muted-foreground hover:text-warning",
                !canManage && "cursor-not-allowed opacity-40",
              )}
              aria-label={t("archiveProduct")}
              data-slot="btn-archive-product"
            >
              <Archive className="size-3.5" />
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canManage}
            title={!canManage ? t("rbacDisabled") : t("deleteProduct")}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(product);
            }}
            className={cn(
              "size-7 p-0 text-muted-foreground hover:text-destructive",
              !canManage && "cursor-not-allowed opacity-40",
            )}
            aria-label={t("deleteProduct")}
            data-slot="btn-delete-product"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

interface ProductTableToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  categories: CategoryResponse[];
  canManage: boolean;
  onImportCsv: () => void;
  onAddProduct: () => void;
  t: (key: string) => string;
}

function ProductTableToolbar({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedStatus,
  onStatusChange,
  categories,
  canManage,
  onImportCsv,
  onAddProduct,
  t,
}: ProductTableToolbarProps): React.ReactElement {
  return (
    <Stack direction="row" justify="between" wrap className="gap-3 sm:items-center">
      <Stack direction="row" size="sm" wrap className="flex-1">
        <div className="relative max-w-sm min-w-55 flex-1">
          <Search className="absolute inset-s-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("searchPlaceholder")}
            dir="auto"
            className="h-9 ps-9 text-xs"
          />
        </div>

        <Stack direction="row" size="xs">
          <Filter className="size-3.5 text-muted-foreground" />
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-xs focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={t("filterCategory")}
          >
            <option value="" className="bg-card text-foreground">
              {t("filterCategory")}
            </option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id} className="bg-card text-foreground">
                {cat.name}
              </option>
            ))}
          </select>
        </Stack>

        <select
          value={selectedStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-xs focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={t("filterStatus")}
        >
          <option value="" className="bg-card text-foreground">
            {t("filterStatus")}
          </option>
          <option value="active" className="bg-card text-foreground">
            {t("statusActive")}
          </option>
          <option value="draft" className="bg-card text-foreground">
            {t("statusDraft")}
          </option>
          <option value="archived" className="bg-card text-foreground">
            {t("statusArchived")}
          </option>
        </select>
      </Stack>

      <Stack direction="row" size="xs">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canManage}
          title={!canManage ? t("rbacDisabled") : t("importCsv")}
          onClick={onImportCsv}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            !canManage && "cursor-not-allowed opacity-50",
          )}
        >
          <Upload className="size-3.5" />
          <span>{t("importCsv")}</span>
        </Button>

        <Button
          type="button"
          size="sm"
          disabled={!canManage}
          title={!canManage ? t("rbacDisabled") : t("addProduct")}
          onClick={onAddProduct}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            !canManage && "cursor-not-allowed opacity-50",
          )}
        >
          <Plus className="size-3.5" />
          <span>{t("addProduct")}</span>
        </Button>
      </Stack>
    </Stack>
  );
}

interface ArchiveConfirmDialogProps {
  product: ProductResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isArchiving: boolean;
}

function ArchiveConfirmDialog({
  product,
  open,
  onOpenChange,
  onConfirm,
  isArchiving,
}: ArchiveConfirmDialogProps): React.ReactElement {
  const t = useTranslations("products");
  const tCommon = useTranslations("common");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs transition-opacity" />
        <DialogPrimitive.Popup
          data-slot="archive-confirm-dialog"
          className="fixed inset-s-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-2xl transition-opacity outline-none rtl:translate-x-1/2"
        >
          <div className="flex items-start justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
                <Archive className="size-4.5" />
              </div>
              <DialogPrimitive.Title className="text-base font-bold text-foreground">
                {t("archiveConfirmTitle")}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={tCommon("close")}
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="mt-3 space-y-3 text-xs text-muted-foreground">
            <p>{t("archiveConfirmDesc")}</p>
            {product && (
              <div className="rounded-md border border-border bg-muted/40 p-2.5 font-semibold text-foreground">
                {product.name}
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/60 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isArchiving}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onConfirm}
              disabled={isArchiving}
            >
              {isArchiving ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{tCommon("loading")}</span>
                </span>
              ) : (
                <span>{t("archiveConfirmBtn")}</span>
              )}
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface RestoreConfirmDialogProps {
  product: ProductResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isRestoring: boolean;
}

function RestoreConfirmDialog({
  product,
  open,
  onOpenChange,
  onConfirm,
  isRestoring,
}: RestoreConfirmDialogProps): React.ReactElement {
  const t = useTranslations("products");
  const tCommon = useTranslations("common");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs transition-opacity" />
        <DialogPrimitive.Popup
          data-slot="restore-confirm-dialog"
          className="fixed inset-s-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-2xl transition-opacity outline-none rtl:translate-x-1/2"
        >
          <div className="flex items-start justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <RotateCcw className="size-4.5" />
              </div>
              <DialogPrimitive.Title className="text-base font-bold text-foreground">
                {t("restoreConfirmTitle")}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={tCommon("close")}
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="mt-3 space-y-3 text-xs text-muted-foreground">
            <p>{t("restoreConfirmDesc")}</p>
            {product && (
              <div className="rounded-md border border-border bg-muted/40 p-2.5 font-semibold text-foreground">
                {product.name}
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/60 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isRestoring}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onConfirm}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{tCommon("loading")}</span>
                </span>
              ) : (
                <span>{t("restoreConfirmBtn")}</span>
              )}
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface DeleteConfirmDialogProps {
  product: ProductResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  onArchiveInstead: () => void;
  isDeleting: boolean;
  isBlockedByOrders: boolean;
}

function DeleteConfirmDialog({
  product,
  open,
  onOpenChange,
  onConfirmDelete,
  onArchiveInstead,
  isDeleting,
  isBlockedByOrders,
}: DeleteConfirmDialogProps): React.ReactElement {
  const t = useTranslations("products");
  const tCommon = useTranslations("common");
  const blocked = Boolean(product?.hasOrders) || isBlockedByOrders;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs transition-opacity" />
        <DialogPrimitive.Popup
          data-slot="delete-confirm-dialog"
          className="fixed inset-s-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-2xl transition-opacity outline-none rtl:translate-x-1/2"
        >
          <div className="flex items-start justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  blocked ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive",
                )}
              >
                {blocked ? <AlertCircle className="size-4.5" /> : <Trash2 className="size-4.5" />}
              </div>
              <DialogPrimitive.Title className="text-base font-bold text-foreground">
                {blocked ? t("deleteBlockedTitle") : t("deleteConfirmTitle")}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={tCommon("close")}
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="mt-3 space-y-3 text-xs text-muted-foreground">
            <p>{blocked ? t("deleteBlockedDesc") : t("deleteConfirmDesc")}</p>
            {product && (
              <div className="rounded-md border border-border bg-muted/40 p-2.5 font-semibold text-foreground">
                {product.name}
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/60 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isDeleting}
            >
              {tCommon("cancel")}
            </Button>

            {blocked ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={onArchiveInstead}
                disabled={isDeleting}
              >
                {t("deleteBlockedAction")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={onConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>{tCommon("loading")}</span>
                  </span>
                ) : (
                  <span>{t("deleteConfirmBtn")}</span>
                )}
              </Button>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ProductList({
  businessId: propBusinessId,
  initialProducts = [],
  initialCategories = [],
}: ProductListProps): React.ReactElement {
  const t = useTranslations("products");
  const tCommon = useTranslations("common");
  const { currentBusinessId, currentRole } = useTenant();

  const businessId = propBusinessId ?? currentBusinessId;
  const canManage = currentRole === "owner" || currentRole === "admin";

  const [products, setProducts] = useState<ProductResponse[]>(initialProducts);
  const [categories, setCategories] = useState<CategoryResponse[]>(initialCategories);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Dialog & Drawer states
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductResponse | null>(null);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [productToArchive, setProductToArchive] = useState<ProductResponse | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [productToRestore, setProductToRestore] = useState<ProductResponse | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [productToDelete, setProductToDelete] = useState<ProductResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteBlockedByOrders, setDeleteBlockedByOrders] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedDrawerProductId, setSelectedDrawerProductId] = useState<string | null>(null);

  // Synchronously purge tenant-scoped state when businessId changes
  const [prevBusinessId, setPrevBusinessId] = useState(businessId);
  if (businessId !== prevBusinessId) {
    setPrevBusinessId(businessId);
    setProducts([]);
    setCategories([]);
    setNextCursor(null);
    setSelectedDrawerProductId(null);
    setEditingProduct(null);
    setProductToArchive(null);
    setProductToRestore(null);
    setProductToDelete(null);
    setDeleteBlockedByOrders(false);
    setFormDialogOpen(false);
    setCsvDialogOpen(false);
    setSearchQuery("");
    setSelectedCategory("");
    setSelectedStatus("");
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(Boolean(businessId));
  }

  const selectedDrawerProduct = useMemo(
    () =>
      selectedDrawerProductId
        ? (products.find((p) => p.id === selectedDrawerProductId) ?? null)
        : null,
    [products, selectedDrawerProductId],
  );

  // Load categories
  useEffect(() => {
    let mounted = true;
    if (!businessId) return;

    apiClient
      .get<CategoryResponse[]>("/api/v1/categories", {
        headers: { "x-business-id": businessId },
      })
      .then((res) => {
        if (mounted) {
          setCategories(Array.isArray(res) ? res : []);
        }
      })
      .catch(() => {
        if (mounted) {
          setCategories([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, [businessId]);

  // Load products on filter change or reload
  useEffect(() => {
    let active = true;
    if (!businessId) return;

    const timer = setTimeout(() => {
      setIsLoading(true);
      setErrorMessage(null);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (selectedCategory) params.set("categoryId", selectedCategory);
      if (selectedStatus) params.set("status", selectedStatus);

      const queryStr = params.toString() ? `?${params.toString()}` : "";
      apiClient
        .get<{ data: ProductResponse[]; next_cursor?: string | null }>(
          `/api/v1/products${queryStr}`,
          {
            headers: { "x-business-id": businessId },
          },
        )
        .then((res) => {
          if (!active) return;
          const items = res.data || [];
          setProducts(items);
          setNextCursor(res.next_cursor || null);
        })
        .catch(() => {
          if (!active) return;
          setProducts([]);
          setNextCursor(null);
          setErrorMessage(tCommon("error"));
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [businessId, searchQuery, selectedCategory, selectedStatus, reloadTrigger, tCommon]);

  function handleLoadMore() {
    if (!businessId || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (selectedCategory) params.set("categoryId", selectedCategory);
    if (selectedStatus) params.set("status", selectedStatus);
    params.set("cursor", nextCursor);

    apiClient
      .get<{ data: ProductResponse[]; next_cursor?: string | null }>(
        `/api/v1/products?${params.toString()}`,
        {
          headers: { "x-business-id": businessId },
        },
      )
      .then((res) => {
        setProducts((prev) => [...prev, ...(res.data || [])]);
        setNextCursor(res.next_cursor || null);
      })
      .catch(() => {
        setErrorMessage(tCommon("error"));
      })
      .finally(() => {
        setIsLoadingMore(false);
      });
  }

  function handleOpenCreate() {
    if (!canManage) return;
    setEditingProduct(null);
    setFormDialogOpen(true);
  }

  function handleOpenEdit(prod: ProductResponse) {
    if (!canManage) return;
    setEditingProduct(prod);
    setFormDialogOpen(true);
  }

  function handleConfirmArchive() {
    if (!productToArchive || !businessId || !canManage) return;
    const toArchiveId = productToArchive.id;
    setIsArchiving(true);
    archiveProductApi(toArchiveId, businessId)
      .then(() => {
        setProductToArchive(null);
        if (selectedDrawerProductId === toArchiveId) {
          setSelectedDrawerProductId(null);
        }
        setSuccessMessage(t("productArchivedSuccess"));
        setReloadTrigger((v) => v + 1);
      })
      .catch(() => {
        setErrorMessage(tCommon("error"));
      })
      .finally(() => {
        setIsArchiving(false);
      });
  }

  function handleConfirmRestore() {
    if (!productToRestore || !businessId || !canManage) return;
    const toRestoreId = productToRestore.id;
    setIsRestoring(true);
    restoreProductApi(toRestoreId, businessId)
      .then(() => {
        setProductToRestore(null);
        setSuccessMessage(t("productRestoredSuccess"));
        setReloadTrigger((v) => v + 1);
      })
      .catch(() => {
        setErrorMessage(tCommon("error"));
      })
      .finally(() => {
        setIsRestoring(false);
      });
  }

  function handleOpenDelete(prod: ProductResponse) {
    if (!canManage) return;
    setDeleteBlockedByOrders(false);
    setProductToDelete(prod);
  }

  function handleConfirmDelete() {
    if (!productToDelete || !businessId || !canManage) return;
    const toDeleteId = productToDelete.id;
    setIsDeleting(true);
    setDeleteBlockedByOrders(false);

    deleteProductApi(toDeleteId, businessId)
      .then(() => {
        setProductToDelete(null);
        if (selectedDrawerProductId === toDeleteId) {
          setSelectedDrawerProductId(null);
        }
        setSuccessMessage(t("productDeletedSuccess"));
        setReloadTrigger((v) => v + 1);
      })
      .catch((err: unknown) => {
        const errorObj = err as {
          status?: number;
          response?: { status?: number };
          error?: { code?: string };
        };
        if (
          errorObj?.status === 409 ||
          errorObj?.response?.status === 409 ||
          errorObj?.error?.code === "product_has_orders"
        ) {
          setDeleteBlockedByOrders(true);
        } else {
          setErrorMessage(tCommon("error"));
          setProductToDelete(null);
        }
      })
      .finally(() => {
        setIsDeleting(false);
      });
  }

  function handleArchiveFromDelete() {
    if (!productToDelete || !businessId || !canManage) return;
    const toArchiveId = productToDelete.id;
    setIsDeleting(true);
    archiveProductApi(toArchiveId, businessId)
      .then(() => {
        setProductToDelete(null);
        setDeleteBlockedByOrders(false);
        if (selectedDrawerProductId === toArchiveId) {
          setSelectedDrawerProductId(null);
        }
        setSuccessMessage(t("productArchivedSuccess"));
        setReloadTrigger((v) => v + 1);
      })
      .catch(() => {
        setErrorMessage(tCommon("error"));
      })
      .finally(() => {
        setIsDeleting(false);
      });
  }

  return (
    <div className="space-y-4" data-slot="product-list">
      <ProductTableToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        categories={categories}
        canManage={canManage}
        onImportCsv={() => setCsvDialogOpen(true)}
        onAddProduct={handleOpenCreate}
        t={t}
      />

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <output className="flex items-center justify-between rounded-md border border-success/30 bg-success/10 p-3 text-xs text-success">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-success hover:opacity-70"
            aria-label={tCommon("close")}
          >
            <X className="size-3.5" />
          </button>
        </output>
      )}

      {/* Products Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 text-start">{t("colImage")}</th>
                <th className="px-4 py-3 text-start">{t("colProduct")}</th>
                <th className="px-4 py-3 text-start">{t("colCategory")}</th>
                <th className="px-4 py-3 text-start">{t("colVariants")}</th>
                <th className="px-4 py-3 text-start">{t("colPhysicalStock")}</th>
                <th className="px-4 py-3 text-start">{t("colAvailableStock")}</th>
                <th className="px-4 py-3 text-start">{t("colPrice")}</th>
                <th className="px-4 py-3 text-start">{t("colStatus")}</th>
                <th className="px-4 py-3 text-end">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y border-border/60">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    <td className="px-4 py-3">
                      <Skeleton className="size-10 rounded-md" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="mt-1 h-3 w-48" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-12" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-12" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Skeleton className="ms-auto h-7 w-16 rounded-md" />
                    </td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Package className="size-6" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">{t("emptyTitle")}</p>
                      <p className="max-w-sm text-xs text-muted-foreground">{t("emptyDesc")}</p>
                      {canManage && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleOpenCreate}
                          className="mt-2 flex items-center gap-1.5 text-xs"
                        >
                          <Plus className="size-3.5" />
                          <span>{t("addProduct")}</span>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((prod) => (
                  <ProductTableRow
                    key={prod.id}
                    product={prod}
                    canManage={canManage}
                    onSelect={(p) => setSelectedDrawerProductId(p.id)}
                    onEdit={handleOpenEdit}
                    onArchive={setProductToArchive}
                    onRestore={setProductToRestore}
                    onDelete={handleOpenDelete}
                    t={t}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        {nextCursor && (
          <div className="flex justify-center border-t border-border/40 p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="flex items-center gap-1.5 text-xs"
            >
              {isLoadingMore && <Loader2 className="size-3.5 animate-spin" />}
              <span>{tCommon("loadMore")}</span>
            </Button>
          </div>
        )}
      </div>

      <ProductFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        product={editingProduct}
        categories={categories}
        businessId={businessId || ""}
        onSaved={() => setReloadTrigger((v) => v + 1)}
      />

      <VariantDrawer
        open={Boolean(selectedDrawerProduct)}
        onOpenChange={(open) => !open && setSelectedDrawerProductId(null)}
        product={selectedDrawerProduct}
        businessId={businessId || ""}
        canManage={canManage}
        onProductUpdated={() => setReloadTrigger((v) => v + 1)}
        onEditProduct={handleOpenEdit}
      />

      <ArchiveConfirmDialog
        product={productToArchive}
        open={Boolean(productToArchive)}
        onOpenChange={(open) => !open && setProductToArchive(null)}
        onConfirm={handleConfirmArchive}
        isArchiving={isArchiving}
      />

      <RestoreConfirmDialog
        product={productToRestore}
        open={Boolean(productToRestore)}
        onOpenChange={(open) => !open && setProductToRestore(null)}
        onConfirm={handleConfirmRestore}
        isRestoring={isRestoring}
      />

      <DeleteConfirmDialog
        product={productToDelete}
        open={Boolean(productToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setProductToDelete(null);
            setDeleteBlockedByOrders(false);
          }
        }}
        onConfirmDelete={handleConfirmDelete}
        onArchiveInstead={handleArchiveFromDelete}
        isDeleting={isDeleting}
        isBlockedByOrders={deleteBlockedByOrders}
      />

      <CsvImportDialog
        open={csvDialogOpen}
        onOpenChange={setCsvDialogOpen}
        businessId={businessId || ""}
        onImportSuccess={() => setReloadTrigger((v) => v + 1)}
      />
    </div>
  );
}

function archiveProductApi(productId: string, businessId: string): Promise<unknown> {
  return apiClient.patch(
    `/api/v1/products/${productId}`,
    { status: "archived" },
    { headers: { "x-business-id": businessId } },
  );
}

function restoreProductApi(productId: string, businessId: string): Promise<unknown> {
  return apiClient.patch(
    `/api/v1/products/${productId}`,
    { status: "active" },
    { headers: { "x-business-id": businessId } },
  );
}

function deleteProductApi(productId: string, businessId: string): Promise<unknown> {
  return apiClient.delete(`/api/v1/products/${productId}`, {
    headers: { "x-business-id": businessId },
  });
}
