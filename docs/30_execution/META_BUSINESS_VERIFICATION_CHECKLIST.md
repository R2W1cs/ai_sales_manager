# Meta Business Verification checklist (Tunisia)

Green checkmark on **Business Verification** in Meta Business Manager is required for many Advanced Access paths.

> **Rule:** Never invent a Meta verification ID. Leave official fields blank until Business Manager shows Verified.

---

## 1. Documents to upload (typical Tunisia set)

Prepare high-quality scans/PDFs:

| Document                          | Notes                                          |
| --------------------------------- | ---------------------------------------------- |
| RNE extract / commercial register | Legal company name must match Business Manager |
| JORT notice (if applicable)       | Incorporation / publication                    |
| Corporate bank statement          | Recent; company name visible                   |
| Utility bill                      | Company address matching Business Manager      |

Admin identity:

- [ ] Phone number verification on Business Manager
- [ ] **or** email domain verification (DNS TXT / Meta instructions)

---

## 2. Business Manager fields

| Field               | Value   |
| ------------------- | ------- |
| Legal name          |         |
| Trade name          |         |
| Address             |         |
| Country             | Tunisia |
| Business Manager ID |         |
| Primary admin       |         |

Link the **production Meta App** to this Business Manager before requesting verification.

---

## 3. Status (fill after Meta)

| Field                       | Value                                             |
| --------------------------- | ------------------------------------------------- |
| Submitted on                | _YYYY-MM-DD_                                      |
| Meta verification reference | _leave blank until issued_                        |
| Status                      | Not started / In review / **Verified** / Rejected |
| Rejection reason (if any)   |                                                   |
| Re-submitted on             |                                                   |

---

## 4. After Verified

1. Confirm App Review permissions still show Advanced Access eligibility.
2. Confirm production webhook verify + HMAC scripts against live hooks host:
   - `pnpm meta:verify-webhook`
   - `pnpm meta:verify-webhook-hmac`
   - `pnpm meta:verify-data-deletion`
3. Connect first design-partner Page / IG professional account (see [`META_LIVE_LOOP.md`](./META_LIVE_LOOP.md)).
