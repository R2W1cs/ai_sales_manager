# 23 — UI Components

| Field           | Value                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document ID     | `23_UI_COMPONENTS`                                                                                                                                                                            |
| Status          | Approved — canonical for operator UI component inventory, props, states, and composition                                                                                                      |
| Owner           | Product / Design                                                                                                                                                                              |
| Audience        | `apps/web` engineers, QA, AI coding agents                                                                                                                                                    |
| Depends on      | `20_DESIGN_SYSTEM.md` (tokens), `21_BRAND_STRATEGY.md` (terminology + tone), `22_UX_FLOWS.md` (screens and flows), `13_API_DESIGN.md` (DTOs, routes, permission codes), `11_TECH_STACK.md` §8 |
| Consumed by     | `apps/web`, `24_REFERENCE_SCREENS.md`, `30_execution/30_TASKS.md`, `30_execution/32_FEATURE_SPECIFICATIONS.md`                                                                                |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# Sales Command Center (Inbox UX)`, `# UX/UI Design Direction`                                                                                         |

---

## 1. Purpose and scope

This document is **canonical for what React components exist, which props they take, which visual states they implement, and how they compose**. If a control is not named here, do not invent it in `apps/web`. Add it here first.

**In scope:** component inventory, composition tree, widget prop contracts (camelCase matching `13` DTOs), variant/state tables, empty/error/loading chrome per component, `next-intl` key namespaces, Lucide + Base UI mapping, permission-aware rendering. Resource field lists stay in `13` — this file says which call a widget makes and which chrome it shows, not a second DTO.

**Out of scope, and where it lives instead:**

| Topic                                                       | Canonical location                         |
| ----------------------------------------------------------- | ------------------------------------------ |
| Colour, type, radius, z-index, control heights, breakpoints | `20_DESIGN_SYSTEM.md`                      |
| Voice, glossary, trust footer, anti-patterns                | `21_BRAND_STRATEGY.md`                     |
| Screen flows, pane %, journeys, notification caps           | `22_UX_FLOWS.md`                           |
| Screenshot / pixel mocks                                    | `24_REFERENCE_SCREENS.md` (export pending) |
| REST paths, query params, Socket.IO events, DTO field lists | `13_API_DESIGN.md`                         |
| Conversation state graph, scoring weights                   | `14_SYSTEM_DESIGN.md`                      |
| Auth / RBAC enforcement                                     | `17_SECURITY_DESIGN.md`                    |
| AI dialect, confidence ladder, tools                        | `05_AI_BEHAVIOR_SPECIFICATION.md`          |
| Handoff triggers 1–15, briefing schema                      | `06_AI_HUMAN_HANDOFF_RULES.md`             |

**References:** `§N` is this file. Sibling docs are filenames. French strings here are **catalog reference copy**, never JSX literals (NFR-I18N-03).

---

## 2. Invariants

1. **Tokens only from `20`.** No hex, no `zinc-*` in JSX, no extra radius, no `h-8` controls, no `z-[999]`. Components consume CSS variables.
2. **Flows only from `22`.** Do not add screens, panes, tabs, or notification types. Do not add a snooze control (Phase 2, `13` §6.2).
3. **Data only from `13`.** Props are DTO fields. Do not invent client-side scores, pipeline columns, or `/inbox/updates`.
4. **Primitives are shadcn/ui + Base UI + Lucide** (`11`, `20` §3). **Not Radix.** Style **vega**. Icons **lucide**.
5. **REST is source of truth.** Server cache is TanStack Query (`11`). Local state is chrome only (open sheet, composer text, pending button). Sockets invalidate + reconcile — no domain writes, no parallel `useState` copy of a list DTO. Pending controls until **200**. Takeover is never optimistic (`22` §7.1, FR-CONV-043).
6. **Default reply chrome is draft-to-approve.** New tenants: `📝 Brouillon à valider`, not `🤖 IA en cours` (FR-AI-011, `22` §4.6 / §7.1). G4 does not flip `reply_mode`.
7. **Employee ≠ playground.** Hide playground nav. `ai.playground` / `ai.traces.read` are 403 for Employee. Inbox shows `handoffContext` briefing, never traces (`22` §3.3 / §4.5.1).
8. **UI hiding is not authorization** (`17`). Hide chrome the role cannot use; still handle **403**.
9. **Money is `DT`.** Format with `20` §8. API `currency` stays `TND`. Never `$` in chrome.
10. **Temperature is word + icon**, from `leadTemperature` on the DTO. Do not recompute bands from `leadScore` in the client (`14` §10.2).
11. **No Framer Motion / GSAP / Lottie.** Motion ≤ 150 ms opacity/transform (`20` §6). Honour `prefers-reduced-motion`.
12. **No payment-link control** in MVP. No WhatsApp nav unless the tenant has an account **and** `whatsapp_enabled`.
13. **Exactly four analytics KPI tiles.** AI/human split is a breakdown, not a fifth card (`01` §15, `20` invariant 6).
14. **One primary action per cluster.** Empty states: title + why + **one** CTA (`20` §11, NFR-UX-06).
15. **Operator density, not marketing whitespace** (`20` §2, §6, §9). Inbox list rows use 12px padding; default cards 16px. Prefer compact rows over stacked marketing cards. Do not wrap every widget in an extra container. Keep three panes visible at `xl` without scrolling the primary action out of the viewport. If a surface feels empty, remove chrome — do not enlarge padding.

---

## 3. Composition and file map

Suggested `apps/web` layout (coding agents must not scatter domain widgets under `components/ui`):

```
apps/web/
  components/
    ui/                 ← generated shadcn primitives only
    auth/               ← login, register, accept-invite, forgot/reset
    shell/              ← GlobalHeader, AppSidebar, CommandPalette, …
    marketing/          ← landing page: MarketingHeader, LandingHero, InteractiveChatDemo, BentoFeatures, MarketingFooter
    inbox/              ← Sales Command Center domain widgets
    onboarding/
    pipeline/
    products/
    settings/
    analytics/
    shared/             ← EmptyState, MoneyText, PermissionGate, …
  app/[locale]/         ← Next.js routes; pages compose, they do not restyle
```

Pages import domain components. Domain components import `ui/` primitives. **Never** the reverse.

### 3.0 Domain ownership

Each `C-*` component has **exactly one** owner folder (§3.1).

| May import                                            | Must not import                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `ui/`, `shared/`, `shell/` — from any domain or page  | Another domain folder (`inbox` ↛ `products`, `pipeline` ↛ `inbox`, …) |
| A **page** (`app/[locale]/…`) — from multiple domains | Domain widgets pulling pages or other domains to “share a card”       |

Cross-domain **navigation** is an `href` (e.g. `PipelineCard` → `/inbox?id=`), not an import of `InboxLayout`.

**Named exception:** `ActivationGate` (onboarding) may import `ReplyModeRadios` (settings) — same `ai.configure` control as `22` §4.6 / §11. `CsvImportWizard` (onboarding) may import `ProductFormDialog` (products) for step 3 manual tab. Settings → Canaux may import `ChannelConnectCard` (onboarding) — same Meta connect chrome as step 2. Do not duplicate those widgets.

Do not create `CustomerInsightsCard`, `SmartLeadWidget`, `AIHelperPanel`, `QuickActionBar`, `ThreadView`, or `CustomerPanel`. Pane 2 / Pane 3 are `InboxLayout` slots, not new components.

### 3.1 Closed inventory (MVP)

| ID           | Component             | Folder     | Used on (`22`)                           |
| ------------ | --------------------- | ---------- | ---------------------------------------- |
| `C-SHELL-01` | `GlobalHeader`        | shell      | All authenticated                        |
| `C-SHELL-02` | `AppSidebar`          | shell      | All authenticated except full-bleed auth |
| `C-SHELL-03` | `WorkspaceSwitcher`   | shell      | Header                                   |
| `C-SHELL-04` | `LanguageSwitcher`    | shell      | Header                                   |
| `C-SHELL-05` | `NotificationBell`    | shell      | Header                                   |
| `C-SHELL-06` | `UserMenu`            | shell      | Header                                   |
| `C-SHELL-07` | `SocketStatus`        | shell      | Header                                   |
| `C-SHELL-08` | `CommandPalette`      | shell      | `Cmd+K` / `Ctrl+K`                       |
| `C-SHELL-09` | `PlanUsageCard`       | shell      | Sidebar footer; Settings → Facturation   |
| `C-SHELL-10` | `NotificationPanel`   | shell      | Bell dropdown                            |
| `C-AUTH-01`  | `LoginForm`           | auth       | `/login` (full-bleed)                    |
| `C-AUTH-02`  | `RegisterForm`        | auth       | `/register` (full-bleed)                 |
| `C-AUTH-03`  | `AcceptInviteForm`    | auth       | `/invite` (full-bleed)                   |
| `C-AUTH-04`  | `ForgotPasswordForm`  | auth       | `/forgot-password` — Should FR-AUTH-008  |
| `C-AUTH-05`  | `ResetPasswordForm`   | auth       | `/reset-password` — Should FR-AUTH-008   |
| `C-INBOX-01` | `InboxLayout`         | inbox      | `/inbox`                                 |
| `C-INBOX-02` | `ConversationList`    | inbox      | Pane 1                                   |
| `C-INBOX-03` | `ConversationCard`    | inbox      | Pane 1                                   |
| `C-INBOX-04` | `InboxViewTabs`       | inbox      | Pane 1                                   |
| `C-INBOX-05` | `InboxFilterPopover`  | inbox      | Pane 1                                   |
| `C-INBOX-06` | `ThreadHeader`        | inbox      | Pane 2                                   |
| `C-INBOX-07` | `AutonomyToolbar`     | inbox      | Pane 2 header                            |
| `C-INBOX-08` | `MessageList`         | inbox      | Pane 2                                   |
| `C-INBOX-09` | `MessageBubble`       | inbox      | Pane 2                                   |
| `C-INBOX-10` | `SystemEventChip`     | inbox      | Pane 2                                   |
| `C-INBOX-11` | `DraftActions`        | inbox      | Draft bubble / toolbar                   |
| `C-INBOX-12` | `SuggestionPanel`     | inbox      | Pane 2                                   |
| `C-INBOX-13` | `Composer`            | inbox      | Pane 2                                   |
| `C-INBOX-14` | `CustomerCard`        | inbox      | Pane 3                                   |
| `C-INBOX-15` | `LeadScoreBlock`      | inbox      | Pane 3                                   |
| `C-INBOX-16` | `OrderDeskCard`       | inbox      | Pane 3                                   |
| `C-INBOX-17` | `TimelineList`        | inbox      | Pane 3                                   |
| `C-INBOX-18` | `HandoffBriefing`     | inbox      | Pane 2/3 when `HUMAN_REQUIRED`           |
| `C-INBOX-19` | `InternalNote`        | inbox      | Thread (not a bubble)                    |
| `C-INBOX-20` | `AssignControl`       | inbox      | Pane 2 header                            |
| `C-INBOX-21` | `CloseThreadButton`   | inbox      | Pane 2 header                            |
| `C-INBOX-22` | `MessageFeedback`     | inbox      | AI sent bubbles                          |
| `C-ONB-01`   | `OnboardingChecklist` | onboarding | `/onboarding/*`                          |
| `C-ONB-02`   | `ChannelConnectCard`  | onboarding | Step 2; Settings → Canaux                |
| `C-ONB-03`   | `CsvImportWizard`     | onboarding | Step 3                                   |
| `C-ONB-04`   | `PlaygroundSimulator` | onboarding | Step 5                                   |
| `C-ONB-05`   | `DecisionInspector`   | onboarding | Step 5 (Owner/Admin)                     |
| `C-ONB-06`   | `ActivationGate`      | onboarding | Step 6                                   |
| `C-PIPE-01`  | `PipelineBoard`       | pipeline   | `/pipeline`                              |
| `C-PIPE-02`  | `PipelineCard`        | pipeline   | `/pipeline`                              |
| `C-PROD-01`  | `ProductTable`        | products   | `/products`                              |
| `C-PROD-02`  | `VariantDrawer`       | products   | `/products`                              |
| `C-PROD-03`  | `ProductFormDialog`   | products   | `/products`                              |
| `C-SET-01`   | `SettingsTabs`        | settings   | `/settings`                              |
| `C-SET-02`   | `ReplyModeRadios`     | settings   | Personnalité IA                          |
| `C-SET-03`   | `BusinessProfileForm` | settings   | Général                                  |
| `C-SET-04`   | `TeamMembersTable`    | settings   | Équipe                                   |
| `C-SET-05`   | `InviteMemberDialog`  | settings   | Équipe                                   |
| `C-SET-06`   | `BusinessRulesForm`   | settings   | Règles Commerciales                      |
| `C-SET-07`   | `BillingUsagePanel`   | settings   | Facturation (Owner)                      |
| `C-ANL-01`   | `KpiCard`             | analytics  | `/analytics`                             |
| `C-ANL-02`   | `AnalyticsChart`      | analytics  | `/analytics`                             |
| `C-MKT-01`   | `MarketingHeader`     | marketing  | `/` (public landing)                     |
| `C-MKT-02`   | `LandingHero`         | marketing  | `/` (public landing)                     |
| `C-MKT-03`   | `InteractiveChatDemo` | marketing  | `/` (public landing)                     |
| `C-MKT-04`   | `BentoFeatures`       | marketing  | `/` (public landing)                     |
| `C-MKT-05`   | `MarketingFooter`     | marketing  | `/` (public landing)                     |
| `C-SHR-01`   | `EmptyState`          | shared     | All                                      |
| `C-SHR-02`   | `ErrorBanner`         | shared     | All                                      |
| `C-SHR-03`   | `ConfirmDialog`       | shared     | Destructive                              |
| `C-SHR-04`   | `MoneyText`           | shared     | All money                                |
| `C-SHR-05`   | `PermissionGate`      | shared     | All                                      |
| `C-SHR-06`   | `TrustFooter`         | shared     | Onboarding, Settings, Facturation        |
| `C-SHR-07`   | `StatusPill`          | shared     | Toolbar, order desk, connect cards       |
| `C-SHR-08`   | `TemperatureBadge`    | shared     | List, Pane 3, pipeline                   |
| `C-SHR-09`   | `ChannelBadge`        | shared     | List, thread header                      |

Do **not** add: `SnoozeButton`, `PaymentLinkButton`, `WhatsAppComposer`, `RevenueKpi`, `ConfidenceGauge` (numeric bands), `EmployeePlayground`, `StreamingToken`, `Confetti`, `ThreadView`, `CustomerPanel`, `LineItemEditor`, `StripeCheckout`, `UnreadViewTab`.

### 3.2 Build / screenshot priority (maps `22` §18 — do not invent a second ladder)

`03` / `30` own sequencing. This table only tells coding agents **which `C-*` to implement first** and tells `24` which trees to draw. Shell + `shared/` are P0 **infrastructure**: inbox P0 screens cannot mount without them, even though `22` §18 lists shell _screenshots_ as P1.

| `22` §18                           | Components (this file)                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** Command Center states A–D   | `InboxLayout`, `ConversationList`, `ConversationCard`, `InboxViewTabs`, `InboxFilterPopover`, `ThreadHeader` (`[Info]`), `AutonomyToolbar`, `MessageList`, `MessageBubble`, `MessageFeedback`, `SystemEventChip`, `DraftActions`, `SuggestionPanel`, `Composer` (`[Suggérer]`), `CustomerCard`, `LeadScoreBlock`, `OrderDeskCard`, `TimelineList`, `HandoffBriefing`, `InternalNote`, `AssignControl`, `CloseThreadButton` |
| **P0** Onboarding steps 2, 3, 5, 6 | `OnboardingChecklist`, `ChannelConnectCard`, `CsvImportWizard`, `PlaygroundSimulator`, `DecisionInspector`, `ActivationGate` (+ `ReplyModeRadios`)                                                                                                                                                                                                                                                                         |
| **P0** infrastructure              | Auth forms (`LoginForm`, `RegisterForm`, `AcceptInviteForm`; Should: forgot/reset), `GlobalHeader`, `AppSidebar`, `WorkspaceSwitcher`, `LanguageSwitcher`, `NotificationBell`, `NotificationPanel`, `UserMenu`, `SocketStatus`, `CommandPalette`, `PlanUsageCard`, `EmptyState`, `ErrorBanner`, `ConfirmDialog`, `MoneyText`, `PermissionGate`, `StatusPill`, `TemperatureBadge`, `ChannelBadge` (`C-SHR-07`–`09`)         |
| **P1**                             | `PipelineBoard`, `PipelineCard`, `ProductTable`, `VariantDrawer`, `ProductFormDialog`, `KpiCard`, `AnalyticsChart`                                                                                                                                                                                                                                                                                                         |
| **P2**                             | `SettingsTabs` (full tabs), `BusinessProfileForm`, `TeamMembersTable`, `InviteMemberDialog`, `BusinessRulesForm`, `BillingUsagePanel`, `TrustFooter`, empty/degraded compositions of `EmptyState` / `ErrorBanner`, `MarketingHeader`, `LandingHero`, `InteractiveChatDemo`, `BentoFeatures`, `MarketingFooter`                                                                                                             |

### 3.3 Composition examples (existing `C-*` only)

Authenticated chrome (every page except full-bleed auth):

```
GlobalHeader
  [≡] below lg · WorkspaceSwitcher · CommandPalette trigger · SocketStatus · LanguageSwitcher · NotificationBell → NotificationPanel · UserMenu
AppSidebar
  nav links · PlanUsageCard
<main>  ← page composes domain trees below
```

Full-bleed auth (`/login`, `/register`, `/invite`, Should `/forgot-password` `/reset-password`): **no** `GlobalHeader` / `AppSidebar` / bell / quota. Brand mark + `LanguageSwitcher` + the `C-AUTH-*` form.

`/` — Public Commercial Landing (`22` §3.4):

```
MarketingHeader
  Brand mark · descriptor · LanguageSwitcher · /login · /register
LandingHero
  Headline · value proposition · Meta API / stock / COD badges · /register CTA
InteractiveChatDemo
  Tunisian Derja / French conversation preview · instant stock verification · COD order card in DT
BentoFeatures
  4 strategic pillars (Derja fluency, grounded inventory, Silence Guarantee, 4-KPI ROI)
MarketingFooter
  Privacy Policy (/privacy) · Terms of Service (/terms) · Meta App Review developer contact
```

`/inbox` — `InboxLayout` (`22` §5 / §14):

```
InboxLayout
├ Pane 1
│   InboxViewTabs · InboxFilterPopover
│   ConversationList
│     ConversationCard  (TemperatureBadge, ChannelBadge, MoneyText)
├ Pane 2
│   ThreadHeader  ([Info] · AssignControl · CloseThreadButton)
│     AutonomyToolbar  (StatusPill + DraftActions | takeover | resume)
│   MessageList
│     MessageBubble · MessageFeedback · SystemEventChip · InternalNote · DraftActions
│   SuggestionPanel     (HUMAN_* only, on-demand)
│   HandoffBriefing     (when handoffContext present)
│   Composer            ([Suggérer] when HUMAN_*)
└ Pane 3  (Sheet at lg / below lg — same children, `--z-overlay`; [Info] opens/toggles)
    CustomerCard · LeadScoreBlock · OrderDeskCard · TimelineList
```

`/onboarding/step-6`: `OnboardingChecklist` → `ActivationGate` → optional `ReplyModeRadios`. TrustFooter.

`/pipeline`: `PipelineBoard` → `PipelineCard` (click = href, not inbox import).

`/products`: `ProductTable` → `VariantDrawer` · `ProductFormDialog`.

`/analytics`: four `KpiCard` + one `AnalyticsChart`. Period `Select` maps to `from`/`to` (`13` §13) — no extra `C-*`.

`/settings` — `SettingsTabs` (`22` §11):

```
SettingsTabs
├ Général          BusinessProfileForm
├ Canaux           ChannelConnectCard  (onboarding import)
├ Personnalité IA  ReplyModeRadios + agent fields as Inputs in the tab (no extra C-*)
├ Règles           BusinessRulesForm
├ Équipe           TeamMembersTable · InviteMemberDialog
└ Facturation      BillingUsagePanel  (Owner / usage.read only; composes PlanUsageCard)
```

### 3.4 File names

Domain widget **file name = export name**, PascalCase, owner folder: `components/inbox/InboxLayout.tsx` exports `InboxLayout`. Forbidden aliases: `Inbox.tsx`, `inbox-layout.tsx`, `MainInbox.tsx`, `InboxNew.tsx`. `components/ui/` stays generated shadcn kebab (`button.tsx`).

### 3.5 Query ownership

**One owner per resource** in a mounted tree. Children receive DTO props / callbacks. TanStack Query cache keys may be shared across routes; do not add a second `useQuery` for the same GET in a parent and a child.

| Resource                    | Owner               | Must not also fetch                     |
| --------------------------- | ------------------- | --------------------------------------- |
| `GET /conversations` (list) | `ConversationList`  | `InboxLayout`, `ConversationCard`       |
| `GET /conversations/:id`    | `InboxLayout`       | Pane 2/3 children (props)               |
| `POST .../read`             | `InboxLayout`       | —                                       |
| `GET .../messages`          | `MessageList`       | `InboxLayout`, `MessageBubble`          |
| `GET .../timeline`          | `TimelineList`      | —                                       |
| `GET`/`POST .../notes`      | `InternalNote`      | —                                       |
| `GET /orders/:id`           | `OrderDeskCard`     | —                                       |
| `GET /notifications`        | `NotificationBell`  | `NotificationPanel` (child of bell)     |
| `GET /usage`                | `PlanUsageCard`     | `BillingUsagePanel` (composes the card) |
| `GET /pipeline`             | `PipelineBoard`     | `PipelineCard`                          |
| `GET /analytics/overview`   | `/analytics` page   | each `KpiCard`                          |
| `GET /ai/usage`             | `BillingUsagePanel` | analytics tiles                         |

Isolated widgets (`AssignControl` members, settings forms) fetch their own resource on their page.

---
