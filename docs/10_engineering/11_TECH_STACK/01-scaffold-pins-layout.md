# 11 — Tech Stack

| Field           | Value                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document ID     | `11_TECH_STACK`                                                                                                                                                                                       |
| Status          | Approved — canonical for languages, libraries, **exact model IDs**, versions, and rejections                                                                                                          |
| Owner           | Engineering                                                                                                                                                                                           |
| Audience        | Backend, frontend, DevOps, AI coding agents                                                                                                                                                           |
| Depends on      | `10_ARCHITECTURE.md`                                                                                                                                                                                  |
| Consumed by     | `12_DATABASE_DESIGN.md`, `13_API_DESIGN.md`, `14_SYSTEM_DESIGN.md`, `15_AI_ARCHITECTURE.md`, `18_DEPLOYMENT.md`, `20_DESIGN_SYSTEM.md`, `30_TASKS.md`, `31_IMPLEMENTATION_PLAN.md`, `40_DECISIONS.md` |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# Backend`, `# Database`, `# Frontend`, `# Infrastructure`, `# AI Architecture`, `# Final Decisions`                                                           |
| Versions as of  | 2026-08-13                                                                                                                                                                                            |

---

## 1. Purpose and scope

This document is **canonical for what we install, which model IDs we call, and why**. Every Better Fullstack TypeScript option (catalog v2.5.1) is pinned or rejected in §2.1. Module boundaries stay in `10_ARCHITECTURE.md`. Table shapes stay in `12_DATABASE_DESIGN.md`. Endpoint contracts stay in `13_API_DESIGN.md`. Orchestrator internals stay in `15_AI_ARCHITECTURE.md`. Meta adapters, HMAC, and Graph stay in `16_INTEGRATION_DESIGN.md`. Hosting, VPC, CI/CD, and instance sizes stay in `18_DEPLOYMENT.md`. Operator UI tokens (colour, type, radius, density) stay in `20_DESIGN_SYSTEM.md`.

If a library or **model id** is not listed here, adding it is a stack change: record it in `40_DECISIONS.md`, re-run the golden set, and update this file. Do not silently introduce a second ORM, a second queue, an unofficial WhatsApp client, or a “better” LLM from a blog post.

**Version policy**

| Rule                                                              | Practice                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| This document pins **major** (and current minor where it matters) | `NestJS 11.x`, not a daily patch                                        |
| **Model ids are pinned exactly**                                  | `gemini-3.5-flash`, not “Gemini Flash”                                  |
| Lockfile pins exact package versions                              | `pnpm-lock.yaml` is the install source of truth                         |
| Patches (libraries)                                               | Allowed via lockfile refresh in a dedicated PR                          |
| Minors (libraries)                                                | Allowed after CI green; one dependency family per PR                    |
| Majors (libraries) or **any model-id change**                     | Decision record + this file + golden set must pass                      |
| Pre-release lines                                                 | Forbidden in production (Nest 12 alpha, Prisma 8 RC as of this writing) |

---

## 2. Stack at a glance

| Layer                      | Choice                         | Pin                                                              |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------- |
| Runtime                    | Node.js Active LTS             | **24** (`engines.node`: `>=24 <25`)                              |
| Language                   | TypeScript, `strict`           | **5.8+** matching Nest 11 / Next 16 peers                        |
| Package manager            | pnpm workspaces                | **10.x**                                                         |
| API                        | NestJS + Fastify adapter       | **11.x** (not 12 until stable)                                   |
| HTTP API                   | REST                           | `/api/v1`                                                        |
| Operator UI                | Next.js App Router + React     | **Next 16.x** (16.3 current), **React 19**                       |
| Database                   | PostgreSQL + `pgvector`        | **Postgres 16** on RDS                                           |
| ORM                        | Prisma                         | **7.x** (not 8 RC); bootstrap gate in §6.2                       |
| Cache / locks / pubsub     | Redis + ioredis                | Redis **7.x** (ElastiCache in prod)                              |
| Jobs                       | BullMQ                         | **5.x**                                                          |
| Realtime                   | Socket.IO + Redis adapter      | Socket.IO **4.x**                                                |
| Objects                    | AWS S3                         | AWS SDK **v3** modular clients                                   |
| Compute                    | Docker → **ECS Fargate**       | Node 24 images; three services (`frontend`, `backend`, `worker`) |
| **Sales reply (primary)**  | Google Gemini                  | **`gemini-3.5-flash`** — §9                                      |
| **Sales reply fallback 1** | OpenAI GPT-5.6 Terra           | **`gpt-5.6-terra`**                                              |
| **Sales reply fallback 2** | Anthropic Claude Sonnet 5      | **`claude-sonnet-5`**                                            |
| **Classifier / summary**   | OpenAI GPT-5.6 Luna            | **`gpt-5.6-luna`**                                               |
| **Embeddings**             | OpenAI                         | **`text-embedding-3-small`** (1536-d)                            |
| Validation                 | Zod                            | **4.x** (3.x only if peers force it)                             |
| Logs                       | Pino JSON                      | —                                                                |
| Operator UI kit            | shadcn/ui + Base UI + Tailwind | Tokens: `20_DESIGN_SYSTEM.md`                                    |
| Lint / format              | ESLint 9 + Prettier            | Not Biome                                                        |

---

## 2.1 Better Fullstack TypeScript pins (catalog v2.5.1)

Identifiers below are Better Fullstack CLI / MCP / Stack Builder values. **Valid values ≠ valid combinations.** Our combination is Next.js UI + NestJS API on Node (not `backend: self`). Authentication is handled by Better Auth with the Organization plugin for multi-tenancy. Instance sizes, VPC, and ECS stay in `18_DEPLOYMENT.md`.

`none` means skip that BFS feature, not “use the default.” If a category is not listed as **Pin**, do not install it.

### App and UI

| Category            | Pin                                              | Why / rejected                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webFrontend`       | **`next`**                                       | Next.js 16 App Router, operator UI only. Not tanstack-router, react-vite, vue, nuxt, svelte, solid, astro, qwik, angular, redwood, fresh, vinext, tanstack-start. No second frontend in the monorepo. |
| `astroIntegration`  | **`none`**                                       | Not Astro.                                                                                                                                                                                            |
| `appShells`         | **`none`**                                       | No PWA, Tauri, Electron, Capacitor, WXT, OpenTUI. Native app is Phase 5.                                                                                                                              |
| `cssFramework`      | **`tailwind`**                                   | Tailwind **4.x**. Not SCSS, Less, styled-components.                                                                                                                                                  |
| `uiLibrary`         | **`shadcn-ui`**                                  | Operator UI kit. Not MUI, Antd, Chakra, DaisyUI, NextUI, Mantine.                                                                                                                                     |
| `shadcnBase`        | **`base`**                                       | **Base UI** primitives. Not Radix.                                                                                                                                                                    |
| `shadcnStyle`       | **`vega`**                                       | Classic balanced spacing (`20`). Not `nova` / `mira` (compact), not `maia` / `luma` (pills).                                                                                                          |
| `shadcnIconLibrary` | **`lucide`**                                     | Canonical in `20`.                                                                                                                                                                                    |
| `shadcnBaseColor`   | **`zinc`**                                       | Neutrals only. Brand accent is lime + navy in `20`, not “zinc app”.                                                                                                                                   |
| `shadcnColorTheme`  | **`zinc`**                                       | Then override `--primary` to lime-400 (`20` §4). Do **not** scaffold catalog `lime`.                                                                                                                  |
| `shadcnFont`        | **`noto-sans`** (BFS) → **IBM Plex Sans** (ship) | Catalog has no IBM Plex. Scaffold Noto to avoid Inter; replace with IBM Plex Sans + IBM Plex Sans Arabic in `apps/web` (`20` §5).                                                                     |
| `shadcnRadius`      | **`default`**                                    | CSS `--radius: 0.5rem` (`20`).                                                                                                                                                                        |
| `i18n`              | **`next-intl`**                                  | Default `fr-TN`; `ar-TN` and `en` ready; RTL. Not paraglide, i18next, intlayer.                                                                                                                       |
| `forms`             | **`react-hook-form`**                            | + Zod resolver from `packages/shared`. Not tanstack-form, Formik, Final Form, Conform.                                                                                                                |
| `stateManagement`   | **`none`**                                       | Server state is TanStack Query (`addons`). Not Redux, Zustand, Jotai, MobX, XState.                                                                                                                   |
| `animation`         | **`none`**                                       | No Framer Motion / GSAP / Lottie in MVP.                                                                                                                                                              |
| `cms`               | **`none`**                                       | Knowledge base is ours. Not Payload, Sanity, Strapi, Tina, Directus, Keystatic, Contentful.                                                                                                           |

### API, data, jobs

| Category                    | Pin                  | Why / rejected                                                                                                                                                                                                                                |
| --------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend`                   | **`nestjs`**         | Nest **11.x**, **Fastify adapter** (`@nestjs/platform-fastify`). **Not** `self` (that would put API routes in Next — forbidden). Not Hono, Elysia, Adonis, Nitro, Encore, Convex.                                                             |
| `runtime`                   | **`node`**           | Node **24**. NestJS requires `node`. Not Bun, not Cloudflare `workers`.                                                                                                                                                                       |
| `api`                       | **`none`**           | REST `/api/v1` on Nest controllers. Source of truth is Zod → controllers, **not** OpenAPI-first. `@nestjs/swagger` generates OpenAPI from those controllers (a view, not the contract). Not tRPC, oRPC, ts-rest, Garph, GraphQL Yoga, Apollo. |
| `database`                  | **`postgres`**       | PostgreSQL **16**. Not SQLite, MySQL, MongoDB, EdgeDB. Redis is cache/queue, not this field.                                                                                                                                                  |
| `orm`                       | **`prisma`**         | Prisma **7.x** (not 8 RC). Keep this major; prove it at bootstrap (§6.2). Not Drizzle, TypeORM, Kysely, MikroORM, Sequelize, Mongoose.                                                                                                        |
| `dbSetup`                   | **`docker`** (local) | Compose `postgres` with pgvector. Production is **RDS via Terraform**, which BFS does not name — not Neon, Supabase, Prisma Postgres, PlanetScale, Turso, D1, Atlas.                                                                          |
| `vectorDb`                  | **`pgvector`**       | Same Postgres. Not Pinecone, Qdrant, Chroma.                                                                                                                                                                                                  |
| `search`                    | **`none`**           | `pg_trgm` + product/variant SQL. Not Meilisearch, Typesense, Elasticsearch, OpenSearch, Algolia.                                                                                                                                              |
| `caching`                   | **`redis`**          | ElastiCache Redis **7** / Compose Redis. Client `ioredis`. Not Upstash.                                                                                                                                                                       |
| `jobQueue`                  | **`bullmq`**         | Worker process. Not Trigger.dev, Inngest, Temporal, SQS-as-bus.                                                                                                                                                                               |
| `realtime`                  | **`socket-io`**      | On the **backend** task + Redis adapter. Not PartyKit, Ably, Pusher, Liveblocks, Yjs, raw `ws`.                                                                                                                                               |
| `fileStorage`               | **`s3`**             | AWS S3. Local: MinIO. Not R2, Cloudinary, Supabase Storage.                                                                                                                                                                                   |
| `fileUpload`                | **`none`**           | Browser → our API → S3. Not UploadThing, FilePond, Uppy as the store.                                                                                                                                                                         |
| `validation`                | **`zod`**            | Zod **4.x** in `packages/shared`. Not Valibot, ArkType, TypeBox, Typia, Runtypes, Effect Schema.                                                                                                                                              |
| `backendLibraries` (Effect) | **`none`**           | No Effect services layer.                                                                                                                                                                                                                     |

### Auth, money, mail, AI SDKs

| Category       | Pin                                                           | Why / rejected                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`         | **`none` (BFS preset) / Better Auth**                         | The BFS `passport` preset does not fit our Nest architecture. Authentication is handled by **Better Auth** with the **Organization plugin** for multi-tenancy. NestJS application authorization enforces domain permissions, tenant data isolation, and RBAC (`Owner`, `Admin`, `Employee`). Not Clerk, NextAuth, Auth0, WorkOS, Kinde, Stack Auth, Supabase Auth. Google OAuth is configured via Better Auth social providers. |
| `payments`     | **`none`**                                                    | Phase **4**. Not Stripe/Polar/Paddle/etc. in MVP.                                                                                                                                                                                                                                                                                                                                                                               |
| `email`        | **`resend`** when invite / verification / password-reset ship | Transactional emails (email verification, password reset, organization invitations) use **Resend** centralized via `EmailService`. Not Postmark, SendGrid, Mailgun, Plunk as the sender.                                                                                                                                                                                                                                        |
| `ai`           | **`vercel-ai-sdk`**                                           | `AiGatewayService` + Vercel AI SDK (`ai`, `@ai-sdk/gateway`) routing through Vercel AI Gateway. Single credential `AI_GATEWAY_API_KEY` for Google Gemini, OpenAI, and Anthropic. Model ids in §9. Routing, tools, cost, dialect, and fallback are centralized at the gateway boundary. No Mastra, VoltAgent, LangGraph, LangChain, LlamaIndex, TanStack AI, OpenAI Agents, Google ADK, ModelFusion.                             |
| `integrations` | **`none`**                                                    | Meta Graph is our Integrations module. Not Nango.                                                                                                                                                                                                                                                                                                                                                                               |
| `ecommerce`    | **`none`**                                                    | Own catalog. Not Medusa.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `featureFlags` | **`none`**                                                    | `feature_flags` per business in our DB. Not GrowthBook, PostHog, LaunchDarkly, Flagsmith, Unleash.                                                                                                                                                                                                                                                                                                                              |
| `analytics`    | **`none`**                                                    | No product-analytics SaaS (not Plausible, Umami, PostHog, GA4). Merchant KPIs, `ai_usage`, `ai_actions`, `usage_events`, and domain events stay in our DB. Do not add a parallel `product_events` table in this file.                                                                                                                                                                                                           |
| `rateLimit`    | **`none`**                                                    | `@nestjs/throttler` on auth + Redis sliding windows for AI. Not Arcjet, not Upstash Ratelimit.                                                                                                                                                                                                                                                                                                                                  |

### Quality, deploy, workspace

| Category          | Pin                                                              | Why / rejected                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logging`         | **`pino`**                                                       | JSON. Fastify logs through the same pino instance (`loggerInstance`), so no `nestjs-pino` / `pino-http` middleware. Not Winston, Evlog, `console.log`.                                                                                                                                                                                                                                          |
| `observability`   | **`none`**                                                       | MVP: CloudWatch + `prom-client` + Terminus. Do not install Sentry, OTel SaaS, SigNoz, Grafana Cloud, Datadog, Axiom, Better Stack, or X-Ray **in MVP**. Revisit one second APM (Sentry **or** OpenTelemetry) when CloudWatch Logs Insights is too slow for error grouping (OQ-53).                                                                                                              |
| `testing`         | **Jest (API + golden) + `playwright` (UI)**                      | BFS allows only one slot. Do **not** use Vitest, Mocha, Cypress. Nest/API/golden stay **Jest**. Inbox/order UI: **Playwright**. If a scaffolder requires one BFS value, pick `playwright` and keep Jest in `apps/api`.                                                                                                                                                                          |
| `codeQuality`     | **`eslint`**, **`prettier`**                                     | **Canonical. Not Biome, not Oxlint/oxfmt.** Next.js is `eslint-config-next`; Nest/money/`business_id` need `@typescript-eslint` type-aware rules (Biome covers ~75–85%); class sort is `prettier-plugin-tailwindcss`. Do **not** run Biome in this repo “alongside” ESLint — that is the config drift Biome is meant to avoid. Oxlint/oxfmt: too new. Husky not required; CI is GitHub Actions. |
| `documentation`   | **`none`**                                                       | Product docs live in `docs/`. Not Starlight, Fumadocs.                                                                                                                                                                                                                                                                                                                                          |
| Addons            | **`tanstack-query`**, **`docker-compose`**, **`github-actions`** | Query **5.x**; Compose = local; GHA = CI/OIDC. **Not** Turborepo, Nx, MCP-in-app, Storybook, MSW, SWR, TanStack Table/Virtual/DB/Pacer, Kong, Axios-as-default, Firebase, GraphQL Codegen, Apollo Client, Electron, Capacitor, backend-utils, devcontainer.                                                                                                                                     |
| `webDeploy`       | **`docker`**                                                     | Next image → ECS `frontend`. **Not Vercel**, Cloudflare Pages, Fly, Railway, Render, Netlify, SST.                                                                                                                                                                                                                                                                                              |
| `serverDeploy`    | **`docker`**                                                     | Nest image → ECS `backend` + `worker`. **Not Vercel.**                                                                                                                                                                                                                                                                                                                                          |
| `workspaceShape`  | **`monorepo`**                                                   | pnpm workspaces: `apps/api`, `apps/web`, `packages/shared`, `packages/config`.                                                                                                                                                                                                                                                                                                                  |
| `packageManager`  | **`pnpm`**                                                       | **10.x**. Not npm, Yarn, Bun.                                                                                                                                                                                                                                                                                                                                                                   |
| `examples`        | **`none`**                                                       | No BFS `ai` / `chat-sdk` example apps.                                                                                                                                                                                                                                                                                                                                                          |
| `aiDocs`          | **`none`**                                                       | Canonical docs are this tree + `docs/AI_Sales_Agent_Brain_Dump.md`. Do not add generator `CLAUDE.md` / `.cursorrules` as source of truth.                                                                                                                                                                                                                                                       |
| `versionChannel`  | **`stable`**                                                     | No `latest`/`beta` lines (Nest 12 alpha, Prisma 8 RC forbidden).                                                                                                                                                                                                                                                                                                                                |
| `git` / `install` | Scaffolding only                                                 | Product repo already uses git. Agents never treat these as architecture.                                                                                                                                                                                                                                                                                                                        |

### MCP / CLI payload (do not “improve”)

Use this stack if scaffolding a throwaway or checking compatibility. BFS auth preset is `none` while application uses Better Auth + Organization plugin and Resend for transactional email.

```json
{
  "ecosystem": "typescript",
  "frontend": ["next"],
  "backend": "nestjs",
  "runtime": "node",
  "api": "none",
  "database": "postgres",
  "orm": "prisma",
  "dbSetup": "docker",
  "auth": "none",
  "payments": "none",
  "email": "none",
  "ai": "none",
  "vectorDb": "pgvector",
  "caching": "redis",
  "jobQueue": "bullmq",
  "realtime": "socket-io",
  "fileStorage": "s3",
  "fileUpload": "none",
  "validation": "zod",
  "forms": "react-hook-form",
  "i18n": "next-intl",
  "cssFramework": "tailwind",
  "uiLibrary": "shadcn-ui",
  "shadcnBase": "base",
  "shadcnStyle": "vega",
  "shadcnIconLibrary": "lucide",
  "shadcnBaseColor": "zinc",
  "shadcnColorTheme": "zinc",
  "shadcnFont": "noto-sans",
  "shadcnRadius": "default",
  "stateManagement": "none",
  "logging": "pino",
  "observability": "none",
  "testing": "playwright",
  "rateLimit": "none",
  "search": "none",
  "cms": "none",
  "analytics": "none",
  "featureFlags": "none",
  "integrations": "none",
  "ecommerce": "none",
  "animation": "none",
  "webDeploy": "docker",
  "serverDeploy": "docker",
  "packageManager": "pnpm",
  "addons": ["tanstack-query", "docker-compose", "github-actions", "eslint", "prettier"],
  "examples": ["none"],
  "aiDocs": ["none"]
}
```

Better Auth with the Organization plugin handles authentication, session management, and organization multi-tenancy in `apps/api`.

### Not expressible in BFS (still required)

These are in this file / `18_DEPLOYMENT.md` and must not be dropped because the catalog lacks a row:

| Ours                                                                        | Why BFS cannot say it                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Better Auth + Organization plugin + RBAC Owner/Admin/Employee               | `auth: none` (BFS preset)                                    |
| Jest for API + golden set                                                   | single `testing` slot                                        |
| `apps/api` two entrypoints (`main` + `worker`), Prisma schema in `apps/api` | BFS often puts Prisma in `packages/db`                       |
| Official Gemini / OpenAI / Anthropic **model ids**                          | `ai: none`                                                   |
| Meta Graph + webhook HMAC + WhatsApp stub                                   | no channel category                                          |
| Cloudflare → ALB, ECS Fargate ×3, no NAT, no Vercel                         | `docker` deploy only                                         |
| MinIO locally, Secrets Manager in prod                                      | —                                                            |
| Socket.IO path `/socket.io`, rooms server-side                              | —                                                            |
| `@nestjs/swagger` OpenAPI generated from Nest controllers                   | `api: none` is not OpenAPI-first; the spec is a derived view |

---

## 3. Monorepo layout

```
apps/api/                 NestJS — HTTP, webhooks, Socket.IO gateway
  src/main.ts             API process
  src/worker.ts           BullMQ process (same package, same image)
  prisma/schema.prisma    Single schema; repositories still module-owned
apps/web/                 Next.js — operator UI only
packages/shared/          Zod schemas, enums, DTO types (NFR-MNT-02)
packages/config/          ESLint, TypeScript, Prettier bases
```

| Rule             | Detail                                                                               |
| ---------------- | ------------------------------------------------------------------------------------ |
| Package manager  | **pnpm** only. npm and Yarn are not used.                                            |
| API + worker     | Same NestJS package, two entrypoints — `10_ARCHITECTURE.md` §3                       |
| Frontend imports | `packages/shared` and `/api/v1` only. **Never** Prisma, BullMQ, Meta, or LLM SDKs    |
| Path aliases     | `@app/shared`, `@api/*` — no deep relative imports across modules                    |
| `tsconfig`       | `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` |

---

## 4. Runtime and language

| Decision              | Rationale                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Node.js 24 Active LTS | Current LTS as of Aug 2026. Nest 11 supports Node 20+. Do not ship Node 22 Maintenance as the production target. |
| TypeScript `strict`   | State machine, money (`Decimal`), and `business_id` must not be implicit `any`                                   |
| ESM                   | Align with Nest 11 / Next 16. No dual CJS/ESM unless a library forces it                                         |
| Decimal money         | Prisma `Decimal` / `decimal.js` for prices and totals. **Never** `number` for TND                                |

Rejected: a Python orchestrator. One language keeps the modular monolith actually modular. Model providers are HTTP APIs.

---
