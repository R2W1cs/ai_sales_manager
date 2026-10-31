---
id: T-KNOW-03
parent: T-KNOW-03
wave: W2
status: done
optional: false
depends:
  - T-KNOW-02
  - T-CAT-04
fs:
  - FS-KNOW-02
read:
  - docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md
  - docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/knowledge/search/embedding.processor.ts
  - apps/api/src/knowledge/search/embedding.service.ts
  - apps/api/src/knowledge/search/vector-search.service.ts
done_cmd: pnpm --filter api test -- src/knowledge
next: T-INT-01
---

# Task: RAG chunking, pgvector embedding generation & vector search worker

## 1. Objective & Value

Implement text chunking, OpenAI 1536-dim embedding generation worker, and pgvector cosine similarity search service.

**Why this exists**: Provide high-precision semantic RAG retrieval so the AI Sales Agent can ground responses in store policies and product details.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/knowledge/embedding.*`
- `apps/api/src/knowledge/vector-search.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Processor: BullMQ `generate-embeddings` consumes document and product texts, chunks (500 tokens / 50 overlap), calls OpenAI `text-embedding-3-small`.
- `VectorSearchService.similaritySearch(businessId, queryText, topK, minScore)` -> Returns chunks ordered by cosine similarity `<=>`.

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenancy Boundary**: Every vector search query must include `WHERE business_id = $1` (cross-tenant similarity search is strictly forbidden).
- 🛡️ **Score Threshold**: Filter out results below minimum similarity threshold (0.72).

---

## 5. Implementation Steps

1. Implement sliding window chunking utility.
2. Implement BullMQ embedding processor writing to `embeddings` table with pgvector type.
3. Implement `VectorSearchService` executing raw SQL query with cosine distance operator `<=>`.
4. Author unit/integration tests verifying chunking, vector storage, and tenant isolation.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Semantic Retrieval**: Query returns relevant policy/product chunks sorted by similarity.
- [ ] **Tenancy Isolation**: Vectors belonging to Tenant A are never returned to Tenant B.
- [ ] **Score Filtering**: Low-relevance chunks (<0.72) are excluded.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/knowledge

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🔑 Environment variables**: Provide `AI_GATEWAY_API_KEY` in `.env`.
- **🧪 Manual QA & Smoke test**: Run worker and test semantic query via test script; verify top matching chunk returns score > 0.72.
- **👁️ Review & Sign-off**: Verify `WHERE business_id = ...` is present in vector search SQL query.

---

## 9. Expected Deliverables

Embedding processor, vector search service, and tests in `apps/api/src/knowledge`.
