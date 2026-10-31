---
id: T-CAT-04
parent: T-CAT-04
wave: W2
status: done
optional: false
depends:
  - T-CAT-02
fs:
  - FS-CAT-01
read:
  - docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md
  - docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/catalog/indexer/catalog-indexer.service.ts
  - apps/api/src/catalog/indexer/catalog-indexer.processor.ts
done_cmd: pnpm --filter api test -- src/catalog
next: T-KNOW-01
---

# Task: Catalog re-indexing & search sync worker

## 1. Objective & Value

Implement background worker to enqueue and debounce vector re-embedding jobs whenever product titles, descriptions, options, or prices are modified.

**Why this exists**: Keep RAG vector database synchronized with latest catalog merchandising data without blocking HTTP request threads.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/catalog/catalog-indexer.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Event: `catalog.product.updated` published on product/variant mutations.
- Queue: BullMQ `sync-product-embedding` with Redis debouncing key.

---

## 4. Invariants & Security Guardrails

- 🔒 **Asynchronous Execution**: Never execute embedding API calls synchronously inside the HTTP handler.

---

## 5. Implementation Steps

1. Implement `CatalogIndexerService` publishing event on product changes.
2. Implement BullMQ processor with Redis debouncing window (5 seconds).
3. Author unit tests verifying event emission and queue dispatch.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Job Enqueue**: Modifying product enqueues re-index job in BullMQ.
- [ ] **Debounce**: Rapid successive edits result in a single embedding refresh.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/catalog

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Edit product title in Swagger and verify job in Redis BullMQ queue.

---

## 9. Expected Deliverables

Catalog indexer service and background worker in `apps/api/src/catalog`.
