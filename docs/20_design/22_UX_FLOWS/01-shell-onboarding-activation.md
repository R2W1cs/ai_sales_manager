# 22 — UX Flows & Screen Specifications

| Field           | Value                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document ID     | `22_UX_FLOWS`                                                                                                                                                                               |
| Status          | Approved — canonical for screen-by-screen flows, layouts, and operator interactions                                                                                                         |
| Owner           | Product / UX Design                                                                                                                                                                         |
| Audience        | Frontend engineers, UX designers, QA, backend engineers, AI coding agents                                                                                                                   |
| Depends on      | `00_PROJECT_OVERVIEW.md`, `01_PRODUCT_REQUIREMENTS.md`, `03_MVP_SCOPE.md`, `05_AI_BEHAVIOR_SPECIFICATION.md`, `06_AI_HUMAN_HANDOFF_RULES.md`, `20_DESIGN_SYSTEM.md`, `21_BRAND_STRATEGY.md` |
| Consumed by     | `23_UI_COMPONENTS.md`, `24_REFERENCE_SCREENS.md`, `apps/web` application shell & screen routes, `30_execution/32_FEATURE_SPECIFICATIONS.md`                                                 |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# Sales Command Center (Inbox UX)`, `# Onboarding Screens`, `# UX/UI Design Direction`, `# Merchant connection flow (MVP)`                           |

---

## 1. Purpose and scope

This document is the **canonical specification for all user journeys, screen layouts, pane mechanics, triage queues, and interactive workflows** within the AI Sales Agent operator platform.

**In scope:**

- The complete application shell (Header, Sidebar, Main viewport).
- The 6-step merchant onboarding flow, activation checklist, CSV import wizard, and AI Playground simulator.
- The Sales Command Center (three-pane workplace): triage list, chat window, customer context & action panel.
- Conversation priority model (two active tiers + archived `RESOLVED`), filters, search, and view persistence.
- AI takeover mechanics, autonomy toggles, human handoff banners, and AI response suggestions.
- Sales Pipeline Kanban view (state-projected 4-column board).
- Catalog & variant management screens and quick stock adjustments.
- Business rules & AI settings configuration interfaces.
- Four-KPI analytics and performance dashboards.
- Real-time Socket.IO handling, pending/queued UI, reconnect refetch, and degradation states.
- Responsive & mobile layouts (tablet drawer, mobile single-pane drilldown).

**Out of scope, and where it lives instead:**

| Topic                                                                    | Canonical location                         |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| UI tokens, hex codes, typography scales, CSS variables, radius, z-index  | `20_DESIGN_SYSTEM.md`                      |
| Brand archetype, tone of voice, terminology glossary, trust cues         | `21_BRAND_STRATEGY.md`                     |
| Granular React component props, TS interfaces, Base UI primitives        | `23_UI_COMPONENTS.md`                      |
| Visual screenshot benchmarks & pixel-accurate mocks                      | `24_REFERENCE_SCREENS.md`                  |
| Handoff triggers (1–15), priority levels, escalation payload definitions | `06_AI_HUMAN_HANDOFF_RULES.md`             |
| AI Decision Engine, tool definitions, intent taxonomy, guardrails        | `05_AI_BEHAVIOR_SPECIFICATION.md`          |
| Database schemas, Prisma models, indexes, and constraints                | `12_DATABASE_DESIGN.md`                    |
| REST endpoints, query parameters, Socket.IO gateway events               | `13_API_DESIGN.md` / `14_SYSTEM_DESIGN.md` |

---

## 2. Core UX Invariants & Principles

1. **The Sales Command Center Principle:** The operator surface is not a generic chat app. It answers three questions in under 5 seconds:
   > _"Who is talking to my business, how likely are they to buy, and what should I do next?"_
2. **The Silence Guarantee (NFR-UX-07):** Do not force merchants to watch routine AI conversations. A calm dashboard means the autonomous agent is working correctly. Noise is an inverse quality signal.
3. **Safety Outranks Revenue:** Escalations requiring human intervention (`HUMAN_REQUIRED`) always sit above high-scoring active leads. An upset customer never drops below an active hot lead.
4. **Transparent, Deterministic Control:** The operator always retains total authority over AI autonomy. Toggles and takeovers reflect verified server state, not optimistic illusions.
5. **Context Precedes Action:** Every decision-critical piece of customer data (phone, address, product variant, cart value, score factors) is visible in the active viewport without opening popups or modals.
6. **Familiarity in Chat:** The transcript remains a clean, standardized message thread. System events, handoffs, and orders render as distinct inline cards, never as conversational bubbles.

### 2.1 UX Psychology Principles

Bridging brand psychology (`21_BRAND_STRATEGY.md` §3.3) to operator interactions:

- **Reduce Cognitive Load:** Operators should never need to memorize customer context across pages. Critical context (variant, cart total, phone, address, escalation trigger) appears directly in the active viewport.
- **Preserve Human Agency:** The AI assists and qualifies, but never removes operator authority. Takeover is always 1-click reachable and authoritative.
- **Progressive Disclosure:** Surface operational urgency first (Tier 1 escalations), detailed customer history second (Pane 3), and deep audit/trace logs on-demand only (Playground/Inspection modal).
- **Trust Through Transparency:** AI actions expose clear grounding rationale and deterministic confidence states instead of behaving like an opaque black box.
- **Calm Productivity:** The dashboard stays quiet when autonomous operations run smoothly; notification volume is strictly bounded to prevent alert fatigue.

### 2.2 UX Anti-Patterns

Forbidden interaction and layout patterns (visual anti-patterns remain in `20_DESIGN_SYSTEM.md` §9.1):

- Generic chatbot / WhatsApp-clone layout (single transcript, no triage, no context pane)
- Full-screen modal workflows for frequent actions (takeover, confirm order, call, send)
- Hiding customer context, phone, or pending order behind extra tabs or nested drawers on desktop
- Excessive notifications, toast storms, or unread badges on routine AI replies
- Color-only status indicators (temperature, confidence, and errors also need word + icon)
- Autonomous AI actions without visible state, reason, or takeover control
- Recency-only conversation sorting
- Payment-link affordances in MVP

---

## 3. Application Shell Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ GLOBAL HEADER (h-14 / 56px, bg-header var(--color-header), fg var(--color-header-fg), z-header) │
│ [Logo + "AI Sales Agent"]  [Workspace Switcher]  |  [Lang: FR] [Bell (3)] [User Menu] │
├──────────────┬─────────────────────────────────────────────────────────────────────────┤
│ SIDEBAR      │ MAIN WORKSPACE CANVAS (bg var(--color-canvas))                          │
│ (w-60 /      │                                                                         │
│ 240px,       │                                                                         │
│ collapsible) │                                                                         │
│              │                                                                         │
│ • Inbox (4)  │                                                                         │
│ • Pipeline   │                                                                         │
│ • Produits   │                                                                         │
│ • Analyses   │                                                                         │
│ • Réglages   │                                                                         │
│ ──────────── │                                                                         │
│ [Plan: Pro]  │                                                                         │
│ [Quota: 82%] │                                                                         │
└──────────────┴─────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Header Navigation (`GlobalHeader`)

- **Height:** `56px` (`h-14`).
- **Visual Anchor:** Dark Navy background (`var(--color-header)`) with high-contrast white text/icons (`var(--color-header-fg)`).
- **Items (Left to Right):**
  1. Brand Mark & Product Name (`AI Sales Agent`).
  2. Business Switcher dropdown (`current_business.name`, role indicator).
  3. Search trigger (`Cmd+K` global command palette).
  4. System Health / Status indicator (Socket connected / Reconnecting).
  5. Language Switcher (`FR` default, `AR`, `EN`).
  6. Notification Bell with badge counter for unread high-priority alerts.
  7. User Profile menu (Avatar, User name, Role, Logout).

### 3.2 Main Navigation Sidebar (`AppSidebar`)

- **Desktop Width:** `240px` (`w-60`) at `xl`. Icon-only `64px` at `lg`. Below `lg`: overlay `Sheet` from header `[≡]` (`20` §6.2 / `23` `AppSidebar`). Not swipe.
- **Selected nav item:** `--surface-selected` + `3px` start border `var(--color-accent)` (`20` §4.5). Not a lime fill. Not `--surface-active`.
- **Navigation Links:**
  - **Boîte de réception** (`/inbox`) — carries unread/needs-attention badge count.
  - **Pipeline de vente** (`/pipeline`) — visual deal board.
  - **Produits** (`/products`) — catalog, stock, and variants.
  - **Analyses** (`/analytics`) — the 4 core performance KPIs.
  - **Paramètres** (`/settings`) — AI personality, business rules, channels, team. **Hidden for Employee** (`22` §3.3).
- **Sidebar Footer:**
  - Plan & Usage card: Owner only (`usage.read` / `GET /usage`). _Plan Pro — 41 200 / 50 000 msgs_ with visual progress bar. Warning state triggers at ≥80% (orange) and ≥95% (red). Admin/Employee do not call `/usage`.
  - Collapsible toggle button.

### 3.3 Role-Based UX Access & Permission Boundaries

| Feature / Screen Area                         | Propriétaire (`owner`)  | Administrateur (`admin`) |          Agent (`employee`)           |
| --------------------------------------------- | :---------------------: | :----------------------: | :-----------------------------------: |
| View Inbox & Reply (`/inbox`)                 |            ✓            |            ✓             |                   ✓                   |
| Takeover & Confirm Orders                     |            ✓            |            ✓             |                   ✓                   |
| View Pipeline (`/pipeline`)                   |            ✓            |            ✓             |                   ✓                   |
| View Catalog (`/products`)                    |            ✓            |            ✓             |     ✓ (read / panel context only)     |
| Add / Edit / Delete Products, Variants, Stock |            ✓            |            ✓             |          ✗ (`catalog.write`)          |
| AI Playground Simulator                       | ✓ (with decision trace) | ✓ (with decision trace)  |      ✗ (`ai.playground` is 403)       |
| Decision traces (inbox or playground)         |            ✓            |            ✓             | ✗ — briefing only (`handoff_context`) |
| AI Settings & Business Rules (`/settings`)    |            ✓            |            ✓             |                   ✗                   |
| Connect / Disconnect Channels                 |            ✓            |            ✓             |                   ✗                   |
| Team Member Management                        |            ✓            |            ✓             |                   ✗                   |
| Billing, Plan & Invoices                      |            ✓            |            ✗             |                   ✗                   |
| Four-KPI Analytics (`/analytics`)             |            ✓            |            ✓             |    ✓ (same four figures; no cost)     |

Permission **codes** and enforcement are canonical in `13` §2.11 and `17`. This table is the operator-visible mapping only. Do not invent a fourth role. UI hiding is not a control (`17`).

### 3.4 Public Commercial Landing Page (`/`)

The root route `/` renders a public marketing surface communicating the product's commercial proposition to prospective merchants and satisfying Meta App Review compliance requirements:

1. **Marketing Header (`MarketingHeader`):**
   - Brand mark + descriptor ("AI Sales Agent").
   - Language selector (`FR` default, `AR`, `EN`).
   - Secondary action: _"Se connecter"_ (`/login`).
   - Primary action: _"Commencer gratuitement"_ (`/register`) with lime-400 accent.

2. **Hero Section (`LandingHero`):**
   - Headline: _"L'employé de vente IA pour le commerce social en Tunisie"_.
   - Subheadline: _"Transformez vos conversations Instagram & Messenger en commandes confirmées, 24/7 en Derja et Français."_
   - Trust Badges: _"API Officielle Meta"_, _"Gestion de stock temps réel"_, _"Paiement à la livraison (COD)"_.
   - Primary CTA linking to `/register`.

3. **Interactive Conversation Simulation (`InteractiveChatDemo`):**
   - Visual mock of an Instagram Direct thread demonstrating Tunisian Derja and French code-switching (_"Slm, mazelt fama taille M ?"_).
   - Instant stock verification and variant reservation.
   - Inline pending order card with delivery address and COD total in `DT`.

4. **Strategic Pillars Bento Grid (`BentoFeatures`):**
   - **Local Linguistic Fluency:** Native understanding of Derja, Arabizi, and French.
   - **Grounded Commerce:** Zero hallucinations; binds to real catalog variants and inventory.
   - **The Silence Guarantee:** Quiet when autonomous sales run smoothly; alerts only when human closure is needed.
   - **Transparent ROI:** 4 core KPI metrics in Dinars (`DT`).

5. **Compliance & Trust Footer (`MarketingFooter`):**
   - Direct links to Privacy Policy (`/privacy`), Terms of Service (`/terms`), and developer contact for Meta App Review verification.

---

## 4. Onboarding Flows & Activation Gates

Onboarding is a **guided, non-blocking checklist** persisted in `businesses.onboarding_steps`. The merchant can leave and resume at any time.

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ ONBOARDING WIZARD / PROGRESS CHECKLIST                                                │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ Étape 1 : Entreprise  ──▶ Étape 2 : Canaux ──▶ Étape 3 : Produits ──▶                 │
│ Étape 4 : Règles & IA ──▶ Étape 5 : Test   ──▶ Étape 6 : Activation                  │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

```
                                  ┌───────────────────────────┐
                                  │   ONBOARDING STATE FLOW   │
                                  └─────────────┬─────────────┘
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │ Step 1: Business Info │
                                    └───────────┬───────────┘
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │ Step 2: Connect Meta  │
                                    │ (Instagram/Messenger) │
                                    └───────────┬───────────┘
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │ Step 3: Product CSV   │
                                    │ or Manual Variant Add │
                                    └───────────┬───────────┘
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │ Step 4: AI & Policies │
                                    │ (Delivery/Payment/Ret)│
                                    └───────────┬───────────┘
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │ Step 5: AI Simulator  │
                                    │ (Playground Trial)    │
                                    └───────────┬───────────┘
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │ Step 6: Live Gate &   │
                                    │ Handshake Activation  │
                                    └───────────────────────┘
```

### 4.1 Step 1 — Create Business (`/onboarding/step-1`)

- **Inputs:** Business Name (e.g. _Maison de Mode Tunis_), Industry (Default: _Mode & Habillement_), Country (_Tunisie_ [TN]), Default Language (_Français_ [fr-TN] / _Arabe_ [ar-TN]). Currency **displays as DT**; API stores `TND` (`13` §5). Timezone default `Africa/Tunis`.
- **Backend Action:** `POST /api/v1/businesses` creates the workspace, default `ai_agents`, `reply_mode=approval_required`, and starter `business_rules`. Caller becomes Owner.
- **Exit:** Advances the checklist to Step 2. The merchant can leave and resume (not a trap wizard).

### 4.2 Step 2 — Connect Channels (`/onboarding/step-2`)

- **Interface:** Three connection cards:
  1. **Instagram Direct:** `[Connecter avec Facebook]` button. Triggers Meta OAuth (scopes canonical in `16_INTEGRATION_DESIGN.md`).
  2. **Facebook Messenger:** Linked via connected Facebook Page during Meta OAuth.
  3. **WhatsApp Business:** Displayed as a distinct card with badge **"Phase 2 — Bientôt disponible"** (disabled with informative tooltip).
- **Success State:** Displays connected Page name, Instagram handle (`@boutique_tn`), account avatar, and green _Actif_ badge.
- **Activation Gate G3 Satisfied:** At least 1 active channel connected (`channel_accounts.status = 'active'`).

### 4.3 Step 3 — Product Catalog Import (`/onboarding/step-3`)

- **Interface:** Dual tab choice:
  - **Tab A: Import CSV** (Primary path for existing merchants).
  - **Tab B: Saisie manuelle** (Form for adding single product + variants).

#### The CSV Import Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Glisser-    │ ──▶ │  Validation  │ ──▶ │  Rapport     │ ──▶ │  Import &    │
│  Déposer CSV │     │  Colonnes    │     │  d'Erreurs   │     │  Indexation  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

1. **Upload:** Drag & drop zone with downloadable CSV sample template (_nom, description, prix, stock, taille, couleur, sku_).
2. **Column Mapping:** Automatic mapping with visual confirmation chips.
3. **Pre-flight Error Report:** Row-by-row validation table showing valid rows (green check) vs. invalid rows (missing price, negative stock). User can choose _Ignorer les lignes erronées et importer (42/45 produits)_.
4. **Execution & Embeddings:** Async processing bar. On completion, products and variants are upserted into `products` / `product_variants` and queued for embeddings indexing.

- **Activation Gate G1 Satisfied:** At least 1 product with a priced, stocked variant.

### 4.4 Step 4 — AI Personality & Minimum Policies (`/onboarding/step-4`)

- **Two Sub-panels:**
  1. **Personnalité de l'Agent:**
     - Agent Name (e.g. _Sarra - Conseillère Vente_).
     - Tone selector: _Chaleureux & Commercial_ (Default), _Professionnel & Formel_, _Concis & Rapide_.
     - In-chat primary dialect: _Tunisien (Derja)_ (Default), _Français_, _Mixte_.
     - Greeting message preview.
  2. **Règles commerciales essentielles (Minimum Policy Pack):**
     - **Frais & Délais de Livraison:** e.g. _7 DT sur toute la Tunisie (24-48h)_.
     - **Modes de Paiement:** _Paiement à la livraison (Cash on Delivery - COD)_ (Default checked), _Virement bancaire_.
     - **Politique d'Échange & Retour:** e.g. _Échange possible sous 7 jours, frais de retour 7 DT à la charge du client_.
- **Activation Gate G2 Satisfied:** Minimum policies defined or defaults explicitly accepted.

### 4.5 Step 5 — AI Playground Simulator (`/onboarding/step-5`)

- **Interface:** Split-screen testing sandbox.
  - **Left:** Simulated customer chat interface with quick scenario chips:
    - `[Demander le prix d'un produit]`
    - `[Vérifier la disponibilité taille/couleur]`
    - `[Simuler intention d'achat]`
    - `[Réclamation / Client mécontent]`
  - **Right:** Live Decision Inspector (Owner/Admin view only):
    - Classified Intent (e.g. `purchase_intent` [Confidence: 0.94]).
    - Retrieved Knowledge & Rules (Grounding source).
    - Tool Execution log (`catalog_check_stock`, `order_create_reservation`).
- **Sandbox Data Rule:** Playground threads are `source=playground`, `is_test=true`. They never hit Meta, KPIs, or `usage_events` (`13` §11, `14` §2).
- **Activation Gate G4 Satisfied:** At least one playground scenario completed, **or** an `approval_required` trial with at least one approved reply (`01` §14).
- **Who can open this screen:** Owner and Admin only (`ai.playground`). Employees receive **403** and never see this route as a working tool (`13` §2.11, `17`).

#### 4.5.1 Traces vs briefing (not an Employee playground)

- **Owner / Admin:** Decision inspector shows classified intent, confidence, retrieved knowledge, and tool logs (`ai.traces.read`).
- **Employee:** No playground. In the live inbox they see the handoff **briefing** (`handoff_context`: reason, priority, required action), never the reasoning trace (FR-OBS-003).

### 4.6 Step 6 — Live Activation & Human Handshake (`/onboarding/step-6`)

- **Pre-activation Checklist Matrix (Gates G1–G5):**
  - [x] G1: Au moins 1 produit avec variante et prix configuré.
  - [x] G2: Règles de livraison et paiement enregistrées.
  - [x] G3: Au moins un canal Meta connecté (Instagram / Messenger).
  - [x] G4: Test de simulation validé dans le Playground.
  - [ ] G5: **Engagement humain:** _« Je comprends que l'IA qualifie les commandes et que mon équipe doit valider manuellement la confirmation finale. »_ (Mandatory checkbox).
- **CTA Button:** `[Activer l'Agent IA en direct]`. Disabled while `aiActivationReady` is false; show `unmetGates`.
- **Optional reply-mode toggle:** `[Autoriser l'envoi automatique]` — **off by default**. Owner/Admin only (`ai.configure`). Enabling PATCHes `replyMode: auto_send` via `PATCH /api/v1/ai/settings` (`13` §11). Leaving it off keeps `approval_required`.
- **FR-AI-011 pin:** G4 unblocks **live** AI; it does **not** flip `reply_mode`. New tenants stay `approval_required` until the Owner sets `auto_send` here or later in Settings.
- **Frontend UX Behavior:** Pending spinner on the CTA; on **422** `activation_not_ready` list unmet gates in place.
- **Backend Contract:** `PATCH /api/v1/integrations/live` `{ "enabled": true }` (`13` §10). Do **not** send `{ "aiActivated": true }` to `PATCH .../onboarding` (that path only accepts G5 `handoffAcknowledged`). Live enablement and `reply_mode` are separate writes.
- **Transition:** On success, redirect to `/inbox`. Default chrome is **draft-to-approve** (`📝 Brouillon à valider`), not `🤖 IA en cours`.

---
