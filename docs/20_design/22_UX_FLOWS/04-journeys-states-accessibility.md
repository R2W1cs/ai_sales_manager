## 14. Responsive Layouts & Mobile Navigation

### 14.1 Breakpoint Behavior Matrix

Matches `20` §7. Sidebar collapse (`md`) is independent of inbox pane count.

| Viewport Width                               | Layout Mode       | Navigation Pattern                                                                                        |
| -------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| **Desktop (`≥ 1280px` / `xl`)**              | Full 3-pane       | Sidebar `240px` outside the split. Pane 1 (~28%) + Pane 2 (~44%) + Pane 3 (~28%) inside **main**.         |
| **Compact desktop (`1024px–1279px` / `lg`)** | 2-pane + sheet    | Icon sidebar `64px`. List + chat. Pane 3 as overlay sheet (`var(--z-overlay)` — below header, `20` §6.2). |
| **Below `lg` (`< 1024px`)**                  | Single-pane stack | Overlay nav `[≡]`. `List` ──▶ `Chat` ──▶ `Details` sheet. Primary actions use `--control-height-mobile`.  |

At `lg` the **sidebar** is icon-only (`64px`). Below `lg` it is an overlay `Sheet` from `[≡]` — that does not by itself enable two inbox panes. **No swipe.**

### 14.2 Single-pane journey (below `lg` / `< 1024px`)

```
┌───────────────────────────┐     ┌───────────────────────────┐     ┌───────────────────────────┐
│ MOBILE SCREEN 1: LIST     │     │ MOBILE SCREEN 2: CHAT     │     │ MOBILE SCREEN 3: DETAILS  │
├───────────────────────────┤     ├───────────────────────────┤     ├───────────────────────────┤
│ [≡] Boîte de réception(3) │ ──▶ │ [◀] Ahmed Ben Ali   [Info]│ ──▶ │ [✕] Fiche Client & Action │
│ ───────────────────────── │     │ 🤖 Mode IA   [Prendre]    │     │ ───────────────────────── │
│ 🚨 Ahmed Ben Ali       2m │     │ ───────────────────────── │     │ 📦 COMMANDE #1042         │
│   Prêt à commander • 120DT│     │ [Client] "nheb taille M"  │     │ 1x Hoodie Noir (M)        │
│                           │     │ [IA] "Parfait..."         │     │ Total: 127 DT             │
│ 🔥 Sonia K.            8m │     │ ───────────────────────── │     │                           │
│   Robe Rouge • 85 DT      │     │ [ Message...]      [Env]  │     │ [ Confirmer la commande ] │
└───────────────────────────┘     └───────────────────────────┘     └───────────────────────────┘
```

1. **Screen 1 (List):** Full-width triage list with high-touch cards (min height 72px). Tapping a card transitions to Screen 2.
2. **Screen 2 (Chat):** Header contains back button (`◀`), contact name, and `[Info]` action. Sticky bottom bar with 1-tap `[Prendre la main]` toggle and message composer.
3. **Screen 3 (Details Bottom Sheet):** Tapping `[Info]` opens a modal bottom sheet containing the Order confirmation deck, Customer phone (`[📞 Appeler]`), and Lead score factors.

---

## 15. Notification Discipline & Anti-Spam Rules

To preserve the **Silence Guarantee**, the platform strictly limits desktop and audio notifications:

### 15.1 Allowed Notification Triggers (Only 4 Situations)

1. **🚨 Hot Lead Detected:** Lead score crosses ≥ 80 threshold upward.
2. **📦 Order Awaiting Confirmation:** AI drafts order and sets `PENDING_CONFIRMATION`.
3. **⚠️ AI Escalation / Uncertainty:** Triggered by confusion, stock conflict, or low confidence.
4. **😡 Angry Customer:** Escalation triggered by complaint/dispute detection.

### 15.2 Anti-Spam Constraints

- **Deduplication:** Maximum 1 notification per conversation per trigger type per 60 minutes.
- **Batching:** Multiple hot leads within 5 minutes are grouped (_« 3 nouveaux leads chauds nécessitent votre attention »_).
- **Working Hours Muting:** Audio chimes are automatically muted outside configured `business_rules.working_hours` (alerts remain in the notification center).

---

## 16. UI States: Empty, Degraded & Loading

_(Functional and copy specifications are canonical below. Visual benchmark screenshots and pixel mocks are deferred to `24_REFERENCE_SCREENS.md`)_

### 16.1 Empty & Degraded State Specifications

| Scenario                            | UI Component             | Functional & Copy Treatment (French)                                                                                                  | Action CTA                        |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Fresh Tenant (No Conversations)** | Pane 1 & 2               | Empty channel state. _"Votre boîte de réception est prête. Partagez votre lien Instagram pour recevoir vos premiers messages."_       | `[Voir les canaux connectés]`     |
| **No Leads Needing Attention**      | Pane 1 (Tab "À traiter") | Reassuring status. _"Aucune action requise pour le moment. L'agent IA gère actuellement vos conversations."_                          | `[Voir toutes les conversations]` |
| **Disconnected Meta Channel**       | Top of Pane 2            | Amber alert banner. _"La connexion avec votre compte Instagram a expiré suite à un changement de mot de passe Meta."_                 | `[Reconnecter le compte]`         |
| **Quota Threshold (≥ 80%)**         | Sidebar Footer           | Orange status indicator. _"Vous avez utilisé 80% de vos messages IA mensuels."_                                                       | `[Mettre à niveau le plan]`       |
| **Quota Exhausted (100%)**          | Top of Pane 2            | Red persistent banner. _"Quota de messages IA atteint. L'agent est en pause, vos équipes peuvent continuer à répondre manuellement."_ | `[Recharger des messages]`        |

### 16.2 Loading States & Feedback Patterns

| Surface / Action             | Loading Pattern                 | Behavior & Interaction Budget                                                                            |
| ---------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Inbox Initial Load**       | Skeleton Shimmer                | Skeleton placeholders for Pane 1 cards and Pane 2 transcript (< 1.5s).                                   |
| **Conversation Switch**      | Stale-While-Revalidate          | Instantly render cached thread if present (< 200ms); subtle top progress bar if fetching remote history. |
| **AI Suggestion Generation** | Pulsing Skeleton Card           | Shimmer box above composer with _"Génération de la suggestion..."_ (< 5s).                               |
| **Order Confirmation Click** | Button Spinner + Disabled State | Spinner inside `[✓ Confirmer]`, button disabled to prevent duplicate POST requests (< 500ms).            |
| **CSV Product Upload**       | Determinate Progress Bar        | Live row processing counter (`Validation 24/50...`) followed by async indexing status.                   |
| **Takeover Toggle**          | Pending control (`aria-busy`)   | Do not claim ownership until `POST .../takeover` **200**. Revert on error.                               |

### 16.3 Error Recovery Patterns

Every operational failure state must specify what happened, whether action is required, the recovery CTA, and data preservation:

| Failure Scenario                 | UI Surface & Treatment                                                       | User Action Required | Recovery CTA                                                               | Data Preservation Behavior                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Failed Meta Outbound Send**    | Red inline border on message bubble: _« ⚠️ Échec d'envoi Meta »_             | Yes                  | `[Réessayer l'envoi]`                                                      | Message draft is preserved in composer/thread; not lost.                                                                                                    |
| **Failed Order Confirmation**    | Red toast alert: _« Erreur lors de la validation : stock insuffisant »_      | Yes                  | `[Réessayer]`                                                              | Order card remains visible with original items; modal does not close. **No** `[Ajuster les articles]` — `13` has no line-item PATCH (`23` `OrderDeskCard`). |
| **Failed CSV Import Validation** | Pre-flight error table highlighting invalid rows                             | Yes                  | `[Télécharger le rapport d'erreurs]` / `[Ignorer et importer les valides]` | Valid rows remain staged; user can fix invalid rows without re-uploading everything.                                                                        |
| **Meta OAuth Disconnection**     | Amber sticky header banner on `/inbox`                                       | Yes (Owner/Admin)    | `[Reconnecter le compte]`                                                  | Channel remains registered in DB; resumes processing instantly after re-auth.                                                                               |
| **AI Engine / LLM Timeout**      | Fails gracefully to `ESCALATION` (`low_confidence` or `integration_failure`) | Yes                  | Moves to Tier 1 queue; suggestion panel offers `[Régénérer]`               | Conversation context and customer message are fully preserved.                                                                                              |

---

## 17. Golden User Journeys

### 17.1 Journey 1: First Sale (Onboarding to First Conversion)

```
1. Signup & Workspace Creation (`/onboarding/step-1`)
   ↓
2. Connect Instagram Direct & Messenger via Meta OAuth (`/onboarding/step-2`)
   ↓
3. Upload Product Catalog CSV with Priced Variants (`/onboarding/step-3`)
   ↓
4. Configure AI Personality & Minimum Policies (`/onboarding/step-4`)
   ↓
5. Run Buying Scenario Test in AI Playground (`/onboarding/step-5`)
   ↓
6. Accept Handshake & Activate Live AI Agent (`/onboarding/step-6`). Optional `auto_send` stays **off**.
   ↓
7. Inbound Customer Direct Message Arrives on Instagram
   ↓
8. AI drafts replies (`approval_required` default). Operator `[Approuver et envoyer]` in the thread (`📝 Brouillon à valider`)
   ↓
9. After approved turns, the AI qualifies the customer, confirms variant (Size M), & captures phone/address
   ↓
10. AI Escalates to Handoff (`purchase_intent` → Tier 1 Urgent Queue on `/inbox`)
   ↓
11. Operator Reviews Order Card in Pane 3 and Clicks `[✓ Confirmer la commande]`
```

### 17.2 Journey 2: Daily Operator Workflow

```
1. Operator Opens `/inbox` (Default Tab: "À traiter")
   ↓
2. Operator Reviews Tier 1 Urgent Escalations (Sorted by Waiting Time)
   ↓
3. For Orders: One-Click Phone Dial (`[📞 Appeler]`) & One-Click Confirm (`[✓ Confirmer]`)
   ↓
4. For Complex Inquiries: Takes Over Chat (`[Prendre la main]`), Uses AI Suggestions, and Replies
   ↓
5. Reviews Hot Leads (`Score ≥ 80`) in Tier 2 to Identify Upsell Opportunities
   ↓
6. Reviews Daily 4-KPI Analytics on `/analytics` to Track AI vs. Human Conversion
```

### 17.3 Journey 3: Channel Reconnection & Recovery

```
1. Meta Password Reset or Token Expiry Occurs
   ↓
2. Webhook / API Detects `401 Unauthorized` / Graph Error #190
   ↓
3. Immediate Amber Banner Appears in Operator Header: "Instagram déconnecté"
   ↓
4. Operator Clicks `[Reconnecter le compte]` in Banner
   ↓
5. Meta OAuth Dialog Opens in Pop-up Modal
   ↓
6. Token Refreshed & Channel Account Flipped to `status = 'active'`
   ↓
7. AI inbound/outbound processing resumes per current `reply_mode` (still `approval_required` unless the Owner opted into `auto_send`)
```

---

## 18. Reference Screen Coverage Requirements

To ensure zero visual improvisation when coding agents implement the frontend, the following screens must have visual reference benchmarks defined in `24_REFERENCE_SCREENS.md`:

### 18.1 Required Screen Coverage Matrix & Priorities

Visual reference specifications in `24_REFERENCE_SCREENS.md` are prioritized into three implementation tiers:

#### Priority P0 — Core Operational & Conversion Workflows (Must Have Detailed Wireframes & Component Trees)

1. **Sales Command Center (`/inbox`):**
   - State A: Default `approval_required` thread (`📝 Brouillon à valider`, approve/edit chrome).
   - State A′: `auto_send` thread (`🤖 IA en cours`, lead score gauge).
   - State B: Human Takeover State (Operator composing, takeover banner, AI suggestion card).
   - State C: Order Confirmation Desk (Pane 3 Order Desk with single-click confirmation card).
   - State D: Complaint / Dispute Escalation State (Tier 1 red priority badge, suppressed suggestions).
2. **Onboarding Journey (`/onboarding`):**
   - Step 2: Channel Connection Cards (Instagram / Messenger active, WhatsApp disabled badge).
   - Step 3: Product Catalog CSV Upload & Pre-flight Error Validation Table.
   - Step 5: AI Playground Simulator (Split-screen chat + trace inspector).
   - Step 6: Activation Checklist, Mandatory Acknowledgement, optional `auto_send` toggle (off by default).

#### Priority P1 — Secondary Management & Performance Views

3. **Application Shell:**
   - Desktop (`≥ 1280px` / `xl`) with expanded sidebar.
   - Compact desktop (`1024px–1279px` / `lg`) collapsed/icon sidebar + context sheet.
   - Below `lg` (`< 1024px`) overlay nav + single-pane inbox stack.
4. **Sales Pipeline Screen (`/pipeline`):**
   - Active Kanban Board with 4 populated stage columns.
5. **Products & Catalog Screens (`/products`):**
   - Product Table with quick inline stock adjustments & Variant Drawer.
6. **Analytics Dashboard (`/analytics`):**
   - 4-Core KPI cards + Daily activity & conversion trend chart.

#### Priority P2 — Configuration, Edge & Zero States

7. **Empty & Degraded States:**
   - Empty Inbox (Zero active conversations).
   - Empty Pipeline Board.
   - Disconnected Meta Account Banner.
8. **Settings & Rules (`/settings`):**
   - AI Personality & Business Rules tabs.

### 18.2 Reference Specification Structure

Each reference screen specification in `24_REFERENCE_SCREENS.md` must provide:

- Structural Layout & ASCII Wireframe.
- Component Hierarchy Tree (Root container down to atomic buttons/chips).
- Visual Intent & Focal Points (What draws the operator's attention first).
- Interaction & Micro-copy Notes.

### 18.3 Visual Interpretation Rules

Reference screens are **implementation constraints**, not moodboards or inspiration.

Coding agents must preserve:

- Information hierarchy (what is primary vs secondary)
- Relative spacing and density relationships
- Component placement and interaction priority
- Visual emphasis (what draws the eye first)
- Pane proportions from §5.1

Do **not** redesign screens, invent extra chrome, or “improve” the layout unless a later revision of this file or `24_REFERENCE_SCREENS.md` explicitly requests it.

### 18.4 Reference Data Requirements

Every reference screen in `24_REFERENCE_SCREENS.md` must use a shared fixture set, not lorem ipsum. Each screen specifies:

- Example operators (`owner` / `admin` / `employee`)
- Example products and variants (name, size/color, price in DT, stock)
- Example conversations (Derja/French snippets, channel, temperature, assignee)
- Example orders (`PENDING_CONFIRMATION` vs `CONFIRMED`, totals in DT)
- Example timestamps in `fr-TN` relative and absolute forms
- Example AI states (`AI_ACTIVE`, `HUMAN_HANDLING`, `HUMAN_REQUIRED`) and `05` §7 ladder chrome (`📝 Brouillon à valider` vs `🤖 IA en cours`) — not extra numeric confidence bands

---

## 19. Accessibility & Ergonomics Standards (WCAG 2.1 AA)

1. **Keyboard Navigation:** All primary actions (takeover, open conversation, confirm order, navigate triage queue) must be fully navigable via keyboard (`Tab`, `Shift+Tab`, `Enter`, `Escape`, `Arrow` keys).
2. **Global Command Palette:** `Cmd+K` / `Ctrl+K` opens the quick switcher to search conversations, jump to products, or trigger quick actions.
3. **Contrast Compliance:** All text and interactive controls must meet WCAG 2.1 AA minimum contrast ratios (4.5:1 for normal text, 3:1 for large text and UI chrome), strictly verified in `20_DESIGN_SYSTEM.md` §4.4.
4. **Focus States:** Every interactive button, input, and card must provide an unmistakable focus ring (`var(--focus-ring)`).
5. **Screen Reader Labels:** All icon-only buttons (e.g. `[📞]`, `[✕]`, `[≡]`, channel icons) must include descriptive `aria-label` attributes in French (`aria-label="Appeler le client"`, `aria-label="Fermer le tiroir"`).
6. **Reduced Motion:** Respect `prefers-reduced-motion: reduce` by disabling skeleton shimmer animations, smooth scroll, and animated drawer transitions.

---

## 20. Rules for Coding Agents & Technical Writers

1. **Strict Token Consumption:** Use Tailwind utility classes and CSS variables strictly defined in `20_DESIGN_SYSTEM.md`. Never introduce custom hex colors or non-standard border radiuses.
2. **Next-intl Key Mapping:** Every label, placeholder, and button text must be referenced via translation keys (`t('inbox.takeover')`), maintaining French (`fr-TN`) as the primary locale.
3. **State Machine Integrity:** Never write status transitions directly on the frontend. Always invoke the canonical API endpoints (`/takeover`, `/confirm-order`, `/resume-ai`, `PATCH /orders/:id/status`).
4. **RTL Dynamic Attribute:** Ensure all message containers and preview snippets include `dir="auto"` to guarantee correct bidirectional rendering of Arabizi, Arabic, and French.
5. **Priority Model Mandate:** The conversation list query must always order by active tier (escalations first, then AI-handling) before applying `lead_score` or timestamp sorting. `RESOLVED` threads stay out of the default view.

---

## 21. References

- `docs/AI_Sales_Agent_Brain_Dump.md` → `# Sales Command Center (Inbox UX)`, `# Onboarding Screens`, `# UX/UI Design Direction`
- `docs/00_product/00_PROJECT_OVERVIEW.md` §3, §4, §14
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` FR-CONV, FR-LEAD, FR-ORD, NFR-UX
- `docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md` — AI Grounding & Suggestion constraints
- `docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md` — Handoff Triggers 1–15 & Priority schema
- `docs/10_engineering/14_SYSTEM_DESIGN.md` — State Machine & Socket.IO Gateway
- `docs/20_design/20_DESIGN_SYSTEM.md` — Visual Tokens & Component Styling
- `docs/20_design/21_BRAND_STRATEGY.md` — Tone of Voice & Terminology Glossary
- `docs/20_design/23_UI_COMPONENTS.md` — Component Specs & Props
- `docs/20_design/24_REFERENCE_SCREENS.md` — Visual Benchmarks & Mock Specifications (export pending)
