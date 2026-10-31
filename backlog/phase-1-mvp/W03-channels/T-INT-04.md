---
id: T-INT-04
parent: T-INT-04
wave: W3
status: done
optional: false
depends:
  - T-INT-03
fs:
  - FS-INT-01
read:
  - docs/10_engineering/16_INTEGRATION_DESIGN/02-oauth-graph-client-ops.md
  - docs/10_engineering/14_SYSTEM_DESIGN/01-state-machine-message-pipeline.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/integrations/outbound/outbound.service.ts
  - apps/api/src/integrations/outbound/outbound.processor.ts
  - apps/api/src/integrations/meta/meta-api.client.ts
done_cmd: pnpm --filter api test -- src/integrations
next: T-INT-05
---

# Task: Outbound message delivery pipeline, rate limiting & retry queue

## 1. Objective & Value

Implement outbound message delivery pipeline via BullMQ with exponential backoff retries, Dead Letter Queue (DLQ), and per-channel rate limiters.

**Why this exists**: Ensure reliable message delivery to customers across Meta channels while handling network transient errors and platform rate limits.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/integrations/outbound.*`
- `apps/api/src/integrations/meta/meta-api.client.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `OutboundService.queueMessage(messageId)` pushes to BullMQ `deliver_outbound` queue.
- Worker decrypts token, calls Meta API, updates message `deliveryStatus = 'SENT'` or `'FAILED'` on exhausted retries.

---

## 4. Invariants & Security Guardrails

- 🔒 **Token Decryption**: Decrypt access token in worker memory just prior to HTTP dispatch.
- 🛡️ **Backoff & DLQ**: 3 retries (2s, 8s, 32s) before moving to Dead Letter Queue.

---

## 5. Implementation Steps

1. Implement `MetaApiClient` for WhatsApp Cloud API and Instagram Graph API.
2. Implement BullMQ `outbound.processor.ts` with exponential retry policy and rate limiting.
3. Author unit tests covering successful send, transient 5xx retry, and fatal 4xx DLQ routing.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Outbound Delivery**: Message dispatches to Meta API and updates delivery status to SENT.
- [ ] **Exponential Retries**: Transient 500 errors trigger retries with backoff.
- [ ] **DLQ Handling**: Fatal errors mark message FAILED and move to DLQ without crashing.

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

- **🧪 Manual QA**: Send outbound test reply; verify message reaches customer test user on Instagram.
- **👁️ Review & Sign-off**: Verify message delivery failures update `deliveryStatus = 'FAILED'` in database.

---

## 9. Expected Deliverables

Outbound delivery service, Meta API client, BullMQ worker, and tests in `apps/api/src/integrations`.
