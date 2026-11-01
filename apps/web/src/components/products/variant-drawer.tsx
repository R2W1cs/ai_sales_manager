"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react";
import { AlertCircle, Check, Edit3, Loader2, Package, X } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import type { ProductResponse, VariantResponse } from "@app/shared";

export interface VariantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductResponse | null;
  businessId: string;
  canManage: boolean;
  onProductUpdated: () => void;
  onEditProduct: (product: ProductResponse) => void;
}

export function VariantDrawer({
  open,
  onOpenChange,
  product,
  businessId,
  canManage,
  onProductUpdated,
  onEditProduct,
}: VariantDrawerProps): React.ReactElement {
  const t = useTranslations("products");
  const tCommon = useTranslations("common");

  const [savingVariantId, setSavingVariantId] = useState<string | null>(null);
  const [stockEdits, setStockEdits] = useState<Record<string, number>>({});
  const [successVariantId, setSuccessVariantId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!product) {
    return <></>;
  }

  function handleSaveStock(variant: VariantResponse) {
    if (!canManage || !product) return;
    const newStock = stockEdits[variant.id];
    if (newStock === undefined || newStock === variant.stock) return;

    setSavingVariantId(variant.id);
    setErrorMessage(null);
    apiClient
      .patch(
        `/api/v1/products/${product.id}/variants/${variant.id}`,
        {
          stock: Math.max(0, newStock),
        },
        {
          headers: businessId ? { "x-business-id": businessId } : undefined,
        },
      )
      .then(() => {
        setSuccessVariantId(variant.id);
        setTimeout(() => setSuccessVariantId(null), 1500);
        onProductUpdated();
      })
      .catch(() => {
        setErrorMessage(t("errStockSaveFailed"));
        // Restore the displayed stock to server value
        setStockEdits((prev) => {
          const next = { ...prev };
          delete next[variant.id];
          return next;
        });
      })
      .finally(() => {
        setSavingVariantId(null);
      });
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs transition-opacity" />
        <DialogPrimitive.Popup
          data-slot="variant-drawer"
          className="fixed inset-y-0 inset-e-0 z-50 flex h-full w-full max-w-md flex-col border-s border-border bg-card shadow-2xl outline-none"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border/60 p-4">
            <div>
              <DialogPrimitive.Title className="text-base font-bold text-foreground">
                {product.name || product.title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted-foreground">
                {t("variantDrawerDesc")}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={tCommon("close")}
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          {/* Quick info bar */}
          <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-4 py-2.5 text-xs">
            <span className="font-medium text-foreground">
              {t("colVariants")}: {product.variants?.length || 0}
            </span>
            {canManage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onEditProduct(product);
                }}
                className="flex items-center gap-1.5 text-xs"
              >
                <Edit3 className="size-3" />
                <span>{tCommon("edit")}</span>
              </Button>
            )}
          </div>

          {/* Error alert */}
          {errorMessage && (
            <div
              role="alert"
              className="mx-4 mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Variants list */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {!product.variants || product.variants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                <Package className="mb-2 size-8 stroke-[1.5]" />
                <p className="text-xs">{t("errVariantRequired")}</p>
              </div>
            ) : (
              product.variants.map((v) => {
                const isSaving = savingVariantId === v.id;
                const isSuccess = successVariantId === v.id;
                const currentStock = stockEdits[v.id] !== undefined ? stockEdits[v.id] : v.stock;
                const attrs = v.attributes ? Object.entries(v.attributes) : [];

                return (
                  <div
                    key={v.id}
                    className="space-y-2 rounded-lg border border-border bg-card p-3.5 text-xs shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {v.sku || `SKU-${v.id.slice(0, 6)}`}
                        </span>
                        {v.isDefault && (
                          <span className="rounded-sm bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            {t("variantDefault")}
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-foreground">
                        {t("priceCurrency", { price: v.price.toString() })}
                      </span>
                    </div>

                    {/* Attributes tags */}
                    {attrs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {attrs.map(([k, val]) => (
                          <span
                            key={`${v.id}-${k}`}
                            className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            <span className="font-medium text-foreground">{k}:</span> {val}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Stock level and Quick adjustment */}
                    <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-2">
                      <div className="space-y-0.5">
                        <p className="text-[11px] text-muted-foreground">{t("variantStock")}</p>
                        <p className="text-[11px] font-semibold text-foreground">
                          {t("colAvailableStock")}: {v.availableStock ?? v.stock}
                        </p>
                      </div>

                      {canManage ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={currentStock}
                            onChange={(e) => {
                              setErrorMessage(null);
                              const val = parseInt(e.target.value, 10);
                              setStockEdits((prev) => ({
                                ...prev,
                                [v.id]: isNaN(val) ? 0 : Math.max(0, val),
                              }));
                            }}
                            className="h-8 w-20 text-center text-xs"
                            aria-label={t("variantStock")}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleSaveStock(v)}
                            disabled={isSaving || currentStock === v.stock}
                            className="h-8 px-2 text-xs"
                            title={t("quickStockSave")}
                            aria-label={t("quickStockSave")}
                          >
                            {isSaving ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : isSuccess ? (
                              <Check className="size-3 text-success" />
                            ) : (
                              <span>{tCommon("save")}</span>
                            )}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">
                          {t("quickStockReadOnly")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
