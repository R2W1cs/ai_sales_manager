---
id: T-INT-05
parent: T-INT-05
wave: W3
status: done
optional: false
depends:
  - T-INT-03
fs:
  - FS-INT-01
read:
  - docs/10_engineering/16_INTEGRATION_DESIGN/02-oauth-graph-client-ops.md
  - docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/integrations/media/media.service.ts
  - apps/api/src/integrations/media/media.processor.ts
done_cmd: pnpm --filter api test -- src/integrations
next: T-INT-06
---

# Task: Media attachments processing & MinIO storage

## 1. Objective & Value

Implement inbound customer media attachment download from Meta CDN and permanent tenant-isolated storage in MinIO/S3.

**Why this exists**: Customer images (payment receipts, product photos) must be downloaded from temporary Meta CDN URLs and preserved permanently in merchant storage.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/integrations/media.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- Worker downloads media from Meta CDN using channel access token.
- Uploads to S3 bucket path `{business_id}/attachments/{id}` and inserts `message_attachments` row.

---

## 4. Invariants & Security Guardrails

- 🔒 **Tenancy Isolation**: Media files stored under tenant-prefixed S3 keys.
- 🛡️ **Size Limit**: Validate attachment size <= 10MB.

---

## 5. Implementation Steps

1. Implement `MediaService` and BullMQ `media.processor.ts`.
2. Author unit tests covering download, upload, and metadata linking.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Media Download**: Customer photo is downloaded to MinIO and linked to message.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/integrations

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Send photo from customer Instagram and verify file in MinIO bucket console.

---

## 9. Expected Deliverables

Media download service and worker in `apps/api/src/integrations`.
