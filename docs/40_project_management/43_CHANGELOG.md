# Documentation & architecture changelog

## 2026-09-04 (Public landing page scope & backlog addition)

**Added — `01_PRODUCT_REQUIREMENTS.md` (FR-AUTH-013):** Public commercial landing page requirement at `/` presenting value proposition, bilingual (Tunisian Derja / French) chat qualification preview, 4-KPI ROI, and navigation to `/login` and `/register`.
**Added — `03_MVP_SCOPE.md` (§4 & §5.1):** Public landing page included in Phase 1 MVP scope; updated §11 non-goals to distinguish complex marketing CMS (non-goal) from the focused commercial single-page landing page.
**Added — `22_UX_FLOWS.md` (§3.4):** Specification for public commercial landing page flow, including `MarketingHeader`, `LandingHero`, `InteractiveChatDemo`, `BentoFeatures`, and `MarketingFooter` with Meta compliance legal links.
**Added — `23_UI_COMPONENTS.md` (`C-MKT-01`–`05`):** Closed component inventory registered for marketing domain components in `apps/web/src/components/marketing/`.
**Added — `32_FEATURE_SPECIFICATIONS.md` (`FS-AUTH-02`):** Feature specification card for public commercial landing page.
**Added — `30_TASKS.md` & `backlog/` (`T-WEB-11`):** Created task `T-WEB-11` in Wave 9 (`W09-web-p1-p2`) with allowlisted paths, acceptance criteria, and dependency on `T-WEB-10`. Refreshed backlog index and verified topological graph.

## 2026-08-25 (Fastify adapter)

**Added — `40_DECISIONS.md` `ADR-025`:** Nest HTTP runs on `@nestjs/platform-fastify`. Supersedes the "Fastify in MVP" reject in `ADR-016` / `11` §2.1. The original rationale ("second adapter, second file-upload story") no longer holds: uploads are S3 presigned `PUT` plus CSV-in-JSON, so there is no multipart parser to port, and Socket.IO attaches to Fastify's raw `http.Server` unchanged. **Added — `11_TECH_STACK.md` §5.3:** Fastify adapter rules — `FastifyRequest`/`FastifyReply` only (never `express`), no `request.path` (use `requestPath`), no `request.secure` (use `isSecureRequest`), `reply.header` not `setHeader`, `reply.redirect(url, code)` url-first, cookie `maxAge` in **seconds**, `rawBody: true` for Meta HMAC, `bodyLimit` on the adapter, `trustProxy` on. **Changed — `11` §5.1:** package table now lists `@nestjs/platform-fastify`, `fastify`, `@fastify/{cookie,helmet,compress,cors}`; `nestjs-pino` → `pino` (Fastify logs through the same instance, so request logging needs no middleware); `helmet` → `@fastify/helmet`. **Changed — `11` §2.1 / §13:** `backend` pin is the Fastify adapter; the reject row now reads Express → Fastify. **Changed — `13_API_DESIGN.md` §2.1:** request size is Fastify `bodyLimit` (512 KB, sized for the Meta webhook) not "Nest/Express body parser + multer"; per-surface caps stay in Zod and `MetaHmacGuard`; `Multipart` row replaced by the presigned-S3/CSV-in-JSON reality; `X-Request-Id` is honoured, generated and echoed via `genReqId`. **Changed — `17_SECURITY_DESIGN.md` §10:** `helmet` → `@fastify/helmet` with `contentSecurityPolicy: false`; auth flood keys on `request.ip` (proxy-resolved), never the raw `X-Forwarded-For`.

**Added — `42_TECH_DEBT.md` `TD-015`–`TD-017`:** (015, **High**) two parallel tenancy models — Better Auth `organization`/`member` alongside `business_members`/`role`; isolation holds because every tenant-owned query is scoped by a server-verified `business_id`, but writes have two sources of truth. (016) `@nestjs/swagger`, `@nestjs/config`, `@nestjs/terminus`, `@nestjs/throttler`, `nestjs-zod` are pinned in `11` but not installed, so `13` §1's generated OpenAPI and `18`'s `/health/live`+`/health/ready` are unmet. (017) guards declare `@Optional() prismaClient?: PrismaClient` behind an `import type`, so the metadata is erased and DI never injects it.

**Not changed:** no route, DTO, table or widget was added or renamed. `12`, `14`, `15`, `16`, `20`–`23`, `30`–`32` are untouched — the adapter swap is not a product change.

---

## 2026-08-17 (brain dump location)

**Moved — `AI_Sales_Agent_Brain_Dump.md`:** from repo root to **`docs/AI_Sales_Agent_Brain_Dump.md`**. Numbered files remain generated exports. **Changed —** `docs/README.md` file map, `00` canonical map, and upstream/reference locators across `00`–`06`, `10`–`18`, `20`–`23`, `30`–`32`, `40`–`41` to `docs/AI_Sales_Agent_Brain_Dump.md`. Historical changelog entries keep the old root path.

---

## 2026-08-16 (backlog review)

**Changed — [`backlog/`](../../backlog/):** required leaves no longer `depends:` on optional Should children (`T-AI-10/c`, `T-AI-04/c`). `INDEX.md` is a status snapshot (`--refresh`); IDs link to cards. `T-BOOT-01/a`–`/b` `done_cmd` no longer runs `tsc` before install. Jest `done_cmd` no longer uses `--passWithNoTests`. `T-WEB-01/d` is the Should auth UI. `T-OPS-07` `done_cmd` is `--check-launch`. Parallel work does not steal `CURSOR.md`. Remaining empty: `07`, `24`.

## 2026-08-16 (backlog)

**Added — [`backlog/`](../../backlog/):** live coding board. Phase 1 is 89 parent `T-*` from `30` split into session leaves (S/M = one leaf; L = 2–4; XL = 4–8). Resume is [`backlog/CURSOR.md`](../../backlog/CURSOR.md) at `T-BOOT-01/a`. Phases 2–5 are blocked `PHASE.md` stubs (no invented WhatsApp/Shopify/Stripe cards). Child ids (`T-BOOT-01/a`) live only here. **Changed — `30`, `31`, `docs/README.md`, `AGENTS.md`:** `30` is the parent-id + FR catalog; do not run a parallel sprint board. Remaining empty: `07`, `24`.

## 2026-08-16 (42_TECH_DEBT)

**Added — `42_TECH_DEBT.md`:** accepted MVP shortcuts `TD-001`–`014` (KPI cancel-after-confirm, plaintext PII, no timed purge, no outbox, RLS off, search 501, knowledge docs without a page, hot messages, AWS “not now”, etc.) with cost / trigger / repayment. Roadmap exclusions (WhatsApp, Stripe, fifth KPI) are **not** debt. Remaining empty: `07`, `24`.

## 2026-08-16 (41_ASSUMPTIONS)

**Added — `41_ASSUMPTIONS.md`:** OQ index (Brain Dump gaps), founder-confirm list, build-now product assumptions. **Resolved conflicts:** C-1 auto-close = 30 days, 7-day warning Phase 2 (`06`); C-2 suggestions = explicit click not on open (`01` OQ-16 / `23`); C-3 `31` calendar OQs retagged **OQ-78–81** (`05` keeps OQ-31–34). **Changed — `01` OQ-09, `05` §14.2 + OQ-33, `31`, `40`:** losers patched to the winners. Remaining empty: `07`, `24`, `42_TECH_DEBT.md`.

## 2026-08-16 (40_DECISIONS)

**Added — `40_DECISIONS.md`:** ADR index (`ADR-001`–`024`) for already-frozen choices (Brain Dump `# Final Decisions`, `00` §5, Option C, stack/UI/model pins, G4 ≠ `reply_mode`, four KPIs, Owner-only `/usage`). Detail stays in the canonical engineering/design files; this file does not copy `11` pin tables. New stack/model changes still require an ADR here first (`11` §1). **Not filled:** `07`, `24`, `41_ASSUMPTIONS.md`, `42_TECH_DEBT.md`.

## 2026-08-16 (32 review — valid only)

**Changed — `32_FEATURE_SPECIFICATIONS.md`:** `Out` is the non-goals field; merchant-visible success stays `02` + `22` §17; feature order stays `30` `T-*` depends (no `FS-*` graph); tokens stay `20` (no `25_DESIGN_TOKENS`); internals stay `10`/`14`/`15`/`16`. `FS-INT-02` **In** shortened to FR pointers. Not added: per-card success stories, invented service-class bans, a 5-step load ritual on every card.

## 2026-08-16 (32_FEATURE_SPECIFICATIONS)

**Added — `32_FEATURE_SPECIFICATIONS.md`:** Phase 1 `FS-*` join table (problem → FR / US / `T-*` / `13` / `22` / `23` / `31` milestone). Does not copy AC, routes, or widgets. Knowledge documents stay API-only until `22`/`23` add a `C-*` (no invented page). **Changed — `10`, `12`, `03`, `README`, `30`, `31`:** `32` is no longer export-pending. Remaining empty: `07` (glossary `00` §14), `24` (needs visual assets).

## 2026-08-16 (30/31 review — valid only)

**Changed — `30_TASKS.md`:** external calendar waits (Meta, AWS, models, partners, golden-set authoring) live in `31` §8 — not `X-*` on the task register. `T-WEB-01` / `T-WEB-05` may start after `W1` on the real auth API; no MSW / fixture-only `WEB-CONTRACT` wave. **Changed — `31_IMPLEMENTATION_PLAN.md`:** same web overlap; dedicated Lane C / `M8` still cannot close until `M4`–`M6`. Not added: owner/risk columns, per-task evidence packs, AI velocity model, dotted `T-AI-01.a` ids, founder hour budgets, invented rollback SLOs.

## 2026-08-16 (31_IMPLEMENTATION_PLAN)

**Added — `31_IMPLEMENTATION_PLAN.md`:** Phase 1 schedule for the `30` register — capacity model (2 EE baseline, 9 ed/week, 268 ed, 30 build weeks + 2 buffer), lanes A/B/C/X, milestones `M0`–`M9` with demos, critical path (~18 serial weeks), long-lead externals (Meta app review from `wk 3`, three design partners from `wk 12`), compression levers, launch-gate mapping to `03` §10, re-planning rules. Weeks are **relative**; the `wk 1` anchor date is unset (OQ-31) — no calendar dates are invented. `M3` runs on the Meta test app over a tunnel (`18` §3); production hosting stays in `M9`; no `30` wave is reordered. `03` OQ-21 → `M6`, OQ-23 → `M3`. **Changed — `10`, `12`, `README`, `30`:** `31` is no longer export-pending. Remaining empty: `07`, `24`, `32`.

## 2026-08-15 (30_TASKS)

**Added — `30_TASKS.md`:** Phase 1 work breakdown (`T-*` ids), sizes, dependencies, waves W0–W10, FR coverage for every **M** requirement (including `FR-AI-020a/b` and agent/settings `T-AI-10`). Scaffold follows `11`; UI tasks bind `23` `C-*` / query owners; no WhatsApp connect, Stripe, snooze, fifth KPI, or `/orders` nav. Pipeline GET and purchase collect sit in W6 after orders. **Changed — `10`, `11`, `12`, `23`, `README`:** `30` is no longer empty. Next fill is `31_IMPLEMENTATION_PLAN.md` (calendar). `24` stays empty until visual assets exist. `07` stays empty (glossary in `00` §14).

## 2026-08-15 (23 query/file/shell)

**Changed — `23_UI_COMPONENTS.md`:** one query owner per resource (TanStack Query; no parent+child double fetch); file name = `C-*` export in the owner folder; below `lg` sidebar is a header `[≡]` `Sheet` at `--z-overlay` (no swipe); `lg` icon-only `64px`; Employee settings nav hidden; `ErrorBanner` maps `13` §2.6 hints (no second status table); Storybook/Zustand forbidden; order lines from `GET /orders/:id`. **Changed — `22`, `20`:** same sidebar breakpoints; AI bubbles `--surface-subtle`; resume chrome from thread GET not `/ai/settings`; PlanUsage Owner-only.

## 2026-08-15 (23 stability)

**Changed — `23_UI_COMPONENTS.md`:** agents must not rename/merge/split `C-*` without updating this file first; implement order is inventory → `22` → `20` → `13`. List-row fields point at `13` §3.3 (no second DTO). Auth stays in `components/auth/`. Do not split `23` into child files. Widget→route bindings stay here.

## 2026-08-15 (23 missing inventory)

**Added — `23_UI_COMPONENTS.md`:** remaining `C-*` bound to frozen `13`/`22`: full-bleed auth (`LoginForm`, `RegisterForm`, `AcceptInviteForm`; Should forgot/reset), `NotificationPanel`, inbox `[Info]` / `[Suggérer]` / mark-read / `AssignControl` / `CloseThreadButton` / `MessageFeedback`, optional COD `paymentStatus` on confirm, settings Général / Canaux (reuse `ChannelConnectCard`) / Règles / Équipe / Facturation (`GET /usage` Owner-only, no Stripe). **Changed — `22` §16.3:** failed confirm recovery is `[Réessayer]` only (no line-item adjust). Next fill remains `24_REFERENCE_SCREENS.md` (empty) or `30_TASKS.md`.

## 2026-08-15 (23_UI_COMPONENTS)

**Added — `23_UI_COMPONENTS.md`:** canonical operator component inventory (`C-*` ids), shadcn/Base UI (not Radix) primitive map, prop contracts from `13` DTOs, inbox chrome (draft-to-approve default, no snooze, no Employee playground), shell/onboarding/pipeline/catalog/settings/analytics widgets, empty/error/loading rules, `next-intl` namespaces. Domain ownership, composition trees, `22` §18 priority mapping, operator-density invariant. **Corrected — contract review:** `senderType=human` (not `user`); inbox chrome derived from thread DTOs (not `GET /ai/settings`); `HUMAN_REQUIRED` keeps takeover toolbar (drafts stay on bubbles); tabs `needs_me`/`all` only; no line-item PATCH; `MoneyText` string amounts; `PlanUsageCard` / `GET /usage` Owner-only (`usage.read`); AI bubbles use `--surface-subtle` not an unnamed navy tint; `StatusPill`/`TemperatureBadge`/`ChannelBadge` in inventory; no extra Button `link` variant. **Changed — `00`, `10`, `12`, `20`, `21`, `22`, `README`:** `23` is no longer export-pending. Inbox sheets use `--z-overlay` (`20` §6.2). `24` consumes `20` + `22` + `23` `C-*` names. Next fill is `24_REFERENCE_SCREENS.md` (empty placeholder; fill when visual assets exist). Next _generated_ doc after design remains execution (`30`) unless screenshots land first.

---

## 2026-08-15 (docs consistency pass before 23)

**Changed — consistency pass:** snooze/`SNOOZED` removed from MVP UX in `22` §6.1 (archived = `RESOLVED` / closed only). US-A-08: Employee cannot open the playground (`ai.playground` 403). `21` §6.2 defers confidence to `05` §7 (no hard-coded 0.6). Design metadata un-cycled: `21` consumed by `20`/`22`/`23`/copy; `20` depends on `21`; `05` owns customer-facing AI voice. OQ-01 pinned to `fr-TN` / `ar-TN` / `en`. OQ-02: billing may be TND or EUR/USD; chrome stays `DT`. Glossary “Sales priority” matches two active tiers + archived `RESOLVED`. `21` §8 keeps emotional purpose; hex stays in `20`. Operator briefing samples in `05`/`06` use `DT` (JSON snapshots keep `"currency": "TND"`).

**Pinned — FR-AI-011:** G4 unblocks live AI; it does **not** flip `reply_mode`. New tenants stay `approval_required` until Owner sets `auto_send` (step 6 optional toggle or Settings). `22` post-activation inbox shows draft-to-approve as default chrome.

**Added — empty placeholders restored:** `00_product/07_DOMAIN_MODEL.md`, `20_design/24_REFERENCE_SCREENS.md`. Not filled. Do not create filled `23` in this pass.

---

## 2026-08-15 (22_UX_FLOWS consistency)

**Changed — `22_UX_FLOWS.md`:** aligned with frozen `13` / `14` / `17` / `20` / `05`: permission matrix (no Employee playground or `catalog.write`); activation via `PATCH /integrations/live`; confirm/cancel via `13` §6.2/§8; suggestions on-demand **202**; confidence ladder from `05` §7 (no 0.80/0.60 bands); pipeline columns from `13` §7; socket events + refetch from `13` §14 (no `/inbox/updates`); inbox breakpoints match `20` §7 (`xl` 3-pane, `lg` 2-pane+sheet, below `lg` stack); tokens `--color-canvas` / `--surface-selected`; analytics four KPIs with no revenue tile. **Changed — `00` / `01`:** stale “export pending” onboarding pointers.

---

## 2026-08-15 (22_UX_FLOWS lock)

**Changed — `22_UX_FLOWS.md`:** locked v1. Added UX anti-patterns (§2.2), visual interpretation rules (§18.3), shared reference-data fixture requirements (§18.4). Renamed “two-tier sort” to **conversation priority model**: two active tiers + archived (resolved/snoozed) tier. Next fill remains `23_UI_COMPONENTS.md`; `24_REFERENCE_SCREENS.md` consumes the P0–P2 coverage list.

---

## 2026-08-15 (22_UX_FLOWS freeze)

**Added — `22_UX_FLOWS.md`:** canonical specification for screen flows, layout mechanics, triage queues, and interactive workflows. Detailed:

- Application shell (`GlobalHeader` 56px dark navy `var(--color-header)`, `AppSidebar` 240px with plan/quota progress).
- UX Psychology Principles (§2.1: Reduce Cognitive Load, Preserve Human Agency, Progressive Disclosure, Trust Through Transparency, Calm Productivity).
- Role-based UX access & permission matrix (`owner`, `admin`, `employee`) + explicit Employee AI Playground boundary & restrictions.
- 6-step guided onboarding checklist, activation gates (G1–G5), CSV import pipeline & pre-flight error table, and AI Playground testing sandbox.
- Sales Command Center (3-pane layout: 28% triage list, 44% chat transcript, 28% context & action deck).
- Two-tier triage sorting algorithm (Tier 1: Escalations by priority & waiting time; Tier 2: AI handling by temperature, score, recency; Tier 3: Resolved/hidden).
- Autonomy controls (Takeover, pause, resume, implicit send takeover), AI confidence & uncertainty UX states, AI suggestion panel with grounding & complaint suppression, order confirmation/cancellation deck (`tel:` link, reservation release), timeline activity stream.
- Lead intelligence popover rendering backend factors without duplicating scoring formula weights (canonical in `14` §6).
- 4-column sales pipeline Kanban view projected from conversation/order states.
- Catalog & variant management with quick stock adjustments, business rules & AI personality configuration, 4-KPI analytics dashboard.
- Real-time Socket.IO event matrix, optimistic outbound updates, and connection degradation fallbacks.
- Breakpoint matrix (desktop ≥1280px 3-pane, tablet 768–1279px 2-pane + drawer, mobile <768px single-pane drilldown stack), notification discipline (only 4 triggers, deduplication, batching).
- UI States: Empty & degraded states, loading skeleton/spinner feedback patterns, and Error Recovery Patterns (§16.3).
- Golden User Journeys (1: First Sale, 2: Daily Operator Workflow, 3: Channel Reconnection).
- Reference Screen Coverage Requirements prioritized into P0, P1, and P2 tiers for `24_REFERENCE_SCREENS.md`.
- Accessibility & Ergonomics Standards (WCAG 2.1 AA keyboard nav, Cmd+K, focus rings, screen reader labels, reduced motion).

**Changed — `00`, `06`, `10`, `12`, `20`, `21`, `README`:** updated cross-references from `22_UX_FLOWS.md (export pending)` to canonical `22_UX_FLOWS.md`. Next document to generate is `23_UI_COMPONENTS.md`.

---

**Added — `21_BRAND_STRATEGY.md`:** canonical brand positioning, archetype (Competent Commercial Partner), psychological design foundations (Control, Trust, Cognitive Ease, Competence), personality spectrum (More Professional/Intelligent/Calm/Reliable/Practical vs Less Playful/Experimental/Entertaining/Futuristic/Emotional), dual-voice architecture (French B2B operator platform vs. Tunisian Arabic / Derja / Arabizi customer-facing AI), tone across UI states, platform terminology closed glossary, localized trust framework for Tunisian/MENA social commerce (4-line trust footer, DT currency formatting, silence guarantee), brand anti-patterns (no "AI magic", no fake urgency, no confetti, no startup clichés), commercial brand name criteria (OQ-76), and copy rules for coding agents.

**Changed — `00`, `01`, `10`, `12`, `20`, `README`:** updated cross-references from `21_BRAND_GUIDELINES.md` to `21_BRAND_STRATEGY.md`. Dependency direction aligned (`00` product docs → `21_BRAND_STRATEGY.md` → `20_DESIGN_SYSTEM.md` & `22_UX_FLOWS.md`). `22_UX_FLOWS.md` is next.

---

**Changed — `20_DESIGN_SYSTEM.md`:** shadcn `--accent` is zinc hover (lime is `--primary` / `--color-accent` only). Lead temperature is word+icon, not `--surface-selected`. Overlay z-index 15 (below header). Named danger/accent-active tokens. Four KPIs named from `01` §15. `dir="auto"` on bubbles. 375 is QA width, not a Tailwind `xs`. No token streaming (`15`).

---

## 2026-08-15 (placeholder 07 + 24)

**Added — empty placeholders:** `00_product/07_DOMAIN_MODEL.md`, `20_design/24_REFERENCE_SCREENS.md`. Not filled. Glossary remains `00` §14; columns remain `12`; screens remain `22`/`23` until those exports. Next fill is `21_BRAND_STRATEGY.md`.

---

## 2026-08-14 (20_DESIGN_SYSTEM freeze)

**Changed — `20_DESIGN_SYSTEM.md`:** frozen as operator UI tokens v1. Added surface tokens, control-state mapping (selected row ≠ primary fill), z-index scale, overflow rules, control heights 40/36/44. Inbox panes stay ~28/44/28 **inside main**; pixel contract remains `22`. Nav labels marked `fr-TN` reference, not JSX literals.

---

## 2026-08-14 (20_DESIGN_SYSTEM)

**Added — `20_DESIGN_SYSTEM.md`:** canonical operator UI tokens — shadcn **vega** + Base UI + Lucide; zinc neutrals; lime-400 `#A3E635` accent fill only (navy on lime); dark header `#0B1220`; IBM Plex Sans + IBM Plex Sans Arabic (BFS scaffold `noto-sans` then replace); radius `0.5rem`; `fr-TN` / RTL logical CSS; no Framer Motion; no app-wide dark mode in MVP. Inbox flows stay in `22`.

**Changed — `11`:** shadcn style/icon/color/font/radius no longer “wait for 20”. **Changed — `10` / `12` / `01` NFR-UX-11 / `00`:** `20` is canonical; `21`–`23` still export-pending.

---

## 2026-08-14 (16_INTEGRATION_DESIGN persist table + deauthorize)

**Changed — `16_INTEGRATION_DESIGN.md`:** webhook persist policy is table-driven (ignored WA = no row; unknown page = row + `processed_at=now()`, no enqueue). App deauthorized / permission revoked / page removed use the same `error` path as Graph `#190`, not only send-time 401. Deauthorize callback `signed_request` on `/webhooks/meta/deauthorize`. Lifecycle parsed in UnifiedMessaging, not `ChannelAdapter`. Reconnect refreshes `authorized_meta_user_id`. One deauthorize POST = one event row (worker marks all matching accounts). **Changed — `12`:** `authorized_meta_user_id` + lookup index. **Changed — `13` / `14` / `18`:** deauthorize route; HTTP sequence defers to the persist table.

---

## 2026-08-14 (17_SECURITY_DESIGN)

**Added — `17_SECURITY_DESIGN.md`:** canonical authN/Z — HS256 access/refresh (no `business_id` in access JWT), host-only refresh cookie, family rotation + reuse revoke, argon2id, RBAC guards from `13` codes (no grant cache), SM page tokens, no field encryption / no RLS / no access denylist in MVP, PII log+prompt rules, customer erase, SSRF on media fetch, audit must-write list.

**Changed — `12`:** `customers.erased_at`; OQ-54 = no RLS in MVP. **Changed — `13`:** `customers.erase`, handshake `businessId`, export registered before `/:id`. **Changed — `10` / `14` / `15` / `16` / `18` / `00` / `03`:** `17` is no longer export-pending; occupancy checks tenant; OQ-04 timed purge is post-MVP.

---

## 2026-08-14 (16_INTEGRATION_DESIGN consistency)

**Changed — `16_INTEGRATION_DESIGN.md`:** HMAC is computed over raw bytes; unknown page / ignored WA must not leave `processed_at` null; one webhook POST = one event row; only `active` accounts ingest; reconnect reuses any non-active row (including `pending`); OAuth user token lives in Redis 10 min (`oauth_expired`); never Graph a `draft`; BullMQ group limiter is the only outbound bucket; `last_inbound_at` on ingest.

**Changed — `12`:** `business_id` null = unknown page (not failed HMAC); `webhook_secret_ref` unused in MVP; unique `(message_id, sort_order)` on attachments.

**Changed — `13`:** HMAC no-persist; webhook does not enqueue AI; OAuth callback 302; `oauth_expired`; channel-account reconnect vs `conflict`.

**Changed — `14`:** HTTP sequence matches `16` (WA skip, unknown page, enqueue); worker applies `16` §4.4 per inbound; stale “step 8” AI-enqueue note removed.

**Changed — `10` / `11`:** worker applies `intendedTransition`; Graph version pin is `v23.0` via `16`.

---

## 2026-08-14 (16_INTEGRATION_DESIGN freeze pins)

**Changed — `16_INTEGRATION_DESIGN.md`:** `deliver_outbound` no-ops if already `sent`/`external_message_id`; token expiry columns + daily `check_channel_tokens`; channel `error` reconnect uses existing OAuth; webhook debug = `processed_at` + BullMQ (no status enum). SM stays for tenant tokens (OQ-68). **Changed — `12`:** `token_expires_at`, `last_token_check_at`. **Changed — `14` / `11`:** skip AI enqueue unless channel `active`; token-check job.

---

## 2026-08-14 (16_INTEGRATION_DESIGN)

**Added — `16_INTEGRATION_DESIGN.md`:** canonical Meta adapters — HMAC-SHA256 on raw body with `META_APP_SECRET`; GET verify with `META_WEBHOOK_SECRET`; OAuth scopes; canonical inbound/outbound DTOs; echo/delivery handling; Graph `v23.0`; outbound limiter 20/10 per second; WhatsApp stub; `fetch_inbound_media` job. Tokens in Secrets Manager via `credentials_ref` only.

**Changed — `10` / `12` / `13` / `14` / `11`:** `16` is no longer export-pending; integrations queue includes media fetch; `META_WEBHOOK_SECRET` on the env name list.

---

## 2026-08-14 (15_AI_ARCHITECTURE consistency)

**Changed — `15_AI_ARCHITECTURE.md`:** worker is the only `ConversationService.transition` writer (`intendedTransition` / `staleLock`); playground outbound is local `sent` not `draft_only`; suggest grounding fail does not escalate; golden set 50 vs `11` dialect minima reconciled; RAG `dist` is cosine distance; generator `max_tokens` clamped 1–400; remaining tool Zod names. **Changed — `14`:** worker steps 4–6 match.

---

## 2026-08-14 (15_AI_ARCHITECTURE freeze pins)

**Changed — `15_AI_ARCHITECTURE.md`:** `ai_usage` always (including playground; no extra column — join `conversations.is_test`); classifier **outage** ≠ clarification ladder; tool cap **8**; circuit breaker volume-gated (≥100 req/60s and ≥50 fails or >20%); prompt-injection untrusted blocks; tool-compliance ≥95% on golden set; prompt drop-order if over budget. Frozen as orchestrator v1.

**Changed — `05`:** classifier outage path. **Changed — `11` / `12`:** breaker keys; `classifier_error` on traces.

---

## 2026-08-14 (15_AI_ARCHITECTURE)

**Added — `15_AI_ARCHITECTURE.md`:** canonical orchestrator — `processTurn` stages, tool caps (6 calls / 2 extra rounds), tenant KNN RAG (chunks never as price/stock), prompt stack, generator fallback + Redis circuit breaker (50/60s → 5 min), cheap grounding evaluator, extended `DecisionTraceSchema`, golden-set CI gates. OQ-62 streak via traces; OQ-63 breaker; OQ-64 no unbounded tool loop.

**Changed — `10` / `12` / `13` / `14`:** `15` is no longer export-pending. **Changed — `12`:** trace JSON keys. **Changed — `11`:** `cb:provider:*` Redis keys. **Changed — `14`:** playground still writes `ai_usage`.

---

## 2026-08-14 (14_SYSTEM_DESIGN v1 freeze)

**Changed — `14_SYSTEM_DESIGN.md`:** webhook worker partial-completion idempotency; EventEmitter best-effort caveat; provider circuit breaker pointer to `15`; OQ-60 suggest lock, OQ-61 scoring snapshot trigger. Frozen as runtime v1.

---

## 2026-08-14 (14_SYSTEM_DESIGN review pins)

**Changed — `14_SYSTEM_DESIGN.md`:** conversation lock is token-fenced (Lua compare-and-del / expire); BullMQ `attempts: 3` built-in exponential is **5s then 10s** (not 5/20/80); webhook 200 after enqueue of `retry_webhook_processing`; `integration_events.processed_at` is the durable inbox (no `outbox_events`); per-turn caps stay in `11` §9; lock TTL stays 30s.

**Changed — `10` / `11` / `12` / `13` / `05`:** inbound flow, Redis lock notes, webhook 200-after-enqueue, `processed_at` sweep, OQ-42 wording aligned.

---

## 2026-08-14 (14_SYSTEM_DESIGN)

**Added — `14_SYSTEM_DESIGN.md`:** canonical runtime — allowed conversation transitions (including confirm-from-`HUMAN_REQUIRED` and no `conversations.order_id`), inbound persist-200-enqueue flow, conversation lock vs stock `FOR UPDATE`, BullMQ job ids/retries, event catalog, numeric AI rate limits, lead-score weights, reservation sweeper, Socket.IO occupancy (`thread:open`/`close`), failure table. `catalog` and `maintenance` queues added.

**Changed — `11_TECH_STACK.md`:** queue table matches `14`; occupancy emits. **Changed — `13_API_DESIGN.md`:** occupancy emits. **Changed — `10` / `12`:** `14` is no longer export-pending; event catalog points at `14`. **Changed — `06`:** close is `inbox.write`; confirm-from-`HUMAN_REQUIRED`; four notification types (no `ORDER_CONFIRMED` bell); OQ-09 7-day warning = Phase 2.

---

## 2026-08-14 (13_API_DESIGN consistency)

**Changed — `13_API_DESIGN.md`:** sibling docs referenced by **filename** (this file has its own §11/§14/§16). Notifications cursor is priority+time, not `(created_at, id)`. Pipeline cards capped; product/AI-action/feedback/notification lists use cursors. Human send is **201** + enqueue (no Meta wait). Customer export is a CSV stream. Webhook HMAC points at `16_INTEGRATION_DESIGN.md`, not this file’s §16.

---

## 2026-08-14 (13_API_DESIGN review pins)

**Changed — `13_API_DESIGN.md`:** request size caps + `413 payload_too_large`; REST 15s deadline with Socket.IO excluded; v1 additive compatibility; error `code` table includes retryable/hint **off the wire**; cursor SQL per list (inbox ≠ `(created_at, id)`); tenant kill is membership check, not `security_version`; suggest/playground/CSV upload return **202**; sockets disconnect on member removal, business delete, password reset. Webhook dedupe window cites `12` §2.12 (30 days), not a new number.

**Changed — `12_DATABASE_DESIGN.md`:** password reset revokes all refresh families; no `security_version` column.

---

## 2026-08-14 (13_API_DESIGN)

**Added — `13_API_DESIGN.md`:** canonical REST `/api/v1` and Socket.IO contracts — envelopes, JWT + `X-Business-Id` tenancy, idempotency, permission codes per route, inbox/orders/catalog/integrations/webhooks/AI admin, four-KPI analytics, health `/ready`. Socket.IO path is `/socket.io` on `api.<apex>` (`18`), not Brain Dump `/realtime`. `POST /ai/respond` is not public (worker in-process). Confirm-order uses `orders.conversation_id`, not a conversation order FK.

**Changed — `12_DATABASE_DESIGN.md`:** `messages.delivery_status` (`MessageDeliveryStatus`) so drafts and failed sends are not inferred from null Meta ids. **Changed — `11_TECH_STACK.md`:** realtime path `/socket.io`. **Changed — `10_ARCHITECTURE.md`:** `13` is no longer export-pending.

---

## 2026-08-14 (12_DATABASE_DESIGN freeze pins)

**Changed — `12_DATABASE_DESIGN.md`:** stock reserve/commit/release/expire in one transaction with `SELECT … FOR UPDATE` on the variant (Redis conversation lock is not stock). Same-module children use composite FKs `(parent_id, business_id)`. `updated_at` is Prisma `@updatedAt` only. `integration_events` unique is `(provider, channel_account_id, external_event_id)` plus a partial unique for pre-tenant rows. `11` Redis table and `10` inbound flow note aligned.

---

## 2026-08-14 (12_DATABASE_DESIGN JSONB / retention / order link)

**Changed — `12_DATABASE_DESIGN.md`:** every JSONB column has a named Zod export in §14 (opaque Meta/HTTP blobs excluded). Retention policy in §2.12 (`messages` stay hot in MVP; `integration_events` 30d; `ai_actions`/`ai_usage` 90d raw; `audit_logs` 365d). Dropped `conversations.order_id` — canonical link is `orders.conversation_id`. No `outbox_events` (OQ-42). Recency inbox index deferred until a query needs it. `10_ARCHITECTURE.md` §5.3 aligned.

---

## 2026-08-14 (12_DATABASE_DESIGN review)

**Changed — `12_DATABASE_DESIGN.md`:** message uniqueness is `(channel_account_id, external_message_id)` plus global `idempotency_key` (no waffle). `available_stock` SQL filters `business_id` on the join. Conversion rollup columns match `01` §15 (AI pending orders, not “qualified handoffs”). Channel status `active` (G3), not `connected`. G4 has `approval_trial_passed`. Ghost `platform_feature_flags` removed. Refresh tokens are per-user. `staff_read_at` replaces inverted `unread_at`. Cross-module pointers have no Prisma relations. KPI SoT is `analytics_daily`. `10_ARCHITECTURE.md` membership/roles sit with Businesses.

---

## 2026-08-13 (12_DATABASE_DESIGN)

**Added — `12_DATABASE_DESIGN.md`:** canonical PostgreSQL schema — tenancy/`business_id`, enums, module-owned tables (auth through audit), variant-first catalog, stock reservations + `available_stock` SQL, identity resolution, playground `is_test`, `handoff_context` stored as JSONB (shape in `06`), pgvector `embeddings` + HNSW, billing/usage/KPI rollups, seeds and migration rules. Knowledge graph and payment-provider tables stay out. OQ-54 (RLS optional), OQ-55 (HNSW).

---

## 2026-08-13 (11_TECH_STACK Swagger / Prisma gate / APM / analytics)

**Changed — `11_TECH_STACK.md`:** `@nestjs/swagger` generates OpenAPI from Nest controllers (Zod stays source of truth; Swagger UI local+staging only). Prisma **7.x** stays pinned with a bootstrap validation gate (OQ-40). `analytics: none` means no SaaS (PostHog/GA4), not “no telemetry.” Observability: no second APM **in MVP**; OQ-53 revisits Sentry **or** OTel after production error-triage pain. `18_DEPLOYMENT.md` APM line aligned.

---

## 2026-08-13 (11_TECH_STACK auth/email/AI wording)

**Changed — `11_TECH_STACK.md`:** architecture unchanged (Nest JWT, Resend, `AIOrchestrator`). Wording only: BFS `passport` **preset** does not fit Nest (Passport itself is used via `@nestjs/passport`); Resend is extra SaaS DX, independent of Better Auth; Vercel AI SDK can multi-provider — rejected because we already own routing/tools/cost/dialect, not because it drops Gemini/Anthropic.

---

## 2026-08-13 (11_TECH_STACK UI kit)

**Changed — `11_TECH_STACK.md`:** UI kit is **shadcn/ui + Base UI** only. Nova, Lucide, lime, zinc, Inter, and radius are **not** stack pins; they wait for `20_DESIGN_SYSTEM.md`.

---

## 2026-08-13 (11_TECH_STACK review fixes)

**Changed — `11_TECH_STACK.md`:** (1) §9.0 verifies provider API ids against first-party docs (2026-08-13); forbids `gpt-5.6` (routes to Sol) and silent Gemini Flash upgrades. (2) UI kit pinned: shadcn/ui, Radix, Nova, Lucide, **lime** / zinc / Inter / medium. (3) ESLint 9 + Prettier is canonical; Biome/Oxlint rejected with reasons (Next plugin, type-aware TS, Tailwind class sort). OQ-48 retargeted to newer Flash ids, not “does 3.5 exist.”

---

## 2026-08-13 (11_TECH_STACK BFS catalog)

**Changed — `11_TECH_STACK.md`:** every Better Fullstack TypeScript option (v2.5.1) pinned or set to `none` — Next+Nest+Node, REST not tRPC, Prisma+pgvector, Redis/BullMQ/Socket.IO, custom Nest JWT (not BFS passport), no Vercel, no LangChain, Tailwind without a UI kit until the design system. Includes MCP payload and gaps BFS cannot express.

---

## 2026-08-13 (18_DEPLOYMENT six deltas)

**Changed — `18_DEPLOYMENT.md`:** smoke-fail rolls ECS to the previous task definition without reversing the DB migration (distinct from migrate-failure); per-`business_id` cost meters (`ai_usage`, `ai_actions`, `usage_events`, S3 prefix size); backend scale on Socket.IO connections / WS memory / latency, not CPU-only; WhatsApp adapter interface + stub required in MVP (`whatsapp_enabled=false`), Phase 2 = implementation only; unexpected STOPPED alarm on any ECS task with immediate SNS; one “not now” list (private ECS, NAT, Multi-AZ, RDS Proxy) replacing the scattered “revisit at 10 businesses” notes.

---

## 2026-08-13 (18_DEPLOYMENT tighten)

**Changed — `18_DEPLOYMENT.md`:** implementable pins only — ports, SGs, ALB idle/health, ECS stop timeouts and circuit breaker, Redis `noeviction` + TLS AUTH, Prisma-in-image migrate task, per-env Next `NEXT_PUBLIC_*` rebuild, full env list, OIDC, forward-only rollback, alarm trip points. Dropped duplicate rationale. OQ-50–52 folded in; OQ-49 (apex) remains.

---

## 2026-08-13 (18_DEPLOYMENT)

**Added — `docs/10_engineering/18_DEPLOYMENT.md`** (canonical for hosting and ops)

- Region `eu-west-3` (Paris); one AWS account; Terraform in `infra/`
- VPC: public ECS (public IPs, **no NAT**), private RDS/Redis; free S3 gateway endpoint only
- Three Fargate services; backend/worker share one Nest image; `linux/amd64`; on-demand not Spot
- Sizing: prod backend/worker 0.5 vCPU / 1 GB; RDS `db.t4g.small` + pgvector; Redis `cache.t4g.micro`
- DNS: `app.` / `api.` proxied on Cloudflare; `hooks.` DNS-only for Meta; ALB idle timeout 4000s; no sticky sessions
- Pipeline: GitHub OIDC → ECR → migrate as one-off ECS task → roll services; production via GitHub Environment approval
- CloudWatch alarms, 14-day log retention, RDS 7-day PITR, Redis treated as ephemeral
- `10_ARCHITECTURE` §8, `11_TECH_STACK` §12, `00` canonical map, `03` §5.8, `04` §4.6, Brain Dump `# Infrastructure` now point here

---

## 2026-08-13 (infra: simple AWS ECS)

**Changed — VPS-first reversed.** AWS credits / free ECS access: production is **ECS Fargate from day one**, kept small.

- Three services only: `frontend` (Next.js), `backend` (NestJS API), `worker` (same Nest image, BullMQ)
- RDS PostgreSQL + pgvector, ElastiCache Redis, S3, Secrets Manager, CloudWatch, Cloudflare → ALB
- No NAT Gateway at first (ECS public subnet, RDS/Redis private)
- Pipeline: GitHub Actions → ECR → ECS → migrations
- Avoid: Kubernetes, microservices, extra AWS accounts, EC2 unless Fargate cannot, VPS migration path
- OQ-39 / OQ-44 decided: three Fargate services from staging onward
- Brain Dump `# Infrastructure`, `00`, `01` (NFR-SCAL, NFR-OPS-07), `03` §5.8, `04` §4.6, `10_ARCHITECTURE` §3/§8, `11_TECH_STACK` §12

---

## 2026-08-13 (spec completeness pass)

**Changed — Brain Dump + already-generated related docs only** (did not fill empty `12+` / `20_design` / `30_*` placeholders)

Twelve additions, folded into existing sections:

1. **Customer identity resolution** — `customer_identities` (`platform`, `platform_user_id`, `phone_number`, `verified_at`); auto-match platform id; auto-link verified phone; never auto-merge without confidence; Owner/Admin **manual merge in MVP** (FR-CUST-010 Must; FR-CUST-011). Fuzzy merge stays out.
2. **AI evaluation store** — `ai_evaluations` (conversation_id, score, failure_reason, evaluator_type); dimensions: correctness, grounding, language, tools, escalation, conversion. Distinct from `ai_feedback`.
3. **Conversation memory** — short-term last 20 messages; conversation summary / products / objections; long-term orders and preferences; no sensitive data without business need.
4. **Fashion catalog** — AI searches **variants**; price stays on `product_variants` (not parent `products`).
5. **Team** — Owner / Admin / Employee; UI may say **Agent** = Employee (inbox + orders only).
6. **Usage / cost protection** — track `ai_tokens`, `ai_cost`, `messages_processed`; monthly AI budget + max conversations / AI replies; AI pauses, humans continue, owner notified.
7. **Onboarding** — six merchant steps: create → Instagram → products → personality (includes policies) → playground → activate.
8. **AI Playground** — canned scenarios; response + tools; reasoning trace Owner/Admin only.
9. **Failure recovery** — LLM → fallback; Meta down → queue (ack 200 only after persist); DB → retry; tool failure → uncertainty + human; every failure logged.
10. **MVP success metrics** — activation / AI / sales / business (MRR, retention) as founder-ops layer; merchant dashboard remains **exactly four KPIs**.
11. **Production infra (superseded same day)** — originally VPS-first; reversed to simple ECS Fargate because of AWS credits. See changelog entry _infra: simple AWS ECS_.
12. **Payments roadmap** — D17, Flouci, Konnect, Stripe and link → webhook → auto-confirm stay **Phase 4**, not Phase 2.

Files: `AI_Sales_Agent_Brain_Dump.md`, `00_PROJECT_OVERVIEW.md`, `01_PRODUCT_REQUIREMENTS.md`, `02_USER_STORIES.md`, `03_MVP_SCOPE.md`, `04_ROADMAP.md`, `05_AI_BEHAVIOR_SPECIFICATION.md`, `10_ARCHITECTURE.md`, `11_TECH_STACK.md`.

---

## 2026-08-13 (generated docs)

**Added — `docs/10_engineering/11_TECH_STACK.md`**

- Canonical stack: Node 24 LTS, TypeScript strict, pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`), NestJS **11.x** (not 12 alpha), Next.js **16.x**, PostgreSQL 16 + pgvector, **Prisma 7** (not 8 RC), Redis 7, BullMQ, Socket.IO + Redis adapter, Zod shared validation, official OpenAI/Anthropic/Gemini SDKs, Pino, Tailwind 4 as UI utility layer
- Resolves **OQ-40**: Prisma with module-owned repositories; vector search via bounded `$queryRaw`
- Rejection list: LangChain, Kafka, Mongo, Pinecone, Supabase, unofficial WhatsApp, second ORM, Python AI service
- Version policy: pin majors in this file, lockfile for exact versions, no pre-release lines in production
- Open questions OQ-43 → OQ-46 (ID format, Next host, Zod 4, default model id)

**Changed — `docs/10_engineering/11_TECH_STACK.md` (detail pass)**

- Pinned **exact LLM ids** with dialect evidence: customer-facing **`gemini-3.5-flash`** (Tunizi/Arabizi — Mahdi 2025 successor of Gemini 2.5 Flash), fallback **`gpt-5.6-terra`** then **`claude-sonnet-5`**; classifier/summary **`gpt-5.6-luna`**; embeddings **`text-embedding-3-small`** (1536-d)
- Explicitly **banned mini/luna** on customer Derja (they normalize Arabizi to MSA); banned Derja-finetuned 8B as the sales agent (ungrounded)
- Defaults: temperature 0.4 / 0, max_tokens 400, 15s timeout, allow-list for `model_primary`
- Thickened Nest/Prisma/Redis/queues/frontend/auth-token/env/Compose pins
- Brain Dump `# AI Architecture` and `00_PROJECT_OVERVIEW` §9 aligned
- OQ-46 decided; OQ-47–48 added (Derja 8B rewrite, Gemini 3.5 vs 2.5 golden-set check)

**Added — `docs/10_engineering/10_ARCHITECTURE.md`**

- Canonical modular-monolith contract: why not microservices and why not a single Nest module; container topology (Next.js + Nest API task + Nest worker task, same image); domain module ownership map; NestJS folder layout with WhatsApp adapter stub; allowed vs forbidden dependencies; inbound control flow that preserves persist-then-200, tools-for-facts, and state-machine ownership; two buses (in-process events vs BullMQ); multi-tenancy as architecture; AWS topology; Phase 2 hooks; extraction order
- Explicitly does not copy schema, API, job lists, or orchestrator internals — those stay for later `10_engineering/` exports
- Open questions OQ-39 → OQ-42 (API/worker split, ORM, `score_lead` queue, outbox)

**Added — `docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md`**

- Canonical handoff spec: invariant (enumerated, code-driven, briefed, silent thereafter), two pipelines (purchase close vs exception), all 15 triggers with detection/do/don't, `ai_timeout` as dedicated reason on the #15 pipeline, priority and inbox sort, `handoff_context` JSON schema and `action_required` defaults, purchase chain including 30-minute stock reservation and no-payment last message, behaviour in `HUMAN_REQUIRED` / `HUMAN_HANDLING`, takeover/resume/close, notifications and anti-spam, conversion timestamps, idempotency, five worked examples
- Does not duplicate AI behaviour (`05`) or invent `20_design/` exports
- Open questions OQ-35 → OQ-38 (bulk threshold, timeout KPI split, VIP+complaint notifications, who may confirm)

## 2026-08-12

**Added — UX/UI Design Direction (Brain Dump + product docs only)**

- Brain Dump: new authoritative section **`# UX/UI Design Direction`** — Context-Rich Not Clutter-Rich, cultural UX, visual benchmark, app shell, navigation, dashboard hierarchy, KPI pattern, AI transparency, trust, usage transparency, anti-patterns, decision framework, etc.
- `00_PROJECT_OVERVIEW.md` — non-negotiable **5.11 Context-rich, not clutter-rich**
- `01_PRODUCT_REQUIREMENTS.md` — NFR-UX-07 → 011 (references Brain Dump; not `20_design/` until those files are generated)

**Not generated yet:** `20_design/22_UX_FLOWS.md`, `20_design/20_DESIGN_SYSTEM.md` — left as placeholders per one-file-at-a-time export order.

**Scope note:** No application code changes.

## 2026-08-06 (generated docs)

**Added — `docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md`**

- Canonical specification for AI behaviour: the **four laws** (grounding, no unauthorised commitment, escalate rather than improvise, every turn explainable), decision pipeline with per-stage contracts and failure behaviour, 12-intent taxonomy, confidence ladder, full tool catalog with empty/error contracts, purchase handoff chain, context priority, memory layers, restrictions and **silence rules**, behaviour by lifecycle stage and conversation state, reply modes and suggestions, output constraints, summarization, recommendations, prompt versioning, failure/degradation matrix, per-turn observability, evaluation and feedback loop, three worked examples
- Handoff triggers are referenced, not duplicated — they stay canonical in `06_AI_HUMAN_HANDOFF_RULES.md`
- Five new open questions (OQ-30 → OQ-34)

**Changed — file renames propagated**

- Source of truth renamed `AI_Sales_Agent_Founder_Brain_Dump_Answered.md` → **`AI_Sales_Agent_Brain_Dump.md`**; all 10 references across `docs/` updated
- `15_AI_BEHAVIOR_SPECIFICATION.md` → **`05_AI_BEHAVIOR_SPECIFICATION.md`** and `16_AI_HUMAN_HANDOFF_RULES.md` → **`06_AI_HUMAN_HANDOFF_RULES.md`**; all 28 cross-references across `docs/` and the Brain Dump updated

## 2026-08-03 (generated docs)

**Added — `docs/00_product/04_ROADMAP.md`**

- Five outcome phases exported from the Brain Dump `# Roadmap`, already reflecting Option C (Phase 2 = catalog connectivity **+** WhatsApp)
- **Deferred item index**: every exclusion in `03_MVP_SCOPE.md` §6 mapped to a phase, so nothing is dropped silently
- **Reordering triggers** table — the six sanctioned reasons to change phase order, each requiring a decision record; plus explicit non-reasons
- **Anti-roadmap** — capabilities we will not build at any phase (chatbot builder, storefront, full CRM, helpdesk, self-hosted training, unofficial WhatsApp)
- **Retrieval maturity track** (R1 → R3) mapped onto product phases, with entry signals for context optimization and knowledge graph work
- Metric evolution per phase; five new open questions (OQ-25 → OQ-29)

## 2026-08-03 (Option C)

**Changed — WhatsApp moved out of MVP → Phase 2**

- **Decision:** Option C — MVP proves the sales loop on **Instagram + Messenger**; **WhatsApp Cloud API** ships in **Phase 2** alongside catalog connectivity (Shopify/Woo)
- Brain Dump `# Integration Architecture`: added **Channel scope decision (Option C)**; split MVP integrations (IG + Messenger) from Phase 2 WhatsApp section; merchant connection flow MVP-only; `whatsapp_enabled` default **false**; onboarding WhatsApp card "Coming in Phase 2"
- WhatsApp adapter remains a **stub** in MVP (folder + interface behind feature flag) — not connectable
- Unofficial WhatsApp automation (Evolution Go, etc.) remains **prohibited** at every phase
- Roadmap Phase 2 renamed to **Catalog connectivity + WhatsApp**; Phase 3 covers richer WhatsApp message types
- Generated docs aligned: `00_PROJECT_OVERVIEW`, `01_PRODUCT_REQUIREMENTS` (FR-INT-014 `W`, §8.1 Phase 2), `02_USER_STORIES` (US-C-01 reverted, US-C-06 deferred), `03_MVP_SCOPE`

**Reason**

- Prove handoff → confirmed conversion faster with less execution risk; WhatsApp adds verification friction, 24h window, templates, and per-conversation billing before the core thesis is validated
- Fashion ICP can be served on Instagram DMs + Messenger via Facebook Page
- WhatsApp still planned via official Meta APIs — not deferred indefinitely

## 2026-08-03 (WhatsApp in MVP — superseded)

**Changed — WhatsApp moved from Phase 3 into the MVP** _(reverted by Option C above)_

## 2026-08-02

- All three Meta channels now ship in Phase 1 through **official APIs only**: WhatsApp Cloud API, Instagram Messaging API, Messenger Platform API
- Brain Dump `# Integration Architecture` rewritten: channel strategy and rationale, **Meta Integration Service** (single OAuth, token management, webhook routing by payload object, permission and verification state), three thin adapters (`whatsapp/`, `instagram/`, `messenger/`), merchant connection flow, provider identifiers per channel
- **Channel capability matrix** added — channels are not interchangeable; differences are enforced in the adapter layer, never in the AI
- **WhatsApp 24-hour service window** specified: window tracked per conversation, no autonomous AI reply outside it, visible window-closed state, approved-template sends only, refused sends never reported as delivered
- **WhatsApp cost** treated as first-class: Meta bills per conversation, so `whatsapp_conversations_started` is metered separately from Instagram and Messenger
- New storage: `message_templates`; `channel_accounts` extended with `page_id`, `ig_user_id`, `waba_id`, `phone_number_id`, `display_name`, `verification_status`
- New endpoints: Meta assets listing, channel-account connect/disconnect, WhatsApp template sync, staff template send; single webhook endpoint routed by `object`
- "One brain across all channels" made explicit in `# AI Agents` — channel is a transport detail, not a reason for a second agent
- `feature_flags.whatsapp_enabled` default flipped to true, retained as a per-tenant kill switch
- Roadmap Phase 3 rescoped from "WhatsApp" to inventory trustworthiness plus richer WhatsApp message types

**Rejected**

- **Unofficial WhatsApp automation** (Evolution API / Evolution Go, Baileys, web-session bridges) — risks banning the merchant's business number, an unrecoverable failure for the customer. Recorded as non-negotiable decision 5.9 in `00_PROJECT_OVERVIEW.md`
- **Aggregator BSPs** (Twilio, 360dialog, MessageBird) — per-message margin, second vendor, and an abstraction we would unwind to reach Instagram and Messenger anyway. Revisit only if Meta onboarding friction blocks merchants

**Changed — generated docs**

- `00_PROJECT_OVERVIEW.md`: channels row, system diagram (Meta Integration Service), new non-negotiable 5.9 "Official Meta APIs only", roadmap table, glossary terms for service window and template message
- `01_PRODUCT_REQUIREMENTS.md`: FR-INT-014 flipped from `W` to `M`; new §8.1 with FR-INT-020 → 033 covering connection, prerequisites, service window, templates, metering, throttling, and the prohibition on unofficial automation; constraints table expanded with four WhatsApp-specific constraints
- `02_USER_STORIES.md`: US-C-01 rewritten for one-consent multi-channel connect; new US-C-01b (prerequisites), US-C-06 (service window and templates), US-C-07 (channel parity)
- `03_MVP_SCOPE.md`: §5.3 rewritten as a full three-channel scope; WhatsApp removed from exclusions and replaced with rich message types and template authoring; five boundary clarifications, five new risks, three launch-gate items, three open questions

**Reason**

- WhatsApp is the dominant messaging channel in the target market. Building the third adapter alongside the first two is materially cheaper than retrofitting it after the conversation model, inbox, and AI loop have hardened.

## 2026-08-02

**Added — Brain Dump: `Sales Command Center (Inbox UX)`**

- New authoritative section on the operator experience: three-pane layout, sales-priority triage, lead scoring, chat pane, customer panel, AI takeover controls, unified inbox, AI suggestions, pipeline view, notification discipline, admin pages, realtime architecture, interaction budgets, empty states, mobile behaviour
- Lead scoring model: deterministic 0–100 score, signal weights, hot/warm/cold bands, `score_lead` job, explicit non-goal (not a purchase probability)
- Realtime decision: WebSocket (Socket.IO) via NestJS with Redis adapter; SSE as fallback; Supabase Realtime rejected (outside the AWS + NestJS stack)
- Supporting edits: `lead_score` fields on `conversations`, `HOT_LEAD` notification type, `lead.score_changed` event, `score_lead` and `notify_hot_lead` jobs, Realtime and Notifications backend modules, Pipeline frontend page, suggestion/timeline/pipeline/realtime API endpoints, MVP build list, Analytics AI/human split

**Added — Brain Dump: `Knowledge Graph & Context Optimization Strategy`**

- Post-MVP architectural direction (explicitly **not** an MVP requirement): context economics, why raw record dumps do not scale, relational vs vector vs graph comparison, node and edge taxonomy, maintenance model, storage options, eleven context-optimization techniques, intent-driven context templates, vendor-neutral `GraphRetrievalProvider` port, hybrid retrieval pipeline, three-stage roadmap, MVP obligations that keep the door open

**Changed — generated docs**

- `00_PROJECT_OVERVIEW.md`: sales-command-center positioning, "triage over transcript" as non-negotiable decision 5.8, realtime in the tech summary, canonical map rows for lead scoring / realtime / command-center UX, ten new glossary terms
- `01_PRODUCT_REQUIREMENTS.md`: new areas `LEAD` and `RT`; requirements for command-center layout and triage ordering, pipeline view, lead scoring, realtime, AI suggestions, notification anti-spam; realtime performance targets; AI/human split added as a breakdown of _messages handled_
- `02_USER_STORIES.md`: eight new stories (US-D-16 … US-D-23) covering triage, unified inbox, customer panel, score explainability, suggestions, pipeline, notification discipline, and realtime degradation
- `README.md`: export hints for `22_UX_FLOWS.md` and `23_UI_COMPONENTS.md`

**Conflicts resolved (recorded in the Brain Dump section, not silently changed)**

- Payment-link phrasing in the illustrative chat → MVP AI never offers payment links; close is human confirmation (payments are Roadmap Phase 4)
- WhatsApp in channel filters → designed now, hidden behind `feature_flags.whatsapp_enabled` (Phase 3)
- Pipeline column "Payment pending" → merchant-facing label retained; card copy says _awaiting your confirmation_
- Five analytics numbers → AI/human split is a breakdown of an existing KPI, not a fifth KPI
- Lead score shown as "likely to buy" → presented as an explainable triage signal, never as a statistic
- Score-based sorting → two-tier ordering so escalations always outrank hot leads

## 2026-07-27

**Added**

- Documentation folder layout (`00_product` … `40_project_management`)
- `15_AI_BEHAVIOR_SPECIFICATION.md`, `16_AI_HUMAN_HANDOFF_RULES.md` (product)
- `15_AI_ARCHITECTURE.md`, `16_INTEGRATION_DESIGN.md`, `17_SECURITY_DESIGN.md` (engineering)
- `23_UI_COMPONENTS.md` (design)
- Renamed `30_development` → `30_execution`
- `43_CHANGELOG.md` (this file)

**Changed**

- `docs/` files are placeholders until exported from `AI_Sales_Agent_Founder_Brain_Dump_Answered.md`

**Reason**

- Separate product, engineering, design, execution, and PM concerns before implementation
