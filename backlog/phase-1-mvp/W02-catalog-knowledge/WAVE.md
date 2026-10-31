---
id: W2
phase: phase-1-mvp
status: done
---

# W2 — Catalog and knowledge

Start constraint from `30` §5, not a sprint name. Calendar is `31`.

**First card in this wave (depends-ready order):** [`T-CAT-01`](T-CAT-01.md)

## Cards

- [`T-CAT-01`](T-CAT-01.md) — Categories CRUD API (`/categories`)
- [`T-CAT-02`](T-CAT-02.md) — Products & variants domain layer (`/products`, `/variants`, S3 images, pricing/stock)
- [`T-CAT-03`](T-CAT-03.md) — Catalog CSV bulk import/export worker & API (`/products/import`, `/products/export`)
- [`T-CAT-04`](T-CAT-04.md) — Catalog re-indexing & search sync worker
- [`T-KNOW-01`](T-KNOW-01.md) — Business rules versioning & validation API (`/business-rules`)
- [`T-KNOW-02`](T-KNOW-02.md) — Knowledge documents management & indexing trigger (`/knowledge/documents`)
- [`T-KNOW-03`](T-KNOW-03.md) — RAG chunking, pgvector embedding generation & vector search worker
