---
id: T-OPS-01
parent: T-OPS-01
wave: W10
status: pending
optional: false
depends:
  - T-BOOT-04
fs:
  - FS-OPS-01
read:
  - docs/10_engineering/18_DEPLOYMENT/01-infrastructure-topology-ecs.md
  - docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md
files:
  - infra/terraform/main.tf
  - infra/terraform/variables.tf
  - infra/terraform/ecs.tf
  - infra/terraform/rds.tf
  - infra/terraform/redis.tf
  - infra/terraform/s3.tf
  - infra/terraform/alb.tf
done_cmd: terraform -chdir=infra/terraform validate
next: T-OPS-02
---

# Task: Production Terraform infrastructure (ECS Fargate ×3, RDS Postgres 16, Redis, S3, ALB)

## 1. Objective & Value

Author complete production Terraform infrastructure definition provisioning 3 ECS Fargate services (API, Worker, Web), RDS Postgres 16 with pgvector, ElastiCache Redis, S3 bucket, and Application Load Balancer without NAT Gateway costs.

**Why this exists**: Provide automated, reproducible, cost-optimized AWS production infrastructure per `18_DEPLOYMENT_INFRASTRUCTURE.md`.

**Parallel Lane Note**: This task depends solely on `T-BOOT-04` and can be executed and validated in parallel with application/web waves via `python3 backlog/_runner.py lanes`.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `infra/terraform/`

### Do Not Modify (Forbidden boundaries)

- `apps/`

---

## 3. Technical Contract & Interfaces

- ECS Services: `api` (port 3001), `worker` (background BullMQ), `web` (Next.js port 3000).
- RDS: PostgreSQL 16.x with `pgvector` extension enabled.
- Redis: ElastiCache 7.x cluster mode disabled.
- Cost Optimization: Dual public subnets for Fargate with public IP assignment (avoids $32/mo NAT Gateway).

---

## 4. Invariants & Security Guardrails

- 🔒 **Security Groups**: RDS and Redis only accept ingress from ECS security group.
- 🛡️ **Secrets**: Sensitive environment variables sourced from AWS Secrets Manager.

---

## 5. Implementation Steps

1. Author Terraform VPC and subnet definitions.
2. Author RDS Postgres, ElastiCache Redis, and S3 modules.
3. Author ECS cluster, task definitions, and ALB routing rules.
4. Validate configuration with `terraform validate`.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Terraform Validation**: `terraform validate` exits code 0 with valid syntax.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
terraform -chdir=infra/terraform validate

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🔑 AWS Credentials**: Run `aws configure` with deployment credentials.
- **🌐 Setup**: Run `terraform -chdir=infra/terraform init` and validate.
- **👁️ Review & Sign-off**: Verify no NAT Gateway is created (maintains cost constraint).

---

## 9. Expected Deliverables

Validated Terraform infrastructure configuration in `infra/terraform`.
