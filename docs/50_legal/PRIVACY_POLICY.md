# Privacy Policy — AI Sales Manager

**Last updated:** 2026-11-24  
**Jurisdiction:** Republic of Tunisia — Law No. **2004-63** of 27 July 2004 on the protection of personal data, supervised by the **INPDP** (Instance Nationale de Protection des Données Personnelles).

This policy explains how personal data is processed when merchants use AI Sales Manager and when shoppers message those merchants on Instagram, Messenger, WhatsApp, or the website widget.

> **Filing status:** Formal INPDP declaration / authorization is tracked in [`INPDP_FILING_CHECKLIST.md`](./INPDP_FILING_CHECKLIST.md). Do **not** invent a filing number — insert the official reference only after INPDP acknowledgment.

---

## 1. Roles (controller vs processor)

| Party                                    | Role under Law 2004-63                                                                                                                                     | Responsibility                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Merchant (store owner)**               | **Data controller** for end-customer (shopper) data collected in their sales conversations                                                                 | Decides purposes: answering DMs, creating COD orders, delivery, staff follow-up               |
| **AI Sales Manager (platform operator)** | **Data processor** for shopper data processed on behalf of the merchant; **controller** for merchant-account data (Owner/Admin/Employee accounts, billing) | Hosts the multi-tenant workspace, AI tools, channels, and storage under merchant instructions |

A separate [`DPA_MERCHANT.md`](./DPA_MERCHANT.md) binds platform and merchant on multi-tenant custody.

---

## 2. Categories of personal data

### 2.1 Shoppers (customers of the merchant)

| Data                                                   | Typical source           | Why we process it                |
| ------------------------------------------------------ | ------------------------ | -------------------------------- |
| Display name / profile name                            | Meta / chat              | Identify the thread              |
| Phone number (**+216** Tunisian mobiles)               | Provided in chat for COD | Delivery contact                 |
| Delivery address (governorate / delegation / line)     | Provided in chat for COD | Fulfilment                       |
| Chat messages & media                                  | Channel webhooks         | Sales assistance & order context |
| Order snapshot (items, amounts in **TND**, COD status) | Platform                 | Pending → confirm COD lifecycle  |

### 2.2 Merchant staff

Account email, name, role, authentication metadata, audit actions — needed to operate the workspace.

---

## 3. Legal basis & transparency

Processing for shoppers is based on:

1. **Merchant instructions** (processor mandate) to operate social-commerce conversations and COD orders.
2. **Legitimate interest / contractual steps** for preparing a delivery sale initiated by the shopper.
3. Where required, **consent** collected by the merchant in their own channel bio / first-message disclosure (see AI disclosure templates).

Shoppers must be told that an **automated sales assistant** may reply, and that they can **request a human** at any time.

---

## 4. Storage, security & location

- Data is stored in encrypted databases and object storage under the platform’s infrastructure (see engineering security design).
- Access is **tenant-scoped** (`business_id`). Staff only see their merchant’s customers.
- Channel tokens are stored as secret references, not in application logs.
- Message bodies and phone numbers are redacted from routine application logs.

---

## 5. Retention

| Record                                  | Retention (MVP policy)                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| Active customer profile & conversations | Kept while the merchant account is active and the customer has not requested erasure |
| Orders (amounts, status)                | Kept for accounting even after customer erasure; PII fields stripped                 |
| Audit logs                              | 365 days                                                                             |
| Timed automatic 24-month PII purge      | **Post-MVP** (tracked as tech debt); erasure-on-request is available now             |

---

## 6. Shopper rights (erasure & access)

Upon a verified request routed through the merchant (or platform ops acting for the merchant):

1. Profile fields are anonymized (`name` → `Deleted customer`; phone / email / address / preferences cleared).
2. Channel identities for that customer are removed (a later message from the same social ID creates a **new** customer record).
3. Message content is redacted; attachments deleted from storage.
4. Order rows remain without delivery PII.

Technical path: `POST /api/v1/customers/:id/erase` (permission `customers.erase`) and ops script `pnpm privacy:erase`.

---

## 7. Contact

- **Merchant privacy contact:** the store Owner email on the workspace.
- **Platform privacy contact:** set in production ops runbook (replace with operator email before go-live).
- **INPDP:** [https://www.inpdp.tn](https://www.inpdp.tn) (official authority).

---

## 8. Changes

Material changes will be reflected in this document and, for merchants, in the in-app Settings notice when contractual terms change.
