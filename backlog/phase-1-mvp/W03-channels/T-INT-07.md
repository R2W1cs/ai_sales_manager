---
id: T-INT-07
parent: T-INT-07
wave: W3
status: done
optional: false
depends:
  - T-INT-01
fs:
  - FS-INT-01
read:
  - docs/10_engineering/16_INTEGRATION_DESIGN/02-oauth-graph-client-ops.md
  - docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/integrations/channels/channels.controller.ts
  - apps/api/src/integrations/channels/channels.service.ts
done_cmd: pnpm --filter api test -- src/integrations
next: T-CONV-01
---

# Task: Channel account health checks & disconnect flow

## 1. Objective & Value

Implement channel token health monitoring, expiration alerts, and graceful channel disconnection.

**Why this exists**: Alert merchants when Meta tokens expire and allow clean channel disconnection without orphaned webhooks.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/integrations/channels.*`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `GET /integrations/channels/health` (200 OK) -> Health status per channel account (`ACTIVE`, `DEGRADED`, `DISCONNECTED`)
- `POST /integrations/channels/:id/disconnect` (200 OK) -> Revokes token and marks channel status `DISCONNECTED`

---

## 4. Invariants & Security Guardrails

- 🛡️ **RBAC Permission**: Disconnect requires `@RequirePermission('integrations.manage')`.

---

## 5. Implementation Steps

1. Implement health check method verifying token expiry against Meta debug API.
2. Implement disconnect route revoking stored tokens.
3. Author unit tests covering health check and disconnect.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Health Status**: Reports token status accurately.
- [ ] **Disconnect**: Invalidate stored credentials on disconnect.

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

- **🧪 Manual QA**: Invalidate token in developer console and verify DEGRADED status in Swagger.

---

## 9. Expected Deliverables

Channel health and disconnect endpoints in `apps/api/src/integrations`.
