"use client";

import { Check, PlusCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api-client";

export interface ManualProductFormProps {
  businessId: string;
  onProductCreated: () => void;
  onBack?: () => void;
  isReimporting?: boolean;
}

const INITIAL_FORM = {
  name: "",
  sku: "",
  price: "",
  stock: "",
};

export function ManualProductForm({
  businessId,
  onProductCreated,
  onBack,
  isReimporting = false,
}: ManualProductFormProps): React.ReactElement {
  const tOnboarding = useTranslations("onboarding");
  const tCommon = useTranslations("common");

  const [form, setForm] = useState(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccess(false);

    if (!form.name.trim()) {
      setErrorMessage("Veuillez saisir le nom du produit.");
      return;
    }
    const priceNum = parseFloat(form.price);
    if (isNaN(priceNum) || priceNum < 0) {
      setErrorMessage("Veuillez saisir un prix valide.");
      return;
    }
    const stockNum = parseInt(form.stock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setErrorMessage("Veuillez saisir une quantité en stock valide.");
      return;
    }

    setIsSaving(true);
    try {
      await apiClient.post(
        "/api/v1/products",
        {
          name: form.name.trim(),
          status: "active",
          variants: [
            {
              sku: form.sku.trim() || undefined,
              price: priceNum,
              stock: stockNum,
              isDefault: true,
            },
          ],
        },
        {
          headers: businessId ? { "x-business-id": businessId } : undefined,
        },
      );
      setForm(INITIAL_FORM);
      setSuccess(true);
      setIsSaving(false);
      onProductCreated();
    } catch {
      setErrorMessage("Échec de l'enregistrement du produit.");
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-slot="form-manual-product"
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <PlusCircle className="size-4 text-primary" />
          <span>{tOnboarding("tabManualAdd")}</span>
        </div>
        {isReimporting && onBack && (
          <Button type="button" variant="ghost" size="sm" onClick={onBack} className="text-xs">
            {tCommon("back")}
          </Button>
        )}
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
        >
          {errorMessage}
        </div>
      )}

      {success && (
        <output className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-2.5 text-xs text-success">
          <Check className="size-4 shrink-0" />
          <span>{tOnboarding("productAddedSuccess")}</span>
        </output>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="manual-name" className="text-xs">
            {tOnboarding("productNameLabel")} *
          </Label>
          <Input
            id="manual-name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder={tOnboarding("productNamePlaceholder")}
            required
            disabled={isSaving}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="manual-sku" className="text-xs">
            {tOnboarding("skuLabel")}
          </Label>
          <Input
            id="manual-sku"
            value={form.sku}
            onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
            placeholder={tOnboarding("skuPlaceholder")}
            disabled={isSaving}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="manual-price" className="text-xs">
            {tOnboarding("priceLabel")} *
          </Label>
          <Input
            id="manual-price"
            type="number"
            step="0.001"
            min="0"
            value={form.price}
            onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
            placeholder={tOnboarding("pricePlaceholder")}
            required
            disabled={isSaving}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="manual-stock" className="text-xs">
            {tOnboarding("stockLabel")} *
          </Label>
          <Input
            id="manual-stock"
            type="number"
            min="0"
            value={form.stock}
            onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
            placeholder={tOnboarding("stockPlaceholder")}
            required
            disabled={isSaving}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          size="sm"
          loading={isSaving}
          data-slot="btn-save-manual-product"
          className="gap-1.5 text-xs"
        >
          <PlusCircle className="size-3.5" />
          <span>{tOnboarding("addProductSubmit")}</span>
        </Button>
      </div>
    </form>
  );
}
