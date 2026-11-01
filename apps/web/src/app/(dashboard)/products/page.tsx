"use client";

import { Package, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";

import { useTenant } from "@/components/layout/tenant-context";
import { ProductList } from "@/components/products/product-list";
import { Stack } from "@/components/ui/stack";
import { Wrapper } from "@/components/ui/wrapper";

export default function ProductsPage(): React.ReactElement {
  const t = useTranslations("products");
  const { currentBusinessId } = useTenant();

  return (
    <Wrapper gap="md" className="h-full flex-1 overflow-y-auto bg-background p-4 md:p-6">
      {/* Page Header */}
      <Stack direction="row" justify="between" wrap className="border-b border-border/60 pb-4">
        <Stack direction="row" size="sm">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Package className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
            <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
          </div>
        </Stack>

        {/* Sync hint pill */}
        <Stack
          direction="row"
          size="xs"
          className="self-start rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-medium text-foreground"
        >
          <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
          <span>{t("reindexNotice")}</span>
        </Stack>
      </Stack>

      {/* Main Product Management Content */}
      <div className="min-h-0 flex-1">
        <ProductList businessId={currentBusinessId} />
      </div>
    </Wrapper>
  );
}
