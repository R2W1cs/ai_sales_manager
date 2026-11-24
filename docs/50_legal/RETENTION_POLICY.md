# Data retention & erasure SOP

Aligns with Law 2004-63, product security design `17` §8.3, and database retention notes in `12` §2.12.

---

## 1. Retention summary (MVP)

| Data                                         | Keep while      | On erase request                                             |
| -------------------------------------------- | --------------- | ------------------------------------------------------------ |
| Customer profile (name, +216 phone, address) | Tenant active   | Anonymize / null                                             |
| Channel identities (IGSID/PSID)              | Until erase     | **Delete** (new identity → new customer)                     |
| Messages                                     | Tenant active   | Content → `[redacted]`                                       |
| Message attachments                          | Until erase     | Delete DB rows + object storage                              |
| Orders                                       | Accounting need | Keep row; strip `customer_snapshot` / `delivery_address` PII |
| Audit logs                                   | 365 days        | Keep (ids only; no PII payload)                              |

Timed **24-month automatic PII purge** is **out of MVP** (OQ-04 / TD-003). Erasure-on-request is mandatory now.

---

## 2. How to fulfil a shopper deletion request

1. Merchant verifies the requester (same phone / social thread).
2. Owner/Admin with `customers.erase` opens the customer in Inbox / Customers.
3. Call API: `POST /api/v1/customers/:id/erase` (returns **204**).
4. Or ops: `pnpm privacy:erase -- --business <uuid> --customer <uuid> --token <jwt>`.
5. Confirm audit event `customer.erase` exists.
6. Reply to the shopper that their personal data was deleted from the assistant workspace (orders may remain without personal details for accounting).

---

## 3. Script

```bash
pnpm privacy:erase -- --api http://127.0.0.1:4000 --business <businessId> --customer <customerId> --token <accessToken>
```

The script never hard-deletes order or conversation rows.
