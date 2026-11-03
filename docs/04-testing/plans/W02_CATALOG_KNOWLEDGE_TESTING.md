# Wave W2 Testing Specification — Catalog, Knowledge Base & Embeddings

| Field       | Value                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------- |
| Wave ID     | `W2`                                                                                          |
| Wave Title  | Catalog, Knowledge Base & Embeddings                                                          |
| Cards       | `T-CAT-01` through `T-CAT-04`, `T-KNOW-01` through `T-KNOW-03` (17 leaves)                    |
| Status      | Canonical AI Testing Guide for Wave W2 Completion Gate                                        |
| Focus Areas | Products, Variants, Stock calculation, S3 Presigned Uploads, CSV Bulk Import, Rules, pgvector |

---

## 1. Automated Verification Suites

```bash
# 1. Catalog Unit & Integration Tests
pnpm --filter api test -- src/catalog

# 2. Knowledge Base & Rules Tests
pnpm --filter api test -- src/knowledge

# 3. Full Workspace Quality Check
pnpm check:full
```

---

## 2. Invariant & Edge Case Testing Matrix

### A. Catalog & Stock Calculation (`12` §6, `13` §8)

- **Stock Math Invariant**:
  - `availableStock = total_stock - active_reservations`.
  - Adding a product variant with negative stock throws `400 validation_error`.
  - Price must be validated as a strict Decimal string `(12,3)`.
- **Soft-Archive vs Deletion**:
  - Deleting a product that is linked to active or historical orders must soft-archive (`archived_at = NOW()`), NEVER hard delete from Postgres.
- **Presigned Media Uploads to MinIO/S3**:
  - Direct merchant upload limit: max 10MB (`413 payload_too_large` if exceeded).
  - Presigned upload URLs expire after 5 minutes.

### B. CSV Bulk Import & Async Queueing (`13` §8.3)

- **Async 202 Contract**:
  - `POST /catalog/import` accepts multipart CSV (≤10MB) and returns `202 Accepted` with `{ "jobId": "uuid" }`.
  - Server MUST NOT hold HTTP connection open during CSV processing.
  - Duplicate SKU rows in CSV are handled via upsert policy (`confirm` phase).

### C. Knowledge Base Rules & Versioning (`12` §10, `13` §9)

- **Rule Overlap & Policy Conflict**:
  - Inserting overlapping rules with same priority returns `409 conflict`.
  - Disabling a rule via `PATCH` sets `effective_to = NOW()`.

### D. `pgvector` Semantic Search & Isolation (`15_AI_ARCHITECTURE.md`)

- **Vector Dimension & Distance**:
  - Vector column strictly typed `vector(1536)` (or `vector(768)`).
  - Cosine distance operator (`<=>`) used for KNN semantic lookup.
- **Strict Multi-Tenant Vector Search Invariant**:
  - Similarity queries MUST have `WHERE business_id = $tenantId`. A KNN query without tenant filter is a Sev-1 security defect.

---

## 3. CLI Smoke & Integration Simulation

```bash
# 1. Create Product Category
curl -s -X POST http://localhost:3001/api/v1/catalog/categories \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: $BIZ_ID" \
  -H "Content-Type: application/json" \
  -d '{"name":"Sneakers","slug":"sneakers"}'

# 2. Upload Knowledge Document
curl -s -X POST http://localhost:3001/api/v1/knowledge/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: $BIZ_ID" \
  -H "Content-Type: application/json" \
  -d '{"title":"Return Policy","content":"Returns accepted within 14 days in original box."}'

# 3. Verify pgvector chunk retrieval
curl -s -X GET "http://localhost:3001/api/v1/knowledge/retrieve?query=how+to+return" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: $BIZ_ID"
```

---

## 4. Wave W2 Completion Gate Checklist

- [ ] All 17 leaves (`T-CAT-01` through `T-KNOW-03/c`) marked `status: done`.
- [ ] Catalog and knowledge unit test suites pass 100%.
- [ ] Multi-tenant vector retrieval proven isolated under unit tests.
- [ ] `pnpm check:full` exits 0.
