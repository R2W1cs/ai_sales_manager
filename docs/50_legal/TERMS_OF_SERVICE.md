# Terms of Service — AI Sales Manager

**Last updated:** 2026-11-24  
**Governing law:** Tunisia. Personal data processing follows Law No. **2004-63** and the merchant [`DPA_MERCHANT.md`](./DPA_MERCHANT.md).

---

## 1. Service

AI Sales Manager (“Platform”) provides a multi-tenant workspace for Tunisian merchants to:

- Connect Instagram, Messenger, and (when enabled) WhatsApp / website chat.
- Run a catalog-grounded **automated sales assistant**.
- Collect purchase intent into **pending COD orders** for human confirmation.
- Operate inbox, pipeline, analytics, and settings.

The Platform does **not** complete silent checkout or invent prices/stock.

---

## 2. Accounts & acceptable use

- Owners are responsible for staff invites, Meta OAuth, catalog accuracy, and lawful use of customer data.
- Prohibited: scraping unrelated persons, unlawful spam, processing special categories of data without lawful basis, or bypassing human-handoff controls.
- AI replies start in `approval_required` until the merchant activates live AI per product gates.

---

## 3. AI assistant disclosure

Merchants must keep an **AI disclosure** visible to shoppers (channel bio and/or first automated greeting). Default templates disclose that an assistant may reply and that the shopper can ask for a **human**.

The Platform provides “Request Human” / `human_request` escalation; merchants must staff the inbox accordingly.

---

## 4. Personal data & INPDP roles

- For **shopper** data in conversations and COD orders: merchant = **controller**, Platform = **processor**.
- For **merchant staff** accounts and billing: Platform = **controller**.
- Details: [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md) and [`DPA_MERCHANT.md`](./DPA_MERCHANT.md).

Merchants authorize the Platform to process names, **+216** phones, and delivery addresses solely to operate the sales workspace and COD lifecycle.

---

## 5. Orders & COD

Pending orders are proposals until a human confirms or cancels. Cash-on-delivery collection and logistics remain the merchant’s responsibility.

---

## 6. Erasure requests

When a shopper requests deletion, the merchant (or Platform ops under merchant instruction) must run the Platform erase flow so PII is anonymized while accounting order rows are retained without delivery PII.

---

## 7. Availability & liability

The service is provided as-is for pilots and production tenants under the subscribed plan. Meta / WhatsApp outages are outside Platform control. Liability is limited to fees paid in the prior three months, except where Tunisian law forbids limitation.

---

## 8. Termination

On account deletion, merchant configuration is removed per product lifecycle. Shopper erase requests remain available until the tenant is fully closed.
