import type { Route } from "next";
import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12 text-foreground">
      <p className="text-sm text-muted-foreground">
        <Link href={"/" as Route} className="underline-offset-4 hover:underline">
          AI Sales Manager
        </Link>{" "}
        · Terms
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="text-sm text-muted-foreground">
        Governing law: Tunisia. Personal data: Law No. 2004-63 / INPDP. Full text:{" "}
        <code className="text-xs">docs/50_legal/TERMS_OF_SERVICE.md</code>
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Service</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The Platform provides catalog-grounded AI replies on social channels and routes purchase
          intent to pending COD orders for human confirmation. It does not invent prices or complete
          silent checkout.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">AI disclosure</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Merchants must keep an automated-assistant disclosure in the channel bio and/or first
          greeting, and staff the inbox when shoppers request a human.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Data roles</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Merchant = controller for shopper conversation/COD data; Platform = processor. Merchant
          staff accounts are controlled by the Platform. See{" "}
          <Link href={"/privacy" as Route} className="underline-offset-4 hover:underline">
            Privacy Policy
          </Link>{" "}
          and <code className="text-xs">docs/50_legal/DPA_MERCHANT.md</code>.
        </p>
      </section>
    </main>
  );
}
