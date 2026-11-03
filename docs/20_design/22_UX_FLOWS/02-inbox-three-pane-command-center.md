## 5. Sales Command Center UX (Three-Pane Architecture)

The core operator workplace on `/inbox`.

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SALES COMMAND CENTER VIEWPORT                                                                     │
├──────────────────────────┬──────────────────────────────────────────┬─────────────────────────────┤
│ PANE 1: CONVERSATIONS    │ PANE 2: CHAT TRANSCRIPT                  │ PANE 3: CUSTOMER & ACTIONS  │
│ (28% / 320px min)        │ (44% / flex-grow)                        │ (28% / 320px min)           │
├──────────────────────────┼──────────────────────────────────────────┼─────────────────────────────┤
│ [Search ...] [Filter ▼]  │ 👤 Ahmed Ben Ali  • [IG]  • Score: 92/100│ Ahmed Ben Ali               │
│ Tabs: [À traiter(2)] [All]│ 🤖 Mode IA Actif    [Prendre la main]    │ +216 98 123 456  [Appeler]  │
├──────────────────────────┼──────────────────────────────────────────┼─────────────────────────────┤
│ 🚨 URGENT - À TRAITER    │ 10:14 [Client]                           │ COMMANDE EN ATTENTE         │
│ • Ahmed Ben Ali     2m   │ "nheb commande taille M svp"             │ • 1x Hoodie Noir (M)        │
│   Prêt à commander • 120DT│                                          │ • Total: 127 DT (Livraison) │
│                          │ 10:14 [IA]                               │                             │
│ 🔥 LEADS CHAUDS          │ "Parfait ! Un responsable va vous        │ [ Confirmer la commande ]   │
│ • Sonia K.          8m   │  contacter pour valider."                │ [ Modifier ] [ Annuler ]    │
│   Dispo Robe Rouge • 85DT│ ──────────────────────────────────────── │ ─────────────────────────── │
│                          │ ⚠️ Handoff : Prêt à commander            │ INFORMATIONS DU LEAD        │
│ 🟡 LEADS TIÈDES          │ ──────────────────────────────────────── │ Score: 92/100 (Chaud 🔥)    │
│ • Mehdi T.         15m   │ [ Proposition de message IA ]            │ Facteurs: (from API)        │
│   Demande prix           │ "Bonjour Ahmed, votre commande est prête"│ • Intention d'achat         │
│                          │ [Insérer] [Envoyer directement]          │ • Téléphone fourni          │
│                          │ ──────────────────────────────────────── │ • Produit ciblé             │
│                          │ [ Écrire un message en français/arabe...]│                             │
└──────────────────────────┴──────────────────────────────────────────┴─────────────────────────────┘
```

This wireframe is a **handoff / pending-order** thread (Tier 1). Default post-activation chrome for new tenants is `📝 Brouillon à valider` (§7.1), not `🤖 Mode IA Actif`.

### 5.1 Pane Proportions & Layout Contract

- **Total Main Width Split:**
  - **Pane 1 (Triage List):** `28%` (Min: `280px`, Max: `360px`, default `320px`).
  - **Pane 2 (Chat Transcript):** `44%` (Min: `420px`, flexible grow).
  - **Pane 3 (Context & Actions):** `28%` (Min: `280px`, Max: `380px`, default `320px`).
- **Collapsibility:** Pane 3 can be toggled via `[Info]` button in Pane 2 header to give maximum transcript space on compact desktop viewports.

---

## 6. Pane 1: Conversation Triage List

### 6.1 Conversation Priority Model (Authoritative)

The default queue uses **two active priority tiers**. `RESOLVED` / closed threads are an **archived tier**, hidden from _À traiter_, not a third competing sort. Snooze is Phase 2 (`03`, FR-CONV-018); there is no snooze control or `SNOOZED` lane in MVP (`13` §6.2).

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ACTIVE TIER 1 : ACTION REQUISE (Statut = HUMAN_REQUIRED)                │
│ 1. Trié par handoff_priority : CRITICAL ──▶ HIGH ──▶ NORMAL             │
│ 2. Tri secondaire : handoff_at ASC (le plus ancien en attente en haut)  │
├─────────────────────────────────────────────────────────────────────────┤
│ ACTIVE TIER 2 : GESTION IA ACTIVE (Tous les autres statuts actifs)      │
│ 1. Trié par lead_temperature : HOT (🔥) ──▶ WARM (🟡) ──▶ COLD (⚪)     │
│ 2. Tri secondaire : lead_score DESC (100 à 0)                           │
│ 3. Tri tertiaire : last_message_at DESC (plus récent)                   │
├─────────────────────────────────────────────────────────────────────────┤
│ ARCHIVED : RÉSOLU / CLÔTURÉ                                             │
│ Masqué de la vue par défaut "À traiter". Not a live priority lane.      │
│ Snooze is not MVP.                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Conversation Card Anatomy

Every card renders without requiring selection:

1. **Channel Icon & Handle/Name:** `[IG]` / `[FB]` + Customer Name (1-line ellipsis, `title` = full name — `20` §5.1).
2. **Temperature & Score:** `TemperatureBadge` from `leadTemperature` + tabular `leadScore`. Do **not** recompute hot/warm/cold from score in the client (`14` §10.2).
3. **Value snippet:** `pendingOrder.total` as `DT` when present. No product title on the list DTO (`13` §3.3).
4. **Last Message Snippet:** 1-line ellipsis preview with `dir="auto"` for proper Arabic/Latin rendering.
5. **Urgency Flag (Tier 1 only):** Red banner with escalation reason (e.g. _Prêt à commander_, _Réclamation_).
6. **Assignee Avatar:** Initials avatar if assigned to an operator.
7. **Relative Timestamp:** e.g. _2 min_, _1 h_.

### 6.3 List Filters & View Management

- **Top Segmented Tabs:**
  - **À traiter (Needs me):** Default `view=needs_me` (`13` §6.1). Shows `HUMAN_REQUIRED`, **or** `HUMAN_HANDLING` assigned to me, **or** `lead_temperature=hot`, **or** a `draft` on the thread. Not “all conversations.”
  - **Tous (All):** `view=all` — active stream excluding archived and `is_test`.
- **Unread:** `unread` on the list DTO is a **row wash**, not a third `view`. `13` §6.1 has no `view=unread` — do not client-filter the loaded page.
- **Filter Popover Options:** channel, assignee, temperature, `has_pending_order` — query params in `13` §6.1. WhatsApp hidden unless the tenant has an account **and** `whatsapp_enabled`.
- **Search (`q`):** Shown in the chrome. MVP returns **501** `not_implemented` until `pg_trgm` ships — do not fake client-side search over the loaded page.
- **State Persistence:** Filter settings are saved to `localStorage` per user session.

---

## 7. Pane 2: Chat Transcript & Takeover System

### 7.1 Header Status & Autonomy Controls

- **Header Left:** Customer full name, channel badge, verified phone indicator.
- **Header Right (Autonomy Toolbar):**
  - **Approval-required default (new tenants):** Amber pill `📝 Brouillon à valider`. Actions: `[Approuver et envoyer]` `[Modifier]`. This is the **default post-activation chrome** while `reply_mode=approval_required`. Do **not** render only `🤖 IA en cours` as if `auto_send` were on. Contract: `POST /api/v1/conversations/:id/messages/:messageId/approve` (`13` §6.2).
  - **AI Active State (`auto_send` only):** Green pill `🤖 IA en cours`. Button: `[Prendre la main]` (`Take Over`).
  - **Human Handling State:** Blue pill `👤 Repris par [Nom] (il y a 4 min)`. Button: `[Réactiver l'IA]`.
- **Action: Human Takeover (`[Prendre la main]`):**
  - **Frontend UX Behavior:** Control shows a pending state (`Prise en main…`, `aria-busy`). Do **not** display “you own this thread” until the server confirms. Two staff must never both believe they own the conversation (FR-CONV-043).
  - **Backend Contract:** `POST /api/v1/conversations/:id/takeover` (`13` §6.2). Server is source of truth. Target < 500 ms. On failure, revert the pending control and keep AI state as returned by GET.
- **Action: Resume AI (`[Réactiver l'IA]`):**
  - **Frontend UX Behavior:** Pending on the control; restore header chrome from GET **thread + messages** after **200** (`23` §7.3 table — do not `GET /ai/settings`). If the API returns **409** `pending_order_blocks_resume`, keep human handling and explain that a pending order must be confirmed or cancelled first.
  - **Backend Contract:** `POST /api/v1/conversations/:id/resume-ai` (`13` §6.2).

### 7.2 Transcript Message Bubbles & System Events

- **Customer Messages (Inbound):** Left-aligned, neutral zinc background (`--surface-subtle`), dark text. Shows timestamp on hover.
- **AI Messages (Autonomous, `auto_send`):** Right-aligned, `--surface-subtle` background, `🤖 IA` chip above bubble. Hovering reveals prompt version and grounding check status badge (Owner/Admin). **Not** an unnamed navy tint (`20` §4.5 is closed).
- **AI Draft Messages (`approval_required` default):** Same alignment as AI, amber outline, `📝 Brouillon` chip. Actions on the bubble: `[Approuver et envoyer]` `[Modifier]`. Not delivered until approve (`13` §6.2). This is the default post-activation transcript chrome.
- **Human Operator Messages:** Right-aligned, dark navy background (`--color-header`), white text, operator avatar next to bubble.
- **System Event Chips (Centered, Non-bubble):**
  - _🚨 Escalade humaine demandée : Intention d'achat détectée (10:14)_
  - _📦 Commande #1042 créée en attente de confirmation (10:15)_
  - _👤 Prise en main par Amine (10:16)_
- **Failed Send State:** Red outline around bubble with retry trigger: `⚠️ Échec d'envoi Meta • [Réessayer]`.

### 7.3 AI Suggestion Panel (Co-Pilot Mode)

When a human is handling the conversation (`HUMAN_HANDLING` or `HUMAN_REQUIRED`), the operator can request a draft. **MVP is on-demand** (click _Suggérer_), not generated on every keystroke or every thread open (`13` §6.2, Brain Dump UX-3).

```
┌────────────────────────────────────────────────────────────────────────┐
│ ✨ SUGGESTION IA                                      [Régénérer] [✕]  │
├────────────────────────────────────────────────────────────────────────┤
│ "Salem Ahmed ! Le Hoodie Noir en taille M est bien disponible en stock.│
│  La livraison à Tunis est de 7 DT sous 24h. Souhaitez-vous valider ?" │
├────────────────────────────────────────────────────────────────────────┤
│ [ Insérer dans le champ ]      [ Envoyer directement au client ]       │
└────────────────────────────────────────────────────────────────────────┘
```

#### Suggestion Rules

1. **Never Autonomous:** `POST .../suggest` returns **202**; the UI shows the §16.2 pending skeleton until `conversation.suggestion` or a `draft` message arrives (< 5 s). Nothing is delivered without `Insérer` / `Envoyer` / approve.
2. **Grounded Only:** Same guardrails as autonomous replies (`05`).
3. **Complaint / refund suppression:** API returns **409**; hide the panel (`06` trigger 5 `complaint`, refund).
4. **Billable:** Recorded like any other AI turn. **403** `ai_paused` if over budget — show the quota banner, do not retry-loop.

### 7.4 Human Composer & Action Bar

- **Input Box:** Multi-line expanding textarea supporting French, Derja, and Arabic typing.
- **RTL Toggle:** `dir="auto"` automatically aligns Arabic text to the right and French/Latin to the left.
- **Canned Responses / Templates:** `/` command opens quick snippet palette.
- **Attachment Support:** Image picker for sending product photos or payment instructions.
- **Implicit Takeover Rule:** Typing and clicking `[Envoyer]` when AI is active automatically executes an implicit takeover, disabling autonomous replies.

### 7.5 AI Confidence & Uncertainty UX States

Do **not** invent extra numeric bands. Runtime behaviour is the clarification ladder in `05` §7 (default threshold **0.65**, merchant-configurable).

| Operator-visible state                     | When (`05` §7)                            | AI runtime                                                                                             | Sales Command Center                                                                                                                   |
| ------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Grounded / above threshold**             | Confidence ≥ threshold and facts grounded | Proceed with the intent’s default action (draft by default; autonomous only if `reply_mode=auto_send`) | Default: `📝 Brouillon à valider`. `🤖 IA en cours` only when `auto_send`. No extra warning chrome.                                    |
| **First low-confidence turn**              | Below threshold, first time               | One clarifying question. Never a list of options dressed as a question                                 | Subtle warning on the AI bubble: _« Précision demandée par l'IA »_. Thread stays in Active Tier 2 unless already escalated.            |
| **Second consecutive low-confidence turn** | Below threshold again                     | Escalate `low_confidence` (FR-AI-024)                                                                  | Move to Active Tier 1. Amber: _« ⚠️ Besoin de confirmation humaine »_. Suggestion panel available on demand (not on complaint/refund). |

Conflicting rules, empty tools, and other escalations still use `06` — this table is only the confidence ladder.

---

## 8. Pane 3: Customer Context, Lead Info & Action Deck

### 8.1 Customer Identity Card

- **Name & Profile:** Customer Name, social handle link (`@ahmed_tn` → opens Instagram profile).
- **Contact Information:** Phone number (e.g. `+216 98 123 456`).
- **Call Action:** Direct `tel:+21698123456` button: `[📞 Appeler le client]`. Clicking logs an audit event in the timeline.
- **Delivery Address:** Region / City / Street address if captured by AI.

### 8.2 Lead Intelligence & Score Breakdown

- **Lead Score Gauge:** Numerical score (0–100) with temperature color indicator (🔥 `hot`, 🟡 `warm`, ⚪ `cold`).
- **Interactive Breakdown (`ⓘ Pourquoi ce score ?`):**
  Popover rendering the deterministic `lead_score_factors` JSON array provided by the backend (e.g. intent detected, phone provided, product discussed).
  - _Note: Exact scoring weights, intent point values, and nightly decay algorithms are canonical in `14_SYSTEM_DESIGN.md` §10. The UX iterates the `lead_score_factors` payload. Do not hard-code point values in the client._

### 8.3 Order Action Deck (`OrderDeskCard`)

If an order is created or in progress, Pane 3 features the primary commerce control:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 📦 COMMANDE #1042                             [ EN ATTENTE ]          │
├────────────────────────────────────────────────────────────────────────┤
│ • 1x Hoodie Noir — Taille M                           120 DT           │
│ • Frais de livraison (Tunis)                            7 DT           │
│ ────────────────────────────────────────────────────────────────────── │
│ TOTAL À ENCAISSER (Paiement à la livraison)           127 DT           │
├────────────────────────────────────────────────────────────────────────┤
│ [ ✓ CONFIRMER LA COMMANDE ]                                            │
│ [ Annuler la commande ]                                                │
└────────────────────────────────────────────────────────────────────────┘
```

- **Action: Confirm Order (`[✓ Confirmer la commande]`):**
  - **Frontend UX Behavior:** Button spinner + disabled (prevent double submit). On success, show _Commande confirmée_ and refresh thread + Pane 3 from REST (socket is an accelerator).
  - **Backend Contract:** `POST /api/v1/conversations/:id/confirm-order` (alias) or `PATCH /api/v1/orders/:id/status` `{ "status": "CONFIRMED" }` (`13` §6.2 / §8). There is **no** `POST /orders/:id/confirm`.
- **Action: Cancel Order (`[Annuler la commande]`):**
  - **Frontend UX Behavior:** Confirm dialog with reason. On success, remove the pending deck and keep the thread open.
  - **Backend Contract:** `PATCH /api/v1/orders/:id/status` `{ "status": "CANCELLED" }` — releases reservations (`13` §8).
- **No line-item editor in MVP.** `13` §8 has no items PATCH. Wrong basket → cancel and `POST /orders`.

### 8.4 Timeline Activity Stream

Displays chronological interaction events:

- `10:02` — Premier message reçu via Instagram
- `10:05` — Coordonnées téléphoniques enregistrées (+216 98...)
- `10:06` — Réservation de stock créée (1x Hoodie Noir M)
- `10:06` — Escalade vers l'équipe commerciale (Prêt à commander)
- `10:16` — Conversation prise en main par Amine

---
