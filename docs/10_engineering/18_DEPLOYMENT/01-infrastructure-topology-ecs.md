# 18 — Deployment

| Field       | Value                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------- |
| Document ID | `18_DEPLOYMENT`                                                                                     |
| Status      | Approved — canonical for hosting, release, and ops                                                  |
| Owner       | Engineering                                                                                         |
| Depends on  | `10_ARCHITECTURE.md`, `11_TECH_STACK.md`, `01_PRODUCT_REQUIREMENTS.md` (NFR-OPS / SCAL / REL / SEC) |
| Upstream    | `docs/AI_Sales_Agent_Brain_Dump.md` → `# Infrastructure`                                            |

Module cuts stay in `10_ARCHITECTURE.md`. Package and model IDs stay in `11_TECH_STACK.md`. Auth/RBAC stay in `17_SECURITY_DESIGN.md`.

---

## 1. Locked

|                                  | Choice                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Region                           | `eu-west-3` (Paris). `eu-central-1` only if a SKU is missing                                                                                           |
| Account                          | One AWS account. Prefixes `staging-` / `prod-`                                                                                                         |
| IaC                              | Terraform in `infra/`. One root module. tfvars per env. **Not** Terragrunt, CDK, or Copilot                                                            |
| Compute                          | ECS **Fargate** ×3: `frontend`, `backend`, `worker`. `linux/amd64`, on-demand. Keep all three from day one (AWS credits). Do not park the UI on Vercel |
| Images                           | `aisales-web` (Next standalone). `aisales-api` (Nest) used by **both** backend and worker                                                              |
| Ingress                          | Cloudflare → one ALB per env. Not NLB, not API Gateway, not Vercel                                                                                     |
| Data                             | RDS PostgreSQL **16** + `vector`. ElastiCache Redis **7**, cluster mode **off**, eviction **`noeviction`**. S3                                         |
| Secrets                          | Secrets Manager. GitHub **OIDC** (no access keys in GitHub)                                                                                            |
| NAT / K8s / EC2 / extra accounts | Out                                                                                                                                                    |
| Realtime                         | Socket.IO **on the backend task**. No fourth ECS service                                                                                               |
| Frontend host                    | ECS `frontend`. Not Vercel                                                                                                                             |

---

## 2. Names, ports, URLs

Apex domain is OQ-49. Hostnames are fixed:

| DNS            | Cloudflare   | ALB target       | Traffic                                         |
| -------------- | ------------ | ---------------- | ----------------------------------------------- |
| `app.<apex>`   | Proxied      | `frontend` :3000 | Merchant UI                                     |
| `api.<apex>`   | Proxied      | `backend` :3000  | REST `/api/v1` + Socket.IO `/socket.io`         |
| `hooks.<apex>` | **DNS-only** | `backend` :3000  | `POST /api/v1/webhooks/meta` and `/deauthorize` |

Meta webhook callback URL: `https://hooks.<apex>/api/v1/webhooks/meta`. Deauthorize Callback URL: `https://hooks.<apex>/api/v1/webhooks/meta/deauthorize` (`16`).

| Process  | Container port | Public  |
| -------- | -------------- | ------- |
| frontend | 3000           | via ALB |
| backend  | 3000           | via ALB |
| worker   | none           | none    |

AWS names: `aisales-{env}-*` where `{env}` is `staging` or `prod`. ECS cluster `aisales-{env}`. Services `frontend`, `backend`, `worker`.

---

## 3. Environments

|         | local                    | staging                                           | production                                                     |
| ------- | ------------------------ | ------------------------------------------------- | -------------------------------------------------------------- |
| Run     | Compose                  | Fargate ×3, desired **1**                         | Fargate ×3, desired **1**                                      |
| Data    | Postgres + Redis + MinIO | RDS `db.t4g.micro` 20 GB, Redis `cache.t4g.micro` | RDS `db.t4g.small` 50 GB, Redis `cache.t4g.micro`              |
| Secrets | `.env` gitignored        | `aisales/staging/*`                               | `aisales/prod/*`                                               |
| Ship    | `docker compose up`      | every push to `main`                              | GitHub Environment **production**, required reviewer, tag `v*` |
| Meta    | test app / tunnel        | test app → `hooks-staging.`                       | live app → `hooks.`                                            |
| Destroy | yes                      | yes                                               | no, without a restore drill                                    |

Staging is a smaller production (own ALB, RDS, Redis, cluster), not a second target group on prod.

---

## 4. Topology

```
Cloudflare
  app.* + api.*  orange
  hooks.*        grey (Meta)
        |
       ALB   ACM, idle 4000s, HTTP→HTTPS
        |
   ┌────┴────┐
frontend   backend (HTTP + Socket.IO)
   :3000      :3000
               |
        ┌──────┼──────┐
       RDS   Redis   worker (no listener)
```

Browser: `app` + `api`. Meta: `hooks` only. Worker talks to RDS, Redis, S3, Meta, LLMs.

Instagram + Messenger are **connectable** in MVP. WhatsApp Cloud API is **Phase 2**. MVP **must** ship the WhatsApp adapter **interface** and stub (`whatsapp_enabled=false`). Adding WhatsApp later is adapter implementation + Meta wiring, not an architecture change.

---

## 5. VPC

VPC `10.0.0.0/16`, two AZs (ALB needs two). Internet Gateway. **No NAT.**

| Subnet      | CIDR                           | Holds              | Route             |
| ----------- | ------------------------------ | ------------------ | ----------------- |
| public a/b  | `10.0.0.0/20`, `10.0.16.0/20`  | ALB, all ECS tasks | `0.0.0.0/0` → IGW |
| private a/b | `10.0.32.0/20`, `10.0.48.0/20` | RDS, Redis         | local only        |

ECS: `awsvpc`, `assignPublicIp = ENABLED`. RDS/Redis: no public IP. Inbound to tasks is still **only** from the ALB SG — a public IP is egress without NAT, not an open 3000/tcp to the internet. Private tasks + NAT are **not now** (§18).

| SG             | Inbound                                   | Outbound                         |
| -------------- | ----------------------------------------- | -------------------------------- |
| `alb`          | 80/443 from `0.0.0.0/0`                   | to `ecs-frontend`, `ecs-backend` |
| `ecs-frontend` | 3000 from `alb`                           | 443 (not required at runtime)    |
| `ecs-backend`  | 3000 from `alb`                           | 443, 5432→rds, 6379→redis        |
| `ecs-worker`   | none                                      | same as backend                  |
| `rds`          | 5432 from backend + worker + migrate task | —                                |
| `redis`        | 6379 from backend + worker                | —                                |

Do not allowlist Meta IPs. Verify webhook signatures (NFR-SEC-07). Dedupe on `integration_events` unique provider event id (FR-INT-009) — deploy does not invent a second replay store.

Endpoints: **S3 gateway only** (free). No interface endpoints.

---

## 6. ALB, TLS, Cloudflare

**ACM:** one cert, SAN `app.<apex>`, `api.<apex>`, `hooks.<apex>`. DNS validation.

**ALB** (one per env):

- Idle timeout **4000** (default 60 drops Socket.IO)
- Stickiness **off** (Redis adapter is the fan-out)
- Deregistration delay **30s**
- Listener 443 → host rules: `app.` → TG frontend; `api.` and `hooks.` → TG backend
- Listener 80 → 443
- TG protocol HTTP, matcher `200`, interval 30s, timeout 5s, healthy 2, unhealthy 3
- Frontend health: `GET /health`
- Backend health: `GET /ready`

**Cloudflare:**

- SSL **Full (strict)**; Always HTTPS; min TLS 1.2
- WebSockets **on** (`api.*`)
- Bot Fight / challenge: never on `hooks.*` (grey). Skip challenge on `api.*` `/socket.io` and `/api/v1`
- No AWS WAF. No CloudFront. Images: S3 signed GET

**CORS:** `https://app.<apex>` only. Cookies: `Secure; SameSite=Lax`.

---

## 7. ECS tasks

Launch type `FARGATE`, platform `LATEST`, CPU architecture `X86_64`. Capacity provider `FARGATE` only. Circuit breaker **on** with rollback. Deployment: min healthy 100%, max 200%. `enableExecuteCommand`: staging yes, prod **no**.

| Service            | CPU / mem                            | Count       | Stop timeout | Command                                                            |
| ------------------ | ------------------------------------ | ----------- | ------------ | ------------------------------------------------------------------ |
| frontend           | 256 / 512                            | 1           | 30s          | Next standalone (`node server.js`), `HOSTNAME=0.0.0.0` `PORT=3000` |
| backend            | staging 256/512; prod **512 / 1024** | 1           | 30s          | `node dist/main`                                                   |
| worker             | staging 256/512; prod **512 / 1024** | 1           | **120s**     | `node dist/worker`                                                 |
| migrate (run-task) | 256 / 512                            | 1 then stop | 60s          | `prisma migrate deploy`                                            |

Same `aisales-api` **digest** on backend, worker, and migrate for a given release.

Auto-scaling: **off** (desired count 1).

When load is real, scale **queue-first** on the worker and **not CPU-only** on the backend:

| Service  | Scale on                                                                                                                                      | Bounds       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| worker   | BullMQ waiting depth **or** oldest job age                                                                                                    | min 1, max 3 |
| backend  | Active Socket.IO connections, WebSocket memory, inbound/outbound latency (`/ready` or ALB). CPU 70% is a **fallback**, not the primary signal | min 1, max 3 |
| frontend | leave at 1 until the UI is the constraint                                                                                                     | 1            |

AI turns sit in Redis. CPU on a single worker can look idle while the queue grows. Socket.IO can saturate memory while CPU looks fine.

On `SIGTERM`: backend stop accepting HTTP/WS; worker pause BullMQ and finish the in-flight job within 120s.

---
