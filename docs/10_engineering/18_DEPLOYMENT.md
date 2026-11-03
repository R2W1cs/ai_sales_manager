# 18 — Deployment

Infrastructure topology, AWS ECS Fargate, RDS PostgreSQL, Redis, Cloudflare, CI/CD pipelines, and runtime configuration.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-infrastructure-topology-ecs.md`](18_DEPLOYMENT/01-infrastructure-topology-ecs.md): **Naming conventions, ports, VPC architecture, ALB, TLS & ECS task definitions**
  - _Guidance:_ Read if configuring Docker containers, ECS service definitions, VPC subnets, or ALB routing rules.
- [`02-storage-env-ci-ops.md`](18_DEPLOYMENT/02-storage-env-ci-ops.md): **RDS/Redis/S3 infra, runtime env vars, GitHub Actions CI/CD, health checks & backups**
  - _Guidance:_ Read if configuring database instances, S3 buckets, environment variables, CI/CD pipelines, or health checks.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `18_DEPLOYMENT/` required for your domain (see bullets above) rather than loading all documentation.
