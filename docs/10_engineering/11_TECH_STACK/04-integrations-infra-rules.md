## 10. Meta / Graph API client

| Item             | Pin                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------- |
| Transport        | `fetch` / `undici` — no Twilio, 360dialog, MessageBird                                |
| Graph version    | Env `META_GRAPH_VERSION`. Canonical pin **`v23.0`** (`16`). **Do not** float `latest` |
| Verify           | App secret HMAC on webhooks (NFR-SEC-07)                                              |
| WhatsApp adapter | Folder stub only; `whatsapp_enabled=false`                                            |

Details: `16_INTEGRATION_DESIGN.md`.

---

## 11. Cross-cutting libraries

| Concern           | Choice                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared validation | Zod in `packages/shared`; Nest via `nestjs-zod`. **No parallel `class-validator` DTOs**                                                                                         |
| Passwords         | `argon2`                                                                                                                                                                        |
| CSV               | `csv-parse` streaming                                                                                                                                                           |
| Time / TZ         | `luxon` — KPI periods in business timezone                                                                                                                                      |
| Metrics           | `prom-client` + Terminus. CloudWatch in prod. No second APM in MVP (OQ-53).                                                                                                     |
| OpenAPI           | `@nestjs/swagger` generated from controllers. Zod remains source of truth. Swagger UI: local + staging only.                                                                    |
| API tests         | Jest (Nest default)                                                                                                                                                             |
| UI tests          | Playwright — inbox takeover, confirm order                                                                                                                                      |
| Golden set        | Jest runner; blocks merge on dialect or grounding regression (NFR-MNT-04)                                                                                                       |
| Lint / format     | ESLint **9** + Prettier + `eslint-config-prettier` + `prettier-plugin-tailwindcss`. Web: `eslint-config-next`. API: `@typescript-eslint` type-aware. **Not Biome, not Oxlint.** |
| AWS               | `@aws-sdk/client-s3`, `@aws-sdk/client-secrets-manager` (or SSM) — modular v3 only                                                                                              |

**Rejected:** Moment.js, default-import lodash, `console.log` as logging, `bcrypt` (we use argon2), Biome (do not add “for speed” or “for AI agents”).

### 11.1 Why ESLint + Prettier, not Biome

One formatter+linter is attractive. It is the wrong default **here**:

1. Next.js first-class lint is `eslint-config-next` (`@next/next`). Biome does not replace that plugin.
2. Type-aware `@typescript-eslint` is required for `business_id`, Prisma `Decimal`, and unawaited BullMQ/async work. Biome 2 covers on the order of 75–85% of those rules (`noFloatingPromises` is the headline gap).
3. Tailwind class order is `prettier-plugin-tailwindcss`.
4. Inbox a11y is `eslint-plugin-jsx-a11y` (NFR-UX). Biome a11y is partial.
5. CI time is dominated by the golden set and Playwright, not ESLint.
6. Running Biome _and_ ESLint “only for missing rules” recreates the config drift Biome is sold to avoid.

Canonical: **Prettier formats, ESLint lints, `tsc --noEmit` typechecks.** Agents follow this pin; they do not pick Biome because a blog ranked it 9.5/10.

---

## 12. Cloud, local, CI

Canonical hosting, VPC, sizing, DNS, and the GitHub → ECR → ECS pipeline: **`18_DEPLOYMENT.md`**. This table is the stack-level pin only.

| Concern       | Choice                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Containers    | Multi-stage Docker, Node 24, non-root user                                                                  |
| API / worker  | Same NestJS image; `CMD` differs (`node dist/main` vs `node dist/worker`)                                   |
| Frontend      | Separate Next.js image; own Fargate service                                                                 |
| Local Compose | `api`, `worker`, `web`, `postgres` (pgvector), `redis`, `minio` (NFR-OPS-06)                                |
| Production    | ECS Fargate ×3, RDS, ElastiCache, S3, Secrets Manager, CloudWatch, ALB, Cloudflare — see `18_DEPLOYMENT.md` |
| CI            | GitHub Actions: lint, typecheck, unit, golden set, image scan (NFR-SEC-08); OIDC to AWS                     |

**Rejected:** Vercel as the **API** host (BullMQ + WebSocket). Lambda for the monolith. Kubernetes. A VPS as the production path. NAT Gateway in MVP. Extra AWS accounts.

Required Compose / prod env **names** (full runtime list and injection: `18_DEPLOYMENT.md` §9):

```
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
AWS_REGION
S3_BUCKET
```

---

## 13. Explicitly not in the stack

Catalog-level rejections (every BFS TypeScript option) live in **§2.1**. This table is the product-level “do not substitute”:

| Not this                                                | Use instead                                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Microservices / Nest microservice transport             | Modular monolith + BullMQ                                                        |
| GraphQL                                                 | REST `/api/v1`                                                                   |
| OpenAPI-first (spec generates the server)               | Zod → Nest controllers; `@nestjs/swagger` is a generated view                    |
| MongoDB / DynamoDB as source of truth                   | PostgreSQL                                                                       |
| Pinecone / Qdrant / Weaviate                            | `pgvector`                                                                       |
| Kafka / SQS as primary job bus                          | BullMQ                                                                           |
| Supabase                                                | Nest + RDS + Socket.IO                                                           |
| PostHog / GA4 / Plausible                               | Our DB: four KPIs, `ai_usage`, `usage_events`, domain events                     |
| Sentry / OTel SaaS **in MVP**                           | CloudWatch + `prom-client`; revisit one via OQ-53                                |
| Clerk / NextAuth / Auth0 / Supabase Auth                | Better Auth with Organization plugin (tenancy) + NestJS AuthZ                    |
| BFS `passport` preset                                   | Better Auth session integration; Nest guards for domain isolation                |
| Postmark / SendGrid as auth email sender                | Resend (centralized via `EmailService`)                                          |
| LangChain / LlamaIndex / vendor agent loops             | `AiGatewayService` + Vercel AI SDK + Vercel AI Gateway (tools call our services) |
| Direct provider API key sprawl                          | Centralized `AI_GATEWAY_API_KEY` via Vercel AI Gateway                           |
| `gpt-4o-mini` / `gpt-5.6-luna` as customer-facing Derja | `gemini-3.5-flash` (they normalize Arabizi toward MSA)                           |
| ESPRIT-Derja / Labess / Jais as the sales agent         | Ungrounded; dialect-only toys                                                    |
| Unofficial WhatsApp                                     | Stub until Phase 2 Cloud API                                                     |
| Prisma 8 RC, Nest 12 alpha                              | Current stable majors                                                            |
| Python AI worker                                        | TypeScript worker                                                                |
| Express adapter                                         | Fastify adapter (`@nestjs/platform-fastify`) — see `40` ADR-025                  |
| Biome / Oxlint as canonical lint                        | ESLint 9 + Prettier (§11.1)                                                      |
| `gpt-5.6` alias                                         | `gpt-5.6-terra` / `gpt-5.6-luna` explicitly — alias is Sol                       |

---

## 14. How coding agents must use this

1. Treat §2.1 as the closed catalog: do not add a Better Fullstack option that is not **Pin**.
2. Install only packages named here, or a documented exception.
3. Call **only** the model ids in §9.3. Do not “upgrade” to Sol/Pro/Opus on the DM path.
4. Put persistence behind the owning module’s repository.
5. Put Zod schemas in `packages/shared` before duplicating types in the UI. `@nestjs/swagger` documents controllers; it does not replace Zod.
6. Meta through Integrations; LLMs through the AI module provider port.
7. Vector KNN and `available_stock` SQL stay in the owning repository, always filtered by `business_id`.
8. Changing `model_primary` requires a golden-set run that includes Arabizi script-match, not just JSON intent accuracy.
9. Do not add PostHog/Sentry/OTel because this catalog row is `none`. Telemetry is our tables + CloudWatch until OQ-53.
10. After scaffold, replace Noto with IBM Plex and override `--primary` per `20_DESIGN_SYSTEM.md`. Do not ship Inter, catalog `lime`, or `nova`/`mira` density.

---

## 15. Open questions

| #     | Question                                                                  | Working answer                                                                                                                                                                                                                 | Owner       | Revisit                                                                                  |
| ----- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------- |
| OQ-40 | ORM                                                                       | **Prisma 7.x** — decided. Bootstrap must prove migrations, generated client, Nest DI, and pgvector KNN (`$queryRaw`) before CI treats the pin as proven. Revisit only if that gate fails or vector latency misses NFR-PERF-06. | Engineering | Repo bootstrap; NFR-PERF-06                                                              |
| OQ-43 | UUID v7 vs v4                                                             | **v4** via Prisma default. Canonical in `12_DATABASE_DESIGN.md`.                                                                                                                                                               | Engineering | Decided                                                                                  |
| OQ-44 | Next.js host                                                              | Own ECS Fargate service (`frontend`) behind the ALB, from day one. CORS allowlist if the API origin differs. Compose locally.                                                                                                  | Engineering | First production traffic                                                                 |
| OQ-45 | Zod 4 vs 3                                                                | **4** if peers allow.                                                                                                                                                                                                          | Engineering | Repo bootstrap                                                                           |
| OQ-46 | Customer-facing model                                                     | **`gemini-3.5-flash`** — decided in §9.                                                                                                                                                                                        | AI          | Golden set; if Arabizi script-match < 90%, try `gpt-5.6-terra` as primary and re-measure |
| OQ-47 | Derja 8B as a rewrite pass?                                               | **No in MVP.** Revisit only if §9.7 prompts fail the golden set.                                                                                                                                                               | AI          | Post-launch dialect metrics                                                              |
| OQ-48 | Newer Gemini Flash (`gemini-3.6-flash` etc.) vs pinned `gemini-3.5-flash` | **`gemini-3.5-flash` verified 2026-08-13** (§9.0). Do not follow Google getting-started if it shows a newer Flash. Revisit only after a golden-set Arabizi script-match vs 3.5 (and vs 2.5 if 3.5 regresses).                  | AI          | Golden set; any new Flash id                                                             |
| OQ-53 | Second APM (Sentry or OpenTelemetry)?                                     | **Not in MVP.** CloudWatch + `prom-client` + Terminus. Revisit one of Sentry **or** OTel when Logs Insights is too slow for error grouping — not both, not at bootstrap.                                                       | Engineering | After first production error-triage pain                                                 |

---

## 16. References

- Better Fullstack TypeScript Options v2.5.1 — catalog identifiers in §2.1
- OpenAI Models — `gpt-5.6-terra` / `gpt-5.6-luna` / `gpt-5.6-sol`; alias `gpt-5.6` → Sol
- Gemini API — `gemini-3.5-flash` model code (stable)
- Anthropic — `claude-sonnet-5`
- TounsiBench (EMNLP 2025) — GPT-4o best Tunisian **generation** / dialectal adherence among the ten models tested
- Mahdi, _How Well Do LLMs Understand Tunisian Arabic?_ (arXiv:2511.16683, Nov 2025) — **Gemini 2.5 Flash** best **Tunizi/Arabizi** transliteration and translation
- `docs/AI_Sales_Agent_Brain_Dump.md` → `# AI Architecture`, `# Backend`, `# Infrastructure`
- `docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md` §4 language, §5 pipeline, §19 timeouts
- `docs/10_engineering/10_ARCHITECTURE.md`
- `docs/10_engineering/18_DEPLOYMENT.md`
