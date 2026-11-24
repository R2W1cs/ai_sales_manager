# Data Processing Agreement (DPA) — Merchant ↔ Platform

**Parties**

1. **Merchant** — the business workspace Owner (controller of shopper personal data).
2. **Platform** — AI Sales Manager operator (processor of shopper personal data; controller of merchant-account data).

**Law:** Tunisia Law No. **2004-63**; INPDP supervision.

This DPA is incorporated into the [`TERMS_OF_SERVICE.md`](./TERMS_OF_SERVICE.md).

---

## 1. Subject matter

Platform processes shopper personal data **only** to provide conversational social commerce features: channel ingest, AI assistance, inbox, pending COD orders, analytics aggregates, and security/audit.

---

## 2. Nature & purpose

| Purpose             | Examples                                                                         |
| ------------------- | -------------------------------------------------------------------------------- |
| Messaging           | Store inbound/outbound messages for the merchant inbox                           |
| AI sales assistance | Classify intent, draft/send grounded replies                                     |
| COD fulfilment prep | Collect name, **+216** phone, governorate/delegation address into pending orders |
| Human takeover      | Escalate to staff when shopper requests a human or rules require it              |
| Compliance          | Execute erase-on-request; write audit events without logging raw PII             |

Platform will **not** sell shopper data, use it to train public foundation models as a Merchant feature, or access another tenant’s data.

---

## 3. Categories of data subjects & data

- **Data subjects:** shoppers messaging the Merchant’s social channels / widget.
- **Data:** identity hints from Meta, chat content, phone, delivery address, order snapshots (TND amounts).

---

## 4. Multi-tenant custody

- Each Merchant’s data is isolated by `business_id`.
- Platform staff (platform operators) may access data only for support, security, or legal obligations, under least privilege.
- Sub-processors (hosting, email, LLM providers) are listed in the production ops inventory; Merchant will be notified of material changes.

---

## 5. Merchant instructions

Merchant instructs Platform to:

1. Process data as described in the Privacy Policy.
2. Disclose the automated assistant in greetings / channel bio.
3. Honour “request human” escalations.
4. Execute `customers.erase` when Merchant confirms a deletion request.

---

## 6. Security

Platform implements access control, TLS, encrypted storage, secret management for channel tokens, log redaction, and audit logging as described in engineering security design (`17`).

---

## 7. Erasure & return

On Merchant written instruction (or API erase), Platform anonymizes the shopper profile and redacts conversation content as specified in `17` §8.3. Order financial rows may be retained without delivery PII for accounting.

On Tenant termination, Platform deletes or anonymizes remaining Merchant-controlled shopper data within a commercially reasonable period after final erase sweeps, except data retained by law.

---

## 8. INPDP

Merchant remains responsible for any controller-side filings. Platform provides cooperation and a filing checklist ([`INPDP_FILING_CHECKLIST.md`](./INPDP_FILING_CHECKLIST.md)). Official INPDP reference numbers are filled **only after** authority acknowledgment — never invented.

---

## 9. Signatures

| Role                          | Name | Date | Signature |
| ----------------------------- | ---- | ---- | --------- |
| Merchant Owner                |      |      |           |
| Platform authorized signatory |      |      |           |
