## 8. RDS, Redis, S3

### RDS (prod unless noted)

- Engine PostgreSQL **16**, class `db.t4g.small` (staging `db.t4g.micro`)
- gp3: prod 50 GB, staging 20 GB; storage autoscaling max 100 GB
- Single-AZ, subnet group = both private subnets, **not** publicly accessible. Multi-AZ: **not now** (§18)
- Encryption at rest on. `Performance Insights` off. Enhanced monitoring off
- Backups **7 days**, PITR on, window `01:00–02:00 UTC`, deletion protection **on** (prod)
- DB name `aisales`. App user `aisales` (not `postgres`). `sslmode=require`
- Prisma pool **10** per task. During a rolling deploy expect ≤4 tasks (2 backend + worker + migrate). RDS Proxy / PgBouncer: **not now** (§18)

`CREATE EXTENSION IF NOT EXISTS vector;` in the first migration that needs it. RDS PostgreSQL 16 supports pgvector; do not add a custom `shared_preload_libraries` unless the engine requires it.

### Redis

- `cache.t4g.micro`, Redis **7**, one node, cluster mode **off**
- Encryption at rest + in transit. AUTH token required. `rediss://`
- `maxmemory-policy` **`noeviction`** (BullMQ must not be LRU-evicted)
- Snapshots **off**. Redis is locks + queue, not a system of record. Lost jobs recover from DB persist + Meta retry

### S3

- Bucket `aisales-{env}-assets` in `eu-west-3`
- Block all public access. SSE-S3. Versioning **on**. Deny `aws:SecureTransport=false`
- Prefixes: `products/`, `knowledge/`, `media/`, `csv/`, `imports/`
- Abort incomplete multipart after 7 days
- No bucket CORS (browser uploads go through the API)

---

## 9. Runtime config

Inject from Secrets Manager via task `valueFrom`. Do not bake secrets into images or Terraform plaintext.

**backend + worker**

```
NODE_ENV
PORT=3000
DATABASE_URL
REDIS_URL
BETTER_AUTH_SECRET
BETTER_AUTH_URL
AI_GATEWAY_API_KEY
VERCEL_OIDC_TOKEN
META_APP_ID
META_APP_SECRET
META_GRAPH_VERSION
META_WEBHOOK_SECRET
AWS_REGION=eu-west-3
S3_BUCKET
CORS_ORIGIN=https://app.<apex>
PUBLIC_APP_URL=https://app.<apex>
PUBLIC_API_URL=https://api.<apex>
WEBHOOK_PUBLIC_URL=https://hooks.<apex>/api/v1/webhooks/meta
```

**frontend** (image **rebuilt per env**; `NEXT_PUBLIC_*` is build-time)

```
HOSTNAME=0.0.0.0
PORT=3000
NEXT_PUBLIC_API_URL=https://api.<apex>
NEXT_PUBLIC_WS_URL=https://api.<apex>
```

Compose uses the same **names**; values point at local Postgres, Redis, MinIO.

Secrets Manager:

```
aisales/{env}/db      DATABASE_URL
aisales/{env}/redis   REDIS_URL
aisales/{env}/auth    BETTER_AUTH_SECRET, BETTER_AUTH_URL, RESEND_API_KEY
aisales/{env}/llm     AI_GATEWAY_API_KEY, VERCEL_OIDC_TOKEN
aisales/{env}/meta    META_APP_ID, META_APP_SECRET, META_GRAPH_VERSION, META_WEBHOOK_SECRET
aisales/{env}/app     S3_BUCKET, CORS_ORIGIN, PUBLIC_* , WEBHOOK_PUBLIC_URL
```

---

## 10. IAM

| Role                            | Allowed                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Task `backend` / `worker`       | `s3:GetObject` `s3:PutObject` on `aisales-{env}-assets/*`; `secretsmanager:GetSecretValue` on `aisales/{env}/*`; logs on its group          |
| Task `frontend`                 | logs only                                                                                                                                   |
| Execution role                  | ECR pull, logs, `GetSecretValue` for secrets listed on the task                                                                             |
| `github-actions-aisales` (OIDC) | ECR push; ECS update-service / run-task / wait; `iam:PassRole` on the three task roles + execution role; Terraform state S3 + DynamoDB lock |

OIDC trust: this repo, `ref:refs/heads/main` and `ref:refs/tags/v*`. No `AWS_ACCESS_KEY_ID` in GitHub.

Frontend cannot reach S3, RDS, or Meta. Uploads go through the API.

Root MFA on. No shared root keys after bootstrap.

---

## 11. Images

| Image         | Context    | Notes                                                                                    |
| ------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `aisales-api` | `apps/api` | Multi-stage, Node 24, non-root. **Prisma CLI remains in the image** for the migrate task |
| `aisales-web` | `apps/web` | `output: 'standalone'`. Build-args for `NEXT_PUBLIC_*`                                   |

ECR in `eu-west-3`, one repo per image. Tags: immutable git SHA; `{env}-{sha}`. Scan on push; **critical = block prod**. Never mix API SHAs across backend/worker/migrate.

---

## 12. CI/CD

```
PR        → lint, typecheck, unit, golden set, image scan. No deploy
main      → build/push → terraform apply staging (if infra/) → migrate → ECS staging
tag v*    → same on production after Environment approval
```

**Order is mandatory:**

1. Build `aisales-api` and `aisales-web` (web with that env’s `NEXT_PUBLIC_*`)
2. `terraform apply` if `infra/` changed
3. `ecs run-task` migrate with the **new** API digest; wait `STOPPED` and exit 0
4. Update `backend`, `worker`, `frontend` to that digest
5. `ecs wait services-stable`
6. Smoke: `GET https://api.<apex>/ready`, `GET https://app.<apex>/health`

If smoke fails: roll ECS `frontend` / `backend` / `worker` to the **previous task definition**; do **not** reverse the DB migration (keep it forward-compatible); SNS-alert engineering. Distinct from migrate failure: if migrate fails, **do not** roll services — fix forward. Never `migrate` in `main.ts`.

Migrations are **forward-only**. Zero-downtime shape:

1. Expand schema (add columns/tables, keep old ones)
2. Deploy code that writes both / reads new
3. Backfill
4. Remove old columns in a later release

No drop/rename in the same release as the code that still needs the old shape. App rollback after a **successful** migrate is safe because the schema is a superset. Schema-incompatible release = roll **forward** with a new SHA.

SQS in front of Meta webhooks is **not** MVP. Inbound durability is already “persist then `200`” (NFR-REL-02). Revisit SQS only if the API cannot persist under burst; do not replace BullMQ.

Terraform state: dedicated S3 bucket + DynamoDB lock, versioning on, key `aisales/{env}/terraform.tfstate`. Not the assets bucket.

```
infra/
  backend.tf
  main.tf
  variables.tf
  environments/staging.tfvars
  environments/production.tfvars
```

---

## 13. Health, logs, alarms

| Path          | Meaning                          | Used by                             |
| ------------- | -------------------------------- | ----------------------------------- |
| `GET /health` | Process up                       | ALB → frontend; optional on backend |
| `GET /ready`  | Postgres **and** Redis reachable | ALB → backend                       |

Worker: no HTTP. Heartbeat later if jobs stall while the container stays up.

Logs: `awslogs` → `/ecs/aisales-{env}/{service}`. Pino JSON. Retention 7d staging, **14d** prod. Correlation id webhook → job → send. No tokens, no PII, no raw webhook bodies in logs (raw payload lives in `integration_events`).

Alarms (SNS email). Page on:

| Metric                                                                                       | Trip                                                            |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| ALB `HTTPCode_Target_5XX`                                                                    | ≥1 for 2 min                                                    |
| Unhealthy host count                                                                         | >0 for 2 min                                                    |
| Any ECS task STOPPED unexpectedly (`frontend` / `backend` / `worker`; reason ≠ deploy/scale) | **immediate** SNS                                               |
| RDS CPU                                                                                      | >80% 5 min; `FreeStorageSpace` < 4 GB; connections > 70% of cap |
| Redis `Evictions`                                                                            | >0                                                              |
| ECS CPU or memory backend/worker                                                             | >85% 5 min                                                      |
| Meta 4xx/5xx, webhook signature failures                                                     | >0 sustained 5 min                                              |
| BullMQ waiting depth / oldest job age                                                        | above the scale thresholds in §7                                |
| LLM p95 latency, error rate, fallback-model count, tool-call failures                        | from `ai_usage` / `ai_actions` (NFR-OPS-02)                     |
| Token cost / day vs budget                                                                   | Owner alert, not pager                                          |

Container Insights: **prod cluster only**. No X-Ray and no second APM **in MVP**. Revisit Sentry or OpenTelemetry only per `11_TECH_STACK.md` OQ-53.

AWS Budget with 50 / 80 / 100% alerts (amount founder-set; required before prod traffic). Credits do not cover RDS/ALB/Redis.

---

## 14. Per-business cost tracking

Per `business_id`, for billing and margin. Reuse existing meters; do not invent a second usage system. Owner-only (FR-OBS-005). Not a fifth dashboard KPI.

| Track                 | Source                                                           |
| --------------------- | ---------------------------------------------------------------- |
| AI tokens / cost      | `ai_usage`                                                       |
| LLM calls             | `ai_usage` / `ai_actions`                                        |
| Meta message usage    | `usage_events` (WhatsApp conversation starts when Phase 2 lands) |
| Storage usage         | S3 prefix size per business (meter, not a new store)             |
| Conversations handled | analytics rollups / `usage_events`                               |

---

## 15. Backups and restore

| Store           | Policy                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| RDS             | Daily + PITR, 7 days, deletion protection. Meets NFR-REL-05 (≤5 min). Restore drill targets NFR-REL-06 (≤4 h) |
| S3              | Versioning; abort incomplete multipart 7d                                                                     |
| Redis           | None                                                                                                          |
| Terraform state | Versioning                                                                                                    |

**Drill:** restore an RDS snapshot to a throwaway instance, boot staging against it, confirm S3 signed GET works. Once before the first paying tenant, then **monthly**. An untested backup is not a backup.

---

## 16. Local

Compose: `api`, `worker`, `web`, `postgres` (pgvector), `redis`, `minio`. Seeded demo tenant. Same process split and env **names** as Fargate. Do not point local apps at staging RDS.

---

## 17. Forbidden

Vercel/Amplify (frontend or API). Separate Socket.IO ECS service. Kubernetes. EC2 app hosts. NAT Gateway (MVP). Second AWS account. RDS Proxy (MVP). Redis cluster mode / `allkeys-lru`. Sticky ALB. `migrate` on boot. AWS keys in GitHub. Public S3 or RDS. AWS WAF. CloudFront. One deployable per Nest module. Desired count 2 “for HA” before load. SQS as the job bus.

---

## 18. Before enterprise scale — not now

Keep MVP pins: public task IPs, no NAT, single-AZ RDS, no connection proxy. Do not add these until enterprise scale (or a security review that requires them). They are **not** launch work.

- ECS tasks in **private** subnets
- NAT Gateway
- Multi-AZ RDS
- RDS Proxy / PgBouncer

---

## 19. Open

| #     | Question    | Answer until then                               |
| ----- | ----------- | ----------------------------------------------- |
| OQ-49 | Apex domain | Split hosts as in §2. Blocked on first ACM cert |
| OQ-53 | Second APM  | **Not in MVP.** Canonical: `11_TECH_STACK.md`.  |
