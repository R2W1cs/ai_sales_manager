# 32 — Feature Specifications

| Field           | Value                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Document ID     | `32_FEATURE_SPECIFICATIONS`                                                                                                                |
| Status          | Approved — canonical for Phase 1 feature join (problem → frozen contracts → tasks)                                                         |
| Owner           | Product / Engineering                                                                                                                      |
| Audience        | Engineers, QA, AI coding agents                                                                                                            |
| Depends on      | `03_MVP_SCOPE.md` §5, `01_PRODUCT_REQUIREMENTS.md`, `02_USER_STORIES.md`, `30_TASKS.md`, `31_IMPLEMENTATION_PLAN.md`, `12`–`18`, `20`–`23` |
| Consumed by     | [`backlog/`](../../backlog/), coding agents, QA traceability, `43_CHANGELOG.md`                                                            |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# MVP`                                                                                              |

---

## 1. Purpose and scope

This document is **canonical for which Phase 1 features exist and which frozen documents close each one**. It does **not** restate acceptance criteria, routes, widgets, or task sizes.

If a behaviour is not in `01`/`02`/`05`/`06`, it is not a feature. If a slice is not a `T-*` in `30`, do not invent implementation work from this file.

**In scope:** `FS-*` ids, problem (which `03` §2 hypothesis), in/out, pointers to FR / US / `T-*` / `13` / `22` / `23` / `31` milestone.

**Out of scope, and where it lives instead:**

| Topic                                           | Canonical location                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Executable AC / merchant-visible success        | `02_USER_STORIES.md` (narratives: `22` §17)                                                              |
| Requirement text                                | `01_PRODUCT_REQUIREMENTS.md`                                                                             |
| Task graph, sizes, done-when, **feature order** | `30_TASKS.md` (`T-*` depends — not a second `FS-*` graph). **Live status:** [`backlog/`](../../backlog/) |
| Calendar, capacity, externals                   | `31_IMPLEMENTATION_PLAN.md`                                                                              |
| Routes / DTOs                                   | `13_API_DESIGN.md`                                                                                       |
| Tables                                          | `12_DATABASE_DESIGN.md`                                                                                  |
| Module boundaries, no cross-entity Prisma       | `10_ARCHITECTURE.md`                                                                                     |
| State machine, jobs, locks                      | `14_SYSTEM_DESIGN.md`                                                                                    |
| Tokens, type, colour, spacing, density          | `20_DESIGN_SYSTEM.md` — **not** a `25_DESIGN_TOKENS` file                                                |
| Widgets / query owners                          | `23_UI_COMPONENTS.md`                                                                                    |
| Screens / copy                                  | `22_UX_FLOWS.md`                                                                                         |
| Screenshot / pixel mocks                        | `24_REFERENCE_SCREENS.md` (empty until assets exist)                                                     |
| AI voice, tools, grounding                      | `05_AI_BEHAVIOR_SPECIFICATION.md`                                                                        |
| Fifteen triggers, briefing                      | `06_AI_HUMAN_HANDOFF_RULES.md`                                                                           |

`24_REFERENCE_SCREENS.md` is empty until visual assets exist. Do not block a feature on `24`. `07_DOMAIN_MODEL.md` is empty; glossary is `00` §14.

**Conflict rule:** behaviour `01`/`02`/`05`/`06` → routes `13` → tokens `20` → widgets `23` → work `30` → time `31`. Internals stay in `10`/`14`/`15`/`16`. If this file disagrees, **fix this file**.

Do not grow cards into architecture. **In** is the capability boundary; **how** is the primary-docs column.

---

## 2. How to read

### 2.1 ID scheme

```
FS-<AREA>-<NN>
```

Area letters match `30` §2.1. Numbers are never reused.

### 2.2 Close when

A feature is closed when **all** of:

1. Every listed **M** FR is implemented (`01`).
2. Every listed Must story's AC pass (`02`), plus blanket BAC-1–10.
3. Every listed `T-*` is done (`30` §2.3).
4. No extra endpoint, nav item, or `C-*` beyond `13` / `22` / `23`.

Should rows close the feature only if their tasks shipped; they do **not** block `03` §10.1.

Do not add a “success criteria” story on the card. That is the listed `US-*` plus, for the happy path, `22` §17.

### 2.3 Fields

**Out** is the non-goals list. Do not add a second Non-goals heading.

**In** names the capability, not the internal design. If a sentence belongs in `14`/`16`/`15`, delete it here and point.

### 2.4 Agent rule

1. Open this `FS-*` card.
2. Execute the listed `T-*` as leaves in [`backlog/`](../../backlog/) (`30` depends are the parent graph; `CURSOR.md` is the board).
3. Read the card’s **Primary docs**, then `13` / `12` / `23` only as the card points. UI slices also read `20`. Not the whole tree (`00` §15.2).
4. Do not add MSW, a `WEB-CONTRACT` wave, `X-*` ids, `FS-*` depends, dotted `T-AI-01.a` ids on `30`, or a tokens file numbered `25`.

---

## 3. Feature index

| ID            | Feature                             | Hypothesis | Milestone (API / UI)                          |
| ------------- | ----------------------------------- | ---------- | --------------------------------------------- |
| `FS-AUTH-01`  | Register, session, logout, throttle | H3         | `M1` / `M8` (`T-WEB-01` may start after `M1`) |
| `FS-AUTH-02`  | Public commercial landing page      | H3         | `M8` (`T-WEB-11`)                             |
| `FS-BIZ-01`   | Create workspace + seeds            | H3         | `M1`                                          |
| `FS-BIZ-02`   | Team invite, roles, seats           | H3         | `M1` / `M8` settings                          |
| `FS-BIZ-03`   | Onboarding + G1–G5 live             | H3         | `M1`+`M5` / `M8`                              |
| `FS-FLAG-01`  | Closed feature flags                | —          | `M1`                                          |
| `FS-CAT-01`   | Variant-first catalog               | H3         | `M2` / `M8`                                   |
| `FS-CAT-02`   | CSV import                          | H3         | `M2` / `M8` onboarding                        |
| `FS-KNOW-01`  | Versioned business rules            | H1, H3     | `M2` / `M8` settings                          |
| `FS-KNOW-02`  | Knowledge docs + embed              | H1         | `M2`                                          |
| `FS-INT-01`   | Meta OAuth IG + Messenger           | H3         | `M3` / `M8`                                   |
| `FS-INT-02`   | Webhook ingest + outbound           | H1–H2      | `M3`                                          |
| `FS-INT-03`   | WhatsApp stub only                  | —          | `M3`                                          |
| `FS-CONV-01`  | Three-pane inbox + human control    | H4         | `M4` / `M8`                                   |
| `FS-LEAD-01`  | Deterministic lead score            | H4         | `M4`                                          |
| `FS-RT-01`    | Realtime + polling fallback         | H4         | `M4` / `M8`                                   |
| `FS-PIPE-01`  | Read-only pipeline                  | H4         | `M6` / `M8`                                   |
| `FS-AI-01`    | Orchestrator + grounding            | H1         | `M5`                                          |
| `FS-AI-02`    | Reply modes, drafts, suggest        | H1, H4     | `M5` / `M8`                                   |
| `FS-AI-03`    | Playground (G4)                     | H3         | `M5` / `M8`                                   |
| `FS-AI-04`    | Agent + settings + prompts          | H1         | `M1`+`M5` / `M8`                              |
| `FS-HAND-01`  | Fifteen `HUMAN_REQUIRED` triggers   | H2         | `M5`                                          |
| `FS-HAND-02`  | Purchase collect → pending order    | H2         | `M6` / `M8`                                   |
| `FS-ORD-01`   | Orders + reservations               | H2         | `M6`                                          |
| `FS-CUST-01`  | Identity, profile, merge, lifecycle | H2         | `M6`                                          |
| `FS-NOTIF-01` | Four notification types             | H2, H4     | `M7` / `M8`                                   |
| `FS-ANL-01`   | Four KPIs                           | H2         | `M7` / `M8`                                   |
| `FS-BILL-01`  | Plans, usage, AI pause              | —          | `M7` / `M8`                                   |
| `FS-OBS-01`   | Actions, traces, feedback, evals    | H1         | `M5`                                          |
| `FS-AUD-01`   | Human audit + raw webhooks          | —          | `M1`+`M3`                                     |
| `FS-OPS-01`   | Compose, ECS, tenancy, launch gate  | —          | `M0`+`M9`                                     |

---

## 4. Identity, workspace, onboarding

### FS-AUTH-01 — Session

|                  |                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| **Problem**      | Merchants need a tenant-scoped account before any other gate (H3).                                      |
| **In**           | Register, login, refresh cookie `aisales_refresh`, logout, `GET /auth/me`, 5/min throttle, unique email |
| **Out**          | MFA (`W`). Should: forgot/reset (`T-AUTH-05`), Google (`T-AUTH-06`) — not launch-blocking               |
| **FR**           | FR-AUTH-001–005, 007, 009–011                                                                           |
| **US**           | US-A-01–03, A-05 (accept)                                                                               |
| **Tasks**        | `T-AUTH-01`–`04`, `T-WEB-01`, `T-WEB-05`                                                                |
| **API**          | `13` §4, §2.9                                                                                           |
| **UI**           | `22` auth; `23` `C-AUTH-*`. Full-bleed; register does **not** create a business                         |
| **Primary docs** | `17`                                                                                                    |

### FS-AUTH-02 — Public commercial landing page

|                  |                                                                                                                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**      | Prospective merchants and Meta App Reviewers need a public commercial entrypoint explaining the product, demonstrating bilingual sales agent capabilities in Derja/French, displaying ROI, and linking to auth and legal terms (H3).                                              |
| **In**           | Single-page public marketing route (`/`), marketing header (`C-MKT-01`), hero with value prop (`C-MKT-02`), interactive chat simulation (`C-MKT-03`), 4-pillar bento grid (`C-MKT-04`), compliance/trust footer (`C-MKT-05`), CTAs to `/login` and `/register`, responsive layout |
| **Out**          | Multi-page marketing CMS, blog/docs portal, interactive backend chat endpoint (simulation is client-side mock), payment gateway integration                                                                                                                                       |
| **FR**           | FR-AUTH-013                                                                                                                                                                                                                                                                       |
| **US**           | US-A-01                                                                                                                                                                                                                                                                           |
| **Tasks**        | `T-WEB-11`                                                                                                                                                                                                                                                                        |
| **API**          | None (static client-side marketing components; links to auth routes)                                                                                                                                                                                                              |
| **UI**           | `22` §3.4; `23` `C-MKT-*`. Public unauthenticated surface                                                                                                                                                                                                                         |
| **Primary docs** | `01` §4, `03` §3, `22` §3.4, `23` §3.1                                                                                                                                                                                                                                            |

### FS-BIZ-01 — Workspace seed

|                  |                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| **Problem**      | A business must exist with one agent, default `approval_required`, starter rules (H3).                 |
| **In**           | `POST /businesses`, profile GET/PATCH, seed `12` §19                                                   |
| **Out**          | `{ aiActivated: true }` on any client PATCH; ownership transfer (`W`); Should soft-delete (`T-BIZ-08`) |
| **FR**           | FR-BIZ-001–004, 006, FR-AI-001, FR-AI-011                                                              |
| **US**           | US-A-04                                                                                                |
| **Tasks**        | `T-BIZ-01`, `T-BIZ-02`                                                                                 |
| **API**          | `13` §5                                                                                                |
| **UI**           | `22` §4.1; `23` `C-ONB-01` step 1 / `C-SET-03`                                                         |
| **Primary docs** | `12` §19, `17`                                                                                         |

### FS-BIZ-02 — Team

|                  |                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------- |
| **Problem**      | Owner/Admin invite Admin or Employee (UI **Agent**); seats against plan (H3).            |
| **In**           | Invitations, members PATCH/DELETE, accept, `quota_exceeded`                              |
| **Out**          | Custom roles (`W`); second Owner; invite Owner                                           |
| **FR**           | FR-BIZ-010–012, 014, FR-AUTH-011. Should FR-BIZ-013 `lastActiveAt` if cheap (`T-BIZ-03`) |
| **US**           | US-A-05, A-06                                                                            |
| **Tasks**        | `T-BIZ-03`, `T-AUTH-03`, `T-WEB-10`                                                      |
| **API**          | `13` §5                                                                                  |
| **UI**           | `23` `C-SET-04/05`. Employee: do not mount `/settings`                                   |
| **Primary docs** | `17`                                                                                     |

### FS-BIZ-03 — Onboarding and activation

|                  |                                                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**      | Self-serve G1–G5 so live AI is not a silent disaster (H3).                                                                                                                                                          |
| **In**           | Server-side checklist; client PATCH onboarding **only** `{ handoffAcknowledged: true }`; `PATCH /integrations/live` `{ enabled: true }` → 422 `activation_not_ready` lists gates; G4 does **not** flip `reply_mode` |
| **Out**          | Skipping G4; Employee playground                                                                                                                                                                                    |
| **FR**           | FR-BIZ-020–026, FR-AI-011                                                                                                                                                                                           |
| **US**           | US-A-07–10                                                                                                                                                                                                          |
| **Tasks**        | `T-BIZ-04`, `T-BIZ-05`, `T-AI-06`, `T-AI-07`, `T-WEB-04`                                                                                                                                                            |
| **API**          | `13` §5, §10 live                                                                                                                                                                                                   |
| **UI**           | `22` §4; `23` `C-ONB-*` + `ActivationGate`. Optional auto_send toggle **off**                                                                                                                                       |
| **Primary docs** | `01` §14                                                                                                                                                                                                            |

### FS-FLAG-01 — Feature flags

|                  |                                                               |
| ---------------- | ------------------------------------------------------------- |
| **Problem**      | Kill-switch WhatsApp and advanced analytics without redeploy. |
| **In**           | Closed keys GET/PATCH (`13` §13)                              |
| **Out**          | Arbitrary keys (400); client-invented flags                   |
| **FR**           | FR-FLAG-001–004                                               |
| **US**           | US-G-07                                                       |
| **Tasks**        | `T-BIZ-06`                                                    |
| **API**          | `13` §13                                                      |
| **UI**           | None in `22` nav                                              |
| **Primary docs** | `14`                                                          |

---

## 5. Catalog and knowledge

### FS-CAT-01 — Variant catalog

|                  |                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| **Problem**      | AI cannot answer price/stock without priced variants (G1, H3).                                          |
| **In**           | Categories, products, variants, images → S3; `availableStock` computed; archive if on order             |
| **Out**          | Shopify/Woo (`W`); bulk edit (`C`); PATCH derived `availableStock`; Should merchandising (`FR-CAT-010`) |
| **FR**           | FR-CAT-001–009, 011–013                                                                                 |
| **US**           | US-B-01, B-02, B-04                                                                                     |
| **Tasks**        | `T-CAT-01`, `T-CAT-02`, `T-CAT-04`, `T-WEB-08`                                                          |
| **API**          | `13` §12                                                                                                |
| **UI**           | `22` §10; `23` `C-PROD-*`. Employee read-only                                                           |
| **Primary docs** | `12`                                                                                                    |

### FS-CAT-02 — CSV import

|                  |                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------- |
| **Problem**      | Primary catalog-loading path for non-technical merchants (H3).                      |
| **In**           | Template GET, import 202, poll, confirm 202; no writes until confirm; upsert by SKU |
| **Out**          | Google Sheets (`W`); silent import without preview                                  |
| **FR**           | FR-CAT-020–027                                                                      |
| **US**           | US-B-03                                                                             |
| **Tasks**        | `T-CAT-03`, `T-WEB-04` (`C-ONB-03`)                                                 |
| **API**          | `13` §12.2                                                                          |
| **UI**           | `22` §4.3; `23` `CsvImportWizard`                                                   |
| **Primary docs** | `13` §12.2                                                                          |

### FS-KNOW-01 — Business rules

|                  |                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| **Problem**      | Delivery/payment/returns must be data, not model inference (H1).                                                |
| **In**           | GET/POST new version; PATCH `enabled` / `effective_to` only; conflict → `policy_conflict`; default no discounts |
| **Out**          | PATCH `payload` in place; invented `fixedFee` field                                                             |
| **FR**           | FR-KNOW-001–005, 007–010. Should FR-KNOW-006 min-order                                                          |
| **US**           | US-B-05–08                                                                                                      |
| **Tasks**        | `T-KNOW-01`, `T-WEB-10` (`C-SET-06`)                                                                            |
| **API**          | `13` §12.4                                                                                                      |
| **UI**           | `22` §11; payload Zod `12` §14.8                                                                                |
| **Primary docs** | `12` §14.8, `05`                                                                                                |

### FS-KNOW-02 — Knowledge + embed

|                  |                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| **Problem**      | FAQ/policy text must retrieve, not be guessed (H1).                                                      |
| **In**           | Documents CRUD; index 201 `pending`; reindex 202; chunk+embed worker                                     |
| **Out**          | PDF/DOCX (`C`); website crawl (`W`)                                                                      |
| **FR**           | FR-KNOW-011–012, 014, FR-CAT-011                                                                         |
| **US**           | US-B-09, B-04                                                                                            |
| **Tasks**        | `T-KNOW-02`, `T-KNOW-03`                                                                                 |
| **API**          | `13` §12                                                                                                 |
| **UI**           | Settings knowledge if `23`/`22` list it; else API + indexing status copy only — **do not invent a page** |
| **Primary docs** | `15` RAG                                                                                                 |

---

## 6. Channels

### FS-INT-01 — Connect Meta

|                  |                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| **Problem**      | Nothing to be live on without an official Page + IG (G3, H3).                                                  |
| **In**           | OAuth, select Page(s), `channel_account`, encrypted tokens, health, disconnect, channel-limit `quota_exceeded` |
| **Out**          | WhatsApp connect; unofficial clients                                                                           |
| **FR**           | FR-INT-001–006, 012, FR-BILL-008                                                                               |
| **US**           | US-C-01–03                                                                                                     |
| **Tasks**        | `T-INT-01`, `T-INT-07`, `T-WEB-04` / `T-WEB-10` (`ChannelConnectCard` reused)                                  |
| **API**          | `13` §10                                                                                                       |
| **UI**           | `22` §4.2, §11 Canaux; `23` `C-ONB-02`                                                                         |
| **Primary docs** | `16`                                                                                                           |
| **External**     | `31` X1 Meta app review                                                                                        |

### FS-INT-02 — Ingest and deliver

|                  |                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**      | Never lose or duplicate a DM; never block webhook on AI (H1–H2).                                                                             |
| **In**           | Signed ingest, idempotent persist-then-200, canonical adapter, outbound retry/DLQ, inbound images stored and shown — behaviour in listed FRs |
| **Out**          | Provider fields on AI/inbox DTOs; unofficial WhatsApp clients                                                                                |
| **FR**           | FR-INT-007–011, 013, 031, FR-AUD-004                                                                                                         |
| **US**           | US-C-04, C-05                                                                                                                                |
| **Tasks**        | `T-INT-02`–`05`                                                                                                                              |
| **API**          | `13` §10                                                                                                                                     |
| **Primary docs** | `16`, `14`                                                                                                                                   |

### FS-INT-03 — WhatsApp stub

|                  |                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------- |
| **Problem**      | Phase 2 must not be a rewrite; MVP must not connect.                                         |
| **In**           | Adapter **folder stub**; `whatsapp_enabled` false; card disabled unless flag **and** account |
| **Out**          | Connect flow, templates, unofficial automation (`FR-INT-032`)                                |
| **FR**           | FR-INT-032 (M). FR-INT-014 / 020–030 are not MVP                                             |
| **US**           | US-C-06 (Phase 2)                                                                            |
| **Tasks**        | `T-INT-06`                                                                                   |
| **Primary docs** | `16`, `03` §7                                                                                |

---

## 7. Sales command center

### FS-CONV-01 — Inbox and human control

|                  |                                                                                                                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**      | Operators work triage, not a chat client (H4).                                                                                                                                                                                                                         |
| **In**           | `needs_me` \| `all`, `sort=sales_priority`, thread GET (does **not** mark read), POST read/messages/approve/retry/takeover/resume/assign/close/notes/suggest **202** / confirm-order; send = implicit takeover; 409 pending order on resume/close; timeline projection |
| **Out**          | `view=unread`; snooze/`SNOOZED`; `POST /orders/:id/confirm`; line-item PATCH; Clients/Commandes/Tableau de bord nav; payment-link chrome                                                                                                                               |
| **FR**           | FR-CONV-001–005, 007–008, 010–016, 019–021, 030–041, 043–044                                                                                                                                                                                                           |
| **US**           | US-D-01, D-03–10, D-15–18, D-20, C-07                                                                                                                                                                                                                                  |
| **Tasks**        | `T-CONV-01`–`05`, `T-WEB-03`, `T-WEB-06`                                                                                                                                                                                                                               |
| **API**          | `13` §6                                                                                                                                                                                                                                                                |
| **UI**           | `22` §5–8; `23` `C-INBOX-01`–`22`. Default chrome draft-to-approve. Playwright: takeover + approve + confirm                                                                                                                                                           |
| **Primary docs** | `14` state machine, `17` RBAC                                                                                                                                                                                                                                          |

### FS-LEAD-01 — Lead score

|                  |                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------- |
| **Problem**      | Heat without an LLM, never ahead of escalations (H4).                                   |
| **In**           | 0–100 + temperature + stored factors; nightly decay; thresholds on `PATCH /ai/settings` |
| **Out**          | LLM scoring (`W`); presenting score as a probability                                    |
| **FR**           | FR-LEAD-001–009                                                                         |
| **US**           | US-D-16, D-19                                                                           |
| **Tasks**        | `T-LEAD-01`, `T-AI-10` (thresholds)                                                     |
| **API**          | `13` §6 list DTO, §11 settings                                                          |
| **UI**           | `23` `TemperatureBadge`; explain affordance on `CustomerCard`                           |
| **Primary docs** | `14` §10                                                                                |

### FS-RT-01 — Realtime

|                  |                                                                                   |
| ---------------- | --------------------------------------------------------------------------------- |
| **Problem**      | Open inbox must move without refresh; REST stays source of truth (H4).            |
| **In**           | Socket.IO rooms (`13` §14); scoped subscribe; reconnect refetch; polling fallback |
| **Out**          | Data that exists only in a push payload; `/inbox/updates`                         |
| **FR**           | FR-RT-001–006, FR-CONV-005                                                        |
| **US**           | US-D-02, D-23                                                                     |
| **Tasks**        | `T-CONV-06`, `T-WEB-03` (`SocketStatus`)                                          |
| **API**          | `13` §14                                                                          |
| **UI**           | `22` §13                                                                          |
| **Primary docs** | `14`                                                                              |

### FS-PIPE-01 — Pipeline

|                  |                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------- |
| **Problem**      | Revenue view as a projection, not a second state machine (H4).                        |
| **In**           | `GET /pipeline` four columns; copy _en attente de confirmation_; click → `/inbox?id=` |
| **Out**          | PATCH; drag-to-advance (`W`); `/orders` nav (`FR-ORD-009` is API + this board)        |
| **FR**           | FR-CONV-050–053                                                                       |
| **US**           | US-D-21                                                                               |
| **Tasks**        | `T-CONV-07`, `T-WEB-07`                                                               |
| **API**          | `13` §7                                                                               |
| **UI**           | `22` §9; `23` `C-PIPE-*`                                                              |
| **Primary docs** | `13` §7                                                                               |

---

## 8. AI

### FS-AI-01 — Orchestrator and grounding

|                  |                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| **Problem**      | H1 fails if the model invents price, stock, fee, or policy.                                           |
| **In**           | Classify → tools → grounded reply; fallback then escalate; never send degraded; `ai_actions` + traces |
| **Out**          | Unpinned model ids; token streaming in UI; Employee traces                                            |
| **FR**           | FR-AI-020–029, FR-CAT-002, 013, FR-KNOW-009, FR-HAND-007                                              |
| **US**           | US-D-12–14, H-01, H-02                                                                                |
| **Tasks**        | `T-AI-01`, `T-AI-02`, `T-AI-05`, `T-AI-09`, `T-OBS-01`                                                |
| **API**          | No public “run orchestrator” route — inbound job (`16`/`14`)                                          |
| **Primary docs** | `05`, `15`, `11` §9.3                                                                                 |
| **External**     | `31` X3, X5                                                                                           |

### FS-AI-02 — Reply modes, drafts, suggest

|                  |                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Problem**      | New tenants must see drafts before customers do (H1, H4).                                                             |
| **In**           | Default `approval_required`; `auto_send` explicit; on-demand suggest **202**; suppress complaint 409; `ai_paused` 403 |
| **Out**          | G4 flipping `reply_mode`; suggest on open/keystroke; Should `draft_only` may omit radio (`23`)                        |
| **FR**           | FR-AI-010–012, 015–019, 020a, 020b. Should FR-AI-013–014                                                              |
| **US**           | US-D-10, D-20                                                                                                         |
| **Tasks**        | `T-AI-04`, `T-AI-08`, `T-AI-10`, `T-WEB-03`                                                                           |
| **API**          | `13` §6, §11                                                                                                          |
| **UI**           | `23` draft chrome + `[Suggérer]`; `C-SET-02`                                                                          |
| **Primary docs** | `05` §7 ladder                                                                                                        |

### FS-AI-03 — Playground

|                  |                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Problem**      | G4: owner sees the voice before customers (H3).                                                                  |
| **In**           | `POST /ai/playground` **202**; four canned + free-form; `source=playground`, `is_test`; never Meta; Employee 403 |
| **Out**          | Employee playground; KPI inclusion of playground rows (`12` §2.6)                                                |
| **FR**           | FR-AI-030–031, FR-BIZ-026                                                                                        |
| **US**           | US-A-08                                                                                                          |
| **Tasks**        | `T-AI-06`, `T-AI-07`, `T-WEB-04` (`C-ONB-04/05`)                                                                 |
| **API**          | `13` §11                                                                                                         |
| **UI**           | `22` §4.5                                                                                                        |
| **Primary docs** | `15`                                                                                                             |

### FS-AI-04 — Agent, settings, prompts

|                  |                                                                           |
| ---------------- | ------------------------------------------------------------------------- |
| **Problem**      | One agent; config takes effect next turn; prompts are immutable versions. |
| **In**           | `GET`/`PATCH /ai/agents/:id`, `/ai/settings`; POST new prompt row         |
| **Out**          | PATCH prompt content in place; unknown model id (400); multi-agent (`W`)  |
| **FR**           | FR-AI-002–004, 006–007, 010, 025–027. Should FR-AI-005                    |
| **US**           | US-D-11, G-08                                                             |
| **Tasks**        | `T-AI-03`, `T-AI-10`, `T-WEB-10` (Personnalité inputs, no extra `C-*`)    |
| **API**          | `13` §11                                                                  |
| **UI**           | `22` §11; `23` §9.3                                                       |
| **Primary docs** | `15` prompts                                                              |

---

## 9. Handoff and commerce

### FS-HAND-01 — Fifteen triggers

|                  |                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| **Problem**      | Escalation is a state transition with a briefing, not a vibe (H2).                                 |
| **In**           | All 15 triggers; reason + priority; briefing schema; `ai_enabled=false`; summary job; notify event |
| **Out**          | Email/SMS/push (`W`); improvising a 16th trigger                                                   |
| **FR**           | FR-HAND-001–007, FR-CONV-019–020                                                                   |
| **US**           | US-E-10, D-04, D-05, H-04                                                                          |
| **Tasks**        | `T-HAND-01`, `T-NOTIF-01`                                                                          |
| **API**          | thread DTO `handoffContext` (`13` §6)                                                              |
| **UI**           | Pane 3 briefing; traces Owner/Admin only (`23`)                                                    |
| **Primary docs** | `06`, `14`                                                                                         |

### FS-HAND-02 — Purchase path

|                  |                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| **Problem**      | H2: AI qualifies, human confirms — no payment promise.                                                       |
| **In**           | Collect one field/turn → reserve → pending order → handoff → staff confirm from conversation                 |
| **Out**          | Payment links; `POST /orders/:id/confirm`; failed confirm line-item editor (`22` §16.3 = `[Réessayer]` only) |
| **FR**           | FR-HAND-008–010                                                                                              |
| **US**           | US-E-01–06, H-03                                                                                             |
| **Tasks**        | `T-HAND-02`, `T-WEB-03` confirm control                                                                      |
| **API**          | `13` §6 confirm-order, §8                                                                                    |
| **UI**           | `22` §8 order desk; `23` confirm card + optional COD `paymentStatus`                                         |
| **Primary docs** | `06` purchase, `05`                                                                                          |

### FS-ORD-01 — Orders and stock

|                  |                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**      | Last unit must not sell twice; four statuses only (H2).                                                                                            |
| **In**           | Create/confirm/cancel/complete; optional `paymentStatus`; Idempotency-Key; TTL 30 min + sweep; `GET /orders` (`inbox.read`); manual `POST /orders` |
| **Out**          | Item PATCH; fulfilment statuses (`W`); Commandes nav                                                                                               |
| **FR**           | FR-ORD-001–012                                                                                                                                     |
| **US**           | US-E-02, E-06–09                                                                                                                                   |
| **Tasks**        | `T-ORD-01`–`04`                                                                                                                                    |
| **API**          | `13` §8                                                                                                                                            |
| **UI**           | Pane 3 + pipeline; **no** `/orders` page (`22` §3.2)                                                                                               |
| **Primary docs** | `12`, `14` jobs                                                                                                                                    |

### FS-CUST-01 — Customers

|                  |                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Problem**      | Same platform id is the same person; fuzzy merge is a support incident.                                                |
| **In**           | Identity match; verified-phone auto-link; PATCH profile/tags/VIP/notes; Owner/Admin merge + audit; lifecycle → AI tone |
| **Out**          | Clients nav; fuzzy auto-merge; Employee merge; Should export (`US-F-04` / FR-CUST-009)                                 |
| **FR**           | FR-CUST-001–008, 010–011                                                                                               |
| **US**           | US-F-01–03, F-05                                                                                                       |
| **Tasks**        | `T-CUST-01`–`04`                                                                                                       |
| **API**          | `13` §9                                                                                                                |
| **UI**           | `23` `CustomerCard` (Pane 3). Merge UI: extend that card or add a `C-*` in `23` **first**                              |
| **Primary docs** | `12`, `05` lifecycle tone                                                                                              |

### FS-NOTIF-01 — Notifications

|                  |                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------- |
| **Problem**      | Interrupt only when a human must act (H2, H4).                                           |
| **In**           | Four types; dedupe/hour; collapse hot leads; GET/PATCH read/read-all; `notification.new` |
| **Out**          | Notify on routine AI; email/SMS/push (`W`)                                               |
| **FR**           | FR-NOTIF-001–005, 010–014. Should FR-NOTIF-006 if socket ships                           |
| **US**           | US-E-05, D-22                                                                            |
| **Tasks**        | `T-NOTIF-01`–`02`, `T-WEB-02` (`NotificationPanel`)                                      |
| **API**          | `13` §13                                                                                 |
| **UI**           | `22` §15; `23` `NotificationPanel` + shell badge                                         |
| **Primary docs** | `14`                                                                                     |

---

## 10. Platform, observability, ops

### FS-ANL-01 — Four KPIs

|                  |                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Problem**      | Prove H2 with four counters, not a BI suite.                                                                      |
| **In**           | `analytics_daily` rollup (business TZ); `GET /analytics/overview`; AI/human **breakdown** inside messages handled |
| **Out**          | Fifth tile (revenue, CSAT, cost, latency); live table scans                                                       |
| **FR**           | FR-ANL-001–004                                                                                                    |
| **US**           | US-G-01                                                                                                           |
| **Tasks**        | `T-ANL-01`–`02`, `T-WEB-09`                                                                                       |
| **API**          | `13` §13                                                                                                          |
| **UI**           | `22` §12; `23` four `KpiCard` + one chart. Page owns the GET                                                      |
| **Primary docs** | `01` §15                                                                                                          |

### FS-BILL-01 — Usage and pause

|                  |                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Problem**      | Hard limits pause AI; humans still reply.                                                                                         |
| **In**           | Plans + subscription seed; `usage_events`; `GET /usage` **Owner**; 80/95; `ai_paused` 403; `GET /ai/usage` Owner cost (not a KPI) |
| **Out**          | Stripe HTTP; Admin/Employee `/usage`; self-serve upgrade (`S`)                                                                    |
| **FR**           | FR-BILL-001–008, 010                                                                                                              |
| **US**           | US-G-02, G-03                                                                                                                     |
| **Tasks**        | `T-BILL-01`–`04`, `T-WEB-02` (`PlanUsageCard` Owner), `T-WEB-10` Facturation                                                      |
| **API**          | `13` §13, §15                                                                                                                     |
| **UI**           | `23` `C-SET-07`                                                                                                                   |
| **Primary docs** | `14` billing jobs                                                                                                                 |

### FS-OBS-01 — Observability

|                  |                                                                       |
| ---------------- | --------------------------------------------------------------------- |
| **Problem**      | “Why did it transfer?” must have an answer (H1).                      |
| **In**           | Tool logs, traces, feedback enum, `ai_evaluations` (FR-AI-032)        |
| **Out**          | Employee traces; cost tile on `/analytics`; automated fine-tune (`W`) |
| **FR**           | FR-OBS-001–004, 006–008, 011                                          |
| **US**           | US-G-04, G-05, G-10, D-04                                             |
| **Tasks**        | `T-OBS-01`–`02`, `T-WEB-03` (`MessageFeedback`)                       |
| **API**          | `13` §6 feedback, §11 traces/feedback                                 |
| **Primary docs** | `15`                                                                  |

### FS-AUD-01 — Audit

|                  |                                                                                |
| ---------------- | ------------------------------------------------------------------------------ |
| **Problem**      | Human/security/money actions are not `ai_actions`.                             |
| **In**           | Audit writer; raw webhook retain                                               |
| **Out**          | Audit list page (Should FR-AUD-002 — not in `22` nav); AI rows in `audit_logs` |
| **FR**           | FR-AUD-001, 003–004                                                            |
| **US**           | BAC-9                                                                          |
| **Tasks**        | `T-BIZ-07`, `T-INT-02`                                                         |
| **API**          | `13` §13                                                                       |
| **Primary docs** | `17`                                                                           |

### FS-OPS-01 — Run and launch

|                  |                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------- |
| **Problem**      | Local one-command; prod three Fargate services; `03` §10 is the definition of done.     |
| **In**           | Compose seed; ECS ×3; CI; tenancy matrix; fault injection; runbook; `T-OPS-07` sign-off |
| **Out**          | K8s, NAT Gateway, VPS                                                                   |
| **FR / NFR**     | `03` §10; NFR-OPS-_, NFR-SEC-04–05, NFR-REL-_                                           |
| **US**           | US-G-09                                                                                 |
| **Tasks**        | `T-BOOT-*`, `T-OPS-01`–`07`                                                             |
| **Primary docs** | `18`, `31` `M0`/`M9`                                                                    |
| **External**     | `31` X2, X4                                                                             |

---

## 11. `03` §5 coverage

Every in-scope capability row maps to ≥1 `FS-*`. `W` rows have no feature.

| `03` §                    | Features                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| 5.1 Identity / onboarding | `FS-AUTH-01`, `FS-BIZ-01`–`03`, `FS-AI-03`                        |
| 5.2 Catalog / knowledge   | `FS-CAT-01`–`02`, `FS-KNOW-01`–`02`                               |
| 5.3 Channels              | `FS-INT-01`–`03`                                                  |
| 5.4 AI                    | `FS-AI-01`–`04`, `FS-OBS-01`                                      |
| 5.5 Command center        | `FS-CONV-01`, `FS-LEAD-01`, `FS-RT-01`, `FS-PIPE-01`              |
| 5.6 Commerce              | `FS-HAND-01`–`02`, `FS-ORD-01`, `FS-CUST-01`, `FS-NOTIF-01`       |
| 5.7 Platform              | `FS-ANL-01`, `FS-BILL-01`, `FS-OBS-01`, `FS-FLAG-01`, `FS-AUD-01` |
| 5.8 Deploy                | `FS-OPS-01`                                                       |

---

## 12. Open questions

None that unblock the join. `OQ-07` (`draft_only`) = Should on `FS-AI-02`. `OQ-21` (manual orders on pipeline) = `FS-PIPE-01` at `M6`. Knowledge **page** not in `22` nav: do not invent one for `FS-KNOW-02`.

---

## 13. References

- `docs/00_product/03_MVP_SCOPE.md` — in-scope capabilities
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` — FR register
- `docs/00_product/02_USER_STORIES.md` — AC
- `docs/30_execution/30_TASKS.md` — `T-*`
- `docs/30_execution/31_IMPLEMENTATION_PLAN.md` — milestones
- `docs/10_engineering/13_API_DESIGN.md` — routes
- `docs/20_design/22_UX_FLOWS.md` — screens
- `docs/20_design/23_UI_COMPONENTS.md` — `C-*`
- `docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md` / `06_AI_HUMAN_HANDOFF_RULES.md`
