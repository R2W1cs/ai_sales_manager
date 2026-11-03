# 11 — Tech Stack

Authoritative tech stack choices, Better Fullstack pins, NestJS, Prisma, Next.js, Redis/BullMQ, and LLM model selections.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-scaffold-pins-layout.md`](11_TECH_STACK/01-scaffold-pins-layout.md): **Stack at a glance, BFS pins (catalog v2.5.1), monorepo layout & runtime**
  - _Guidance:_ Read if scaffolding projects, checking package versions, monorepo paths, or Node/pnpm requirements.
- [`02-backend-db-realtime.md`](11_TECH_STACK/02-backend-db-realtime.md): **NestJS 11, PostgreSQL/pgvector, Prisma 7, Redis, BullMQ & Next.js 16**
  - _Guidance:_ Read if configuring backend modules, database ORM, queue workers, realtime gateway, or web framework.
- [`03-llm-routing-models.md`](11_TECH_STACK/03-llm-routing-models.md): **LLM model routing, exact model IDs, fallbacks, pricing & context limits**
  - _Guidance:_ Read if configuring AI SDK models (Gemini Flash, GPT-4o-mini), fallbacks, pricing, or token limits.
- [`04-integrations-infra-rules.md`](11_TECH_STACK/04-integrations-infra-rules.md): **Meta client, cross-cutting libraries, cloud infrastructure & forbidden tech**
  - _Guidance:_ Read if integrating third-party libraries, AWS infra, CI workflows, or checking forbidden dependencies.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `11_TECH_STACK/` required for your domain (see bullets above) rather than loading all documentation.
