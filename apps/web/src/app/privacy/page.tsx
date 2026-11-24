import type { Route } from "next";
import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12 text-foreground">
      <p className="text-sm text-muted-foreground">
        <Link href={"/" as Route} className="underline-offset-4 hover:underline">
          AI Sales Manager
        </Link>{" "}
        · Privacy
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">
        Tunisia — Law No. 2004-63 · INPDP (Instance Nationale de Protection des Données
        Personnelles). Full text: <code className="text-xs">docs/50_legal/PRIVACY_POLICY.md</code>
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Roles</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          For shopper data in Instagram / Messenger / WhatsApp / widget conversations, the{" "}
          <strong className="text-foreground">merchant is the data controller</strong> and AI Sales
          Manager is the <strong className="text-foreground">data processor</strong>. For merchant
          staff accounts and billing, the Platform is the controller. See the merchant DPA in{" "}
          <code className="text-xs">docs/50_legal/DPA_MERCHANT.md</code>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What we process for COD sales</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Customer name and chat identity</li>
          <li>Phone numbers in +216 format</li>
          <li>Delivery address (governorate / delegation)</li>
          <li>Order amounts in TND and COD status</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your rights</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Shoppers may request deletion via the merchant. The Platform anonymizes the profile,
          redacts messages, deletes attachments, and strips delivery PII from orders while keeping
          accounting rows. Technical path:{" "}
          <code className="text-xs">POST /api/v1/customers/:id/erase</code>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">AI transparency</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Automated assistants disclose themselves in the greeting. Shoppers can request a human at
          any time by writing “agent” / “humain”.
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        INPDP filing references are recorded only after official acknowledgment — see{" "}
        <code>docs/50_legal/INPDP_FILING_CHECKLIST.md</code>.
      </p>
    </main>
  );
}
