## 5. Backend — NestJS 11

### 5.1 Packages

| Package                                                      | Role                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify` | HTTP. **Fastify adapter** (`FastifyAdapter` + `NestFastifyApplication`). Socket.IO attaches to Fastify's raw `http.Server`; uploads are S3 presigned URLs, so there is no second file-upload story. See `40` ADR-025 |
| `fastify`                                                    | Pinned to the exact version `@nestjs/platform-fastify` bundles, so only one Fastify copy is installed                                                                                                                |
| `@fastify/cookie`                                            | `request.cookies`, `reply.setCookie`. **`maxAge` is seconds**, not milliseconds like Express `res.cookie`                                                                                                            |
| `@fastify/helmet`                                            | Default security headers. No CSP for a JSON API (`17` §10)                                                                                                                                                           |
| `@fastify/compress`                                          | Response compression                                                                                                                                                                                                 |
| `@fastify/cors`                                              | CORS. Pulled in by `@nestjs/platform-fastify`; configured through `app.enableCors()`                                                                                                                                 |
| `@nestjs/config`                                             | Typed config from env / Secrets Manager                                                                                                                                                                              |
| `better-auth` + `@better-auth/prisma-adapter`                | Authentication, session management, Organization plugin for tenancy, RBAC. Mounted on `/api/auth/*` through an in-repo Fastify adapter (`5.3`)                                                                       |
| `@nestjs/websockets`, `@nestjs/platform-socket.io`           | Realtime gateway                                                                                                                                                                                                     |
| `@nestjs/terminus`                                           | `GET /ready` (Postgres + Redis, ALB matcher) and `GET /health/live` (NFR-OPS-04). Paths per `13` §2.10 — there is no `/health/ready`                                                                                 |
| `pino`                                                       | JSON logs with `request_id` / `correlation_id`. Fastify logs through the same instance, so request logging needs no extra middleware                                                                                 |
| `argon2`                                                     | Password hashing                                                                                                                                                                                                     |
| `nestjs-zod`                                                 | Pipe Zod schemas from `packages/shared` into controllers                                                                                                                                                             |
| `@nestjs/swagger`                                            | OpenAPI JSON generated from Nest controllers. **Not** the source of truth (Zod is). Swagger UI: local + staging only; not an unauthenticated prod surface.                                                           |
| `@nestjs/throttler`                                          | Auth-endpoint rate limit (NFR-SEC-09); AI rate limits are Redis, not this                                                                                                                                            |

**Do not** enable `@nestjs/microservices` or a broker “for later.” BullMQ is the async boundary.

Nest **12 is alpha** as of 2026-08. Stay on 11.x.

### 5.3 Fastify adapter rules

The adapter is selected in exactly one place: `apps/api/src/bootstrap.ts`. Do not
call `NestFactory.create` without it.

| Rule                | Pin                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request/reply types | `FastifyRequest` / `FastifyReply`, aliased as `HttpRequest` / `HttpReply` in `apps/api/src/platform/core/http.ts`. Never import from `express`                  |
| No `request.path`   | Use `requestPath(req)`. Fastify only has `request.url`, which includes the query string                                                                         |
| No `request.secure` | Use `isSecureRequest(req)`                                                                                                                                      |
| Headers             | `reply.header(...)`. There is no `reply.setHeader`                                                                                                              |
| Redirects           | `reply.redirect(url, code)` — url **first**. The Express `(code, url)` order throws                                                                             |
| Cookies             | `reply.setCookie` / `reply.clearCookie`, `maxAge` in **seconds**                                                                                                |
| Raw body            | The app is created with `rawBody: true`; `request.rawBody` holds the exact bytes. Required for Meta HMAC (`16` §4.2). Never sign `JSON.stringify(request.body)` |
| Body limit          | `bodyLimit` is set on the adapter, sized for the 512 KB Meta webhook. Do not rely on framework defaults (`13` §2.1)                                             |
| Proxy               | `trustProxy` is on, so `request.ip` and `request.protocol` describe the client. Rate limiting must key on `request.ip`, never a hand-parsed `X-Forwarded-For`   |
| Prefer Nest         | Return values and exceptions over `@Res()`. Reach for `@Res({ passthrough: true })` only when a header is dynamic                                               |

### 5.2 Auth tokens & Sessions (implementation defaults)

| Token / Session | Lifetime                       | Storage                                       |
| --------------- | ------------------------------ | --------------------------------------------- |
| Session Token   | **7 to 14 days**               | HttpOnly Secure cookie / Bearer token         |
| Access Token    | **15 minutes**                 | Memory / Authorization header                 |
| Socket.IO       | Session cookie or Bearer token | Server joins rooms — client cannot pick rooms |

Full RBAC and Better Auth configuration: `17_SECURITY_DESIGN.md`. Defaults here so bootstrap is not invented twice. Keyed via `BETTER_AUTH_SECRET`.

---

## 6. Persistence — PostgreSQL, pgvector, Prisma 7

### 6.1 Database

PostgreSQL is the system of record, **including vectors**. No MongoDB, no Pinecone, no Supabase.

| Item              | Pin                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Engine            | PostgreSQL **16**                                                                               |
| RDS               | `db.t4g.medium` starting point (staging); encrypt at rest; backups for RPO ≤ 5 min (NFR-REL-05) |
| Local image       | A **pgvector-enabled** image (e.g. `pgvector/pgvector:pg16`), never vanilla `postgres:16`       |
| Extensions        | `vector`, `pgcrypto`; `pg_trgm` for fuzzy product names                                         |
| Encoding / locale | `UTF8`; collation that sorts Arabic and Latin together without breaking RTL storage             |
| Time              | Store `timestamptz`. KPI windows use the **business timezone** (`luxon`)                        |

### 6.2 ORM — Prisma 7 (OQ-40)

**Single ORM:** Prisma 7.x. Repositories wrap `PrismaClient` **inside the owning module**. Other modules never inject `PrismaService`.

| Option       | Verdict                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| **Prisma 7** | Schema-first migrations (NFR-OPS-05), generated types, Nest integration |
| TypeORM      | `synchronize` is a production foot-gun; weaker migrations for this team |
| Drizzle      | Better raw SQL / pgvector; not worth two ORMs                           |
| Prisma 8 RC  | Pre-release — forbidden                                                 |

**Bootstrap gate:** keep the 7.x pin. Before CI treats Prisma as proven, run on the pgvector image: Migrate up (and a down/up round-trip on a throwaway DB), generated client in Nest DI, a `business_id`-scoped `$queryRaw` KNN (`<=>`), and a Decimal money round-trip. If that gate fails: fix Prisma 7 usage or reopen OQ-40. Do **not** silently switch to Drizzle or Prisma 8 RC.

**pgvector:** Prisma 7 still treats `vector` as an extension type. KNN (`ORDER BY embedding <=> $1::vector LIMIT k`) lives in **`$queryRaw` / TypedSQL in the Products/Knowledge repository only**. CRUD on embedding metadata uses Prisma. Every raw query **must** include `business_id` in `WHERE`.

**IDs:** Prisma `@default(uuid())` UUIDv4 for MVP (OQ-43). Do not sort inbox by id.

**Money:** `Decimal(12, 3)` for TND (millimes). Display as `12 540 DT` in the UI.

Migrations: Prisma Migrate, **forward-only**, run on deploy. Never `prisma db push` in production.

**Embedding column:** `vector(1536)` matching `text-embedding-3-small`. Changing embedding model is a reindex of the whole tenant, not a config toggle.

---

## 7. Redis, BullMQ, realtime

### 7.1 Redis

| Use                      | Key / pattern                                                 | Notes                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation lock        | `conversation:{id}:processing`                                | `SET {token} NX EX 30`; heartbeat every 10s **only if** GET == token; Lua DEL if token matches. **Not** stock correctness — variant `FOR UPDATE` is in `12` §6.5. Details in `14_SYSTEM_DESIGN.md` §6 |
| Rate limits              | `rl:identity:{id}:5m`, `rl:business:{id}:1m`                  | Sliding window — numeric limits in `14_SYSTEM_DESIGN.md`                                                                                                                                              |
| Provider circuit breaker | `cb:provider:{google\|openai\|anthropic}:n`, `:fail`, `:open` | Volume-gated trip; open 5 min. `15_AI_ARCHITECTURE.md` §11.2                                                                                                                                          |
| Socket.IO adapter        | Redis pub/sub                                                 | Required once API replicas > 1                                                                                                                                                                        |
| BullMQ                   | `bull:{queue}:*`                                              | Dedicated logical DB index `1` if isolating from cache, or key prefix `bull:`                                                                                                                         |

Client: **`ioredis`**. One connection family for BullMQ, one for cache/locks, one for the Socket.IO adapter (adapter requirement).

### 7.2 Queues (names are stable)

| Queue           | Jobs                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `ai`            | `process_inbound_message`, `send_ai_reply`, `summarize_conversation`, `score_lead`, `generate_suggestion` |
| `embeddings`    | `reindex_business`, `index_document`                                                                      |
| `catalog`       | `validate_import`, `run_import`                                                                           |
| `integrations`  | `deliver_outbound`, `retry_webhook_processing`, `fetch_inbound_media`, `check_channel_tokens`             |
| `analytics`     | `rollup_daily`                                                                                            |
| `billing`       | `sync_usage_aggregates`                                                                                   |
| `notifications` | `notify_handoff`, `notify_order_request`, `notify_hot_lead`                                               |
| `maintenance`   | `expire_reservations`, `auto_close_inactive`, `sweep_retention`                                           |

`attempts: 3` (three runs). Built-in exponential `delay: 5000` → **5s then 10s**, then DLQ + alert (NFR-REL-03). Not 5s/20s/80s. AI job id: `{conversationId}:{inboundMessageId}`.

### 7.3 Realtime

- `socket.io` **4.x** + `@socket.io/redis-adapter`
- Path: `/socket.io` (engine default; ALB + Cloudflare in `18`). Brain Dump `WS /realtime` is superseded — do not mount a second path
- Auth: same JWT as REST
- Rooms joined **server-side only**: `business:{id}`, `conversation:{id}`, `user:{id}`. Client occupancy emits: `thread:open` / `thread:close` (`14_SYSTEM_DESIGN.md` §12) — not `socket.join`
- On reconnect the client **refetches**; the socket is not a source of truth
- SSE is a fallback if the load balancer cannot upgrade WebSockets — not the happy path

---

## 8. Frontend — Next.js 16

| Decision         | Pin / rationale                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js          | **16.x** (16.3 current), App Router                                                                                                                 |
| React            | **19.x**                                                                                                                                            |
| TanStack Query   | **5.x** — server state (inbox, KPIs, notifications)                                                                                                 |
| Socket.IO client | **4.x** — same major as server                                                                                                                      |
| `next-intl`      | French default locale `fr-TN`; `ar-TN` and `en` ready; RTL for Arabic UI                                                                            |
| Tailwind CSS     | **4.x** + `prettier-plugin-tailwindcss`                                                                                                             |
| UI kit           | **shadcn/ui + Base UI**. Style **`vega`**, Lucide, zinc neutrals, radius `0.5rem`, IBM Plex (after Noto scaffold). Canonical: `20_DESIGN_SYSTEM.md` |
| Forms            | React Hook Form + Zod resolver sharing `packages/shared`                                                                                            |

Next.js is **UI only**. No Route Handlers to Meta, Postgres, or OpenAI. No Prisma in `apps/web`. Visual tokens (accent, neutrals, type, radius, icon set) are `20_DESIGN_SYSTEM.md`.

Default UI locale: **`fr-TN`**. Currency: `TND` with `fr-TN` numbering (`12 540 DT`).

**Rejected:** Remix, Vue, native app (Phase 5), Redux as default, GraphQL clients, MUI/Antd/Chakra, Biome.

---
