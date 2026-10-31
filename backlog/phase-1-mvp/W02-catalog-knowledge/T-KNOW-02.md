---
id: T-KNOW-02
parent: T-KNOW-02
wave: W2
status: done
optional: false
depends:
  - T-BIZ-01
fs:
  - FS-KNOW-02
read:
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
  - docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/knowledge/documents/documents.controller.ts
  - apps/api/src/knowledge/documents/documents.service.ts
  - apps/api/src/knowledge/dto/create-document.dto.ts
done_cmd: pnpm --filter api test -- src/knowledge
next: T-KNOW-03
---

# Task: Knowledge documents management & indexing trigger (`/knowledge/documents`)

## 1. Objective & Value

Implement knowledge document storage and ingestion triggers for RAG semantic search.

**Why this exists**: Allow merchants to upload FAQ documents, product manuals, and store policies for semantic AI retrieval.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/knowledge/documents.*`
- `apps/api/src/knowledge/dto/*doc*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /knowledge/documents` (200 OK) -> List store knowledge documents with indexing status
- `POST /knowledge/documents` (201 Created) -> `{ title: string, content: string, category?: string }` (sets `indexingStatus: pending`)
- `DELETE /knowledge/documents/:id` (204 No Content) -> Removes document and deletes associated embeddings
- `POST /knowledge/documents/:id/reindex` (202 Accepted) -> Triggers re-chunking and re-embedding

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenancy Scope**: Documents and embeddings belong strictly to caller's `business_id`.
- 🛡️ **Cascade Deletion**: Deleting a document removes its associated vector rows from `embeddings` table.

---

## 5. Implementation Steps

1. Implement `DocumentsService` and `DocumentsController`.
2. Trigger BullMQ job `index_knowledge_document` on document create/reindex.
3. Author unit tests covering CRUD, cascade delete, and queue triggers.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Document Create**: Creates document with `status = 'PENDING'` and queues indexing.
- [ ] **Cascade Clean**: Deleting document deletes related vector embeddings.

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

- **🧪 Manual QA**: Upload store FAQ text document in Swagger and verify status is PENDING.

---

## 9. Expected Deliverables

Knowledge documents controller, service, and tests in `apps/api/src/knowledge`.
