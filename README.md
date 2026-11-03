# AI Sales Manager

Tunisian ecommerce sales workspace. A merchant loads a catalog and business rules, then an AI answers customers in French, Arabic, and Derja using only that data. Staff work a triage inbox, confirm pending orders, and watch four KPIs.

> Course project (Software Engineering, AI-assisted development). Phases are owned by team members. The runnable monorepo matches the working demo: website widget, AI playground, operator console, measured refactor, and testing dossier.

## Demo

[Watch the full walkthrough](docs/demo.mp4) (about 3 and a half minutes). Captions explain each part. The playground and the website bubble are both tried in Tunisian Derja (`slm, andkom pntallon blue`), then the video continues through the inbox, pipeline, catalog, analytics, every settings tab, the six setup steps, the live startup console, and the employee menu.

## Presentation

Open the defense deck:

- PowerPoint: [`presentation/AI-Sales-Manager.pptx`](presentation/AI-Sales-Manager.pptx)
- Browser slides: [`presentation/index.html`](presentation/index.html)

## Testing

Asma’s dossier is under [`docs/04-testing/`](docs/04-testing/README.md).

| Artifact                                                                                                                   | Link                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Testing PDF report** (unit, integration, E2E, golden AI, smoke, security, **k6 load / stress / spike**, **soak**, chaos) | [`docs/04-testing/AI-Sales-Manager-Testing-Report.pdf`](docs/04-testing/AI-Sales-Manager-Testing-Report.pdf) |
| Wave plans W0–W10 + manual QA                                                                                              | [`docs/04-testing/plans/`](docs/04-testing/plans/)                                                           |
| k6 lab scripts                                                                                                             | [`docs/04-testing/perf/`](docs/04-testing/perf/)                                                             |
| Automated test index                                                                                                       | [`tests/README.md`](tests/README.md)                                                                         |

Latest automated run recorded in the dossier: **1,452** API Jest tests and **39** shared tests passed; golden-set gates PASS.

```bash
pnpm test
pnpm eval:golden
pnpm test:e2e
k6 run docs/04-testing/perf/k6-load.js
```

## Team and phase ownership

| Member    | Phase                                              | Folder                                                                                                                           |
| --------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Rayen** | Requirements, methodology, design and architecture | [`docs/01-requirements`](docs/01-requirements), [`docs/02-methodology`](docs/02-methodology), [`docs/03-design`](docs/03-design) |
| Aymen     | Frontend and ethics                                | `apps/web`, `docs/06-ethics` (to be added)                                                                                       |
| Moataz    | Backend, optimization and refactoring              | `apps/api`, [`docs/05-refactoring`](docs/05-refactoring)                                                                         |
| Asma      | Testing of the whole application                   | [`tests/`](tests), [`docs/04-testing`](docs/04-testing)                                                                          |

## Stack

- Next.js web app (`apps/web`) on port 3000
- NestJS API (`apps/api`) on port 4000
- PostgreSQL with pgvector, Redis, and optional MinIO
- Chat models through Groq, OrcaRouter, or the Vercel AI Gateway

## Run locally

Requirements: Node.js 22+, pnpm, and Docker.

```bash
pnpm install
cp .env.example .env
cp .env.example apps/api/.env
cp .env.example apps/web/.env
```

Set `PORT=4000` in `apps/api/.env` and `PORT=3000` in `apps/web/.env`. For local Redis published on 6380, set `REDIS_URL=redis://localhost:6380`. If MinIO is unavailable, set `ALLOW_LOCAL_STORAGE_FALLBACK=true`.

```bash
docker compose up -d postgres redis
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev:api
pnpm dev:web
```

Open http://localhost:3000.

### Demo login

| Email                  | Password       | Role                              |
| ---------------------- | -------------- | --------------------------------- |
| `demo@example.com`     | `Password123!` | Owner                             |
| `admin@example.com`    | `Password123!` | Admin                             |
| `agent@example.com`    | `Password123!` | Employee                          |
| `operator@example.com` | `Password123!` | Startup operator (all businesses) |

The seeded shop is **Maison Alyssa Tunis**. Sign in as `operator@example.com` to open the startup console at `/operator`.

## Talk to the AI

Put a key in `apps/api/.env`. Groq is used when `GROQ_API_KEY` is set.

```bash
GROQ_API_KEY=your-key
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-120b
```

- **AI Playground** (`/playground`)
- **Website widget** (`/website`)
- **Inbox** for takeover, reply, attachments, and suggestions

## Workspace

| Path          | What it is                                  |
| ------------- | ------------------------------------------- |
| `/inbox`      | Sales command center                        |
| `/playground` | Customer simulator                          |
| `/pipeline`   | Read-only sales pipeline                    |
| `/products`   | Catalog, variants, CSV import               |
| `/analytics`  | Four KPIs                                   |
| `/settings`   | Personality, rules, team, channels, billing |
| `/website`    | Chat bubble a shop pastes on its own site   |
| `/onboarding` | Store setup through go-live                 |
| `/operator`   | Startup console across all businesses       |

## Course reading order

1. [Project proposal](docs/01-requirements/01-project-proposal.md)
2. [User stories](docs/01-requirements/02-user-stories.md) and [backlog](docs/01-requirements/03-product-backlog.md)
3. [Functional requirements](docs/01-requirements/06-functional-requirements.md) and [NFRs](docs/01-requirements/04-non-functional-requirements.md)
4. [Methodology](docs/02-methodology/01-methodology.md)
5. [Design overview](docs/03-design/00-design-overview.md)
6. [Testing dossier](docs/04-testing/README.md) and the [testing PDF report](docs/04-testing/AI-Sales-Manager-Testing-Report.pdf)
7. [Refactoring report](docs/05-refactoring/report.md)
8. [Presentation](presentation/README.md) and [demo video](docs/demo.mp4)

Detailed product and engineering specs also live under `docs/00_product`, `docs/10_engineering`, `docs/20_design`, `docs/30_execution`, and `docs/40_project_management`.

## Status

| Phase                     | State                                              |
| ------------------------- | -------------------------------------------------- |
| Requirements              | Present                                            |
| Methodology               | Present                                            |
| Design                    | Present                                            |
| Frontend                  | Present (runnable app)                             |
| Backend / refactoring     | Present (`docs/05-refactoring`)                    |
| Testing                   | Present (`docs/04-testing` + PDF report, `tests/`) |
| Presentation + demo video | Present                                            |
