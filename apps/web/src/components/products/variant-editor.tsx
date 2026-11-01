"use client";

import { AlertCircle, Layers, Plus, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface VariantItem {
  id?: string;
  _key?: string;
  sku?: string;
  price: number;
  discountPrice?: number | null;
  stock: number;
  availableStock?: number;
  attributes?: Record<string, string>;
  isDefault?: boolean;
}

export interface VariantEditorProps {
  variants: VariantItem[];
  onChange: (variants: VariantItem[]) => void;
  disabled?: boolean;
}

const COMMON_SIZES = ["XS", "S", "M", "L", "XL"];

function VariantGeneratorPanel({
  onGenerate,
  onClose,
  t,
}: {
  onGenerate: (sizes: string[], colors: string[]) => void;
  onClose: () => void;
  t: (key: string) => string;
}): React.ReactElement {
  const [genSizes, setGenSizes] = useState<string[]>(["S", "M", "L"]);
  const [genColors, setGenColors] = useState<string>("");

  function toggleSize(sz: string) {
    setGenSizes((prev) => (prev.includes(sz) ? prev.filter((s) => s !== sz) : [...prev, sz]));
  }

  function handleTriggerGenerate() {
    const parsedColors = genColors
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    onGenerate(genSizes, parsedColors);
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-xs">
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{t("variantGeneratorTitle")}</p>
        <p className="text-[11px] text-muted-foreground">{t("variantGeneratorDesc")}</p>
      </div>

      <div className="space-y-2">
        <Label className="text-[11px] font-medium">{t("variantGeneratorSizes")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {COMMON_SIZES.map((sz) => {
            const isSelected = genSizes.includes(sz);
            return (
              <button
                key={`size-btn-${sz}`}
                type="button"
                onClick={() => toggleSize(sz)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                    : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                {sz}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] font-medium">{t("variantGeneratorColors")}</Label>
        <Input
          value={genColors}
          onChange={(e) => setGenColors(e.target.value)}
          placeholder={t("variantAttrColorPlaceholder")}
          dir="auto"
          className="h-8 text-xs"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">
          {t("optional")}
        </Button>
        <Button type="button" size="sm" onClick={handleTriggerGenerate} className="text-xs">
          {t("variantGeneratorBtn")}
        </Button>
      </div>
    </div>
  );
}

function VariantItemHeader({
  index,
  isDefault,
  availableStock,
  disabled,
  totalCount,
  onSetDefault,
  onRemove,
  t,
}: {
  index: number;
  isDefault?: boolean;
  availableStock?: number;
  disabled: boolean;
  totalCount: number;
  onSetDefault: () => void;
  onRemove: () => void;
  t: (key: string) => string;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-foreground">#{index + 1}</span>
        {isDefault ? (
          <span className="flex items-center gap-1 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-xs">
            <Star className="size-2.5 fill-current" />
            {t("variantDefault")}
          </span>
        ) : (
          !disabled && (
            <button
              type="button"
              onClick={onSetDefault}
              className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
            >
              {t("variantMakeDefault")}
            </button>
          )
        )}
        {availableStock !== undefined && (
          <span className="text-[11px] text-muted-foreground">
            ({t("colAvailableStock")}: {availableStock})
          </span>
        )}
      </div>

      {!disabled && totalCount > 1 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="size-7 p-0 text-muted-foreground hover:text-destructive"
          title={t("variantRemove")}
          aria-label={t("variantRemove")}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function VariantItemFields({
  variant,
  disabled,
  hasInvalidDiscount,
  onUpdate,
  t,
}: {
  variant: VariantItem;
  disabled: boolean;
  hasInvalidDiscount: boolean;
  onUpdate: (updates: Partial<VariantItem>) => void;
  t: (key: string) => string;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
      <div className="space-y-1">
        <Label className="text-[11px] font-medium">{t("variantSku")}</Label>
        <Input
          value={variant.sku || ""}
          disabled={disabled}
          onChange={(e) => onUpdate({ sku: e.target.value })}
          placeholder={t("variantSkuPlaceholder")}
          dir="auto"
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] font-medium">{t("variantPrice")} *</Label>
        <Input
          type="number"
          min="0"
          step="0.1"
          value={isNaN(variant.price) ? "" : variant.price}
          disabled={disabled}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            onUpdate({ price: isNaN(val) ? 0 : val });
          }}
          required
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] font-medium">{t("variantDiscountPrice")}</Label>
        <Input
          type="number"
          min="0"
          step="0.1"
          value={
            variant.discountPrice !== null && variant.discountPrice !== undefined
              ? variant.discountPrice
              : ""
          }
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            onUpdate({
              discountPrice: raw ? (isNaN(parseFloat(raw)) ? null : parseFloat(raw)) : null,
            });
          }}
          placeholder={t("optional")}
          className={cn(
            "h-8 text-xs",
            hasInvalidDiscount && "border-destructive focus-visible:ring-destructive",
          )}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] font-medium">{t("variantStock")} *</Label>
        <Input
          type="number"
          min="0"
          step="1"
          value={isNaN(variant.stock) ? "" : variant.stock}
          disabled={disabled}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            onUpdate({ stock: isNaN(val) ? 0 : Math.max(0, val) });
          }}
          required
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

function VariantItemAttributes({
  attributes = {},
  disabled,
  onAttributeChange,
  t,
}: {
  attributes?: Record<string, string>;
  disabled: boolean;
  onAttributeChange: (key: string, val: string) => void;
  t: (key: string) => string;
}): React.ReactElement {
  const sizeVal = attributes.size || attributes.taille || "";
  const colorVal = attributes.color || attributes.couleur || "";

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">{t("variantAttrSize")}</Label>
        <Input
          value={sizeVal}
          disabled={disabled}
          onChange={(e) => onAttributeChange("size", e.target.value)}
          placeholder={t("variantAttrSizePlaceholder")}
          dir="auto"
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">{t("variantAttrColor")}</Label>
        <Input
          value={colorVal}
          disabled={disabled}
          onChange={(e) => onAttributeChange("color", e.target.value)}
          placeholder={t("variantAttrColorPlaceholder")}
          dir="auto"
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

function VariantRowItem({
  variant,
  index,
  totalCount,
  disabled,
  onUpdate,
  onSetDefault,
  onRemove,
  t,
}: {
  variant: VariantItem;
  index: number;
  totalCount: number;
  disabled: boolean;
  onUpdate: (updates: Partial<VariantItem>) => void;
  onSetDefault: () => void;
  onRemove: () => void;
  t: (key: string) => string;
}): React.ReactElement {
  const hasInvalidDiscount =
    variant.discountPrice !== null &&
    variant.discountPrice !== undefined &&
    variant.discountPrice >= variant.price;

  function handleAttrChange(k: string, v: string) {
    if (disabled) return;
    const nextAttrs = { ...(variant.attributes || {}) };
    if (!v.trim()) {
      delete nextAttrs[k];
    } else {
      nextAttrs[k] = v.trim();
    }
    onUpdate({ attributes: nextAttrs });
  }

  return (
    <div
      className={cn(
        "relative space-y-3 rounded-lg border p-3 text-xs transition-colors",
        variant.isDefault ? "border-primary/40 bg-primary/5" : "border-border bg-card",
      )}
    >
      <VariantItemHeader
        index={index}
        isDefault={variant.isDefault}
        availableStock={variant.availableStock}
        disabled={disabled}
        totalCount={totalCount}
        onSetDefault={onSetDefault}
        onRemove={onRemove}
        t={t}
      />

      <VariantItemFields
        variant={variant}
        disabled={disabled}
        hasInvalidDiscount={hasInvalidDiscount}
        onUpdate={onUpdate}
        t={t}
      />

      <VariantItemAttributes
        attributes={variant.attributes}
        disabled={disabled}
        onAttributeChange={handleAttrChange}
        t={t}
      />

      {hasInvalidDiscount && (
        <div role="alert" className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{t("errDiscountGreater")}</span>
        </div>
      )}
    </div>
  );
}

export function VariantEditor({
  variants,
  onChange,
  disabled = false,
}: VariantEditorProps): React.ReactElement {
  const t = useTranslations("products");
  const [showGenerator, setShowGenerator] = useState(false);

  function handleUpdateVariant(index: number, updates: Partial<VariantItem>) {
    if (disabled) return;
    const updated = [...variants];
    const current = updated[index];
    if (!current) return;
    updated[index] = { ...current, ...updates };
    onChange(updated);
  }

  function handleSetDefault(index: number) {
    if (disabled) return;
    const updated = variants.map((v, i) => ({ ...v, isDefault: i === index }));
    onChange(updated);
  }

  function handleAddVariant() {
    if (disabled) return;
    const newVariant: VariantItem = {
      _key: crypto.randomUUID(),
      sku: "",
      price: variants.length > 0 && variants[0] ? variants[0].price : 0,
      discountPrice: null,
      stock: 0,
      isDefault: variants.length === 0,
      attributes: {},
    };
    onChange([...variants, newVariant]);
  }

  function handleRemoveVariant(index: number) {
    if (disabled || variants.length <= 1) return;
    const updated = [...variants];
    const removedWasDefault = updated[index]?.isDefault;
    updated.splice(index, 1);
    if (removedWasDefault && updated.length > 0 && updated[0]) {
      updated[0].isDefault = true;
    }
    onChange(updated);
  }

  function handleMatrixGenerated(sizes: string[], colors: string[]) {
    const basePrice = variants.length > 0 && variants[0] ? variants[0].price : 0;
    const generated: VariantItem[] = [];

    const createVariant = (sku: string, attributes: Record<string, string>): VariantItem => ({
      _key: crypto.randomUUID(),
      sku,
      price: basePrice,
      discountPrice: null,
      stock: 0,
      isDefault: generated.length === 0 && variants.length === 0,
      attributes,
    });

    if (sizes.length > 0 && colors.length > 0) {
      for (const size of sizes) {
        for (const color of colors) {
          generated.push(
            createVariant(`${size}-${color.slice(0, 3).toUpperCase()}`, { size, color }),
          );
        }
      }
    } else if (sizes.length > 0) {
      for (const size of sizes) {
        generated.push(createVariant(`SKU-${size}`, { size }));
      }
    } else if (colors.length > 0) {
      for (const color of colors) {
        generated.push(createVariant(`SKU-${color.slice(0, 3).toUpperCase()}`, { color }));
      }
    }

    if (generated.length > 0) {
      if (variants.length === 1 && !variants[0]?.sku && !variants[0]?.id) {
        generated[0]!.isDefault = true;
        onChange(generated);
      } else {
        onChange([...variants, ...generated]);
      }
      setShowGenerator(false);
    }
  }

  return (
    <div className="space-y-4" data-slot="variant-editor">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-foreground">{t("formVariantsSection")}</h3>
          <p className="text-[11px] text-muted-foreground">{t("formVariantsDesc")}</p>
        </div>
        {!disabled && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowGenerator((v) => !v)}
              className="flex items-center gap-1.5 text-xs"
            >
              <Layers className="size-3.5" />
              <span>{t("variantGeneratorTitle")}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddVariant}
              className="flex items-center gap-1.5 text-xs"
            >
              <Plus className="size-3.5" />
              <span>{t("variantAdd")}</span>
            </Button>
          </div>
        )}
      </div>

      {showGenerator && !disabled && (
        <VariantGeneratorPanel
          onGenerate={handleMatrixGenerated}
          onClose={() => setShowGenerator(false)}
          t={t}
        />
      )}

      <div className="space-y-3">
        {variants.map((v, idx) => (
          <VariantRowItem
            key={v.id || v._key || v.sku || "variant-item"}
            variant={v}
            index={idx}
            totalCount={variants.length}
            disabled={disabled}
            onUpdate={(updates) => handleUpdateVariant(idx, updates)}
            onSetDefault={() => handleSetDefault(idx)}
            onRemove={() => handleRemoveVariant(idx)}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
