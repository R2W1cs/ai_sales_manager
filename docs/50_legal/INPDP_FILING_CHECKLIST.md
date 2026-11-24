# INPDP declaration / authorization dossier checklist

Use this checklist to prepare the **formal dossier** for the Instance Nationale de Protection des Données Personnelles (INPDP) covering processing of shopper data for Tunisian social-commerce tenants.

> **Rule:** Leave official reference fields blank until INPDP issues them. Never invent a declaration or authorization number for demos or git.

---

## A. Parties & roles

- [ ] Platform legal name / RC / tax ID
- [ ] Platform DPO or privacy contact email/phone
- [ ] Statement: Platform = **processor** for shopper data; Merchant = **controller**
- [ ] Template DPA signed with each design-partner merchant ([`DPA_MERCHANT.md`](./DPA_MERCHANT.md))

## B. Processing description

- [ ] Purposes: DM sales assistance, COD pending orders, human handoff, analytics aggregates
- [ ] Data categories: name, +216 phone, delivery address, messages, order amounts (TND)
- [ ] Channels: Instagram, Messenger, WhatsApp (if enabled), website widget
- [ ] Recipients: merchant staff; hosting/LLM sub-processors (attach list)
- [ ] Cross-border transfers (if any): document destination country + safeguards

## C. Security measures (attach excerpts)

- [ ] Tenant isolation (`business_id`)
- [ ] Encryption in transit / at rest
- [ ] Access control & audit (`customer.erase`, exports)
- [ ] Erasure procedure (`POST /customers/:id/erase` + ops script)
- [ ] Retention table ([`RETENTION_POLICY.md`](./RETENTION_POLICY.md))

## D. Transparency toward shoppers

- [ ] Merchant bio / first-message AI disclosure (default templates in product)
- [ ] “Request human” path documented
- [ ] Links to Privacy Policy & Terms on marketing site (`/privacy`, `/terms`)

## E. Filing status (fill after authority response)

| Field                              | Value                        |
| ---------------------------------- | ---------------------------- |
| Dossier submitted on               | _YYYY-MM-DD_                 |
| Submission channel                 | _portal / mail / in-person_  |
| INPDP acknowledgment reference     | _leave blank until received_ |
| Authorization / declaration number | _leave blank until received_ |
| Validity / renewal date            | _if applicable_              |

## F. Attachments index

1. Privacy Policy
2. Terms of Service
3. Signed merchant DPA(s)
4. Architecture / security summary
5. Erasure & retention SOP
6. Sub-processor list (production)
