"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react";
import { AlertCircle, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient, ApiClientError } from "@/lib/api-client";
import type {
  CategoryResponse,
  ProductImageResponse,
  ProductResponse,
  ProductStatus,
} from "@app/shared";

import { ImageUploader } from "./image-uploader";
import { uploadProductImageViaPresigned } from "./product-upload-helper";
import { VariantEditor, type VariantItem } from "./variant-editor";

export interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: ProductResponse | null;
  categories: CategoryResponse[];
  businessId: string;
  onSaved: () => void;
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
  businessId,
  onSaved,
}: ProductFormDialogProps): React.ReactElement {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs transition-opacity" />
        <DialogPrimitive.Popup
          data-slot="product-form-dialog"
          className="fixed inset-s-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-2xl transition-opacity outline-none rtl:translate-x-1/2"
        >
          {open && (
            <ProductFormInner
              key={`${product?.id || "new"}`}
              product={product}
              categories={categories}
              businessId={businessId}
              onSaved={onSaved}
              onClose={() => onOpenChange(false)}
            />
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface ProductFormInnerProps {
  product?: ProductResponse | null;
  categories: CategoryResponse[];
  businessId: string;
  onSaved: () => void;
  onClose: () => void;
}

class PartialProductSaveError extends Error {
  public readonly isPartialFailure = true as const;

  constructor(
    public readonly freshProduct: ProductResponse,
    public readonly originalError: unknown,
  ) {
    super(
      originalError instanceof Error
        ? originalError.message
        : "Failed to update all product variants",
    );
    this.name = "PartialProductSaveError";
  }
}

interface PartialFailureError {
  isPartialFailure: true;
  freshProduct: ProductResponse;
  originalError: unknown;
}

function isPartialFailureError(err: unknown): err is PartialProductSaveError | PartialFailureError {
  return (
    err instanceof PartialProductSaveError ||
    (typeof err === "object" &&
      err !== null &&
      "isPartialFailure" in err &&
      (err as { isPartialFailure: unknown }).isPartialFailure === true &&
      "freshProduct" in err)
  );
}

function ProductFormInner({
  product,
  categories,
  businessId,
  onSaved,
  onClose,
}: ProductFormInnerProps): React.ReactElement {
  const t = useTranslations("products");
  const tCommon = useTranslations("common");

  const [currentProduct, setCurrentProduct] = useState<ProductResponse | null>(product || null);
  const isEditing = Boolean(currentProduct);

  const [name, setName] = useState(currentProduct?.name || currentProduct?.title || "");
  const [description, setDescription] = useState(currentProduct?.description || "");
  const [categoryId, setCategoryId] = useState<string>(currentProduct?.categoryId || "");
  const [status, setStatus] = useState<ProductStatus>(currentProduct?.status || "active");
  const [variants, setVariants] = useState<VariantItem[]>(() => {
    if (currentProduct?.variants && currentProduct.variants.length > 0) {
      return currentProduct.variants.map((v) => ({
        id: v.id,
        sku: v.sku || "",
        price: typeof v.price === "string" ? parseFloat(v.price) : v.price,
        discountPrice:
          v.discountPrice !== null && v.discountPrice !== undefined
            ? typeof v.discountPrice === "string"
              ? parseFloat(v.discountPrice)
              : v.discountPrice
            : null,
        stock: v.stock,
        availableStock: v.availableStock,
        attributes: (v.attributes as Record<string, string>) || {},
        isDefault: Boolean(v.isDefault),
      }));
    }
    return [
      {
        sku: "",
        price: 0,
        discountPrice: null,
        stock: 0,
        isDefault: true,
        attributes: {},
      },
    ];
  });

  const [images, setImages] = useState<ProductImageResponse[]>(currentProduct?.images || []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage(t("errNameRequired"));
      return;
    }

    if (variants.length === 0) {
      setErrorMessage(t("errVariantRequired"));
      return;
    }

    for (const v of variants) {
      if (
        typeof v.price !== "number" ||
        !Number.isFinite(v.price) ||
        isNaN(v.price) ||
        v.price <= 0
      ) {
        setErrorMessage(t("errVariantRequired"));
        return;
      }

      if (
        typeof v.stock !== "number" ||
        !Number.isFinite(v.stock) ||
        isNaN(v.stock) ||
        v.stock < 0
      ) {
        setErrorMessage(t("errVariantRequired"));
        return;
      }

      if (
        v.discountPrice !== null &&
        v.discountPrice !== undefined &&
        (typeof v.discountPrice !== "number" ||
          !Number.isFinite(v.discountPrice) ||
          isNaN(v.discountPrice) ||
          v.discountPrice < 0 ||
          v.discountPrice >= v.price)
      ) {
        setErrorMessage(t("errDiscountGreater"));
        return;
      }
    }

    setIsSaving(true);
    saveProductData({
      product: currentProduct,
      trimmedName,
      description,
      categoryId,
      status,
      variants,
      pendingFiles,
      businessId,
    })
      .then((result) => {
        if (result.failedFiles.length > 0) {
          // Switch to edit mode for the newly created product and retain only failed files
          setCurrentProduct(result.savedProduct);
          setPendingFiles(result.failedFiles);
          setImages((prev) => [...prev, ...result.uploadedImages]);
          onSaved();
          setErrorMessage(t("errUploadFailed"));
          return;
        }
        onSaved();
        onClose();
      })
      .catch((err: unknown) => {
        if (isPartialFailureError(err)) {
          const fresh = err.freshProduct;
          setCurrentProduct(fresh);
          if (fresh.variants) {
            setVariants(
              fresh.variants.map((v) => ({
                id: v.id,
                sku: v.sku || "",
                price: typeof v.price === "string" ? parseFloat(v.price) : v.price,
                discountPrice:
                  v.discountPrice !== null && v.discountPrice !== undefined
                    ? typeof v.discountPrice === "string"
                      ? parseFloat(v.discountPrice)
                      : v.discountPrice
                    : null,
                stock: v.stock,
                availableStock: v.availableStock,
                attributes: (v.attributes as Record<string, string>) || {},
                isDefault: Boolean(v.isDefault),
              })),
            );
          }
          if (fresh.name) setName(fresh.name);
          if (fresh.description !== undefined) setDescription(fresh.description || "");
          if (fresh.categoryId !== undefined) setCategoryId(fresh.categoryId || "");
          if (fresh.status) setStatus(fresh.status);
          if (fresh.images) setImages(fresh.images);
          onSaved();
        }

        const underlying = isPartialFailureError(err) ? err.originalError : err;
        const msg =
          underlying instanceof ApiClientError && underlying.message
            ? underlying.message
            : underlying instanceof Error && underlying.message
              ? underlying.message
              : t("errSaveFailed");
        setErrorMessage(msg);
      })
      .finally(() => {
        setIsSaving(false);
      });
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border/60 pb-4">
        <div>
          <DialogPrimitive.Title className="text-base font-bold text-foreground">
            {isEditing ? t("formTitleEdit") : t("formTitleAdd")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-xs text-muted-foreground">
            {t("formSubtitle")}
          </DialogPrimitive.Description>
        </div>
        <DialogPrimitive.Close
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={tCommon("close")}
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-6">
        {/* Error alert */}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Section 1: Basic details */}
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold text-foreground">{t("formBasicSection")}</h3>

          <div className="space-y-3">
            {/* Product Name */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {t("formNameLabel")} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("formNamePlaceholder")}
                required
                dir="auto"
                className="text-xs"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">{t("formDescLabel")}</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("formDescPlaceholder")}
                rows={3}
                dir="auto"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Category */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">{t("formCategoryLabel")}</Label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-xs focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={t("formCategoryLabel")}
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
              </div>

              {/* Status */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">{t("formStatusLabel")}</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProductStatus)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-xs focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={t("formStatusLabel")}
                >
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
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Variants */}
        <div className="rounded-lg border border-border bg-card p-4">
          <VariantEditor variants={variants} onChange={setVariants} disabled={isSaving} />
        </div>

        {/* Section 3: Photos */}
        <div className="rounded-lg border border-border bg-card p-4">
          <ImageUploader
            businessId={businessId}
            productId={currentProduct?.id}
            images={images}
            onChange={setImages}
            pendingFiles={pendingFiles}
            onPendingFilesChange={setPendingFiles}
            disabled={isSaving}
          />
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={isSaving} className="flex items-center gap-1.5">
            {isSaving && <Loader2 className="size-3.5 animate-spin" />}
            <span>
              {isSaving ? (isEditing ? t("formUpdating") : t("formCreating")) : t("formSave")}
            </span>
          </Button>
        </div>
      </form>
    </>
  );
}

interface SaveProductParams {
  product?: ProductResponse | null;
  trimmedName: string;
  description: string;
  categoryId: string;
  status: ProductStatus;
  variants: VariantItem[];
  pendingFiles: File[];
  businessId: string;
}

interface SaveProductResult {
  savedProduct: ProductResponse;
  failedFiles: File[];
  uploadedImages: ProductImageResponse[];
}

async function saveProductData({
  product,
  trimmedName,
  description,
  categoryId,
  status,
  variants,
  pendingFiles,
  businessId,
}: SaveProductParams): Promise<SaveProductResult> {
  const headers = businessId ? { "x-business-id": businessId } : undefined;

  if (!product) {
    // CREATE PRODUCT
    const createdProduct = await apiClient.post<ProductResponse>(
      "/api/v1/products",
      {
        name: trimmedName,
        title: trimmedName,
        description: description.trim() || undefined,
        categoryId: categoryId || undefined,
        status,
        variants: variants.map((v) => ({
          sku: v.sku?.trim() || undefined,
          price: v.price,
          discountPrice: v.discountPrice,
          stock: v.stock,
          attributes: v.attributes || {},
          isDefault: Boolean(v.isDefault),
        })),
      },
      { headers },
    );

    // Upload any pending staged files concurrently with Promise.allSettled
    const failedFiles: File[] = [];
    const uploadedImages: ProductImageResponse[] = [];
    if (pendingFiles.length > 0 && createdProduct.id) {
      const results = await Promise.allSettled(
        pendingFiles.map((file, i) =>
          uploadProductImageViaPresigned(file, createdProduct.id, businessId, i === 0, i),
        ),
      );
      results.forEach((res, i) => {
        if (res.status === "fulfilled") {
          uploadedImages.push(res.value);
        } else {
          const failed = pendingFiles[i];
          if (failed) failedFiles.push(failed);
        }
      });
    }

    return {
      savedProduct: createdProduct,
      failedFiles,
      uploadedImages,
    };
  } else {
    // UPDATE EXISTING PRODUCT
    try {
      await apiClient.patch<ProductResponse>(
        `/api/v1/products/${product.id}`,
        {
          name: trimmedName,
          title: trimmedName,
          description: description.trim() || null,
          categoryId: categoryId || null,
          status,
        },
        { headers },
      );

      // Manage variants
      const originalVariantIds = new Set((product.variants || []).map((v) => v.id));
      const currentVariantIds = new Set(variants.flatMap((v) => (v.id ? [v.id] : [])));

      // Delete removed variants in parallel
      const deletionPromises: Promise<unknown>[] = [];
      for (const oldId of originalVariantIds) {
        if (!currentVariantIds.has(oldId)) {
          deletionPromises.push(
            apiClient.delete(`/api/v1/products/${product.id}/variants/${oldId}`, {
              headers,
            }),
          );
        }
      }
      await Promise.all(deletionPromises);

      // Update or create variants in parallel
      const mutationPromises = variants.map((v) => {
        if (v.id && originalVariantIds.has(v.id)) {
          return apiClient.patch(
            `/api/v1/products/${product.id}/variants/${v.id}`,
            {
              sku: v.sku?.trim() || null,
              price: v.price,
              discountPrice: v.discountPrice,
              stock: v.stock,
              attributes: v.attributes || {},
              isDefault: Boolean(v.isDefault),
            },
            { headers },
          );
        }
        return apiClient.post(
          `/api/v1/products/${product.id}/variants`,
          {
            sku: v.sku?.trim() || undefined,
            price: v.price,
            discountPrice: v.discountPrice,
            stock: v.stock,
            attributes: v.attributes || {},
            isDefault: Boolean(v.isDefault),
          },
          { headers },
        );
      });
      await Promise.all(mutationPromises);

      const refreshed = await apiClient.get<ProductResponse>(`/api/v1/products/${product.id}`, {
        headers,
      });
      return {
        savedProduct: refreshed,
        failedFiles: [],
        uploadedImages: [],
      };
    } catch (err) {
      // Attempt to refresh product from backend to synchronize state after partial failure
      let freshProduct: ProductResponse | null = null;
      try {
        freshProduct = await apiClient.get<ProductResponse>(`/api/v1/products/${product.id}`, {
          headers,
        });
      } catch {
        // Refresh failed; preserve original error without masking
      }

      if (freshProduct) {
        throw new PartialProductSaveError(freshProduct, err);
      }
      throw err;
    }
  }
}
