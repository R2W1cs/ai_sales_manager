---
id: T-INT-01
parent: T-INT-01
wave: W3
status: done
optional: false
depends:
  - T-BIZ-01
  - T-BIZ-06
fs:
  - FS-INT-01
read:
  - docs/10_engineering/16_INTEGRATION_DESIGN/02-oauth-graph-client-ops.md
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/integrations/channels/channels.controller.ts
  - apps/api/src/integrations/channels/channels.service.ts
  - apps/api/src/integrations/meta/meta-oauth.service.ts
  - apps/api/src/integrations/integrations.module.ts
done_cmd: pnpm --filter api test -- src/integrations
next: T-INT-02
---

# Task: Meta OAuth & Channel accounts management (WhatsApp / Instagram / Messenger)

## 1. Objective & Value

Implement Meta OAuth integration flow and channel accounts management with AES-256-GCM token encryption and plan quota enforcement.

**Why this exists**: Allow merchants to connect their official Instagram Business, Facebook Messenger, and WhatsApp accounts to receive and send messages.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/integrations/channels.*`
- `apps/api/src/integrations/meta-oauth.*`
- `apps/api/src/integrations/dto/*`
- `packages/shared/src/integrations/`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`
- `apps/api/src/conversations/`

---

## 3. Technical Contract & Interfaces

- `GET /integrations/channels` (200 OK) -> List connected channel accounts and health status
- `GET /integrations/meta/oauth-url` (200 OK) -> Generate Meta authorization URL with signed state token
- `POST /integrations/meta/callback` (200 OK) -> Exchange code, encrypt token with AES-256-GCM, save `channel_accounts` row

---

## 4. Invariants & Security Guardrails

- 🔒 **Encryption**: Access tokens must be encrypted with AES-256-GCM before saving to database.
- 🛡️ **Plan Quota**: Validate channel count against subscription plan allowance (returns 403 quota_exceeded if breached).
- 🛡️ **WhatsApp Gate**: WhatsApp account connection is blocked unless `whatsapp_enabled` flag is true.

---

## 5. Implementation Steps

1. Implement `MetaOAuthService` generating OAuth URLs and exchanging auth codes.
2. Implement AES-256-GCM encryption/decryption utility using `ENCRYPTION_KEY`.
3. Implement `ChannelsController` and `ChannelsService` with plan quota checks.
4. Author unit tests covering OAuth callback, token encryption, and quota enforcement.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Connect Channel**: Meta OAuth exchange saves encrypted channel account.
- [ ] **Quota Enforcement (403)**: Attempting to connect channels beyond plan quota returns 403 quota_exceeded.
- [ ] **WhatsApp Gate**: WhatsApp connection is blocked if feature flag is disabled.

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

- **🔑 Environment variables**: Configure `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, and `ENCRYPTION_KEY` in `.env`.
- **🌐 External setup**: Configure OAuth redirect URL in Meta App Dashboard.
- **🧪 Manual QA**: Initiate OAuth URL in browser, authorize test Instagram account, and verify encrypted token in DB.
- **👁️ Review & Sign-off**: Verify raw tokens are never stored in plaintext in the database.

---

## 9. Expected Deliverables

Meta OAuth service, channels controller, encryption helper, and tests in `apps/api/src/integrations`.
