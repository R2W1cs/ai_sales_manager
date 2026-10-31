---
id: T-INT-03
parent: T-INT-03
wave: W3
status: done
optional: false
depends:
  - T-INT-02
fs:
  - FS-INT-01
read:
  - docs/10_engineering/16_INTEGRATION_DESIGN/01-adapters-webhooks.md
  - docs/10_engineering/14_SYSTEM_DESIGN/01-state-machine-message-pipeline.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/integrations/adapters/meta-whatsapp.adapter.ts
  - apps/api/src/integrations/adapters/meta-instagram.adapter.ts
  - apps/api/src/integrations/adapters/meta-messenger.adapter.ts
  - apps/api/src/integrations/normalizer/normalizer.service.ts
done_cmd: pnpm --filter api test -- src/integrations
next: T-INT-04
---

# Task: Messaging adapters & canonical message normalization

## 1. Objective & Value

Implement platform-specific adapters to normalize inbound raw webhook payloads into the unified `CanonicalMessage` domain interface.

**Why this exists**: Decouple core conversations and AI systems from provider-specific JSON quirks across Meta platforms.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/integrations/adapters/`
- `apps/api/src/integrations/normalizer/normalizer.service.ts`
- `packages/shared/src/integrations/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `NormalizerService.normalize(rawPayload): CanonicalMessage`
- `CanonicalMessage`: `{ externalMessageId, channelType, channelAccountId, externalSenderId, text, attachments, timestamp }`

---

## 4. Invariants & Security Guardrails

- 🔒 **Module Boundary**: No provider-specific JSON fields leak beyond the `integrations` module boundary.

---

## 5. Implementation Steps

1. Implement adapters for Instagram Graph API, Messenger, and WhatsApp Cloud API.
2. Implement `NormalizerService` routing raw events to appropriate adapter.
3. Author unit tests covering text, image attachments, quick replies, and malformed payload resilience.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Normalization**: Instagram, Messenger, and WhatsApp payloads map into identical CanonicalMessage interface.
- [ ] **Malformed Resilience**: Malformed provider JSON is flagged without crashing background worker.

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

- **🧪 Manual QA**: Send text and image messages from customer Instagram and verify normalized format in worker logs.

---

## 9. Expected Deliverables

Platform adapters and normalization service in `apps/api/src/integrations`.
