## 9. Sales Pipeline Kanban View (`/pipeline`)

A board-style projection of conversation and deal stages for owners managing overall daily flow.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ PIPELINE DE VENTE                                                  [Filtre: Aujourd'hui ▼]       │
├──────────────────┬──────────────────┬───────────────────────────────┬────────────────────────────┤
│ NOUVEAUX LEADS   │ LEADS QUALIFIÉS  │ EN ATTENTE DE CONFIRMATION    │ COMMANDES CONFIRMÉES       │
│ (12 leads • 0DT) │ (8 leads • 640DT)│ (4 commandes • 508 DT)        │ (15 commandes • 1 890 DT)  │
├──────────────────┼──────────────────┼───────────────────────────────┼────────────────────────────┤
│ • Karim S.       │ • Sonia B.       │ 🚨 Ahmed Ben Ali              │ ✓ Meriem F.                │
│   Score: 25      │   Score: 85      │   Hoodie Noir (M)             │   Robe Fleurie (S)         │
│   "prix svp?"    │   Robe Rouge (S) │   127 DT • En attente appel   │   140 DT • Confirmé 09:30  │
│                  │   85 DT          │                               │                            │
│ • Leila M.       │                  │ 🚨 Yassine K.                 │ ✓ Omar D.                  │
│   Score: 30      │ • Fatma K.       │   Sneakers Blanches (42)      │   T-Shirt Basique (L)      │
│   "dispo?"       │   Score: 70      │   195 DT • À rappeler         │   45 DT • Confirmé 08:45   │
└──────────────────┴──────────────────┴───────────────────────────────┴────────────────────────────┘
```

### 9.1 Column Mappings (State Projection)

Columns are a **read-only projection** of existing status (`13` §7). No drag-to-advance in MVP. Card copy for column 3 says _en attente de confirmation_, never _en attente de paiement_.

| Kanban Column                     | Merchant meaning                    | Underlying projection (`13` §7)                                       |
| --------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| **1. Nouveaux Leads**             | First interactions                  | `NEW` or `AI_ACTIVE`, **not hot**, no pending order                   |
| **2. Leads Qualifiés**            | Specific interest / high engagement | `ORDER_INTENT_DETECTED` **or** `lead_temperature=hot` still AI-side   |
| **3. En attente de confirmation** | Order waiting on staff              | Orders `PENDING_CONFIRMATION` (not `is_test`)                         |
| **4. Commandes Confirmées**       | Closed                              | Orders `CONFIRMED` or `COMPLETED`, or conversations `ORDER_CONFIRMED` |

- **Interaction in MVP:** Clicking a card opens `/inbox?id={conversation_id}`. Do not PATCH pipeline state.

---

## 10. Product & Catalog Management Flow (`/products`)

### 10.1 Product List & Stock Matrix

- **Table Columns:** Product Image, Name, Category, Variants Count, Live Stock Level, Price (`DT`), Status (`Actif` / `Inactif`).
- **Quick Stock Adjustment:** Inline editor for Owner/Admin (`catalog.write`). Employees see stock as read-only.
- **Variant Drawer:** Clicking a product opens the side drawer displaying individual SKUs, sizes, colors, and specific stock counts. `availableStock` is computed server-side — never PATCHed as a derived field (`13` §12).

### 10.2 Add / Edit Product Modal

- **Fields:** Name, Description, Category, Base Price (`DT`), Variants generator (Sizes: `XS, S, M, L, XL`, Colors), Stock per variant, Product Images upload (stored on S3).
- **Automatic Embedding Sync:** Saving an updated product automatically queues an async background reindexing job (`enqueue_product_reindex`).

---

## 11. AI Settings & Business Rules Flow (`/settings`)

Structured into clean configuration tabs:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ PARAMÈTRES ET CONFIGURATION                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ Général ]  [ Canaux ]  [ Personnalité IA ]  [ Règles Commerciales ]  [ Équipe ]  [ Facturation ]│
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ RÈGLES COMMERCIALES                                                                              │
│                                                                                                  │
│ 1. Politique de Livraison                                                                        │
│    • Frais fixes standard : [ 7 ] DT                                                             │
│    • Seuil de livraison gratuite : [ 150 ] DT                                                    │
│    • Délai annoncé : [ 24 à 48 heures ouvrables ]                                                │
│                                                                                                  │
│ 2. Politique de Remise                                                                           │
│    • Autoriser l'IA à négocier des remises : ( ) Oui   (•) Non (Strictement interdit)             │
│                                                                                                  │
│ 3. Horaires de Travail et Escalades                                                              │
│    • Jours ouvrables : [x] Lun  [x] Mar  [x] Mer  [x] Jeu  [x] Ven  [x] Sam  [ ] Dim             │
│    • Heures : [ 08:30 ] à [ 19:30 ]                                                             │
│    • Hors horaires : L'IA continue de répondre et informe des délais de confirmation humaine.  │
│                                                                                                  │
│ (Personnalité IA tab) Mode de réponse : (•) Brouillon à valider  ( ) Envoi automatique           │
│ Default remains `approval_required`. `PATCH /api/v1/ai/settings` `{ "replyMode" }` (`13` §11).     │
│ G4 never flips this (FR-AI-011).                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Analytics Dashboard Flow (`/analytics`)

Strictly adheres to the **Four Core KPIs** in `01` §15. The AI/human split is a **breakdown of messages handled**, not a fifth KPI. Do **not** add revenue, CSAT, or cost tiles (`20` invariant 6, FR-ANL-005).

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ANALYSES DE PERFORMANCE                                             [ Période: 7 derniers jours ▼]│
├──────────────────┬──────────────────┬───────────────────────────────┬────────────────────────────┤
│ MESSAGES TRAITÉS │ COMMANDES CRÉÉES │ ESCALADES HUMAINES            │ TAUX DE CONVERSION         │
│ 14 250           │ 342              │ 380                           │ 8.4%                       │
│ 🤖 91% IA • 👤 9%│ (count only)     │ Taux d'escalade : 2.6%        │ +1.2 pts vs période préc.  │
├──────────────────┴──────────────────┴───────────────────────────────┴────────────────────────────┤
│ GRAPHIQUE PRINCIPAL : Activité des conversations & Commandes par jour                             │
│ [ Courbe Messages IA ]  [ Courbe Messages Humains ]  [ Barres Commandes Confirmées ]             │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Real-Time Socket Events & Optimistic UI

The client maintains an authenticated WebSocket connection via NestJS Socket.IO gateway.

### 13.1 Client Event Matrix

| Gateway Event             | Trigger Condition                                                   | UI Reaction in Sales Command Center                                                                          |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `conversation.message`    | Message persisted                                                   | Append bubble if thread open; update snippet; re-sort list. Refetch if cursor gap (`13` §14)                 |
| `conversation.status`     | State changed                                                       | Update badge; move between Active Tier 1 / Tier 2                                                            |
| `conversation.handoff`    | Entered `HUMAN_REQUIRED`                                            | Move to _À traiter_; toast only if the type is in §15                                                        |
| `conversation.score`      | Lead score recomputed                                               | Temperature word+icon in Pane 1; gauge in Pane 3                                                             |
| `conversation.suggestion` | On-demand draft ready                                               | Suggestion panel (`draft` message)                                                                           |
| `notification.new`        | In-app notification row (incl. pending order, hot lead, escalation) | Bell. Pane 3 order deck still comes from REST/thread refetch — socket payloads are ids, not full transcripts |

### 13.2 Connection & Degradation Handling

- **Socket Disconnected:** Subtle header banner: _Connexion en cours... Les messages restent synchronisés._
- **Automatic Fallback:** Socket.IO polling transport, plus refetch `GET /api/v1/conversations` and the open thread from the last cursor (`13` §14, FR-RT-005). There is **no** `/inbox/updates` route.
- **Human outbound:** `POST .../messages` returns **201** with `deliveryStatus=queued`. Show the bubble immediately as queued (not as delivered). Checks update from REST or `conversation.message` — do not invent a second SoT.
- **Reconnect:** Always refetch list + open thread. A missed frame must never leave a permanently wrong UI.

---
