---
id: T-OPS-02
parent: T-OPS-02
wave: W10
status: pending
optional: false
depends:
  - T-OPS-01
  - T-BOOT-05
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md
files:
  - .github/workflows/deploy-production.yml
  - .github/workflows/deploy-staging.yml
done_cmd: "pnpm check:full"
next: T-OPS-03
---

# Task: CI/CD deployment workflow & zero-downtime rolling update pipeline

## 1. Objective & Value

Implement automated GitHub Actions CI/CD deployment pipeline with Docker multi-stage builds, ECR push, standalone Prisma migration task, and ECS rolling updates.

**Why this exists**: Enable reliable, automated zero-downtime production deployments on merge to main.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `.github/workflows/deploy*`

### Do Not Modify (Forbidden boundaries)

- `apps/`

---

## 3. Technical Contract & Interfaces

- Pipeline: Lint & Test -> Build Docker Images -> Push to ECR -> Run `prisma migrate deploy` as one-off ECS task -> Trigger ECS rolling service update.

---

## 4. Invariants & Security Guardrails

- 🔒 **Migration Safety**: Run migrations as standalone task before rolling new container images.

---

## 5. Implementation Steps

1. Author GitHub Actions deployment workflow.
2. Configure AWS OIDC authentication.
3. Add health check verification step post-rollout.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Workflow Syntax**: GitHub Actions YAML parses and validates correctly.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm check:full

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🔑 Secrets**: Configure GitHub repository secrets (`AWS_ROLE_ARN`, `ECR_REGISTRY`).

---

## 9. Expected Deliverables

GitHub Actions deployment workflows in `.github/workflows`.
