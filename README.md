# AI Sales Manager

**Catalog-grounded AI sales workspace for Tunisian ecommerce.**

Merchants load products and business rules. An assistant answers customers in French, Modern Standard Arabic, Tunisian Arabic (Derja), and Arabizi — using only that shop’s data. When a buyer is ready to purchase, the conversation is handed to a human as a pending order. Staff work a triage inbox, confirm orders, and track four operating KPIs.

This repository is the course delivery for Software Engineering (AI-assisted development): a runnable monorepo, full documentation, measured refactoring, a testing dossier with a PDF report, a defense presentation, and a product demo video.

---

## Highlights

| Area                 | What you get                                                       |
| -------------------- | ------------------------------------------------------------------ |
| Multilingual AI      | Derja-first replies grounded in catalog, stock, and policy tools   |
| Sales command center | Inbox, pipeline, playground, analytics, settings                   |
| Channels (MVP)       | Instagram, Messenger, and an embeddable website chat widget        |
| Human handoff        | Purchase intent → pending order with staff briefing                |
| Platform ops         | Startup operator console across all businesses                     |
| Quality              | 1,452 API tests, golden AI evaluation gates, k6 lab profiles       |
| Delivery artifacts   | Demo video, PPTX + HTML presentation, testing PDF, refactor report |

---

## Quick links

| Resource                          | Path                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Demo video (~3.5 min)             | [`docs/demo.mp4`](docs/demo.mp4)                                                                             |
| Defense presentation (PowerPoint) | [`presentation/AI-Sales-Manager.pptx`](presentation/AI-Sales-Manager.pptx)                                   |
| Defense presentation (browser)    | [`presentation/index.html`](presentation/index.html)                                                         |
| Testing PDF report                | [`docs/04-testing/AI-Sales-Manager-Testing-Report.pdf`](docs/04-testing/AI-Sales-Manager-Testing-Report.pdf) |
| Refactoring & optimization report | [`docs/05-refactoring/report.md`](docs/05-refactoring/report.md)                                             |
| Requirements                      | [`docs/01-requirements/`](docs/01-requirements/)                                                             |
| Methodology                       | [`docs/02-methodology/`](docs/02-methodology/)                                                               |
| Design & architecture             | [`docs/03-design/`](docs/03-design/)                                                                         |

---

## Architecture

```
apps/web          Next.js 16  — merchant UI, widget embed, operator console   :3000
apps/api          NestJS + Fastify — auth, AI, orders, channels, billing      :4000
packages/shared   Shared Zod schemas and types
Postgres + pgvector · Redis · optional MinIO
LLM routing: Groq → OrcaRouter → Vercel AI Gateway
```

**MVP channels:** Instagram and Messenger. WhatsApp is stubbed. Fashion ecommerce is the first vertical.

---

## Getting started

### Requirements

- Node.js 22+
- [pnpm](https://pnpm.io/) 11+
- Docker (Postgres and Redis)

### Install and run

```bash
pnpm install
cp .env.example .env
cp .env.example apps/api/.env
cp .env.example apps/web/.env
```

In `apps/api/.env` set `PORT=4000`. In `apps/web/.env` set `PORT=3000`.  
If Redis is published on host port `6380`, set `REDIS_URL=redis://localhost:6380`.  
If MinIO is not available, set `ALLOW_LOCAL_STORAGE_FALLBACK=true`.

```bash
docker compose up -d postgres redis
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev:api
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000).

### Demo accounts

Seeded business: **Maison Alyssa Tunis**. Password for all accounts: `Password123!`

| Email                  | Role                                            |
| ---------------------- | ----------------------------------------------- |
| `demo@example.com`     | Owner                                           |
| `admin@example.com`    | Admin                                           |
| `agent@example.com`    | Employee                                        |
| `operator@example.com` | Startup operator (all businesses) → `/operator` |

### AI provider (optional for live Derja chat)

Add to `apps/api/.env`, then restart the API:

```bash
GROQ_API_KEY=your-key
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-120b
```

Try Derja in **Playground** (`/playground`) or the **Website** widget (`/website`), for example: `slm, andkom pntallon blue`.

---

## Product surfaces

| Route         | Description                                                 |
| ------------- | ----------------------------------------------------------- |
| `/inbox`      | Sales command center — triage, takeover, reply, attachments |
| `/playground` | Safe customer simulator against the live catalog            |
| `/website`    | Public key + install snippet for the shop’s site            |
| `/pipeline`   | Pending and in-progress orders                              |
| `/products`   | Catalog, variants, CSV import                               |
| `/analytics`  | Four KPIs                                                   |
| `/settings`   | Personality, rules, team, channels, billing                 |
| `/onboarding` | Go-live checklist                                           |
| `/operator`   | Cross-tenant startup console                                |

Header search and `Ctrl+K` / `Cmd+K` jump between pages.

---

## Quality & verification

| Check                        | Command / artifact                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Unit & integration           | `pnpm test` — 1,452 API + 39 shared tests (last recorded run)                                                |
| AI golden set                | `pnpm eval:golden` — 104 Tunisian commerce scenarios; gates PASS                                             |
| End-to-end UI                | `pnpm test:e2e` (Playwright; app must be running)                                                            |
| Full gate                    | `pnpm check:ci` (lint, types, tests, production build)                                                       |
| Load / stress / spike / soak | `k6 run docs/04-testing/perf/k6-load.js` (see [`perf/`](docs/04-testing/perf/))                              |
| Full testing write-up        | [`docs/04-testing/AI-Sales-Manager-Testing-Report.pdf`](docs/04-testing/AI-Sales-Manager-Testing-Report.pdf) |

Unset `GROQ_API_KEY` / `ORCA_API_KEY` when you want Jest to stay offline.

---

## Documentation map

| Phase                 | Owner  | Location                                                             |
| --------------------- | ------ | -------------------------------------------------------------------- |
| Requirements          | Rayen  | [`docs/01-requirements`](docs/01-requirements)                       |
| Methodology           | Rayen  | [`docs/02-methodology`](docs/02-methodology)                         |
| Design                | Rayen  | [`docs/03-design`](docs/03-design)                                   |
| Testing               | Asma   | [`docs/04-testing`](docs/04-testing), [`tests/`](tests)              |
| Backend / refactoring | Moataz | [`apps/api`](apps/api), [`docs/05-refactoring`](docs/05-refactoring) |
| Frontend              | Aymen  | [`apps/web`](apps/web)                                               |

**Suggested reading order for graders:** proposal → user stories & backlog → FRs / NFRs → methodology → design overview → [testing PDF](docs/04-testing/AI-Sales-Manager-Testing-Report.pdf) → [refactor report](docs/05-refactoring/report.md) → [presentation](presentation/README.md) → [demo video](docs/demo.mp4).

Extended product and engineering specifications also live under `docs/00_product`, `docs/10_engineering`, `docs/20_design`, `docs/30_execution`, and `docs/40_project_management`.

---

## Repository layout

```
apps/api/                 NestJS API, Prisma, Jest, golden eval
apps/web/                 Next.js app, Playwright e2e
packages/shared/          Shared contracts
docs/01-requirements/     Course requirements
docs/02-methodology/      Scrum / DoD / contributing
docs/03-design/           UML, ERD, ADRs, diagram PNGs
docs/04-testing/          Testing dossier + PDF + k6 scripts
docs/05-refactoring/      Measured complexity & performance report
docs/demo.mp4             Product walkthrough
presentation/             Defense deck (PPTX + HTML)
backlog/                  Task cards and wave board
docker-compose.yml        Postgres, Redis, MinIO
```

---

## Team

| Member | Responsibility                                     |
| ------ | -------------------------------------------------- |
| Rayen  | Requirements, methodology, design and architecture |
| Aymen  | Frontend and ethics                                |
| Moataz | Backend, optimization, and refactoring             |
| Asma   | Testing of the whole application                   |

---

## License

Course project — all rights reserved by the authors unless otherwise stated.
