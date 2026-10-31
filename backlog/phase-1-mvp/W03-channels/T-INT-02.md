---
id: T-INT-02
parent: T-INT-02
wave: W3
status: done
optional: false
depends:
  - T-INT-01
fs:
  - FS-INT-01
read:
  - docs/10_engineering/16_INTEGRATION_DESIGN/01-adapters-webhooks.md
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/integrations/webhooks/webhooks.controller.ts
  - apps/api/src/integrations/webhooks/webhooks.service.ts
  - apps/api/src/integrations/guards/meta-hmac.guard.ts
done_cmd: pnpm --filter api test -- src/integrations
next: T-INT-03
---

# Task: Meta Webhooks ingestion & raw payload persistence

## 1. Objective & Value

Implement Meta webhook verification challenge and high-performance webhook receiver with HMAC validation, immediate 200 OK ACK, and raw payload persistence.

**Why this exists**: Meta requires webhook endpoints to respond within 3-5 seconds and cryptographically verify signatures to prevent webhook spoofing.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/integrations/webhooks.*`
- `apps/api/src/integrations/guards/meta-hmac.guard.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /webhooks/meta` (200 OK) -> Webhook verification challenge (returns `hub.challenge` string)
- `POST /webhooks/meta` (200 OK) -> Body `{ object: 'instagram' | 'page' | 'whatsapp_business_account', entry: [] }` (persists to `integration_events`, responds 200 immediately, queues BullMQ processing)

---

## 4. Invariants & Security Guardrails

- 🔒 **HMAC Verification**: Validate `X-Hub-Signature-256` header against `META_APP_SECRET` using timing-safe comparison.
- 🛡️ **Idempotency**: Use `external_event_id` unique constraint to deduplicate repeated webhooks silently.
- 🚫 **Negative Invariants**: Never execute AI turns or synchronous external calls in the webhook receiver thread.

---

## 5. Implementation Steps

1. Implement `MetaHmacGuard` verifying HMAC SHA-256 signature.
2. Implement `WebhooksController.handleWebhook()` saving raw payload to `integration_events` and enqueuing BullMQ job.
3. Author unit tests covering GET challenge, valid HMAC, invalid HMAC (401), and duplicate event deduplication.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Challenge**: GET returns `hub.challenge` matching verify token.
- [ ] **HMAC Check**: Invalid HMAC returns 401 Unauthorized without persisting data.
- [ ] **Fast 200**: Valid webhook persists raw event and returns 200 OK immediately.
- [ ] **Duplicate Idempotency**: Duplicate external message IDs are deduplicated safely.

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

- **🌐 External setup**: Configure webhook callback URL (`https://<tunnel>/webhooks/meta`) in Meta Developer App dashboard.
- **🧪 Manual QA**: Send test payload from Meta Graph API Explorer and verify 200 response under 500ms.

---

## 9. Expected Deliverables

Webhook controller, HMAC guard, persistence service, and tests in `apps/api/src/integrations`.
