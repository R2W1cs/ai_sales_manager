## 8. Onboarding components

Non-blocking checklist (`22` §4). Persist via `GET/PATCH .../onboarding`. Client may PATCH **only** `{ handoffAcknowledged: true }`. Never `{ aiActivated: true }`.

### 8.1 `OnboardingChecklist` (`C-ONB-01`)

Steps 1–6 as in `22` §4. Allow leave/resume. Trust footer at the bottom. Steps 1 and 4 are **forms inside this checklist** (`Input`, `Select`, `RadioGroup`) — do not add `OnboardingStep1Card` / `PersonalityForm` ids.

### 8.2 `ChannelConnectCard` (`C-ONB-02`)

Instagram + Messenger connect (`16` OAuth). WhatsApp card: disabled badge _Phase 2 — Bientôt disponible_. Success: page name, handle, `channel_active` pill. **Same component** on Settings → Canaux (named exception §3.0). Do not fork a settings-only connect card.

### 8.3 `CsvImportWizard` (`C-ONB-03`)

Drop → map → preflight table → import. Determinate `Progress` (`22` §16.2). Invalid rows: keep valid staged; CTAs from `22` §16.3. Manual tab uses `ProductFormDialog`.

### 8.4 `PlaygroundSimulator` + `DecisionInspector` (`C-ONB-04/05`)

Route requires `ai.playground`. Employee: do not mount; API 403. Four scenario chips from `22` §4.5. Threads `source=playground`, `is_test=true` — never listed in merchant inbox.

`DecisionInspector`: `ai.traces.read` only. Intent, confidence, retrieved knowledge, tool log. Not a numeric confidence _band_ UI — show the value as caption, behaviour stays `05` §7.

### 8.5 `ActivationGate` (`C-ONB-06`)

Checklist G1–G5 from `unmetGates`. Primary: `[Activer l'Agent IA en direct]` → `PATCH /api/v1/integrations/live` `{ enabled: true }`. Disabled while `aiActivationReady` is false. **422** `activation_not_ready`: list unmet gates.

Optional `[Autoriser l'envoi automatique]` **off**. Owner/Admin (`ai.configure`). On: `PATCH /api/v1/ai/settings` `{ replyMode: "auto_send" }`. Separate write from live enablement. G4 does not flip this (FR-AI-011).

On success: navigate `/inbox` with **draft** chrome unless the toggle was on.

---

## 9. Pipeline, catalog, settings, analytics

### 9.1 `PipelineBoard` / `PipelineCard` (`C-PIPE-01/02`)

`GET /api/v1/pipeline`. Four columns only (`13` §7). **No drag. No PATCH.** Card click → `/inbox?id={conversationId}`. Column 3 copy: _en attente de confirmation_. `totalValue` via `MoneyText`. Preview cap = API `limit`.

### 9.2 `ProductTable` / `VariantDrawer` / `ProductFormDialog`

Columns: `22` §10.1. Inline stock: `catalog.write` (Owner/Admin). Employee: read-only. `availableStock` is server-computed — never PATCH a derived field (`13` §12). Images to S3 as in `13`. Save enqueues reindex — show status text, not a fake embedding visualization.

### 9.3 `SettingsTabs` (`C-SET-01`)

Tabs from `22` §11, in this order. Employee: **do not mount** `/settings` (`22` §3.3). Hide Facturation without `usage.read` (Owner).

| Tab                 | Component                                                         | Perm / routes                                                                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Général             | `BusinessProfileForm`                                             | `PATCH /api/v1/businesses/:id` (`business.write`). Fields = FR-BIZ-002 / `13` §3.2: `name`, `industry`, `country`, `defaultLanguage` (`fr` \| `ar`), `timezone`, `currency`. Defaults already seeded; do not invent extra profile keys                                     |
| Canaux              | `ChannelConnectCard`                                              | Same widget as onboarding step 2 (`16` OAuth). `integrations.manage`. Do **not** duplicate a second connect card                                                                                                                                                           |
| Personnalité IA     | `ReplyModeRadios` + agent Inputs **in this tab** (no extra `C-*`) | `GET/PATCH /api/v1/ai/settings` `{ replyMode }` and `GET/PATCH /api/v1/ai/agents/:id` (`ai.configure`). Agent fields from `13` §11 (personality, language, tone, greeting/fallback, `salesStrategy`, `confidenceThreshold`, `enabled`). Model ids only from `11` §9.3 pins |
| Règles Commerciales | `BusinessRulesForm`                                               | `rules.write` — see below                                                                                                                                                                                                                                                  |
| Équipe              | `TeamMembersTable` + `InviteMemberDialog`                         | `members.manage`                                                                                                                                                                                                                                                           |
| Facturation         | `BillingUsagePanel`                                               | Owner. `GET /api/v1/usage` (`usage.read`). Optional Owner caption from `GET /api/v1/ai/usage` (cost/tokens — **not** an analytics tile). **No Stripe HTTP** in MVP (`13` §15)                                                                                              |

#### ReplyModeRadios (`C-SET-02`)

| Value               | Label                                         |
| ------------------- | --------------------------------------------- |
| `approval_required` | _Brouillon à valider_ (default)               |
| `auto_send`         | _Envoi automatique_                           |
| `draft_only`        | If shipped (Should FR-AI-013); otherwise omit |

G4 does not flip this (FR-AI-011). Discount negotiate on the **Règles** tab: default **Non**, locked to forbidden (`05`).

#### `BusinessRulesForm` (`C-SET-06`)

`GET /api/v1/business-rules` then **POST** a new row to change payload (`13` §12.4). Never PATCH `payload` in place — only `enabled` / `effective_to` on PATCH. Map `22` §11 chrome onto `12` §14.8 Zod (do not invent a flat `fixedFee` field):

| Surface (`22` §11)       | `ruleType`      | Payload                                                         |
| ------------------------ | --------------- | --------------------------------------------------------------- |
| Livraison fee + ETA      | `delivery`      | `zones[]` with `fee`, `currency: "TND"`, `eta_hours`            |
| Seuil livraison gratuite | `free_shipping` | `{ threshold, currency: "TND" }`                                |
| Négocier des remises     | `discount`      | `{ ai_may_offer: false, max_percent: null }` — **Oui** disabled |
| Jours / heures           | `working_hours` | `timezone`, `weekly`, `human_callback`                          |

Seeded `payment` / `returns` / `min_order` may render read-only until edited via the same POST-new-version rule. Amounts via `MoneyText` / numeric inputs; API `currency` stays `TND`.

#### `TeamMembersTable` + `InviteMemberDialog` (`C-SET-04/05`)

- List: `GET .../members` — name, email, role, invite status, `lastActiveAt` (FR-BIZ-013)
- Pending: `GET .../invitations`
- Invite: `POST .../invitations` `{ email, role: "admin" \| "employee" }`. Cannot invite Owner. Seat limit → `quota_exceeded`
- Role: `PATCH .../members/:userId` `{ role: "admin" \| "employee" }`. Cannot grant `owner`. Cannot demote the sole Owner
- Remove member: `ConfirmDialog` → `DELETE .../members/:userId`
- Revoke invite: `DELETE .../invitations/:invitationId`

#### `BillingUsagePanel` (`C-SET-07`)

Owner only. Composes `PlanUsageCard` from `GET /usage` (80% / 95% warnings). Copy that self-serve upgrade is out of MVP — **no** `StripeCheckout`, no billing portal route. `TrustFooter` on this tab. Admin/Employee must not call `/usage`.

### 9.4 `KpiCard` + `AnalyticsChart`

Exactly four `KpiCard`s, names from `01` §15. Messages handled may show AI/human **breakdown inside the same card**. Period control as in `22` §12. One chart: zinc + **one** accent series (`20` §4.4). No revenue, CSAT, cost, latency tiles. Employee sees the same four figures (`analytics.read`).

---

## 10. Loading, empty, error (component rules)

Visual pins: `20` §11. Copy and CTAs: `22` §16.

| Pattern                       | Component behaviour                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page / inbox first paint      | `Skeleton` matching `ConversationCard` / transcript — not a centered spinner                                                                      |
| Conversation switch           | Stale-while-revalidate; thin progress if fetch > 200 ms                                                                                           |
| Suggestion wait               | Skeleton card _Génération de la suggestion..._ < 5 s                                                                                              |
| Confirm / takeover / activate | Button `loading`                                                                                                                                  |
| CSV                           | Determinate `Progress`                                                                                                                            |
| AI turn in thread             | Status **text** _Analyse de la conversation…_ / _Préparation de la réponse…_. **No token streaming** (`15`)                                       |
| Socket down                   | `SocketStatus` + `ErrorBanner` copy from `22` §13.2; refetch list + open thread on reconnect                                                      |
| Meta disconnect               | Sticky `ErrorBanner`. `[Reconnecter le compte]` only with `integrations.manage`. Employee: status copy, no reconnect CTA (`13` §10.1)             |
| Quota 80/100                  | Owner: `PlanUsageCard` from `GET /usage`. All roles: Pane 2 banner on `403` `ai_paused` — copy `22` §16.1. Do not poll `/usage` as Admin/Employee |

`aria-live="polite"` on the conversation list for new handoff rows — not a toast per AI reply (`20` §10).

---

## 11. i18n namespaces

`next-intl` catalogs: `fr-TN` (default), `ar-TN`, `en`. Keys, not literals.

| Namespace    | Owns                                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| `shell`      | Nav, header, palette, quota, notification panel                                 |
| `auth`       | Login, register, invite, forgot/reset                                           |
| `inbox`      | List, toolbar, bubbles, composer, order desk, briefing, assign, close, feedback |
| `onboarding` | Steps 1–6, gates, playground chips                                              |
| `pipeline`   | Column titles, empty board                                                      |
| `products`   | Table, drawer, form                                                             |
| `settings`   | Tabs, reply mode, rules, team, billing                                          |
| `analytics`  | Four KPI titles + chart                                                         |
| `errors`     | `13` `code` → French                                                            |
| `common`     | Confirm / cancel / loading / DT suffix                                          |

RTL: `dir` on `<html>` from locale; logical CSS; Lucide chevrons flip (`20` §8). Chat and snippets: `dir="auto"` on the node (`22` §20).

---

## 12. Accessibility contract

Implements `20` §10 and `22` §19.

- Focus: `--focus-ring`. Never `outline-none` without replacement.
- Icon-only: `aria-label` in French (call, close sheet, menu, bell, Info / fiche client).
- Keyboard: list arrows, Tab through toolbar, Enter send with explicit button (do not hijack Enter without a visible Send).
- Hit target `h-11` below `lg` for takeover, send, confirm, approve, Suggérer, Clôturer.
- Temperature, status, errors: word or icon, not colour alone.
- `prefers-reduced-motion: reduce` → instant show/hide; no skeleton shimmer.

Playwright covers takeover + confirm (`11`). Approve-draft is in the same critical path for new tenants — include it in the core flow tests.

---

## 13. Realtime wiring (UI only)

Subscribe to `13` §14 client events. Payloads are ids + small fields.

| Event                     | Component update                                                                |
| ------------------------- | ------------------------------------------------------------------------------- |
| `conversation.message`    | `MessageList` append if open; `ConversationCard` snippet; refetch if cursor gap |
| `conversation.status`     | Card badge; list membership                                                     |
| `conversation.handoff`    | Move into _À traiter_; notify only if type ∈ `22` §15.1                         |
| `conversation.score`      | `TemperatureBadge` + `LeadScoreBlock`                                           |
| `conversation.suggestion` | `SuggestionPanel`                                                               |
| `notification.new`        | `NotificationBell` + `NotificationPanel`                                        |

On reconnect: refetch `GET /conversations` + open thread. Occupancy: `thread:open` / `thread:close` only (`13` §14). No typing events. No domain writes on the socket.

---

## 14. Forbidden components and anti-patterns

Do not ship:

- Snooze / `SNOOZED` lane / archive-as-snooze
- Employee playground or Employee decision-trace inspector
- Lime-filled selected rows or lime body text
- Confidence 0.80 / 0.60 extra bands; raw `confidence < 0.6` chrome (`05` §7)
- `🤖 IA en cours` as the default for new tenants
- Optimistic takeover / optimistic confirm
- `POST /orders/:id/confirm` or `PATCH .../onboarding` `{ aiActivated: true }`
- Client-side conversation search over the loaded page
- Fifth KPI, revenue tile, payment link, unofficial WhatsApp composer
- `[Modifier les articles]` / `PATCH /orders/:id/items` / `LineItemEditor`
- Stripe checkout, billing portal, or any `billing.manage` HTTP in MVP
- `view=unread` tab; fifth notification type
- Radix imports, Framer Motion, Inter/Geist, catalog `lime` theme, `h-8` controls
- Hard-coded French in JSX; raw English `error.message`
- Cartoon robot avatar, confetti, glowing “AI magic” spark (`21` §8.1)
- Storybook / MSW / Zustand / Redux (`11` pins TanStack Query + Playwright; visual SoT is `24`)

---

## 15. Rules for coding agents

Before implementing a `C-*`: this inventory (§3.1) → owning flow in `22` → tokens in `20` → route/DTO in `13`. Implement only states listed here. Tests live in `11` / `30`, not as extra widgets.

Do **not** rename, merge, split, or replace a `C-*` with a new abstraction without updating this file first. New widgets need a `C-*` id here before they exist in `apps/web`.

1. Implement the inventory in §3.1.
2. Consume `20` tokens. If a visual value is missing, add it to `20`, not in the component.
3. Screen behaviour stays in `22`. This file does not invent steps or queues.
4. Props = `13` DTO camelCase. Scoring weights stay in `14`. Permission codes stay in `13` §2.11 / `17`. Do not copy resource field lists into this file.
5. Every string is a `next-intl` key. Reference French in this file is the catalog source, not JSX.
6. Primary cluster actions: Approve (draft mode), Takeover (`auto_send`), Confirm order, Activate. One lime button per cluster.
7. Pending + `aria-busy` until 200. Revert on error. Preserve composer content on send failure (`22` §16.3).
8. `MoneyText` for all amounts. Temperature from `leadTemperature`. Draft chrome is the default.
9. Sheets use `--z-overlay`. Dialogs use `--z-modal`. Header stays `--z-header`.
10. Do not fill `24_REFERENCE_SCREENS.md` from this file. When `24` is written it **consumes** `22` layout contracts (§5, §14, §18), **this** inventory (§3.1 ids + §3.3 trees), and `20` tokens. Reference screens name `C-*` components; they do not invent widgets or restyle tokens.
11. Do not invent endpoints, query params, or DTO fields (`view=unread`, `PATCH /orders/:id/items`, membership-wide `replyMode` snapshot, `senderType=user`, `GET /usage` as Admin/Employee, `POST /orders/:id/confirm`). If `13` does not list it, the component does not call it.
12. Auth pages are full-bleed. Settings → Canaux reuses `ChannelConnectCard`. Facturation is Owner `GET /usage` only. `[Suggérer]` lives on `Composer`. `[Info]` lives on `ThreadHeader`.
13. Do not split this file into `23A`–`23E` children. The index + contracts stay in this document.
14. File name = export name (§3.4). One query owner per resource (§3.5). Below `lg`, sidebar is a header-opened `Sheet` — no swipe, no extra nav component.

---

## 16. Open questions

None that unblock implementation. OQ-76 (commercial name) does not change the header descriptor in MVP. OQ-77: no decorative onboarding illustrations.

---

## 17. References

- `docs/AI_Sales_Agent_Brain_Dump.md` → `# Sales Command Center (Inbox UX)`, `# UX/UI Design Direction`
- `docs/20_design/20_DESIGN_SYSTEM.md` — tokens, primitives pins, a11y, overflow
- `docs/20_design/21_BRAND_STRATEGY.md` — terminology, tone, trust footer
- `docs/20_design/22_UX_FLOWS.md` — screens, panes, journeys, empty copy
- `docs/20_design/24_REFERENCE_SCREENS.md` — visual benchmarks (export pending)
- `docs/10_engineering/11_TECH_STACK.md` §8 — shadcn + Base UI + Lucide
- `docs/10_engineering/13_API_DESIGN.md` — DTOs, routes, permissions, sockets
- `docs/10_engineering/14_SYSTEM_DESIGN.md` §10 — score factors and temperature
- `docs/10_engineering/17_SECURITY_DESIGN.md` — UI hiding ≠ authZ
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` FR-AI-011, §14 gates, §15 KPIs
- `docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md` §7 confidence ladder
