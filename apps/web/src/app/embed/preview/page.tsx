"use client";

import React, { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function EmbedPreviewPage(): React.ReactElement {
  return (
    <React.Suspense fallback={<div className="min-h-dvh bg-[#f6f3ee]" />}>
      <StorefrontPreview />
    </React.Suspense>
  );
}

function StorefrontPreview(): React.ReactElement {
  const params = useSearchParams();
  const publicKey = params.get("key") ?? "";

  useEffect(() => {
    if (!publicKey) return;
    const existing = document.querySelector("script[data-ai-sales-preview='true']");
    if (existing) existing.remove();
    const script = document.createElement("script");
    script.src = "/widget.js";
    script.async = true;
    script.dataset.key = publicKey;
    script.dataset.aiSalesPreview = "true";
    document.body.appendChild(script);
    return () => {
      script.remove();
      document.querySelector("[data-ai-sales-widget]")?.remove();
    };
  }, [publicKey]);

  return (
    <main className="min-h-dvh bg-[#f6f3ee] text-[#1c1917]">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <p className="text-sm font-semibold tracking-wide">Sample shop</p>
        <p className="text-xs text-[#78716c]">Your website</p>
      </header>
      <section className="mx-auto grid max-w-3xl gap-6 px-6 pb-24 md:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#78716c]">New in</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Linen blazer</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-[#57534e]">
            A product page on the merchant site. The chat bubble is the only thing they add. The
            catalog, the model, and the keys stay in this app.
          </p>
          <p className="mt-6 text-lg font-medium">189 TND</p>
        </div>
        <div className="aspect-4/5 rounded-2xl bg-[#e7e0d6]" />
      </section>
    </main>
  );
}
