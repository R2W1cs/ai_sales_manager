---
id: T-INT-06
parent: T-INT-06
wave: W3
status: done
optional: false
depends:
  - T-INT-03
fs:
  - FS-INT-01
read:
  - docs/10_engineering/16_INTEGRATION_DESIGN/02-oauth-graph-client-ops.md
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/integrations/adapters/whatsapp-cloud.stub.ts
done_cmd: pnpm --filter api test -- src/integrations
next: T-INT-07
---

# Task: WhatsApp integration adapter stub & feature gate

## 1. Objective & Value

Establish official WhatsApp Cloud API adapter architecture stub and enforce strict feature gating.

**Why this exists**: Prepare for official WhatsApp Cloud API onboarding in Phase 2 while strictly forbidding unofficial WhatsApp scrapers.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/integrations/adapters/whatsapp*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `WhatsAppCloudStubAdapter` implements `ChannelAdapter` interface with feature flag check.

---

## 4. Invariants & Security Guardrails

- 🚫 **Forbidden Packages**: Strictly zero unofficial WhatsApp libraries in package.json or pnpm-lock.yaml.

---

## 5. Implementation Steps

1. Create WhatsApp adapter stub conforming to `ChannelAdapter`.
2. Author test verifying feature flag check and lockfile hygiene.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Clean Dependencies**: Verify zero unofficial WhatsApp dependencies exist in lockfile.

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

- **👁️ Review & Sign-off**: Verify `pnpm-lock.yaml` contains no unapproved scraping dependencies.

---

## 9. Expected Deliverables

WhatsApp adapter stub in `apps/api/src/integrations`.
