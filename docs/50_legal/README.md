# Legal & INPDP compliance pack

Course / production artifacts for Tunisian conversational social commerce under **Law No. 2004-63** and the **INPDP**.

| Document                                                   | Purpose                                               |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md)                 | Controller/processor roles, COD PII, erasure          |
| [`TERMS_OF_SERVICE.md`](./TERMS_OF_SERVICE.md)             | Merchant SaaS terms + AI disclosure duty              |
| [`DPA_MERCHANT.md`](./DPA_MERCHANT.md)                     | Multi-tenant custody agreement                        |
| [`INPDP_FILING_CHECKLIST.md`](./INPDP_FILING_CHECKLIST.md) | Formal dossier checklist (**no invented filing IDs**) |
| [`RETENTION_POLICY.md`](./RETENTION_POLICY.md)             | Retention + erase SOP                                 |

Public pages: `/privacy`, `/terms`, `/data-deletion`.  
Erase API: `POST /api/v1/customers/:id/erase`. Ops: `pnpm privacy:erase`.  
Meta App Review / Business Verification: [`docs/30_execution/META_APP_REVIEW_CHECKLIST.md`](../30_execution/META_APP_REVIEW_CHECKLIST.md).
